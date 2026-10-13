import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";

export async function createGroupWithOwner(tripId: string, ownerId: string) {
  return prisma.group.create({
    data: {
      tripId,
      members: { create: { userId: ownerId, role: "OWNER" } },
    },
  });
}

export async function addMemberToGroup(tripId: string, userId: string) {
  const group = await prisma.group.upsert({
    where: { tripId },
    update: {},
    create: { tripId },
  });

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId } },
    update: {},
    create: { groupId: group.id, userId, role: "MEMBER" },
  });

  return group;
}

async function assertMember(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new HttpError(403, "You are not a member of this group");
  return membership;
}

export async function getGroupForTrip(tripId: string, userId: string) {
  const group = await prisma.group.findUnique({
    where: { tripId },
    include: {
      trip: true,
      members: { include: { user: { select: { id: true, name: true, photoUrl: true } } } },
    },
  });
  if (!group) throw new HttpError(404, "This trip doesn't have a group yet");
  await assertMember(group.id, userId);
  return group;
}

export async function getGroupById(groupId: string, userId: string) {
  await assertMember(groupId, userId);
  return prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      trip: true,
      members: { include: { user: { select: { id: true, name: true, photoUrl: true } } } },
    },
  });
}

export { assertMember };

const CHAT_NOTIFICATION_TYPES = ["GROUP_MESSAGE", "MESSAGE_REACTION"];

// Inbox: every group chat the user belongs to, newest activity first, with the
// last message and how many chat notifications are still unread for it.
export async function listGroupsForUser(userId: string) {
  const [memberships, unread] = await Promise.all([
    prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            trip: {
              select: { id: true, title: true, destination: true, images: true, travelMode: true, startDate: true, endDate: true },
            },
            _count: { select: { members: true } },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, type: true, content: true, createdAt: true, sender: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
    prisma.notification.findMany({
      where: { userId, read: false, type: { in: CHAT_NOTIFICATION_TYPES } },
      select: { payload: true },
    }),
  ]);

  const unreadByGroup = new Map<string, number>();
  for (const n of unread) {
    const groupId = (n.payload as { groupId?: unknown } | null)?.groupId;
    if (typeof groupId === "string") unreadByGroup.set(groupId, (unreadByGroup.get(groupId) ?? 0) + 1);
  }

  return memberships
    .map(({ group, role, joinedAt }) => ({
      id: group.id,
      role,
      trip: group.trip,
      memberCount: group._count.members,
      lastMessage: group.messages[0] ?? null,
      unreadCount: unreadByGroup.get(group.id) ?? 0,
      lastActivityAt: (group.messages[0]?.createdAt ?? joinedAt).toISOString(),
    }))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}
