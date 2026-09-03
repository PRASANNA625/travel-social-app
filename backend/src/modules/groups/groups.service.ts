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
