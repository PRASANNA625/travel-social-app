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
