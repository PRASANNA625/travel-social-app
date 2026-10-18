import { env } from "../config/env";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Local testing only: keeps sent messages in memory so smoke tests can read the links.
export const devOutboxEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_MAIL_INBOX === "1";
const devOutbox: (MailMessage & { at: number })[] = [];

export function readDevOutbox(to?: string) {
  const wanted = to?.trim().toLowerCase();
  return devOutbox.filter((m) => !wanted || m.to.toLowerCase() === wanted);
}

// "Triply <you@gmail.com>" -> { name: "Triply", email: "you@gmail.com" }
function parseFrom(from: string) {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1] || "Triply", email: match[2] } : { name: "Triply", email: from.trim() };
}

// Sends one email through Brevo. Without BREVO_API_KEY (outside production) the
// message is printed instead, so local work needs no email account.
export async function sendMail(msg: MailMessage): Promise<void> {
  if (env.brevoApiKey) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.brevoApiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: parseFrom(env.mailFrom),
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo rejected the email (${res.status}): ${await res.text()}`);
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Email isn't configured. Set BREVO_API_KEY and MAIL_FROM.");
  }
  console.log(`[mail] to ${msg.to}: ${msg.subject}\n${msg.text}`);
  if (devOutboxEnabled) devOutbox.push({ ...msg, at: Date.now() });
}
