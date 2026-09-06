import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { emitToUser } from "../../config/socket";

export async function notify(userId: string, type: string, payload: Record<string, unknown>) {
  const notification = await prisma.notification.create({
    data: { userId, type, payload: payload as Prisma.InputJsonValue },
  });
  emitToUser(userId, "notification:new", notification);
  return notification;
}

export interface GroupMessagePayload {
  groupId: string;
  tripId: string;
  tripTitle: string;
  senderId: string;
  senderName: string;
  messageType: "TEXT" | "IMAGE";
  content: string | null;
}

// While the recipient has an unread GROUP_MESSAGE notification for this same
// group, fold new messages into it (bump payload + createdAt) instead of
// piling up a fresh row per message. A new unread notification is created
// once the previous one has been read.
export async function notifyGroupMessage(userId: string, payload: GroupMessagePayload) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "GROUP_MESSAGE",
      read: false,
      payload: { path: ["groupId"], equals: payload.groupId },
    },
  });

  const notification = existing
    ? await prisma.notification.update({
        where: { id: existing.id },
        data: { payload: payload as unknown as Prisma.InputJsonValue, createdAt: new Date() },
      })
    : await prisma.notification.create({
        data: { userId, type: "GROUP_MESSAGE", payload: payload as unknown as Prisma.InputJsonValue },
      });

  emitToUser(userId, "notification:new", notification);
  return notification;
}
