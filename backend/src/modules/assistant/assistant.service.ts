import { env } from "../../config/env";
import { HttpError } from "../../middleware/error";
import type { AssistantMessage } from "./assistant.types";

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_HISTORY_MESSAGES = 20;
const REQUEST_TIMEOUT_MS = 30_000;
const RATE_LIMIT_PER_HOUR = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT =
  "You are Triply's trip-planning assistant. Help the user plan trips: suggest destinations, " +
  "itineraries, budgets, best times to visit, and packing tips. Keep answers concise, practical, " +
  "and travel-focused. If asked something unrelated to travel, gently redirect to trip planning.";

// In-memory per-user sliding window, same pattern as socket.ts's onlineSockets -
// this app runs a single backend instance with no Redis, so an in-process Map
// is the established way to hold this kind of ephemeral state.
const requestLog = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (requestLog.get(userId) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_PER_HOUR) {
    requestLog.set(userId, timestamps);
    return true;
  }
  timestamps.push(now);
  requestLog.set(userId, timestamps);
  return false;
}

export async function getAssistantReply(userId: string, messages: AssistantMessage[]): Promise<AssistantMessage> {
  if (isRateLimited(userId)) {
    throw new HttpError(429, "You've reached the assistant's hourly limit. Try again later.");
  }

  if (!env.anthropicApiKey) {
    console.error("[assistant] ANTHROPIC_API_KEY not configured");
    throw new HttpError(503, "The assistant isn't available right now.");
  }

  const capped = messages.slice(-MAX_HISTORY_MESSAGES);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: capped,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      console.error("[assistant] Anthropic request timed out");
      throw new HttpError(504, "That took too long - please try again.");
    }
    console.error("[assistant] Anthropic request failed:", err);
    throw new HttpError(502, "Couldn't get a response, please try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[assistant] Anthropic error ${res.status}: ${body}`);
    throw new HttpError(502, "Couldn't get a response, please try again.");
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    console.error("[assistant] Anthropic response had no text content:", JSON.stringify(data));
    throw new HttpError(502, "Couldn't get a response, please try again.");
  }

  return { role: "assistant", content: text };
}
