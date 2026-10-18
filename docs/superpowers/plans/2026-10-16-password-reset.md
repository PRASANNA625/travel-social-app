# Password Reset and Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users and staff who forget their password can reset it from an emailed link. Signed-in users can change it in Settings. Admins can email a member a reset link. Any reset or change signs the account out on every other device.

**Architecture:**
- A tiny Brevo mailer (plain `fetch`) and an in-memory rate limiter live in `backend/src/utils`.
- Reset tokens go in a new `PasswordResetToken` table; only the sha256 of each token is stored.
- Each JWT carries a `pwd` claim, the account's `passwordChangedAt` in milliseconds. `requireAuth` and the socket handshake reject tokens whose claim doesn't match the database. Changing the password therefore ends every older session at once.
- The app gets Forgot and Reset screens, a Settings modal and an admin button. On web, the reset link is caught once by `RootNavigator`.

**Tech stack:** Express, Prisma 5 (Postgres), zod, bcryptjs, jsonwebtoken, socket.io; Expo SDK 57 with react-native-web, TanStack Query v5, Zustand; Brevo transactional email API v3.

**Spec:** `docs/superpowers/specs/2026-10-16-password-reset-design.md`

## Spec adjustments (agreed in planning; the spec has been updated to match)

1. **Session cut-off uses a `pwd` claim instead of `iat`.**
   - `iat` has one-second resolution. A token issued in the same second as a password change would wrongly survive.
   - The claim is an exact match: `pwd = passwordChangedAt?.getTime() ?? 0`.
   - Existing tokens have no claim (treated as 0) and existing users have `passwordChangedAt = null` (also 0). Nobody is signed out when this ships.
2. **The reset screen is shown by `RootNavigator`, not registered in both stacks.**
   - `RootNavigator` reads `/reset-password?token=` once at start-up, then cleans the URL.
   - While that token is held, it renders `ResetPasswordScreen` instead of either stack, whether the user is signed in or not.
3. **The admin reset rule reuses the existing `loadTarget` rule.**
   - Only a Super Admin can act on accounts of equal or higher rank, and nobody can act on their own account.
   - So Admins can reset Users and Moderators, and Super Admins can reset anyone except themselves. That matches every other admin action and the existing `canManage` used in the UI.
4. **A dev-only outbox gives tests the emailed link.**
   - It is enabled only when `NODE_ENV !== "production"` and `DEV_MAIL_INBOX=1`.
   - It exposes `GET /auth/dev/outbox?to=` and `POST /auth/dev/reset-limits`.
5. **The backend trusts Render's proxy in production** (`app.set("trust proxy", 1)`). Without it, every request appears to come from the proxy's IP, and the per-IP limit would throttle everyone together.
6. **A server-side socket disconnect follows a reset or change.**
   - After a reset or change, the server disconnects that user's live sockets.
   - The client socket reads its token through a callback and reconnects after a server disconnect.
   - The device that made the change reconnects with its new token; other devices are refused.
7. **401 from a stale request no longer signs the user out.** The client interceptor signs the user out on 401 only if the failing request carried the current token. An in-flight request sent just before the token was swapped can't sign out the user who just changed their password.

## Global constraints

- **Passwords:** 8–128 characters for register, reset and change; bcrypt cost 10 (the existing value).
- **Reset token:** 32 random bytes, base64url; only its sha256 hex is stored. It expires 30 minutes after creation, works once, and a newer request voids older unused tokens.
- **Rate limits** (in memory, sliding window, per Render instance):
  - forgot: 3 per email per hour and 10 per IP per hour; over the limit it still answers 200 and sends nothing.
  - change: 5 failed attempts per user per 15 minutes, answered with 429 `RATE_LIMITED`.
  - admin send: 20 per admin per hour.
- **Forgot response:** always `200 { "ok": true }`. The email is sent in the background.
- **Error codes:**
  - `RESET_TOKEN_INVALID` (400)
  - `WRONG_PASSWORD` (400)
  - `NO_PASSWORD` (400)
  - `RATE_LIMITED` (429)
  - `SESSION_EXPIRED` (401)
  - `NO_EMAIL` (400)
- **Email:**
  - subject `Reset your Triply password`
  - link `${WEB_APP_URL}/reset-password?token=<raw>`
- **Production env** (Render, entered by the owner, never in chat or the repo): `BREVO_API_KEY`, `MAIL_FROM` (for example `Triply <you@gmail.com>`) and `WEB_APP_URL=https://triply-pi-three.vercel.app`.
- **New UI strings** are English only, in components; no i18n keys.
- **Windows workflow:**
  - Stop the backend before `npx prisma migrate dev`.
  - Restart Metro with `--clear` after adding new folders.
  - Edit with the Edit tool or Python; avoid heredocs containing quotes.
- **Commits:**
  - Commit at the end of each task only if the owner has approved committing for this plan.
  - Never stage `cloud-sql-proxy.exe` or `.mcp.json`.
  - Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Local servers:**
  - Backend on `http://localhost:4010`, started from `backend/` with `npm run dev`.
  - `backend/.env` (gitignored) must contain `DEV_MAIL_INBOX=1` for the tests.
  - Expo web runs on `http://localhost:8081`.

## Review focus

1. **Mixed-case or space-padded email in forgot:** `" Admin@X.com "` must find `admin@x.com`. It's normalised before the lookup and the rate-limit key. Tested in Task 4.
2. **A link opened twice, or in two tabs at once:** the second use must fail with `RESET_TOKEN_INVALID`. The atomic claim uses `updateMany ... usedAt: null`. Tested in Task 4.
3. **A background poll racing a password change:** the user who changed the password must stay signed in. This is the interceptor's same-token guard. Tested in Task 8's browser test, which keeps polling during the change.
4. **An emailed link opened while another account is signed in on that browser:** the reset screen must show, and finishing it signs into the reset account. Tested in Task 7's browser test.
5. **A Google-only account in Settings:** it sees "Set a password" and gets an email, not an error. Tested in Task 5 (API) and Task 8 (UI).

---

## File map

| File | Responsibility |
|---|---|
| `backend/src/utils/mailer.ts` (new) | `sendMail`, Brevo call, dev console/outbox |
| `backend/src/utils/rateLimit.ts` (new) | `allow`, `recent`, `record`, `resetRateLimits` |
| `backend/src/config/env.ts` | `brevoApiKey`, `mailFrom`, `webAppUrl` |
| `backend/prisma/schema.prisma` and a new migration | `PasswordResetToken`, `User.passwordChangedAt` |
| `backend/src/utils/jwt.ts` | `pwd` claim |
| `backend/src/middleware/auth.ts` | `getAccountState`, `sessionIsCurrent`, the `SESSION_EXPIRED` check |
| `backend/src/config/socket.ts` | handshake check, `disconnectUser` |
| `backend/src/modules/auth/auth.service.ts` | exported `toAuthResponse` (pwd claim, `hasPassword`) |
| `backend/src/modules/auth/password.service.ts` (new) | `sendResetLink`, `requestPasswordReset`, `resetPassword`, `changePassword` |
| `backend/src/modules/auth/auth.controller.ts` and `auth.routes.ts` | three password endpoints and the dev outbox routes |
| `backend/src/modules/users/users.service.ts` | `getMe` adds `hasPassword` |
| `backend/src/modules/admin/admin.users.ts` and `admin.routes.ts` | `sendPasswordReset` and its route |
| `backend/src/app.ts` | `trust proxy` in production |
| `render.yaml` | the new env vars |
| `backend/scripts/lib/http.mjs` (new) | shared helpers for the smoke tests |
| `backend/scripts/smoke-test-password-*.mjs` (new) | API tests: sessions, reset, change, admin |
| `mobile/src/store/authStore.ts` | `replaceToken` |
| `mobile/src/api/client.ts` | same-token 401 guard and the `SESSION_EXPIRED` notice |
| `mobile/src/api/socket.ts` | token callback, reconnect after a server disconnect |
| `mobile/src/api/auth.ts` | `useForgotPassword`, `useResetPassword`, `useChangePassword` |
| `mobile/src/types/index.ts` | `User.hasPassword` |
| `mobile/src/navigation/types.ts` and `AuthStack.tsx` | `ForgotPassword` route |
| `mobile/src/navigation/resetLink.ts` (new) | `takeResetToken()` |
| `mobile/src/navigation/RootNavigator.tsx` | shows the reset screen when a link token is present |
| `mobile/src/screens/auth/AuthCardLayout.tsx` (new) | gradient and card shell shared by the two new auth screens |
| `mobile/src/screens/ForgotPasswordScreen.tsx` (new) | request a link |
| `mobile/src/screens/ResetPasswordScreen.tsx` (new) | choose a new password |
| `mobile/src/screens/LoginScreen.tsx` | "Forgot password?" link |
| `mobile/src/components/ChangePasswordModal.tsx` (new) | Settings modal |
| `mobile/src/screens/SettingsScreen.tsx` | Account section with a Change or Set password row |
| `mobile/src/api/admin.ts` and `mobile/src/screens/admin/Drawers.tsx` | `useSendPasswordReset` and its button |

---

### Task 1: Mailer, rate limiter and env

**Files:**
- Create: `backend/src/utils/mailer.ts`, `backend/src/utils/rateLimit.ts`, `backend/scripts/lib/http.mjs`, `backend/scripts/smoke-test-password-mailer.mjs`
- Modify: `backend/src/config/env.ts`, `backend/src/modules/auth/auth.routes.ts`, `backend/src/app.ts`, `render.yaml`, `backend/.env` (local, gitignored)

**Interfaces:**
- Produces:
  - `sendMail(msg: MailMessage): Promise<void>`, where `MailMessage = { to: string; subject: string; html: string; text: string }`
  - `devOutboxEnabled: boolean`
  - `readDevOutbox(to?: string): (MailMessage & { at: number })[]`, newest last
  - `allow(key: string, limit: number, windowMs: number): boolean`
  - `recent(key: string, windowMs: number): number`
  - `record(key: string): void`
  - `resetRateLimits(): void`
  - `env.brevoApiKey`, `env.mailFrom`, `env.webAppUrl`
  - HTTP: `GET /auth/dev/outbox?to=` and `POST /auth/dev/reset-limits` (dev only)

- [ ] **Step 1: Write the shared test helpers.** Create `backend/scripts/lib/http.mjs`:

```js
// Shared helpers for the password smoke tests (plain fetch, no framework).
export const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:4010";
export const rand = () => Math.random().toString(36).slice(2, 8);

export async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data };
}

const results = [];
export function check(name, pass, extra = "") {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
}
export function report() {
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

export async function register(prefix = "pw") {
  const email = `${prefix}-${rand()}@triply.test`;
  const password = "Passw0rd!" + rand();
  const r = await request("POST", "/auth/register", { body: { email, password, name: `${prefix} tester` } });
  if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.data)}`);
  return { email, password, token: r.data.token, user: r.data.user };
}

// Newest message the dev outbox holds for this address, and the reset token in its link.
export async function lastMail(to) {
  const r = await request("GET", `/auth/dev/outbox?to=${encodeURIComponent(to)}`);
  const mail = Array.isArray(r.data) ? r.data[r.data.length - 1] : undefined;
  const token = mail?.text.match(/reset-password\?token=([\w-]+)/)?.[1];
  return { mail, token, count: Array.isArray(r.data) ? r.data.length : 0 };
}

export const resetLimits = () => request("POST", "/auth/dev/reset-limits");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
```

- [ ] **Step 2: Write the failing test.** Create `backend/scripts/smoke-test-password-mailer.mjs`:

```js
// Dev outbox wiring: the endpoints exist only with DEV_MAIL_INBOX=1 outside production.
import { request, check, report, resetLimits } from "./lib/http.mjs";

const outbox = await request("GET", "/auth/dev/outbox?to=nobody@triply.test");
check("dev outbox endpoint answers", outbox.status === 200 && Array.isArray(outbox.data), `status ${outbox.status}`);
const reset = await resetLimits();
check("dev reset-limits endpoint answers", reset.status === 200 && reset.data?.ok === true, `status ${reset.status}`);
report();
```

- [ ] **Step 3: Run it and confirm it fails.** Run `cd backend && node scripts/smoke-test-password-mailer.mjs`. Expect FAIL on both checks with `status 404`.

- [ ] **Step 4: Add the env values.** In `backend/src/config/env.ts`, add these fields inside `env` after `cloudinary`:

```ts
  // Transactional email (password reset). Without a key, emails are printed to the console outside production.
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  mailFrom: process.env.MAIL_FROM ?? "Triply <no-reply@triply.app>",
  // Where links in emails point (the web app), e.g. https://triply-pi-three.vercel.app
  webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:8081",
```

- [ ] **Step 5: Write the mailer.** Create `backend/src/utils/mailer.ts`:

```ts
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
```

- [ ] **Step 6: Write the rate limiter.** Create `backend/src/utils/rateLimit.ts`:

```ts
// In-memory sliding-window counters. Fine for one server instance; they reset on restart.
const hits = new Map<string, number[]>();

function fresh(key: string, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, list);
  return list;
}

// Number of hits for `key` within the window.
export function recent(key: string, windowMs: number): number {
  return fresh(key, windowMs).length;
}

export function record(key: string): void {
  const list = hits.get(key) ?? [];
  list.push(Date.now());
  hits.set(key, list);
}

// True (and counted) while under `limit` hits per window; false once the limit is reached.
export function allow(key: string, limit: number, windowMs: number): boolean {
  if (fresh(key, windowMs).length >= limit) return false;
  record(key);
  return true;
}

export function resetRateLimits(): void {
  hits.clear();
}
```

- [ ] **Step 7: Register the dev routes.** In `backend/src/modules/auth/auth.routes.ts`, add these imports:

```ts
import { devOutboxEnabled, readDevOutbox } from "../../utils/mailer";
import { resetRateLimits } from "../../utils/rateLimit";
```

Then append at the end of the file:

```ts
// Local testing only (DEV_MAIL_INBOX=1, never in production): read sent emails, clear rate limits.
if (devOutboxEnabled) {
  authRouter.get("/dev/outbox", (req, res) => res.json(readDevOutbox(String(req.query.to ?? ""))));
  authRouter.post("/dev/reset-limits", (_req, res) => {
    resetRateLimits();
    res.json({ ok: true });
  });
}
```

- [ ] **Step 8: Trust the proxy and add the deploy env vars.**
  - In `backend/src/app.ts`, directly after `export const app = express();`, add:

    ```ts
    // Render sits behind a proxy; without this every request looks like it comes from
    // the proxy's IP, and per-IP rate limits would throttle everyone together.
    if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
    ```

  - In `render.yaml`, append under `envVars` after `ANTHROPIC_API_KEY`:

    ```yaml
      # Password-reset email (Brevo). MAIL_FROM must be a verified sender in Brevo,
      # e.g. "Triply <you@gmail.com>".
      - key: BREVO_API_KEY
        sync: false
      - key: MAIL_FROM
        sync: false
      # The web app that reset links open.
      - key: WEB_APP_URL
        value: https://triply-pi-three.vercel.app
    ```

  - Add the line `DEV_MAIL_INBOX=1` to `backend/.env`. It's local and gitignored, so don't stage it.

- [ ] **Step 9: Restart the backend and run the test.**
  - Stop the backend dev server, then start it from `backend/` with `npm run dev` so the new `.env` line loads.
  - Run `node scripts/smoke-test-password-mailer.mjs`. Expect `2/2 passed`.
  - Run `npx tsc --noEmit -p .` and expect no output.

- [ ] **Step 10: Commit** (if approved):

```bash
git add backend/src/utils/mailer.ts backend/src/utils/rateLimit.ts backend/src/config/env.ts backend/src/modules/auth/auth.routes.ts backend/src/app.ts render.yaml backend/scripts/lib/http.mjs backend/scripts/smoke-test-password-mailer.mjs
git commit -m "Add Brevo mailer, rate limiter and dev email outbox"
```

---

### Task 2: Schema, session stamp and `hasPassword`

**Files:**
- Modify:
  - `backend/prisma/schema.prisma`
  - `backend/src/utils/jwt.ts`
  - `backend/src/middleware/auth.ts`
  - `backend/src/config/socket.ts`
  - `backend/src/modules/auth/auth.service.ts:11-18`
  - `backend/src/modules/users/users.service.ts:38-42`
- Create: the migration `backend/prisma/migrations/<timestamp>_password_reset/` (generated), `backend/scripts/smoke-test-password-sessions.mjs`

**Interfaces:**
- Consumes: `request`, `check`, `report` and `register` from `scripts/lib/http.mjs` (Task 1).
- Produces:
  - `signToken(userId: string, passwordChangedAt?: Date | null): string`
  - `verifyToken(token: string): TokenClaims`, where `TokenClaims = { sub: string; pwd?: number }`
  - `getAccountState(userId: string): Promise<{ suspended: boolean; passwordStamp: number }>`
  - `sessionIsCurrent(claims: TokenClaims, state: AccountState): boolean`
  - `invalidateAccountCache(userId)` (existing; now clears the combined cache)
  - `disconnectUser(userId: string): void`
  - `toAuthResponse(user)`, now exported; its `user` gains `hasPassword: boolean` and the token carries `pwd`
  - `GET /users/me` gains `hasPassword: boolean`
  - Prisma: `prisma.passwordResetToken` and `User.passwordChangedAt`

- [ ] **Step 1: Write the failing test.** Create `backend/scripts/smoke-test-password-sessions.mjs`:

```js
// Sessions end when passwordChangedAt changes; /users/me exposes hasPassword.
import "dotenv/config";
import prismaPkg from "@prisma/client";
import { io } from "socket.io-client";
import { BASE, request, check, report, register } from "./lib/http.mjs";

const prisma = new prismaPkg.PrismaClient();
const connect = (token) =>
  new Promise((resolve) => {
    const s = io(BASE, { auth: { token }, transports: ["websocket"], reconnection: false });
    s.on("connect", () => { s.disconnect(); resolve("connected"); });
    s.on("connect_error", (e) => resolve(e.message));
  });

const u = await register("sess");
const me = await request("GET", "/users/me", { token: u.token });
check("/users/me says hasPassword", me.status === 200 && me.data.hasPassword === true, JSON.stringify(me.data?.hasPassword));
check("register response says hasPassword", u.user.hasPassword === true);
check("passwordHash never leaves the server", !("passwordHash" in me.data) && !("passwordHash" in u.user));
check("socket accepts a current token", (await connect(u.token)) === "connected");

await prisma.user.update({ where: { id: u.user.id }, data: { passwordChangedAt: new Date() } });
await new Promise((r) => setTimeout(r, 16000)); // account cache TTL is 15s
const stale = await request("GET", "/users/me", { token: u.token });
check("old token is rejected after a password change", stale.status === 401 && stale.data?.code === "SESSION_EXPIRED", `${stale.status} ${stale.data?.code}`);
check("socket refuses the old token", (await connect(u.token)) === "Session expired");

const relog = await request("POST", "/auth/login", { body: { email: u.email, password: u.password } });
const fresh = await request("GET", "/users/me", { token: relog.data?.token });
check("a new login works again", fresh.status === 200);

await prisma.$disconnect();
report();
```

- [ ] **Step 2: Run it and confirm it fails.** Run `cd backend && node scripts/smoke-test-password-sessions.mjs`. Expect the `hasPassword` checks and `old token is rejected` to FAIL.

- [ ] **Step 3: Update the schema.**
  - In `backend/prisma/schema.prisma`, inside `model User`, add after `passwordHash   String?`:

    ```prisma
      // Set when the password is reset or changed; tokens issued before it stop working.
      passwordChangedAt   DateTime?
      passwordResetTokens PasswordResetToken[]
    ```

  - Append a new model at the end of the file:

    ```prisma
    // One emailed password-reset link. Only the sha256 of the link's token is stored.
    model PasswordResetToken {
      id        String    @id @default(cuid())
      userId    String
      user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
      tokenHash String    @unique
      expiresAt DateTime
      usedAt    DateTime?
      createdAt DateTime  @default(now())
      requestIp String?

      @@index([userId, createdAt])
    }
    ```

- [ ] **Step 4: Create the migration.**
  - Stop the backend dev server first; on Windows the running server locks the Prisma engine.
  - From `backend/`, run `npx prisma migrate dev --name password_reset`. Expect `Your database is now in sync with your schema` and a regenerated client.

- [ ] **Step 5: Add the `pwd` claim to tokens.** Replace the contents of `backend/src/utils/jwt.ts` with:

```ts
import jwt from "jsonwebtoken";
import { env } from "../config/env";

// `pwd` is the account's passwordChangedAt in ms (0 if never changed). A token whose
// pwd doesn't match the account any more was issued before a password change.
export interface TokenClaims {
  sub: string;
  pwd?: number;
}

export function signToken(userId: string, passwordChangedAt?: Date | null): string {
  return jwt.sign({ sub: userId, pwd: passwordChangedAt?.getTime() ?? 0 }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenClaims {
  return jwt.verify(token, env.jwtSecret) as TokenClaims;
}
```

- [ ] **Step 6: Replace the status cache with an account-state cache.** In `backend/src/middleware/auth.ts`, replace everything from the comment `// Account status is checked on every authenticated request` through the end of `isSuspended` with:

```ts
// Account status and password stamp are checked on every authenticated request, so a
// suspension or password change takes effect immediately, not when the token expires.
// A short cache keeps that from costing a database query per request; admin and
// password actions clear it.
const STATUS_TTL_MS = 15_000;
export interface AccountState {
  suspended: boolean;
  passwordStamp: number;
}
const accountCache = new Map<string, AccountState & { at: number }>();

export function invalidateAccountCache(userId: string) {
  accountCache.delete(userId);
}

export async function getAccountState(userId: string): Promise<AccountState> {
  const cached = accountCache.get(userId);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, passwordChangedAt: true } });
  // A deleted account counts as suspended: its token must stop working too.
  const state = { suspended: !user || user.status === "SUSPENDED", passwordStamp: user?.passwordChangedAt?.getTime() ?? 0 };
  accountCache.set(userId, { ...state, at: Date.now() });
  return state;
}

export async function isSuspended(userId: string): Promise<boolean> {
  return (await getAccountState(userId)).suspended;
}

// False for tokens issued before the account's latest password change.
export function sessionIsCurrent(claims: TokenClaims, state: AccountState) {
  return (claims.pwd ?? 0) === state.passwordStamp;
}
```

Then update the rest of the file:

- Change the import to `import { verifyToken, type TokenClaims } from "../utils/jwt";`.
- In `requireAuth`, replace the block from `let userId: string;` to `req.userId = userId;` with:

```ts
  let claims: TokenClaims;
  try {
    claims = verifyToken(header.slice("Bearer ".length));
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  try {
    const state = await getAccountState(claims.sub);
    if (state.suspended) {
      return res.status(403).json({ error: "This account has been suspended", code: "ACCOUNT_SUSPENDED" });
    }
    if (!sessionIsCurrent(claims, state)) {
      return res.status(401).json({ error: "Your password was changed. Please sign in again.", code: "SESSION_EXPIRED" });
    }
  } catch (err) {
    return next(err);
  }
  req.userId = claims.sub;
```

`optionalAuth` keeps using `verifyToken(...).sub` unchanged.

- [ ] **Step 7: Apply the same check at the socket handshake, and add `disconnectUser`.** In `backend/src/config/socket.ts`:
  - Change the import of `isSuspended` to `import { getAccountState, sessionIsCurrent } from "../middleware/auth";`.
  - Add `import { verifyToken, type TokenClaims } from "../utils/jwt";`.
  - Replace the body of the `io.use(...)` callback with:

```ts
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));
    let claims: TokenClaims;
    try {
      claims = verifyToken(token);
    } catch {
      return next(new Error("Invalid auth token"));
    }
    getAccountState(claims.sub)
      .then((state) => {
        if (state.suspended) return next(new Error("Account suspended"));
        if (!sessionIsCurrent(claims, state)) return next(new Error("Session expired"));
        socket.userId = claims.sub;
        next();
      })
      .catch(() => next(new Error("Could not verify account")));
```

  Then add after `emitToUser`:

```ts
// Drops every live connection of this user (after a password change). Clients
// reconnect with their current token; sessions from before the change are refused.
export function disconnectUser(userId: string) {
  io?.in(`user:${userId}`).disconnectSockets(true);
}
```

  If `jwt` or `env` imports in `socket.ts` are now unused, remove them; `npx tsc` will report it.

- [ ] **Step 8: Carry the stamp and `hasPassword` in auth responses.** In `backend/src/modules/auth/auth.service.ts`, replace `toAuthResponse` with:

```ts
// Token plus the signed-in user, minus credentials. Suspended accounts can't sign in.
export function toAuthResponse<
  T extends { id: string; status: string; passwordHash: string | null; googleId: string | null; passwordChangedAt: Date | null }
>(user: T) {
  if (user.status === "SUSPENDED") {
    throw new HttpError(403, "This account has been suspended", "ACCOUNT_SUSPENDED");
  }
  const { passwordHash, googleId: _googleId, passwordChangedAt, ...safeUser } = user;
  return { token: signToken(user.id, passwordChangedAt), user: { ...safeUser, hasPassword: !!passwordHash } };
}
```

- [ ] **Step 9: Add `hasPassword` to `/users/me`.** In `backend/src/modules/users/users.service.ts`, replace `getMe` with:

```ts
export async function getMe(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { ...privateUserSelect, passwordHash: true } });
  if (!user) throw new HttpError(404, "User not found");
  const { passwordHash, ...rest } = user;
  // Settings shows "Change password" or "Set a password"; the hash itself never leaves the server.
  return { ...rest, hasPassword: !!passwordHash };
}
```

- [ ] **Step 10: Restart, typecheck and test.**
  - Start the backend (`npm run dev` in `backend/`).
  - Run `npx tsc --noEmit -p .` and expect no output.
  - Run `node scripts/smoke-test-password-sessions.mjs`. It takes about 20s; expect `7/7 passed`.

- [ ] **Step 11: Commit** (if approved):

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/utils/jwt.ts backend/src/middleware/auth.ts backend/src/config/socket.ts backend/src/modules/auth/auth.service.ts backend/src/modules/users/users.service.ts backend/scripts/smoke-test-password-sessions.mjs
git commit -m "End older sessions when a password changes and expose hasPassword"
```

---

### Task 3: Forgot and reset endpoints

**Files:**
- Create: `backend/src/modules/auth/password.service.ts`, `backend/scripts/smoke-test-password-reset.mjs`
- Modify: `backend/src/modules/auth/auth.controller.ts`, `backend/src/modules/auth/auth.routes.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `sendMail`, `allow`
  - From Task 2: `signToken`, `invalidateAccountCache`, `disconnectUser`, `toAuthResponse`, `prisma.passwordResetToken`
- Produces:
  - `sendResetLink(user: { id: string; email: string; name: string }, requestIp?: string): Promise<void>`
  - `requestPasswordReset(email: string, ip?: string): Promise<void>`
  - `resetPassword(rawToken: string, password: string)`, which returns the updated Prisma `User` row
  - `POST /auth/password/forgot`, which takes `{ email }` and returns `200 { ok: true }`
  - `POST /auth/password/reset`, which takes `{ token, password }` and returns `200 { token, user }`, or 400 `RESET_TOKEN_INVALID`

- [ ] **Step 1: Write the failing test.** Create `backend/scripts/smoke-test-password-reset.mjs`:

```js
// Forgot + reset: neutral answers, single-use expiring links, limits, sessions ended.
import "dotenv/config";
import prismaPkg from "@prisma/client";
import { request, check, report, register, lastMail, resetLimits, sleep } from "./lib/http.mjs";

const prisma = new prismaPkg.PrismaClient();
await resetLimits();
const forgot = (email) => request("POST", "/auth/password/forgot", { body: { email } });

const u = await register("reset");
const unknownEmail = `nobody-${Date.now()}@triply.test`;
const known = await forgot(u.email);
const unknown = await forgot(unknownEmail);
check("known and unknown emails get the same answer",
  known.status === 200 && unknown.status === 200 && JSON.stringify(known.data) === JSON.stringify(unknown.data) && known.data?.ok === true);
await sleep(300);
let mail = await lastMail(u.email);
check("known email receives a reset link", !!mail.token && mail.mail.subject === "Reset your Triply password");
check("unknown email receives nothing", (await lastMail(unknownEmail)).count === 0);

// Mixed case and spaces still find the account.
await forgot(`  ${u.email.toUpperCase()}  `);
await sleep(300);
const mixed = await lastMail(u.email);
check("email is matched case-insensitively", mixed.count === 2, `count ${mixed.count}`);
check("the older link stops working once a new one is sent",
  (await request("POST", "/auth/password/reset", { body: { token: mail.token, password: "NewPassw0rd!" } })).data?.code === "RESET_TOKEN_INVALID");

// Reset with the newest link.
const newPassword = "NewPassw0rd!" + Date.now();
const ok = await request("POST", "/auth/password/reset", { body: { token: mixed.token, password: newPassword } });
check("reset signs the user in", ok.status === 200 && !!ok.data?.token && ok.data.user?.id === u.user.id, `${ok.status} ${JSON.stringify(ok.data)}`);
const again = await request("POST", "/auth/password/reset", { body: { token: mixed.token, password: newPassword } });
check("a link works only once", again.status === 400 && again.data?.code === "RESET_TOKEN_INVALID");
check("old password no longer works", (await request("POST", "/auth/login", { body: { email: u.email, password: u.password } })).status === 401);
check("new password works", (await request("POST", "/auth/login", { body: { email: u.email, password: newPassword } })).status === 200);
check("old session is ended immediately", (await request("GET", "/users/me", { token: u.token })).data?.code === "SESSION_EXPIRED");
check("the reset session works", (await request("GET", "/users/me", { token: ok.data.token })).status === 200);

// Expiry.
await resetLimits();
await forgot(u.email);
await sleep(300);
const exp = await lastMail(u.email);
await prisma.passwordResetToken.updateMany({ where: { userId: u.user.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
check("an expired link is refused",
  (await request("POST", "/auth/password/reset", { body: { token: exp.token, password: "Whatever123" } })).data?.code === "RESET_TOKEN_INVALID");

// Validation and limits.
check("short passwords are refused", (await request("POST", "/auth/password/reset", { body: { token: exp.token, password: "short" } })).status === 400);
await resetLimits();
const v = await register("limit");
for (let i = 0; i < 4; i++) await forgot(v.email);
await sleep(300);
check("only 3 emails per address per hour", (await lastMail(v.email)).count === 3);
check("raw tokens are not stored", (await prisma.passwordResetToken.count({ where: { tokenHash: exp.token } })) === 0);

await resetLimits();
await prisma.$disconnect();
report();
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node scripts/smoke-test-password-reset.mjs`. Expect FAIL; the forgot calls return 404.

- [ ] **Step 3: Write the service.** Create `backend/src/modules/auth/password.service.ts`:

```ts
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { disconnectUser } from "../../config/socket";
import { HttpError } from "../../middleware/error";
import { invalidateAccountCache } from "../../middleware/auth";
import { sendMail } from "../../utils/mailer";
import { allow } from "../../utils/rateLimit";

const RESET_TTL_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

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
```

- [ ] **Step 4: Add the controllers.** In `backend/src/modules/auth/auth.controller.ts`, add `import * as password from "./password.service";`, then append:

```ts
const passwordField = z.string().min(8, "Use at least 8 characters").max(128);

export async function forgotPassword(req: Request, res: Response) {
  const { email } = z.object({ email: z.string().trim().email() }).parse(req.body);
  await password.requestPasswordReset(email, req.ip);
  res.json({ ok: true });
}

export async function resetPassword(req: Request, res: Response) {
  const body = z.object({ token: z.string().min(20).max(200), password: passwordField }).parse(req.body);
  const user = await password.resetPassword(body.token, body.password);
  res.json(service.toAuthResponse(user));
}
```

- [ ] **Step 5: Add the routes.** In `backend/src/modules/auth/auth.routes.ts`, add before the dev block:

```ts
authRouter.post("/password/forgot", asyncHandler(controller.forgotPassword));
authRouter.post("/password/reset", asyncHandler(controller.resetPassword));
```

- [ ] **Step 6: Typecheck and test.**
  - Run `npx tsc --noEmit -p .` and expect no output.
  - `tsx watch` restarts the server on its own. Run `node scripts/smoke-test-password-reset.mjs` and expect `15/15 passed`.

- [ ] **Step 7: Commit** (if approved):

```bash
git add backend/src/modules/auth/password.service.ts backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.routes.ts backend/scripts/smoke-test-password-reset.mjs
git commit -m "Add forgot-password email and single-use reset links"
```

---

### Task 4: Change password endpoint

**Files:**
- Modify: `backend/src/modules/auth/password.service.ts`, `backend/src/modules/auth/auth.controller.ts`, `backend/src/modules/auth/auth.routes.ts`
- Create: `backend/scripts/smoke-test-password-change.mjs`

**Interfaces:**
- Consumes:
  - From Task 1: `recent` and `record`
  - From Task 2: `signToken`, `invalidateAccountCache` and `disconnectUser`
- Produces:
  - `changePassword(userId: string, currentPassword: string | undefined, newPassword: string): Promise<{ token: string }>`
  - `POST /auth/password/change`, which requires a login token, takes `{ currentPassword?, newPassword }`, and returns `{ token }`. It fails with 400 `WRONG_PASSWORD`, 400 `NO_PASSWORD` or 429 `RATE_LIMITED`.

- [ ] **Step 1: Write the failing test.** Create `backend/scripts/smoke-test-password-change.mjs`:

```js
// Change password: right/wrong current password, limits, sessions, Google-only accounts.
import "dotenv/config";
import prismaPkg from "@prisma/client";
import { request, check, report, register, resetLimits, rand } from "./lib/http.mjs";

const prisma = new prismaPkg.PrismaClient();
await resetLimits();
const change = (token, body) => request("POST", "/auth/password/change", { token, body });

const u = await register("change");
const wrong = await change(u.token, { currentPassword: "nope-nope-nope", newPassword: "Another123!" });
check("wrong current password is refused without signing out", wrong.status === 400 && wrong.data?.code === "WRONG_PASSWORD");
check("still signed in after a wrong attempt", (await request("GET", "/users/me", { token: u.token })).status === 200);

const next = "Changed123!" + rand();
const ok = await change(u.token, { currentPassword: u.password, newPassword: next });
check("change returns a fresh token", ok.status === 200 && typeof ok.data?.token === "string");
check("fresh token works", (await request("GET", "/users/me", { token: ok.data.token })).status === 200);
check("previous token stops working", (await request("GET", "/users/me", { token: u.token })).data?.code === "SESSION_EXPIRED");
check("new password logs in", (await request("POST", "/auth/login", { body: { email: u.email, password: next } })).status === 200);
check("too-short new password is refused", (await change(ok.data.token, { currentPassword: next, newPassword: "short" })).status === 400);

// Five failures, then rate limited.
const w = await register("lock");
for (let i = 0; i < 5; i++) await change(w.token, { currentPassword: "bad-" + i, newPassword: "Whatever123" });
const sixth = await change(w.token, { currentPassword: w.password, newPassword: "Whatever123" });
check("sixth attempt within 15 minutes is rate limited", sixth.status === 429 && sixth.data?.code === "RATE_LIMITED");

// Google-only account (no password).
const g = await register("google");
await prisma.user.update({ where: { id: g.user.id }, data: { passwordHash: null } });
const relogin = await request("POST", "/auth/login", { body: { email: g.email, password: g.password } });
check("passwordless account cannot log in with a password", relogin.status === 401);
// Its existing token is still current (passwordChangedAt untouched).
check("passwordless account reports hasPassword false", (await request("GET", "/users/me", { token: g.token })).data?.hasPassword === false);
const np = await change(g.token, { newPassword: "Whatever123" });
check("passwordless account is told to use the email link", np.status === 400 && np.data?.code === "NO_PASSWORD");

await resetLimits();
await prisma.$disconnect();
report();
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node scripts/smoke-test-password-change.mjs`. Expect FAIL with 404s.

- [ ] **Step 3: Write the service function.** In `password.service.ts`, add `import { signToken } from "../../utils/jwt";`, change the rateLimit import to `import { allow, recent, record } from "../../utils/rateLimit";`, and append:

```ts
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
```

- [ ] **Step 4: Add the controller and route.**
  - In `auth.controller.ts`, add `import type { AuthedRequest } from "../../middleware/auth";` and append:

    ```ts
    export async function changePassword(req: AuthedRequest, res: Response) {
      const body = z.object({ currentPassword: z.string().max(128).optional(), newPassword: passwordField }).parse(req.body);
      res.json(await password.changePassword(req.userId!, body.currentPassword, body.newPassword));
    }
    ```

  - In `auth.routes.ts`, add `import { requireAuth } from "../../middleware/auth";` and add this line next to the other password routes:

    ```ts
    authRouter.post("/password/change", requireAuth, asyncHandler(controller.changePassword));
    ```

- [ ] **Step 5: Typecheck and test.**
  - Run `npx tsc --noEmit -p .` and expect no output.
  - Run `node scripts/smoke-test-password-change.mjs` and expect `11/11 passed`.
  - Rerun `node scripts/smoke-test-password-reset.mjs` and expect `15/15 passed`.

- [ ] **Step 6: Commit** (if approved):

```bash
git add backend/src/modules/auth/password.service.ts backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.routes.ts backend/scripts/smoke-test-password-change.mjs
git commit -m "Let signed-in users change their password"
```

---

### Task 5: Admin "send reset link"

**Files:**
- Modify: `backend/src/modules/admin/admin.users.ts`, `backend/src/modules/admin/admin.routes.ts`
- Create: `backend/scripts/smoke-test-password-admin.mjs`

**Interfaces:**
- Consumes:
  - From Task 3: `sendResetLink`
  - From Task 1: `allow`
  - Existing: `loadTarget(actorId, actorRole, targetId)` and `logAction(actorId, action, targetType, targetId, details)` in `admin.users.ts`
- Produces:
  - `sendPasswordReset(actorId: string, actorRole: UserRole, id: string): Promise<{ ok: true }>`
  - `POST /admin/users/:id/password-reset`, which requires ADMIN or above

- [ ] **Step 1: Write the failing test.** Create `backend/scripts/smoke-test-password-admin.mjs`. It uses the local test staff accounts, which already exist in the local database:

```js
// Admin reset link: role rules, email sent, audit row written.
import "dotenv/config";
import prismaPkg from "@prisma/client";
import { request, check, report, register, lastMail, resetLimits, sleep } from "./lib/http.mjs";

const prisma = new prismaPkg.PrismaClient();
await resetLimits();
const staff = async (who) =>
  (await request("POST", "/auth/login", { body: { email: `admintest-${who}@triply.test`, password: "AdminTest#2026" } })).data;
const mod = await staff("mod"), admin = await staff("admin"), sup = await staff("super");
const send = (token, id) => request("POST", `/admin/users/${id}/password-reset`, { token });

const member = await register("adminreset");
check("moderators can't send reset links", (await send(mod.token, member.user.id)).status === 403);
check("admins can't target a super admin", (await send(admin.token, sup.user.id)).status === 403);
check("unknown user is 404", (await send(sup.token, "does-not-exist")).status === 404);

const ok = await send(admin.token, member.user.id);
check("admin can send a member a reset link", ok.status === 200 && ok.data?.ok === true, `${ok.status} ${JSON.stringify(ok.data)}`);
await sleep(300);
const mail = await lastMail(member.email);
check("the member receives the email", !!mail.token);
const reset = await request("POST", "/auth/password/reset", { body: { token: mail.token, password: "FromAdmin123!" } });
check("the admin-sent link works", reset.status === 200);
const audit = await prisma.auditLog.findFirst({ where: { action: "user.password_reset_link", targetId: member.user.id }, orderBy: { createdAt: "desc" } });
check("an audit entry is written", audit?.actorId === admin.user.id && audit?.targetType === "USER");

await prisma.$disconnect();
report();
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node scripts/smoke-test-password-admin.mjs`. Expect FAIL with 404 on the send calls.

- [ ] **Step 3: Write the service function.** In `admin.users.ts`, add these imports:

```ts
import { sendResetLink } from "../auth/password.service";
import { allow } from "../../utils/rateLimit";
```

Then append:

```ts
// Emails a member a single-use password reset link (same link as "Forgot password").
export async function sendPasswordReset(actorId: string, actorRole: UserRole, id: string) {
  await loadTarget(actorId, actorRole, id);
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, name: true } });
  if (!user.email) throw new HttpError(400, "This member has no email address", "NO_EMAIL");
  if (!allow(`admin-reset:${actorId}`, 20, 60 * 60 * 1000)) {
    throw new HttpError(429, "You've sent a lot of reset links. Try again in an hour.", "RATE_LIMITED");
  }
  await sendResetLink({ id: user.id, email: user.email, name: user.name });
  await logAction(actorId, "user.password_reset_link", "USER", id, { via: "admin" });
  return { ok: true as const };
}
```

- [ ] **Step 4: Add the route.** In `admin.routes.ts`, directly after the `adminRouter.patch("/users/:id", ...)` block, add:

```ts
adminRouter.post(
  "/users/:id/password-reset",
  ADMIN,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const { id, role } = actor(req);
    res.json(await users.sendPasswordReset(id, role, req.params.id));
  })
);
```

- [ ] **Step 5: Typecheck and test.**
  - Run `npx tsc --noEmit -p .` and expect no output.
  - Run `node scripts/smoke-test-password-admin.mjs` and expect `7/7 passed`.

- [ ] **Step 6: Commit** (if approved):

```bash
git add backend/src/modules/admin/admin.users.ts backend/src/modules/admin/admin.routes.ts backend/scripts/smoke-test-password-admin.mjs
git commit -m "Let admins email a member a password reset link"
```

---

### Task 6: App plumbing (token swap, stale-401 guard, socket, hooks)

**Files:**
- Modify:
  - `mobile/src/store/authStore.ts`
  - `mobile/src/api/client.ts:18-28`
  - `mobile/src/api/socket.ts:7-16`
  - `mobile/src/api/auth.ts`
  - `mobile/src/types/index.ts:72-90`

**Interfaces:**
- Consumes: the Task 3 and 4 endpoints.
- Produces:
  - `useAuthStore().replaceToken(token: string): Promise<void>`
  - `useForgotPassword()`, a mutation of `(email: string) => { ok: true }`
  - `useResetPassword()`, a mutation of `({ token, password }) => AuthResponse` that signs the user in
  - `useChangePassword()`, a mutation of `({ currentPassword, newPassword }) => { token }` that swaps in the new token
  - `User.hasPassword?: boolean`

- [ ] **Step 1: Add `replaceToken` to the store.** In `mobile/src/store/authStore.ts`, add `replaceToken: (token: string) => Promise<void>;` to the state interface, next to `login`. Add its implementation after `login`:

```ts
  // After a password change: same user, new token (the old one no longer works).
  replaceToken: async (token) => {
    await tokenStorage.setItemAsync(TOKEN_KEY, token);
    set({ token });
  },
```

- [ ] **Step 2: Make the 401 handler ignore stale requests.** In `mobile/src/api/client.ts`, replace the response interceptor with:

```ts
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only sign out if the rejected request used the current token: a request sent
      // just before a password change swapped the token must not sign the user out.
      const current = useAuthStore.getState().token;
      const sent = error.config?.headers?.Authorization;
      if (current && sent === `Bearer ${current}`) {
        useAuthStore.getState().logout();
        if (error.response.data?.code === "SESSION_EXPIRED") {
          Alert.alert("Signed out", "Your password was changed. Please sign in again.");
        }
      }
    } else if (error.response?.status === 403 && error.response.data?.code === "ACCOUNT_SUSPENDED") {
      signOutSuspended();
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 3: Make the socket read the current token and reconnect.** In `mobile/src/api/socket.ts`, replace the `io(...)` call and the `socket.on` line in `getSocket` with:

```ts
  socket = io(API_URL, {
    // Read on every (re)connect, so a token swapped after a password change is used.
    auth: (cb) => cb({ token: useAuthStore.getState().token }),
    transports: ["websocket"],
    autoConnect: true,
  });
  socket.on("account:suspended", (payload: { reason?: string } | undefined) => signOutSuspended(payload?.reason));
  // The server drops sockets after a password change; reconnect with the current token.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect" && useAuthStore.getState().token) socket?.connect();
  });
```

- [ ] **Step 4: Add the hooks and the type.**
  - In `mobile/src/api/auth.ts`, append:

    ```ts
    export function useForgotPassword() {
      return useMutation({
        mutationFn: async (email: string) => (await apiClient.post<{ ok: true }>("/auth/password/forgot", { email })).data,
      });
    }

    export function useResetPassword() {
      return useMutation({
        mutationFn: async (input: { token: string; password: string }) => {
          const { data } = await apiClient.post<AuthResponse>("/auth/password/reset", input);
          return completeLogin(data);
        },
      });
    }

    export function useChangePassword() {
      return useMutation({
        mutationFn: async (input: { currentPassword: string; newPassword: string }) => {
          const { data } = await apiClient.post<{ token: string }>("/auth/password/change", input);
          await useAuthStore.getState().replaceToken(data.token);
          return data;
        },
      });
    }
    ```

  - In `mobile/src/types/index.ts`, inside `interface User`, add after `role?`:

    ```ts
      // Only on the signed-in user's own profile: false for accounts that sign in with Google only.
      hasPassword?: boolean;
    ```

- [ ] **Step 5: Typecheck.** Run `cd mobile && npx tsc --noEmit -p .` and expect no output. This task only wires things up; Tasks 7 and 8 exercise it through the UI.

- [ ] **Step 6: Commit** (if approved):

```bash
git add mobile/src/store/authStore.ts mobile/src/api/client.ts mobile/src/api/socket.ts mobile/src/api/auth.ts mobile/src/types/index.ts
git commit -m "Wire password hooks, token swap and stale-401 guard in the app"
```

---

### Task 7: Forgot and Reset screens, and the reset link

**Files:**
- Create:
  - `mobile/src/screens/auth/AuthCardLayout.tsx`
  - `mobile/src/screens/ForgotPasswordScreen.tsx`
  - `mobile/src/screens/ResetPasswordScreen.tsx`
  - `mobile/src/navigation/resetLink.ts`
  - Test (scratchpad, not committed): `<scratchpad>/pw/password-ui.mjs`
- Modify:
  - `mobile/src/navigation/types.ts`
  - `mobile/src/navigation/AuthStack.tsx`
  - `mobile/src/navigation/RootNavigator.tsx`
  - `mobile/src/screens/LoginScreen.tsx` (after the password field, around line 122)
  - `mobile/web/index.html` if present (referrer meta)

**Interfaces:**
- Consumes: `useForgotPassword` and `useResetPassword` from Task 6.
- Produces:
  - `takeResetToken(): string | null` and `clearResetToken(): void`
  - `AuthStackParamList.ForgotPassword: { email?: string } | undefined`
  - `<ResetPasswordScreen token onClose />`
  - `<AuthCardLayout title subtitle onBack? children />`

- [ ] **Step 1: Write the failing browser test.**
  - Create `<scratchpad>/pw/password-ui.mjs`, where `<scratchpad>` is this session's scratchpad directory.
  - Run it with `NODE_PATH="$(npm root -g)"` so `playwright-core` resolves.
  - It needs the local backend with `DEV_MAIL_INBOX=1` and Expo web on 8081.

```js
// Forgot -> email link -> reset -> signed in; and the link opened while another account is signed in.
import { chromium } from "playwright-core";
const API = "http://localhost:4010", WEB = "http://localhost:8081";
const results = [];
const check = (n, p, x = "") => results.push(`${p ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
const call = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const tokenFor = async (email) => {
  const r = await call("GET", `/auth/dev/outbox?to=${encodeURIComponent(email)}`);
  return r.json?.at(-1)?.text.match(/reset-password\?token=([\w-]+)/)?.[1];
};
await call("POST", "/auth/dev/reset-limits");
const email = `pwui-${Date.now()}@triply.test`;
await call("POST", "/auth/register", { email, password: "OldPassw0rd!", name: "PW UI" });

const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    await call("POST", "/auth/dev/reset-limits"); // each pass sends 2 emails to the same address
    const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    page.setDefaultTimeout(15000);
    page.on("dialog", (d) => { results.push(`      dialog: ${d.message()}`); d.accept(); });
    await page.goto(WEB, { waitUntil: "load" });
    await page.waitForTimeout(5000);
    if (await page.getByText("Log in", { exact: true }).count()) await page.getByText("Log in", { exact: true }).first().click();
    await page.waitForTimeout(1500);
    await page.getByText("Forgot password?").click();
    await page.getByPlaceholder("Email").fill(email);
    await page.getByText("Send reset link").click();
    await page.waitForTimeout(1500);
    check(`${w}: neutral confirmation shown`, (await page.getByText(/If that email has an account/).count()) > 0);
    const token = await tokenFor(email);
    await page.goto(`${WEB}/reset-password?token=${token}`, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    check(`${w}: reset screen opens from the link`, (await page.getByText("Choose a new password").count()) > 0);
    check(`${w}: token removed from the address bar`, !page.url().includes("token="), page.url());
    const newPw = `NewPassw0rd!${w}`;
    await page.getByPlaceholder("New password").fill(newPw);
    await page.getByPlaceholder("Confirm new password").fill(newPw + "x");
    await page.getByText("Save new password").click();
    check(`${w}: mismatch is caught`, (await page.getByText("Passwords don't match").count()) > 0);
    await page.getByPlaceholder("Confirm new password").fill(newPw);
    await page.getByText("Save new password").click();
    await page.waitForTimeout(3000);
    check(`${w}: signed in after reset`, (await page.getByText("Discover").count()) > 0);
    check(`${w}: new password works on the API`, (await call("POST", "/auth/login", { email, password: newPw })).status === 200);
    await page.screenshot({ path: `password-ui-${w}.png` });

    // Open a fresh link while signed in (as this same browser session) -> reset screen still shows.
    await call("POST", "/auth/password/forgot", { email });
    await page.waitForTimeout(500);
    await page.goto(`${WEB}/reset-password?token=${await tokenFor(email)}`, { waitUntil: "load" });
    await page.waitForTimeout(4000);
    check(`${w}: link opened while signed in still shows the reset screen`, (await page.getByText("Choose a new password").count()) > 0);
    await page.goto(`${WEB}/reset-password?token=not-a-real-token-123456789`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    await page.getByPlaceholder("New password").fill("Whatever123");
    await page.getByPlaceholder("Confirm new password").fill("Whatever123");
    await page.getByText("Save new password").click();
    await page.waitForTimeout(1500);
    check(`${w}: bad link offers a new one`, (await page.getByText("Request a new link").count()) > 0);
    await page.context().close();
  }
} finally {
  await b.close();
  console.log(results.join("\n"));
}
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node password-ui.mjs` from the scratchpad `pw` folder. Expect FAIL; the "Forgot password?" text isn't found and the test times out.

- [ ] **Step 3: Catch the reset link.** Create `mobile/src/navigation/resetLink.ts`:

```ts
import { Platform } from "react-native";

// Web only: a password-reset email opens /reset-password?token=... Read the token once
// at start-up and clean the address bar so the token isn't left in history or shared.
// Cached at module level: React StrictMode runs state initializers twice, and the second
// run would otherwise find the URL already cleaned.
let taken: string | null | undefined;

export function takeResetToken(): string | null {
  if (taken !== undefined) return taken;
  taken = null;
  if (Platform.OS !== "web" || typeof window === "undefined") return taken;
  const { pathname, search } = window.location;
  if (!pathname.replace(/\/+$/, "").endsWith("/reset-password")) return taken;
  const token = new URLSearchParams(search).get("token");
  window.history.replaceState(null, "", "/");
  taken = token && token.length >= 20 ? token : null;
  return taken;
}

// Called when the reset screen closes, so a later remount doesn't show it again.
export function clearResetToken() {
  taken = null;
}
```

- [ ] **Step 4: Write the shared card layout.** Create `mobile/src/screens/auth/AuthCardLayout.tsx`:

```tsx
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GRADIENT_PRIMARY } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";

// Gradient background and white card, matching the login screen, for the password screens.
export function AuthCardLayout({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack?: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <LinearGradient colors={GRADIENT_PRIMARY.colors} locations={GRADIENT_PRIMARY.locations} style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]}>
            {onBack && (
              <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
                <MaterialCommunityIcons name="arrow-left" size={22} color={colors.ink} />
              </TouchableOpacity>
            )}
            <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
            {!!subtitle && <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: 24, padding: 24, gap: 14 },
  back: { alignSelf: "flex-start", marginBottom: -4 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13.5, lineHeight: 19, marginTop: -6 },
});

// Shared field and button styles for the password screens.
export const authFieldStyles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15 },
  button: { borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { alignSelf: "center", paddingVertical: 8 },
  linkText: { fontSize: 13.5, fontWeight: "600" },
  error: { fontSize: 13 },
});
```

- [ ] **Step 5: Write the Forgot password screen.** Create `mobile/src/screens/ForgotPasswordScreen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useForgotPassword } from "../api/auth";
import { useTheme } from "../theme/ThemeContext";
import { AuthCardLayout, authFieldStyles as s } from "./auth/AuthCardLayout";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

export function ForgotPasswordScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) return setError("Enter a valid email address.");
    setError("");
    forgot.mutate(trimmed, {
      onSuccess: () => { setSent(true); setWait(RESEND_SECONDS); },
      onError: () => setError("Couldn't send right now. Check your connection and try again."),
    });
  };

  return (
    <AuthCardLayout
      title={sent ? "Check your email" : "Forgot password?"}
      subtitle={sent ? undefined : "Enter the email you signed up with and we'll send you a link to choose a new password."}
      onBack={() => navigation.goBack()}
    >
      {sent ? (
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>
          If that email has an account, we've sent a link to reset your password. It expires in 30 minutes.
        </Text>
      ) : (
        <View style={[s.field, { backgroundColor: colors.fieldBg, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="email-outline" size={18} color={colors.muted} />
          <TextInput
            style={[s.input, { color: colors.ink }]}
            placeholder="Email"
            placeholderTextColor={colors.mutedLight}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={send}
          />
        </View>
      )}
      {!!error && <Text style={[s.error, { color: colors.danger }]}>{error}</Text>}
      <TouchableOpacity
        style={[s.button, { backgroundColor: colors.primary, opacity: forgot.isPending || wait > 0 ? 0.6 : 1 }]}
        onPress={send}
        disabled={forgot.isPending || wait > 0}
        accessibilityRole="button"
      >
        {forgot.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.buttonText}>{sent ? (wait > 0 ? `Resend in ${wait}s` : "Resend link") : "Send reset link"}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={s.link} onPress={() => navigation.navigate("Login")} accessibilityRole="button">
        <Text style={[s.linkText, { color: colors.primary }]}>Back to login</Text>
      </TouchableOpacity>
    </AuthCardLayout>
  );
}
```

- [ ] **Step 6: Write the Reset password screen.** Create `mobile/src/screens/ResetPasswordScreen.tsx`:

```tsx
import { useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useResetPassword } from "../api/auth";
import { useTheme } from "../theme/ThemeContext";
import { Alert } from "../utils/alert";
import { AuthCardLayout, authFieldStyles as s } from "./auth/AuthCardLayout";

// Shown by RootNavigator when the app was opened from a reset email (signed in or not).
// onClose(requestNew) hands control back; requestNew opens Forgot password.
export function ResetPasswordScreen({ token, onClose }: { token: string; onClose: (requestNew?: boolean) => void }) {
  const { colors } = useTheme();
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);

  const save = () => {
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match");
    setError("");
    reset.mutate(
      { token, password },
      {
        onSuccess: () => {
          onClose();
          Alert.alert("Password updated", "You're signed in with your new password.");
        },
        onError: (err: any) => {
          if (err?.response?.data?.code === "RESET_TOKEN_INVALID") setLinkInvalid(true);
          setError(err?.response?.data?.error ?? "Couldn't update your password. Try again.");
        },
      }
    );
  };

  const field = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <View style={[s.field, { backgroundColor: colors.fieldBg, borderColor: colors.border }]}>
      <MaterialCommunityIcons name="lock-outline" size={18} color={colors.muted} />
      <TextInput
        style={[s.input, { color: colors.ink }]}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        secureTextEntry={!show}
        autoComplete="new-password"
        value={value}
        onChangeText={onChange}
        onSubmitEditing={save}
      />
      <TouchableOpacity onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityLabel={show ? "Hide password" : "Show password"}>
        <MaterialCommunityIcons name={show ? "eye-off-outline" : "eye-outline"} size={19} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );

  return (
    <AuthCardLayout title="Choose a new password" subtitle="Use at least 8 characters. You'll be signed out on your other devices.">
      {field(password, setPassword, "New password")}
      {field(confirm, setConfirm, "Confirm new password")}
      {!!error && <Text style={[s.error, { color: colors.danger }]}>{error}</Text>}
      {linkInvalid ? (
        <TouchableOpacity style={[s.button, { backgroundColor: colors.primary }]} onPress={() => onClose(true)} accessibilityRole="button">
          <Text style={s.buttonText}>Request a new link</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[s.button, { backgroundColor: colors.primary, opacity: reset.isPending ? 0.6 : 1 }]}
          onPress={save}
          disabled={reset.isPending}
          accessibilityRole="button"
        >
          {reset.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Save new password</Text>}
        </TouchableOpacity>
      )}
      <TouchableOpacity style={s.link} onPress={() => onClose()} accessibilityRole="button">
        <Text style={[s.linkText, { color: colors.primary }]}>Cancel</Text>
      </TouchableOpacity>
    </AuthCardLayout>
  );
}
```

- [ ] **Step 7: Register the route and show the reset screen.**
  - In `mobile/src/navigation/types.ts`, add `ForgotPassword: { email?: string } | undefined;` to `AuthStackParamList`.
  - In `AuthStack.tsx`, import `ForgotPasswordScreen`. Add `<Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />` after `Register`. Let `AuthStack` take an `initialRouteName?: keyof AuthStackParamList` prop and pass it to `Stack.Navigator`.
  - Replace `RootNavigator.tsx` with:

```tsx
import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { AuthStack } from "./AuthStack";
import { AppNavigator } from "./AppNavigator";
import { clearResetToken, takeResetToken } from "./resetLink";
import { ResetPasswordScreen } from "../screens/ResetPasswordScreen";

export function RootNavigator() {
  const token = useAuthStore((s) => s.token);
  // A reset link wins over everything else until it's finished or cancelled.
  const [resetToken, setResetToken] = useState(takeResetToken);
  const [openForgot, setOpenForgot] = useState(false);
  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onClose={(requestNew) => {
          clearResetToken();
          setResetToken(null);
          if (requestNew) {
            useAuthStore.getState().logout();
            setOpenForgot(true);
          }
        }}
      />
    );
  }
  return token ? <AppNavigator /> : <AuthStack initialRouteName={openForgot ? "ForgotPassword" : undefined} />;
}
```

  If `useState(takeResetToken)` runs before the auth store has hydrated, that's fine. The reset screen doesn't need auth, and completing it calls `login` itself.

- [ ] **Step 8: Add "Forgot password?" to the login screen.** In `LoginScreen.tsx`, insert directly after the password field's closing `</View>`, before the login button:

```tsx
              <TouchableOpacity
                style={styles.forgotLink}
                onPress={() => navigation.navigate("ForgotPassword", { email: email.trim() || undefined })}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryLinkText, { color: colors.primary }]}>Forgot password?</Text>
              </TouchableOpacity>
```

  Then add `forgotLink: { alignSelf: "flex-end", paddingVertical: 4, marginTop: -6 },` to its StyleSheet.

- [ ] **Step 9: Stop the token leaking through the Referer header.**
  - If `mobile/web/index.html` exists, add `<meta name="referrer" content="no-referrer" />` inside `<head>`.
  - If it doesn't, run `npx expo customize public/index.html` from `mobile/`. It creates `mobile/public/index.html`; add the meta tag there.
  - Check that the exported `index.html` contains the tag after `npx expo export -p web`.

- [ ] **Step 10: Test.**
  - Restart Metro with `--clear`, since `screens/auth/` is a new folder.
  - Run `cd mobile && npx tsc --noEmit -p .` and expect no output.
  - Run `node password-ui.mjs` and expect every line to be PASS at both 390 and 1440.
  - Look at `password-ui-390.png` and check the layout by eye.

- [ ] **Step 11: Commit** (if approved):

```bash
# plus whichever index.html Step 9 edited (mobile/web/index.html or mobile/public/index.html)
git add mobile/src/screens/auth/AuthCardLayout.tsx mobile/src/screens/ForgotPasswordScreen.tsx mobile/src/screens/ResetPasswordScreen.tsx mobile/src/navigation/resetLink.ts mobile/src/navigation/types.ts mobile/src/navigation/AuthStack.tsx mobile/src/navigation/RootNavigator.tsx mobile/src/screens/LoginScreen.tsx
git commit -m "Add Forgot password and Reset password screens"
```

---

### Task 8: Change password in Settings

**Files:**
- Create: `mobile/src/components/ChangePasswordModal.tsx`, test `<scratchpad>/pw/password-settings.mjs`
- Modify: `mobile/src/screens/SettingsScreen.tsx`

**Interfaces:**
- Consumes:
  - From Task 6: `useChangePassword` and `useForgotPassword`
  - Existing: `useMe()` from `api/users`, which now carries `hasPassword`
- Produces: `<ChangePasswordModal visible onClose />`

- [ ] **Step 1: Write the failing browser test.** Create `<scratchpad>/pw/password-settings.mjs`:

```js
// Settings: change password (wrong current, success, stays signed in while polling) and Set a password.
import { execFileSync } from "child_process";
import { chromium } from "playwright-core";
const BACKEND_DIR = "C:/Users/PRASANNA B/Downloads/travel-social-app/backend";
// Turns an account into a Google-only one (no password) for the "Set a password" case.
const dropPassword = (email) =>
  execFileSync("node", ["-e", "require('dotenv/config');const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.update({where:{email:process.argv[1]},data:{passwordHash:null}}).then(()=>p.$disconnect())", email], { cwd: BACKEND_DIR });
const API = "http://localhost:4010", WEB = "http://localhost:8081";
const results = [];
const check = (n, p, x = "") => results.push(`${p ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
const call = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
await call("POST", "/auth/dev/reset-limits");
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function openSettings(token, w) {
  const page = await (await b.newContext({ viewport: { width: w, height: 844 } })).newPage();
  page.setDefaultTimeout(15000);
  page.on("dialog", (d) => { results.push(`      dialog: ${d.message()}`); d.accept(); });
  await page.goto(WEB);
  await page.evaluate((t) => localStorage.setItem("travel_social_token", t), token);
  await page.goto(WEB, { waitUntil: "load" });
  await page.waitForTimeout(5000);
  await page.locator(`text="Profile" >> visible=true`).first().click();
  await page.waitForTimeout(2000);
  await page.locator(`text="Settings" >> visible=true`).first().click();
  await page.waitForTimeout(2000);
  return page;
}
try {
  for (const w of [390, 1440]) {
    const email = `pwset-${w}-${Date.now()}@triply.test`;
    const reg = (await call("POST", "/auth/register", { email, password: "OldPassw0rd!", name: "PW Settings" })).json;
    const page = await openSettings(reg.token, w);
    await page.getByText("Change password").click();
    await page.getByPlaceholder("Current password").fill("wrong-password");
    await page.getByPlaceholder("New password").fill("NewPassw0rd!");
    await page.getByPlaceholder("Confirm new password").fill("NewPassw0rd!");
    await page.getByText("Save", { exact: true }).click();
    await page.waitForTimeout(1500);
    check(`${w}: wrong current password shows an error`, (await page.getByText("Current password is incorrect").count()) > 0);
    // Keep the app polling while the change happens (refetches fire on focus/interval).
    const poll = setInterval(() => page.evaluate(() => window.dispatchEvent(new Event("focus"))).catch(() => {}), 150);
    await page.getByPlaceholder("Current password").fill("OldPassw0rd!");
    await page.getByText("Save", { exact: true }).click();
    await page.waitForTimeout(3000);
    clearInterval(poll);
    check(`${w}: success message shown`, results.some((r) => r.includes("Password changed")));
    check(`${w}: still signed in on this device`, (await page.getByText("Settings").count()) > 0 && (await page.getByText("Log in").count()) === 0);
    check(`${w}: old session token is dead`, (await call("GET", "/users/me", null, reg.token)).json?.code === "SESSION_EXPIRED");
    check(`${w}: new password works`, (await call("POST", "/auth/login", { email, password: "NewPassw0rd!" })).status === 200);
    await page.screenshot({ path: `password-settings-${w}.png` });
    await page.context().close();
  }
  // Passwordless account: the row says "Set a password" and sends an email.
  const email = `pwset-g-${Date.now()}@triply.test`;
  const reg = (await call("POST", "/auth/register", { email, password: "OldPassw0rd!", name: "PW Google" })).json;
  dropPassword(email);
  const page = await openSettings(reg.token, 390);
  check("google-only: row reads Set a password", (await page.getByText("Set a password").count()) > 0);
  await page.getByText("Set a password").click();
  await page.waitForTimeout(1500);
  check("google-only: tells the user to check their email", results.some((r) => r.includes("Check your email")));
  await page.context().close();
} finally {
  await b.close();
  console.log(results.join("\n"));
}
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node password-settings.mjs` from the scratchpad `pw` folder. Expect FAIL: there's no "Change password" row yet. The script's `dropPassword` helper uses Prisma from `backend/` to make the Google-only test account.

- [ ] **Step 3: Write the modal.** Create `mobile/src/components/ChangePasswordModal.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useChangePassword } from "../api/auth";
import { useTheme } from "../theme/ThemeContext";
import { RADIUS } from "../theme/tokens";
import { Alert } from "../utils/alert";

export function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) { setCurrent(""); setNext(""); setConfirm(""); setError(""); }
  }, [visible]);

  const save = () => {
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("Use at least 8 characters for the new password.");
    if (next !== confirm) return setError("New passwords don't match.");
    setError("");
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          onClose();
          Alert.alert("Password changed", "You've been signed out on your other devices.");
        },
        onError: (err: any) => setError(err?.response?.data?.error ?? "Couldn't change your password. Try again."),
      }
    );
  };

  const input = (value: string, onChange: (v: string) => void, placeholder: string, autoComplete: "current-password" | "new-password") => (
    <TextInput
      style={[styles.input, { color: colors.ink, backgroundColor: colors.fieldBg, borderColor: colors.border }]}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedLight}
      secureTextEntry
      autoComplete={autoComplete}
      value={value}
      onChangeText={onChange}
      onSubmitEditing={save}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.ink }]}>Change password</Text>
          {input(current, setCurrent, "Current password", "current-password")}
          {input(next, setNext, "New password", "new-password")}
          {input(confirm, setConfirm, "Confirm new password", "new-password")}
          {!!error && <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]} onPress={onClose} accessibilityRole="button">
              <Text style={{ color: colors.ink, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, opacity: change.isPending ? 0.6 : 1 }]}
              onPress={save}
              disabled={change.isPending}
              accessibilityRole="button"
            >
              {change.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 16 },
  sheet: { width: "100%", maxWidth: 420, alignSelf: "center", borderRadius: RADIUS.card, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  row: { flexDirection: "row", gap: 10, marginTop: 4 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
});
```

- [ ] **Step 4: Add the Account section to Settings.**
  - In `SettingsScreen.tsx`, add these imports:

    ```ts
    import { useState } from "react";
    import { useMe } from "../api/users";
    import { useForgotPassword } from "../api/auth";
    import { ChangePasswordModal } from "../components/ChangePasswordModal";
    import { Alert } from "../utils/alert";
    ```

  - Merge `useState` into the existing `react` import. Inside the component, add:

    ```ts
      const { data: me } = useMe();
      const forgot = useForgotPassword();
      const [changingPassword, setChangingPassword] = useState(false);
      const onPasswordRow = () => {
        if (me?.hasPassword !== false) return setChangingPassword(true);
        if (!me.email) return Alert.alert("No email on this account", "Add an email address to your profile first.");
        forgot.mutate(me.email, {
          onSuccess: () => Alert.alert("Check your email", `We've sent a link to ${me.email} to set your password.`),
          onError: () => Alert.alert("Couldn't send the email", "Try again in a moment."),
        });
      };
    ```

  - Insert this block before `<Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Privacy & Safety</Text>`:

    ```tsx
            <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Account</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.row} onPress={onPasswordRow} disabled={forgot.isPending} accessibilityRole="button">
                <View style={styles.iconWrap}>
                  <MaterialCommunityIcons name="lock-reset" size={18} color={colors.muted} />
                </View>
                <Text style={styles.rowLabel}>{me?.hasPassword === false ? "Set a password" : "Change password"}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedLight} />
              </TouchableOpacity>
            </View>
    ```

  - Render `<ChangePasswordModal visible={changingPassword} onClose={() => setChangingPassword(false)} />` just before the outermost closing `</View>`.

- [ ] **Step 5: Test.**
  - Run `cd mobile && npx tsc --noEmit -p .` and expect no output.
  - Run `node password-settings.mjs` and expect every line to be PASS.
  - Look at `password-settings-390.png` and check the layout by eye.

- [ ] **Step 6: Commit** (if approved):

```bash
git add mobile/src/components/ChangePasswordModal.tsx mobile/src/screens/SettingsScreen.tsx
git commit -m "Add Change password to Settings"
```

---

### Task 9: Admin button

**Files:**
- Modify: `mobile/src/api/admin.ts` (next to `useActivateUser`, around line 288), `mobile/src/screens/admin/Drawers.tsx:181-190`
- Test (scratchpad): `<scratchpad>/pw/password-admin-ui.mjs`

**Interfaces:**
- Consumes:
  - The Task 5 endpoint
  - Existing `useAdminMutation`, `useConfirm` and `useToast`, already used in `Drawers.tsx` and `UsersSection.tsx`
  - Existing `canManage` and `atLeast`
- Produces: `useSendPasswordReset()`, a mutation of `(id: string)`

- [ ] **Step 1: Write the failing browser test.** Create `<scratchpad>/pw/password-admin-ui.mjs`:

```js
// Admin drawer: reset-link button visible to Admin (sends), hidden for Moderator.
import { chromium } from "playwright-core";
const API = "http://localhost:4010", WEB = "http://localhost:8081";
const results = [];
const check = (n, p, x = "") => results.push(`${p ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
const call = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const login = async (who) => (await call("POST", "/auth/login", { email: `admintest-${who}@triply.test`, password: "AdminTest#2026" })).json;
await call("POST", "/auth/dev/reset-limits");
const memberEmail = `pwadm-${Date.now()}@triply.test`;
const member = (await call("POST", "/auth/register", { email: memberEmail, password: "Passw0rd!x", name: `Reset Target ${Date.now() % 10000}` })).json;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function openMember(token) {
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(15000);
  await page.goto(WEB);
  await page.evaluate((t) => localStorage.setItem("travel_social_token", t), token);
  await page.goto(WEB, { waitUntil: "load" });
  await page.waitForTimeout(5000);
  await page.locator(`text="Admin" >> visible=true`).first().click();
  await page.waitForTimeout(2500);
  await page.locator(`text="Users" >> visible=true`).first().click();
  await page.waitForTimeout(1500);
  await page.getByPlaceholder(/Search/).first().fill(member.user.name);
  await page.waitForTimeout(2000);
  await page.locator(`text="${member.user.name}" >> visible=true`).first().click();
  await page.waitForTimeout(2000);
  return page;
}
try {
  const admin = await login("admin");
  const p = await openMember(admin.token);
  check("admin sees the reset-link button", (await p.getByText("Send password reset link").count()) > 0);
  await p.getByText("Send password reset link").click();
  await p.waitForTimeout(800);
  await p.locator(`text="Send link" >> visible=true`).first().click();
  await p.waitForTimeout(2000);
  check("admin gets a confirmation toast", (await p.getByText("Reset link sent").count()) > 0);
  const out = (await call("GET", `/auth/dev/outbox?to=${encodeURIComponent(memberEmail)}`)).json;
  check("the member got the email", Array.isArray(out) && out.length === 1);
  await p.context().close();

  const mod = await login("mod");
  const q = await openMember(mod.token);
  check("moderator does not see the button", (await q.getByText("Send password reset link").count()) === 0);
  await q.context().close();
} finally {
  await b.close();
  console.log(results.join("\n"));
}
```

  Run it and expect FAIL: the button isn't found.

- [ ] **Step 2: Add the hook.** In `mobile/src/api/admin.ts`, add after `useActivateUser`:

```ts
export const useSendPasswordReset = () => useAdminMutation((id: string) => apiClient.post(`/admin/users/${id}/password-reset`));
```

- [ ] **Step 3: Add the button.**
  - In `Drawers.tsx`, import `useSendPasswordReset` from `../../api/admin`. Import `useConfirm` from wherever `UsersSection.tsx` imports it; use the same path.
  - Inside `UserDrawer`, add:

    ```ts
      const confirm = useConfirm();
      const sendReset = useSendPasswordReset();
      const canSendReset = manageable && atLeast(nav.role, "ADMIN") && !!user?.email;
      const onSendReset = () =>
        user &&
        confirm({
          title: "Send a password reset link?",
          message: `We'll email a link to ${user.email}. It works once and expires in 30 minutes.`,
          confirmLabel: "Send link",
          onConfirm: async () => {
            await sendReset.mutateAsync(user.id);
            toast("Reset link sent");
          },
        });
    ```

  - Inside the `{manageable && (<View style={styles.actionRow}> ... </View>)}` block, after the Edit profile button, add:

    ```tsx
                  {canSendReset && <AdminButton label="Send password reset link" icon="lock-reset" onPress={onSendReset} />}
    ```

- [ ] **Step 4: Test.**
  - Run `cd mobile && npx tsc --noEmit -p .` and expect no output.
  - Run `node password-admin-ui.mjs` and expect `4` PASS lines.

- [ ] **Step 5: Commit** (if approved):

```bash
git add mobile/src/api/admin.ts mobile/src/screens/admin/Drawers.tsx
git commit -m "Add Send password reset link to the admin member drawer"
```

---

### Task 10: Regression, deploy and live check

**Files:** none new. This task deploys and verifies.

- [ ] **Step 1: Full regression.**
  - From `backend/`, run all five password smoke tests: `node scripts/smoke-test-password-mailer.mjs`, `-sessions`, `-reset`, `-change` and `-admin`.
  - From the scratchpad `pw/` folder, rerun `nearme-ui.mjs`, `sports-ui.mjs`, `hero-ui.mjs`, `ct-e2e.mjs` and `interest-refresh.mjs`.
  - Run `npx tsc --noEmit -p .` in both `backend/` and `mobile/`.
  - Everything must pass. Report any failure with its output, and don't deploy.

- [ ] **Step 2: Owner sets up Brevo.** Give the owner these steps; don't ask for the key in chat.
  1. Sign up at brevo.com (free plan).
  2. Go to Senders, domains & IPs, then Senders, and add and verify the sender address, for example their Gmail.
  3. Go to SMTP & API, then API keys, and generate a key.
  4. In the Render dashboard, open triply-backend, then Environment, and add `BREVO_API_KEY` (the key), `MAIL_FROM` (`Triply <their verified address>`) and `WEB_APP_URL` (`https://triply-pi-three.vercel.app`). Save.

- [ ] **Step 3: Deploy the backend.**
  - Push to `web-dev-deploy-foundation` (only with the owner's OK to push). Render runs `prisma migrate deploy` during its build.
  - Poll until `POST https://triply-backend-njv4.onrender.com/auth/password/forgot` with `{"email":"nobody@example.com"}` returns `200 {"ok":true}`.
  - Check that `/auth/dev/outbox` returns 404 in production.

- [ ] **Step 4: Deploy the web app.**
  - From `mobile/`, run `EXPO_PUBLIC_API_URL=https://triply-backend-njv4.onrender.com npx expo export -p web --output-dir <scratchpad>/webbuild`.
  - Copy the build into `<scratchpad>/triply/`, keeping `.vercel/` and `vercel.json`.
  - Rename `assets/node_modules` to `assets/vendor`, and sed `/assets/node_modules/` to `/assets/vendor/` in `_expo/**/*.js` and `index.html`. Vercel drops `node_modules` folders, so without this step the icons break.
  - Run `npx vercel deploy --prod --yes`.
  - Check that one vendor `.ttf` returns `200 font/ttf`, and that the deployed `index.html` contains `no-referrer`.

- [ ] **Step 5: Live check with the owner.**
  1. The owner opens the site, taps Forgot password and enters their own email.
  2. They confirm the email arrives, note whether it landed in spam, and open the link.
  3. They set a new password and confirm they're signed in.
  4. They confirm another signed-in browser was signed out.
  5. Report the result. If the email went to spam, tell the owner that verifying a domain in Brevo improves delivery.
