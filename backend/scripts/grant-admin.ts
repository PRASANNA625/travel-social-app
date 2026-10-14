// Grants a dashboard role to an existing account (used once to create the first
// Super Admin; after that, Super Admins assign roles from the dashboard).
//
//   npm run admin:grant -- someone@example.com SUPER_ADMIN
//   npm run admin:grant -- someone@example.com USER        (removes admin access)
import { PrismaClient, UserRole } from "@prisma/client";

async function main() {
  const [identifier, roleArg = "SUPER_ADMIN"] = process.argv.slice(2);
  const roles = Object.values(UserRole) as string[];
  if (!identifier || !roles.includes(roleArg)) {
    console.error(`Usage: npm run admin:grant -- <email or phone> [${roles.join("|")}]`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
      select: { id: true, name: true, role: true },
    });
    if (!user) {
      console.error(`No account found for ${identifier}. Sign up in the app first.`);
      process.exit(1);
    }
    const role = roleArg as UserRole;
    await prisma.user.update({ where: { id: user.id }, data: { role } });
    await prisma.auditLog.create({
      data: { actorId: null, action: "user.role_change", targetType: "USER", targetId: user.id, details: { from: user.role, to: role, via: "cli" } },
    });
    console.log(`${user.name} (${identifier}): ${user.role} -> ${role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
