import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { notify } from "../notifications/notify";
import { publicUserSelect } from "../users/users.service";
import type { ReportReason } from "./safety.types";

async function assertUserExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new HttpError(404, "User not found");
}

// What moderators see of a reported chat message: that message only, copied at
// report time so it survives later edits or removal.
async function messageSnapshot(reporterId: string, reportedId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      groupId: true,
      senderId: true,
      type: true,
      content: true,
      mediaUrl: true,
      durationMs: true,
      createdAt: true,
      group: { select: { trip: { select: { id: true, title: true } } } },
    },
  });
  if (!message) throw new HttpError(404, "Message not found");
  if (message.senderId !== reportedId) throw new HttpError(400, "That message wasn't sent by this person");
  // Only people in the chat could have seen the message.
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: message.groupId, userId: reporterId } },
    select: { userId: true },
  });
  if (!member) throw new HttpError(403, "You're not part of this chat");
  return {
    type: message.type,
    content: message.content,
    mediaUrl: message.mediaUrl,
    durationMs: message.durationMs,
    sentAt: message.createdAt.toISOString(),
    groupId: message.groupId,
    tripId: message.group.trip.id,
    tripTitle: message.group.trip.title,
  };
}

export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  details?: string,
  messageId?: string
) {
  if (reporterId === reportedId) throw new HttpError(400, "You can't report yourself");
  await assertUserExists(reportedId);
  const snapshot = messageId ? await messageSnapshot(reporterId, reportedId, messageId) : null;

  const report = await prisma.userReport.create({
    data: {
      reporterId,
      reportedId,
      reason,
      details: details ?? null,
      ...(snapshot ? { messageId, messageSnapshot: snapshot } : {}),
    },
  });
  await notify(reporterId, "REPORT_RECEIVED", { reportedUserId: reportedId, reason });
  return report;
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new HttpError(400, "You can't block yourself");
  await assertUserExists(blockedId);

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: {},
      create: { blockerId, blockedId },
    }),
    prisma.buddyConnection.updateMany({
      where: {
        status: "PENDING",
        OR: [
          { fromUserId: blockerId, toUserId: blockedId },
          { fromUserId: blockedId, toUserId: blockerId },
        ],
      },
      data: { status: "REJECTED" },
    }),
  ]);
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
