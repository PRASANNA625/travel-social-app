import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { notify } from "../notifications/notify";
import { publicUserSelect } from "../users/users.service";
import type { ReportReason } from "./safety.types";

async function assertUserExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "User not found");
}

export async function reportUser(reporterId: string, reportedId: string, reason: ReportReason, details?: string) {
  if (reporterId === reportedId) throw new HttpError(400, "You can't report yourself");
  await assertUserExists(reportedId);

  const report = await prisma.userReport.create({
    data: { reporterId, reportedId, reason, details: details ?? null },
  });
  await notify(reporterId, "REPORT_RECEIVED", { reportedUserId: reportedId, reason });
  return report;
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new HttpError(400, "You can't block yourself");
  await assertUserExists(blockedId);

  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  });

  await prisma.buddyConnection.updateMany({
    where: {
      status: "PENDING",
      OR: [
        { fromUserId: blockerId, toUserId: blockedId },
        { fromUserId: blockedId, toUserId: blockerId },
      ],
    },
    data: { status: "REJECTED" },
  });
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
}

export async function listBlockedUsers(blockerId: string) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId },
    include: { blocked: { select: publicUserSelect } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => r.blocked);
}
