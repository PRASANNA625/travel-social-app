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
  messageId: string;
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

export interface MessageReactionPayload {
  groupId: string;
  tripId: string;
  tripTitle: string;
  messageId: string;
  messageType: "TEXT" | "IMAGE";
  content: string | null;
  reactorId: string;
  reactorName: string;
  reactorPhotoUrl: string | null;
  emoji: string;
}

// Collapses repeated reactions to the same message into one unread
// notification (latest reactor/emoji wins), mirroring notifyGroupMessage's
// per-group collapse above. Keyed by messageId, so reactions on different
// messages the recipient owns each still get their own notification.
export async function notifyMessageReaction(userId: string, payload: MessageReactionPayload) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "MESSAGE_REACTION",
      read: false,
      payload: { path: ["messageId"], equals: payload.messageId },
    },
  });

  const notification = existing
    ? await prisma.notification.update({
        where: { id: existing.id },
        data: { payload: payload as unknown as Prisma.InputJsonValue, createdAt: new Date() },
      })
    : await prisma.notification.create({
        data: { userId, type: "MESSAGE_REACTION", payload: payload as unknown as Prisma.InputJsonValue },
      });

  emitToUser(userId, "notification:new", notification);
  return notification;
}

// Undoing a reaction retracts the still-unread notification announcing it,
// but only when it's still about the same reactor - if someone else reacted
// after (collapsing the notification onto them) or the recipient already
// read it, the undo leaves it alone.
export async function retractMessageReactionNotification(
  userId: string,
  messageId: string,
  reactorId: string
) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "MESSAGE_REACTION",
      read: false,
      payload: { path: ["messageId"], equals: messageId },
    },
  });
  if (!existing) return;
  const existingReactorId = (existing.payload as Record<string, unknown> | null)?.reactorId;
  if (existingReactorId !== reactorId) return;

  await prisma.notification.delete({ where: { id: existing.id } });
  emitToUser(userId, "notification:removed", { id: existing.id });
}

export interface TripCommentPayload {
  tripId: string;
  tripTitle: string;
  commentId: string;
  commenterId: string;
  commenterName: string;
  commenterPhotoUrl: string | null;
  content: string;
}

// Collapses repeated comments on the same trip into one unread notification
// (latest comment/commenter wins), mirroring notifyGroupMessage's per-group
// collapse above - the trip owner doesn't need a fresh row for every comment
// piling up while they haven't looked yet.
export async function notifyTripComment(userId: string, payload: TripCommentPayload) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "TRIP_COMMENT",
      read: false,
      payload: { path: ["tripId"], equals: payload.tripId },
    },
  });

  const notification = existing
    ? await prisma.notification.update({
        where: { id: existing.id },
        data: { payload: payload as unknown as Prisma.InputJsonValue, createdAt: new Date() },
      })
    : await prisma.notification.create({
        data: { userId, type: "TRIP_COMMENT", payload: payload as unknown as Prisma.InputJsonValue },
      });

  emitToUser(userId, "notification:new", notification);
  return notification;
}
