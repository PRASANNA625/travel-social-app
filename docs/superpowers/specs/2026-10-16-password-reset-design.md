# Password reset and change

Date: 2026-10-16
Status: design approved in chat, spec awaiting review

## Goal

Anyone who forgets their password (a regular user or staff) can get a new one by email, signed-in users can change theirs in Settings, and admins can send a user a reset link. Passwords stay bcrypt-hashed, as today.

**Success**
- A forgotten password is recovered end to end through a real email on the live site.
- Resetting or changing a password signs the account out on every other device.
- The forgot-password form never reveals whether an email has an account.

**Out of scope**
- Temporary passwords set by admins.
- Phone/SMS reset (phone login is disabled).
- Email verification at sign-up.
- Translating the new strings. They are added in English; other languages fall back to English, the same as other recent screens.

## 1. Email delivery (Brevo)

New `backend/src/utils/mailer.ts` with `sendMail({ to, subject, html, text })`.

- With `BREVO_API_KEY` set, it POSTs to `https://api.brevo.com/v3/smtp/email` with `api-key: <key>`, using Node's `fetch`. No new dependency.
- The sender comes from `MAIL_FROM` (for example `Triply <you@gmail.com>`), parsed into a name and an email. That address must be a verified sender in Brevo.
- Without the key, and only outside production, it logs the email to the console (subject, recipient and text including the link). Local work and tests need no Brevo account.
- In production with no key, it throws, and the caller logs that error. The forgot-password response stays the same, so nothing leaks.
- Add `brevoApiKey`, `mailFrom` and `webAppUrl` to `config/env.ts`.
  - `WEB_APP_URL` is where reset links point. In production it is `https://triply-pi-three.vercel.app`; locally it defaults to `http://localhost:8081`.
- In `render.yaml`, add `BREVO_API_KEY`, `MAIL_FROM` and `WEB_APP_URL`, all with `sync: false`.
- **One-time setup by the owner:**
  1. Create a free Brevo account.
  2. Add a verified sender.
  3. Create an API key.
  4. Enter the three values in Render's dashboard. The key is never put in chat or in the repo.

## 2. Data model (one Prisma migration)

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique   // sha256 of the raw token; the raw token only ever exists in the email
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  requestIp String?
  @@index([userId, createdAt])
}
```

On `User`, add:
- `passwordChangedAt DateTime?`
- the relation `passwordResetTokens PasswordResetToken[]`

## 3. Signing out other devices

JWTs already carry `iat`. `requireAuth`'s cached account lookup (`isSuspended`, 15s cache) is extended to also fetch `passwordChangedAt`. A token is rejected with `401 { code: "SESSION_EXPIRED" }` when `iat` (in seconds) is earlier than `passwordChangedAt` (rounded down to seconds).

- The same check runs in the socket.io handshake (`backend/src/config/socket.ts`, the `io.use` handler), so chat connections from old sessions are refused too.
- A password change or reset clears that user's cache entry (`invalidateAccountCache`), so it takes effect at once.
- The client's existing 401 handling signs the user out. Confirm that `apiClient` treats `SESSION_EXPIRED` as a sign-out, as it does for an invalid token.
- After a change, the device that made it gets a fresh token in the response, issued after `passwordChangedAt`, so it stays signed in.

## 4. Forgot password

### Backend (auth module)

`POST /auth/password/forgot` takes `{ email }` and always returns `200 { ok: true }` after the same work, whether or not the account exists.

- Look up an `ACTIVE` user by email, case-insensitive. Suspended or missing accounts get no email and the same response.
- **Rate limits** use an in-memory sliding window. That is fine for a single Render instance; the limit resets on restart, which is acceptable.
  - 3 requests per email per hour.
  - 10 requests per IP per hour.
  - Over the limit, the request still returns 200 but sends nothing.
- Generate 32 random bytes and encode them as base64url. Store the sha256 hash with `expiresAt = now + 30 min`.
- Older unused tokens for that user are marked used, so only the newest link works.
- **The email**
  - Subject: "Reset your Triply password".
  - Body: a button and a plain link to `${WEB_APP_URL}/reset-password?token=<raw>`.
  - It says that the link expires in 30 minutes, and that if you didn't ask for this you can ignore it.
  - There are HTML and text versions.

`POST /auth/password/reset` takes `{ token, password }`, where the password is 8–128 characters.

- Hash the token and find a row that is unused and unexpired. If none matches, return `400 "This reset link is invalid or has expired"` with the code `RESET_TOKEN_INVALID`.
- In one transaction:
  - set `passwordHash` to the bcrypt hash of the new password,
  - set `passwordChangedAt` to now,
  - mark the token used,
  - mark the user's other tokens used.
- Then clear the account cache and return the normal auth response (token and user), so the user is signed in.
- Suspended users get the existing 403 from `toAuthResponse`.
- Google-only accounts (where `passwordHash` is null) can set a password this way.

### App

- **LoginScreen:** add a "Forgot password?" link under the password field. It goes to a new auth-stack screen, `ForgotPassword`.
- **ForgotPasswordScreen:** an email field and a Send button. After sending, it shows the neutral message "If that email has an account, we've sent a link to reset your password. It expires in 30 minutes." Buttons: Back to login, and Resend (disabled for 60 seconds).
- **ResetPasswordScreen:** a new auth-stack screen, `ResetPassword`, with param `{ token }`.
  - On web, reaching `/reset-password?token=…` has to open this screen.
  - Until the full linking config from the swipe spec lands, the auth navigator reads `window.location` once on start. If the path is `/reset-password` and a token is present, it starts on this screen and then cleans the URL with `history.replaceState` so the token doesn't sit in the address bar.
  - Fields: new password and confirm, with show/hide toggles. It checks that the passwords match and are at least 8 characters.
  - On success it stores the returned session and enters the app with the message "Password updated".
  - On an invalid token it shows the error and a "Request a new link" button.
- **Signed-in users** who open a reset link get the same screen, mounted in the app stack, so a staff member can finish a reset while signed in elsewhere.

## 5. Change password in Settings

`POST /auth/password/change` (with `requireAuth`) takes `{ currentPassword?, newPassword }`.

- If the user has a `passwordHash`, `currentPassword` is required and must match. Otherwise return `400 "Current password is incorrect"` with code `WRONG_PASSWORD`.
  - Failed attempts are limited to 5 per user per 15 minutes.
- If the user has no password (a Google-only account), return `400` with code `NO_PASSWORD`. The app sends those users through the email flow instead.
- On success:
  - update the hash,
  - set `passwordChangedAt` to now,
  - invalidate all reset tokens,
  - clear the cache,
  - return `{ token }`, a fresh JWT.

  The client swaps in the new token, so this device stays signed in.

**App**

- **SettingsScreen:** add a "Change password" row in the account section.
  - With a password: it opens a modal with Current, New and Confirm fields, and a Save button.
  - Without a password: the row reads "Set a password", and tapping it calls `/auth/password/forgot` for the user's own email and shows a "Check your email" message.
- `GET /users/me`, or the existing current-user payload, gains `hasPassword: boolean`. The hash itself is never sent.

## 6. Admin: send a reset link

`POST /admin/users/:id/password-reset` is available to `ADMIN` and above.

- An Admin can't target a `SUPER_ADMIN`. A Super Admin can target anyone.
- It returns `403` when the rank rule fails, `404` when there's no such user, and `400` when the user has no email.
- It sends the same email as section 4, with the same token rules. The per-email rate limit does not apply, but the admin is limited to 20 of these per hour.
- It writes an audit entry: `action: "user.password_reset_link"`, `targetType: "USER"`, `targetId`, with `details: { via: "admin" }`.
- **App:** in Admin → Users → user detail, add a "Send password reset link" button, shown only when `adminRole >= ADMIN` and the user has an email. It asks for confirmation ("Email a reset link to <email>?"), then shows "Reset link sent".

## Security notes

- Raw tokens are never stored or logged in production. Only the dev console mailer prints links.
- **Constant response:** the forgot endpoint does the same work whether or not the account exists, including the DB lookup, the timing-safe path and an always-200 reply, so it can't be used to find accounts.
- Reset and change both require 8–128 characters. bcrypt cost stays at the existing value.
- The reset page sends `Referrer-Policy: no-referrer` (`<meta name="referrer">` in the web index), and the URL is cleaned after reading the token.

## Testing

**Backend API tests** (node script against the local backend, using the console mailer and reading the link from the server log or a test-only hook enabled when `NODE_ENV=test`):

1. **Forgot**
   - A known and an unknown email return the same body and status.
   - A known email creates one token and an email; an unknown one creates neither.
   - The fourth request within an hour sends nothing.
2. **Reset**
   - It works once. A second use, or an expired token, gives `RESET_TOKEN_INVALID`.
   - A new request makes the older link fail.
   - Afterwards you can log in with the new password and not the old one.
   - An old JWT gets `401 SESSION_EXPIRED` on `/users/me`, and an old socket is refused.
3. **Change**
   - A wrong current password gives `WRONG_PASSWORD`; the sixth failure is rate limited.
   - A success returns a token that works, while the previous token fails.
   - A Google-only account gets `NO_PASSWORD`.
4. **Admin**
   - A moderator gets 403. An Admin targeting a Super Admin gets 403.
   - An Admin targeting a user sends the email and writes the audit row.

**Browser tests** (Playwright, at 390px and 1440px):
- Login, Forgot password, the neutral message, then open the link from the log: reset, signed in, and "Password updated".
- Settings, Change password: a wrong current password shows an error; the right one succeeds and the user stays signed in.
- Admin user detail: the button is visible to an Admin and hidden for a Moderator. Sending shows a confirmation.

**Regression:** existing suites pass, and `tsc` is clean on both projects.

**Live check:** after deploy and Brevo setup, run one real reset to the owner's inbox. Also check that the email doesn't land in spam, and note it if it does.

## Adjustments made during planning

These replace the matching details above. See `docs/superpowers/plans/2026-10-16-password-reset.md`.

- **Session cut-off:** tokens carry a `pwd` claim equal to `passwordChangedAt` in milliseconds, and the check is an exact match. The earlier `iat` comparison had one-second resolution and could miss a token issued in the same second as a change.
- **Live chat after a change:** after a reset or change, the server also disconnects the user's live sockets. The app's socket reads its token on each connect and reconnects, so the device that made the change keeps working.
- **Stale requests:** the app signs out on 401 only when the rejected request carried the current token.
- **Reset link routing:** the reset screen is shown by `RootNavigator` from the captured link token, not registered in both stacks.
- **Admin reset permissions:** the admin reset uses the existing admin rule (`loadTarget`). Only Super Admins act on equal or higher roles, and nobody acts on their own account.
- **Test hook:** it is a dev-only outbox (`DEV_MAIL_INBOX=1`, never in production) at `GET /auth/dev/outbox` and `POST /auth/dev/reset-limits`.
- **Proxy:** in production the backend sets `trust proxy`, so per-IP limits see real client IPs behind Render.
