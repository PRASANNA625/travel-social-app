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
