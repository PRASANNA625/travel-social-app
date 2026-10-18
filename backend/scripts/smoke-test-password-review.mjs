// Review fixes: a token newer than a stale cached stamp is accepted; optional-auth
// routes ignore tokens from before a password change.
import "dotenv/config";
import jwt from "jsonwebtoken";
import prismaPkg from "@prisma/client";
import { request, check, report, register, resetLimits } from "./lib/http.mjs";

const prisma = new prismaPkg.PrismaClient();
await resetLimits();

// The token issued by a change carries pwd = the new stamp. If the server still has
// the old stamp cached (a read that raced the change), that token must not be refused.
const a = await register("race");
const ahead = jwt.sign({ sub: a.user.id, pwd: Date.now() + 60_000 }, process.env.JWT_SECRET, { expiresIn: "1h" });
const r = await request("GET", "/users/me", { token: ahead });
check("a token newer than the cached password stamp is accepted", r.status === 200, `${r.status} ${r.data?.code ?? ""}`);
const behind = jwt.sign({ sub: a.user.id, pwd: -1 }, process.env.JWT_SECRET, { expiresIn: "1h" });
check("a token older than the password stamp is still refused", (await request("GET", "/users/me", { token: behind })).status === 401);

// Optional-auth routes: a liked trip shows isLiked for the owner's current token only.
const b = await register("optauth");
const trip = (await request("POST", "/trips", {
  token: b.token,
  body: {
    title: "Opt auth check", destination: "Hampi, India", startLocation: "Bengaluru, India",
    startDate: new Date(Date.now() + 4 * 864e5).toISOString(), endDate: new Date(Date.now() + 6 * 864e5).toISOString(),
    travelMode: "CAR", seats: 3, description: "Optional auth review test.", placesToVisit: [], images: [], joinType: "OPEN",
  },
})).data;
await request("POST", `/trips/${trip.id}/like`, { token: b.token });
check("current token sees its own like", (await request("GET", `/trips/${trip.id}`, { token: b.token })).data?.isLiked === true);
const changed = await request("POST", "/auth/password/change", { token: b.token, body: { currentPassword: b.password, newPassword: "Changed123!x" } });
const stale = await request("GET", `/trips/${trip.id}`, { token: b.token });
check("old token is treated as signed out on optional-auth routes", stale.status === 200 && stale.data?.isLiked === false, `isLiked ${stale.data?.isLiked}`);
check("new token still sees the like", (await request("GET", `/trips/${trip.id}`, { token: changed.data.token })).data?.isLiked === true);

await request("DELETE", `/trips/${trip.id}`, { token: changed.data.token });
await prisma.$disconnect();
report();
