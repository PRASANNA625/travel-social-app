import { prisma } from "../../config/prisma";
import { parsePageParams, toSkipTake } from "../../utils/pagination";

export async function listNotifications(userId: string, query: Record<string, unknown>) {
  const pageParams = parsePageParams(query);
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  return { items, total, unreadCount, ...pageParams };
}

export async function markNotificationRead(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export async function markGroupNotificationsRead(userId: string, groupId: string) {
  return prisma.notification.updateMany({
    where: {
      userId,
      type: { in: ["GROUP_MESSAGE", "MESSAGE_REACTION"] },
      read: false,
      payload: { path: ["groupId"], equals: groupId },
    },
    data: { read: true },
  });
}
