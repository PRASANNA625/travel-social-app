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
