import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { disconnectUser } from "../../config/socket";
import { HttpError } from "../../middleware/error";
import { invalidateAccountCache } from "../../middleware/auth";
import { signToken } from "../../utils/jwt";
import { sendMail } from "../../utils/mailer";
import { allow, recent, record } from "../../utils/rateLimit";

const RESET_TTL_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function resetEmail(name: string, link: string) {
  const text = [
    `Hi ${name},`,
    "",
    "Someone asked to reset the password for your Triply account. Open this link to choose a new one:",
    "",
    link,
    "",
    "The link works once and expires in 30 minutes. If you didn't ask for this, you can ignore this email; your password won't change.",
    "",
    "Triply",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;line-height:1.5">
<p>Hi ${escapeHtml(name)},</p>
<p>Someone asked to reset the password for your Triply account. Choose a new one here:</p>
<p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Reset password</a></p>
<p style="font-size:13px;color:#475569">Or paste this link into your browser:<br>${link}</p>
<p style="font-size:13px;color:#475569">The link works once and expires in 30 minutes. If you didn't ask for this, you can ignore this email; your password won't change.</p>
<p>Triply</p></div>`;
  return { subject: "Reset your Triply password", text, html };
}

// Creates a fresh single-use link for this user (older unused links stop working) and emails it.
export async function sendResetLink(user: { id: string; email: string; name: string }, requestIp?: string) {
  const raw = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(now.getTime() + RESET_TTL_MS), requestIp },
    }),
  ]);
  const link = `${env.webAppUrl.replace(/\/+$/, "")}/reset-password?token=${raw}`;
  await sendMail({ to: user.email, ...resetEmail(user.name, link) });
}

// Always resolves the same way, whether or not the account exists, so the endpoint
// can't be used to find out which emails are registered.
export async function requestPasswordReset(email: string, ip?: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" }, status: "ACTIVE" },
    select: { id: true, email: true, name: true },
  });
  const ipAllowed = allow(`forgot-ip:${ip ?? "unknown"}`, 10, HOUR_MS);
  const emailAllowed = allow(`forgot-email:${normalized}`, 3, HOUR_MS);
  if (!user?.email || !ipAllowed || !emailAllowed) return;
  // Sent in the background so the response time doesn't reveal whether the account exists.
  sendResetLink({ id: user.id, email: user.email, name: user.name }, ip).catch((err) =>
    console.error("[password] reset email failed", err)
  );
}

// Sets a new password from an emailed link. Every other session of the account ends.
export async function resetPassword(rawToken: string, password: string) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  const now = new Date();
  // Claim the link atomically, so two tabs submitting at once can't both use it.
  const claimed = row
    ? await prisma.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })
    : { count: 0 };
  if (!row || claimed.count === 0) {
    throw new HttpError(400, "This reset link is invalid or has expired", "RESET_TOKEN_INVALID");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: now } }),
    prisma.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } }),
  ]);
  invalidateAccountCache(user.id);
  disconnectUser(user.id);
  return user;
}

const CHANGE_WINDOW_MS = 15 * 60 * 1000;

// Changes the password of a signed-in user. Other sessions end; this one gets a new token.
export async function changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new HttpError(404, "User not found");
  if (!user.passwordHash) {
    throw new HttpError(400, "This account doesn't have a password yet. Use the emailed link to set one.", "NO_PASSWORD");
  }
  const failKey = `change-fail:${userId}`;
  if (recent(failKey, CHANGE_WINDOW_MS) >= 5) {
    throw new HttpError(429, "Too many attempts. Try again in 15 minutes.", "RATE_LIMITED");
  }
  if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    record(failKey);
    // 400, not 401: a wrong current password must not sign the user out.
    throw new HttpError(400, "Current password is incorrect", "WRONG_PASSWORD");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), passwordChangedAt: now } }),
    prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
  ]);
  invalidateAccountCache(userId);
  disconnectUser(userId);
  return { token: signToken(userId, now) };
}
