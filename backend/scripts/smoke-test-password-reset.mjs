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
