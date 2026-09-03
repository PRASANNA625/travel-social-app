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
