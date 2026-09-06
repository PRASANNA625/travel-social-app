# AI Trip Assistant — Design

## Context

Triply has no existing AI/language-model integration anywhere in the codebase
(verified: no SDK dependency in either `package.json`, no AI-related backend
module, no AI-related mobile/web screen, no AI-related environment variable
in `backend/src/config/env.ts` or `render.yaml`). This is a net-new feature,
not a fix to something broken.

## Goal

A standalone chat screen where a logged-in user can ask an AI for trip
planning help — destination ideas, itinerary suggestions, budget guidance,
best time to visit, packing tips — independent of the existing group chat
feature.

## Non-goals (this iteration)

- No persistence of conversation history across app restarts or devices.
  The conversation lives in the screen's local component state only.
- No streaming responses (single request → single complete response).
- No integration with group chat, trip descriptions, or any other existing
  feature. This is additive and isolated.
- No multi-conversation history/list UI. One conversation per screen visit.

## Provider & model

Anthropic Claude Messages API (`https://api.anthropic.com/v1/messages`),
called via the Node 20 built-in `fetch` — no `@anthropic-ai/sdk` dependency,
since this is a single non-streaming JSON call and the repo already avoids
dependencies where a raw HTTP call suffices (see: no HTTP client library
anywhere else in `backend/package.json`).

Model: `claude-haiku-4-5-20251001` — fastest/cheapest current model,
appropriate for a conversational assistant on a Render free-tier deployment.
Confirmed live and supported via Anthropic's models overview docs as of this
writing (retirement not sooner than 2026-10-15).

API version header: `anthropic-version: 2023-06-01` (current stable Messages
API version).

## Backend

### New module: `backend/src/modules/assistant/`

Mirrors the shape of the existing `notifications` module:

- `assistant.types.ts` — zod schema for the request body.
- `assistant.service.ts` — calls Anthropic, owns the system prompt, message
  cap, and rate limiting.
- `assistant.controller.ts` — thin HTTP glue.
- `assistant.routes.ts` — route registration.

Wired into `backend/src/app.ts` as `app.use("/assistant", assistantRouter)`,
alongside the other routers.

### Route

`POST /assistant/messages`, behind the existing `requireAuth` JWT middleware
(same auth as every other route — no new auth mechanism).

Request body (validated with zod):

```ts
{
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}
```

The client sends the full running conversation each time (simplest possible
statelessness — no server-side conversation storage). The backend takes only
the **last 20 messages** before forwarding to Anthropic, so an unbounded
client-side conversation can't cause unbounded cost per request. Each
message's `content` is capped at 4000 characters server-side (reject with
400 if exceeded) as a basic abuse guard.

Response body: `{ role: "assistant", content: string }` on success, or
`{ error: string }` with an appropriate HTTP status on failure (see Error
handling below) — the error string is always a generic, user-safe message,
never the raw provider error or any credential detail.

### System prompt

A fixed string prepended as the Anthropic `system` parameter:

> "You are Triply's trip-planning assistant. Help the user plan trips:
> suggest destinations, itineraries, budgets, best times to visit, and
> packing tips. Keep answers concise, practical, and travel-focused. If
> asked something unrelated to travel, gently redirect to trip planning."

### Rate limiting

An in-memory `Map<userId, { count: number; windowStart: number }>` inside
`assistant.service.ts`, same in-memory-state pattern already used for socket
presence (`onlineSockets` in `backend/src/config/socket.ts`) — consistent
with this app's existing "single instance, no Redis" architecture. Limit:
20 requests/user/hour, sliding window reset. Over the limit → `429` with
`{ error: "You've reached the assistant's hourly limit. Try again later." }`.

### Calling Anthropic

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);
try {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: cappedMessages,
    }),
    signal: controller.signal,
  });
  // non-2xx -> throw a typed error the controller maps to a generic message
} finally {
  clearTimeout(timeout);
}
```

Errors are distinguished server-side (for logging only — the client never
sees which one occurred beyond a generic message):

| Condition | Logged as | Client sees |
|---|---|---|
| `env.anthropicApiKey` unset | `[assistant] ANTHROPIC_API_KEY not configured` | 503, "The assistant isn't available right now." |
| Fetch aborted (timeout) | `[assistant] Anthropic request timed out` | 504, "That took too long — please try again." |
| Anthropic returns non-2xx | `[assistant] Anthropic error <status>: <body>` | 502, "Couldn't get a response, please try again." |
| Network error (fetch throws) | `[assistant] Anthropic request failed: <err>` | 502, "Couldn't get a response, please try again." |
| Rate limit exceeded | (not an error, expected) | 429, "You've reached the assistant's hourly limit. Try again later." |

### Config

- `backend/src/config/env.ts`: add `anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? ""`
  (optional, not `required()` — a missing key degrades this one feature to a
  503 rather than crashing the whole backend on boot, same reasoning as the
  existing optional Cloudinary/Google keys).
- `render.yaml`: add `ANTHROPIC_API_KEY` with `sync: false` under
  `travel-social-backend`'s `envVars`, exactly like `CLOUDINARY_API_KEY`.

## Mobile / Web

Single implementation serves both (this app's "Web" is the same Expo
codebase exported via `expo export -p web` — no platform-specific code
needed, matching how every other screen in this app already works).

### New screen: `mobile/src/screens/AssistantScreen.tsx`

- Gradient header (reusing `GradientBackground`, matching `NotificationsScreen`'s
  hero pattern) with title "AI Trip Assistant".
- `FlatList` of chat bubbles, visually consistent with `GroupChatScreen`'s
  bubble styling (user messages right-aligned/primary-colored, assistant
  messages left-aligned/white) but simpler — no reactions, no read receipts,
  no attachments.
- Text input + send button at the bottom, same `KeyboardAvoidingView`
  pattern already used in `GroupChatScreen`/`TripDetailScreen`.
- A typing-indicator bubble (three animated dots, reusing the `Animated` API
  patterns already established in this codebase) shown while the request is
  in flight.
- On failure: an inline error bubble with the server's generic message and a
  "Retry" button that resends the same last user message.

### New API hook: `mobile/src/api/assistant.ts`

```ts
export function useAssistantReply() {
  return useMutation({
    mutationFn: async (messages: AssistantMessage[]) =>
      (await apiClient.post<{ role: "assistant"; content: string }>("/assistant/messages", { messages })).data,
  });
}
```

`useMutation`'s built-in `isPending` disables the send button and input
while a request is outstanding — this is the same duplicate-prevention
mechanism already used throughout the app (e.g. `addComment.isPending` in
`TripDetailScreen`), not a new pattern.

### Navigation

- `AppStackParamList` gains `Assistant: undefined`.
- Registered in `AppNavigator.tsx` as a new `Stack.Screen`.
- Entry point: a new `PrimaryButton` ("AI Trip Assistant", icon
  `robot-outline` or similar) on `ProfileScreen`, placed above the existing
  "Edit Profile" button. Chosen over adding a 5th tab or a Discover-header
  button to avoid touching already-tuned UI elsewhere; Profile is the
  natural home for a standalone, non-trip-specific utility.

### Types

`mobile/src/types/index.ts` gains:

```ts
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}
```

## Data flow (end to end)

1. User types a message on `AssistantScreen` and taps send.
2. Screen appends `{role: "user", content}` to local state, calls
   `useAssistantReply().mutate(conversationSoFar)`.
3. Mobile → `POST /assistant/messages` (JWT in `Authorization` header, same
   `apiClient` axios instance used everywhere else).
4. Backend: `requireAuth` → zod validation → rate-limit check → cap to last
   20 messages / 4000 chars each → call Anthropic with system prompt →
   30s-timeout fetch.
5. Anthropic responds → backend forwards `{role: "assistant", content}` to
   the client (200), or a generic error (429/502/503/504) as above.
6. Mobile: on success, appends the assistant message to local state and
   scrolls to bottom (same `FlatList` + `onContentSizeChange` pattern as
   `GroupChatScreen`). On error, shows the inline error+retry bubble instead
   of appending a message.
7. While `isPending`, the input and send button are disabled and a
   typing-indicator bubble is shown; both clear when the mutation settles
   (success or error).

## Testing plan

- `tsc --noEmit` clean in both `backend` and `mobile`.
- Backend: a throwaway local server + a live call to the real Anthropic API
  using a real key (if available in this environment) verifying a real
  200 response end-to-end; if no key is available in this environment, a
  mocked-fetch unit-level check that the request is well-formed (correct
  headers, model, capped message count) plus manual verification of the
  error-mapping table above via forced failure conditions (invalid key,
  aborted signal).
- Mobile: smoke-test via a throwaway Expo web bundle compile, confirming the
  new screen/hook/types compile and are wired into navigation.
- Manual verification (both Web and Mobile, per the user's request): send a
  message, confirm a real Claude response renders, confirm the send
  button/input disable during the request, confirm a forced error (e.g.
  temporarily wrong key) shows the generic error + retry without leaking
  provider details, confirm retry resends correctly.
