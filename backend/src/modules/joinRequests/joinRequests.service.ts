import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { addMemberToGroup } from "../groups/groups.service";
import { notify } from "../notifications/notify";
import { emitToGroup } from "../../config/socket";

const CLOSED_STATUSES = ["CANCELLED", "FULL", "COMPLETED"];

async function finalizeApproval(tripId: string, userId: string, via: "request" | "invitation" = "request") {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const group = await addMemberToGroup(tripId, userId);

  const seatsFilled = trip.seatsFilled + 1;
  const status =
    seatsFilled >= trip.seats ? "FULL" : seatsFilled >= trip.seats * 0.8 ? "ALMOST_FULL" : trip.status;

  await prisma.trip.update({ where: { id: tripId }, data: { seatsFilled, status } });

  const member = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, photoUrl: true },
  });
  emitToGroup(group.id, "group:member_joined", { groupId: group.id, member });

  if (via === "invitation") {
    await notify(trip.ownerId, "INVITATION_ACCEPTED", { tripId, tripTitle: trip.title, userId, userName: member.name });
  } else {
    await notify(userId, "JOIN_REQUEST_APPROVED", { tripId, tripTitle: trip.title });
  }
}

export async function createJoinRequest(tripId: string, userId: string, message?: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.ownerId === userId) throw new HttpError(400, "You can't request to join your own trip");
  if (trip.status === "CANCELLED" || trip.status === "FULL" || trip.status === "COMPLETED") {
    throw new HttpError(400, "This trip is no longer accepting participants");
  }
  if (trip.joinType === "INVITE_ONLY") {
    const invited = await prisma.joinRequest.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { status: true } });
    if (invited?.status !== "INVITED") throw new HttpError(403, "This trip is invite-only. The organizer must invite you.");
  }

  const existing = await prisma.joinRequest.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
  // Asking to join something you were invited to is accepting the invitation.
  if (existing?.status === "INVITED") return respondToInvitation(existing.id, userId, true);
  if (existing) throw new HttpError(409, "You've already requested to join this trip");

  const autoApprove = trip.joinType === "OPEN";
  const request = await prisma.joinRequest.create({
    data: { tripId, userId, message, status: autoApprove ? "APPROVED" : "PENDING" },
  });

  if (autoApprove) {
    await finalizeApproval(tripId, userId);
  } else {
    await notify(trip.ownerId, "NEW_JOIN_REQUEST", { tripId, tripTitle: trip.title, userId, requestId: request.id });
  }

  return request;
}

export async function listRequestsForTrip(tripId: string, ownerId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.ownerId !== ownerId) throw new HttpError(403, "Only the trip owner can view join requests");

  return prisma.joinRequest.findMany({
    where: { tripId },
    include: { user: { select: { id: true, name: true, photoUrl: true, bio: true, location: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function respondToRequest(requestId: string, ownerId: string, approve: boolean) {
  const request = await prisma.joinRequest.findUnique({ where: { id: requestId }, include: { trip: true } });
  if (!request) throw new HttpError(404, "Join request not found");
  if (request.trip.ownerId !== ownerId) throw new HttpError(403, "Only the trip owner can respond to this request");
  if (request.status !== "PENDING") throw new HttpError(400, "This request has already been handled");

  const updated = await prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: approve ? "APPROVED" : "REJECTED" },
  });

  if (approve) {
    await finalizeApproval(request.tripId, request.userId);
  } else {
    await notify(request.userId, "JOIN_REQUEST_REJECTED", { tripId: request.tripId, tripTitle: request.trip.title });
  }

  return updated;
}

// Organizers invite their accepted travel buddies. The invitee accepts or declines.
async function areBuddies(a: string, b: string) {
  const connection = await prisma.buddyConnection.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { fromUserId: a, toUserId: b },
        { fromUserId: b, toUserId: a },
      ],
    },
    select: { id: true },
  });
  return !!connection;
}

async function isBlockedEitherWay(a: string, b: string) {
  const block = await prisma.userBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return !!block;
}

export async function inviteUser(tripId: string, ownerId: string, userId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.ownerId !== ownerId) throw new HttpError(403, "Only the organizer can send invitations");
  if (userId === ownerId) throw new HttpError(400, "You're already the organizer");
  if (CLOSED_STATUSES.includes(trip.status)) throw new HttpError(400, "This isn't taking participants any more");
  if (!(await areBuddies(ownerId, userId)) || (await isBlockedEitherWay(ownerId, userId))) {
    throw new HttpError(403, "You can only invite your travel buddies");
  }

  const existing = await prisma.joinRequest.findUnique({ where: { tripId_userId: { tripId, userId } } });
  if (existing?.status === "APPROVED") throw new HttpError(409, "They're already taking part");
  if (existing?.status === "INVITED") throw new HttpError(409, "They're already invited");
  // They asked to join already: inviting them is approving that request.
  if (existing?.status === "PENDING") return respondToRequest(existing.id, ownerId, true);

  const invitation = await prisma.joinRequest.upsert({
    where: { tripId_userId: { tripId, userId } },
    update: { status: "INVITED" },
    create: { tripId, userId, status: "INVITED" },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { name: true } });
  await notify(userId, "TRIP_INVITATION", {
    tripId,
    tripTitle: trip.title,
    category: trip.category,
    inviterId: ownerId,
    inviterName: owner.name,
    requestId: invitation.id,
  });
  return invitation;
}

export async function respondToInvitation(requestId: string, userId: string, accept: boolean) {
  const invitation = await prisma.joinRequest.findUnique({ where: { id: requestId }, include: { trip: true } });
  if (!invitation || invitation.userId !== userId) throw new HttpError(404, "Invitation not found");
  if (invitation.status !== "INVITED") throw new HttpError(400, "This invitation has already been answered");
  if (accept && CLOSED_STATUSES.includes(invitation.trip.status)) {
    throw new HttpError(400, "Sorry, this isn't taking participants any more");
  }

  const updated = await prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: accept ? "APPROVED" : "REJECTED" },
  });
  if (accept) {
    await finalizeApproval(invitation.tripId, userId, "invitation");
  } else {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    await notify(invitation.trip.ownerId, "INVITATION_DECLINED", {
      tripId: invitation.tripId,
      tripTitle: invitation.trip.title,
      userId,
      userName: me.name,
    });
  }
  return updated;
}

// The organizer's buddies, each with where they stand on this trip.
export async function invitableBuddies(tripId: string, ownerId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.ownerId !== ownerId) throw new HttpError(403, "Only the organizer can send invitations");

  const [connections, blocks, requests] = await Promise.all([
    prisma.buddyConnection.findMany({
      where: { status: "ACCEPTED", OR: [{ fromUserId: ownerId }, { toUserId: ownerId }] },
      select: {
        fromUser: { select: { id: true, name: true, photoUrl: true, location: true } },
        toUser: { select: { id: true, name: true, photoUrl: true, location: true } },
      },
    }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: ownerId }, { blockedId: ownerId }] },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.joinRequest.findMany({ where: { tripId }, select: { userId: true, status: true } }),
  ]);
  const blocked = new Set(blocks.map((b) => (b.blockerId === ownerId ? b.blockedId : b.blockerId)));
  const statusOf = new Map(requests.map((r) => [r.userId, r.status]));
  return connections
    .map((c) => (c.fromUser.id === ownerId ? c.toUser : c.fromUser))
    .filter((u) => !blocked.has(u.id))
    .map((u) => ({ ...u, status: statusOf.get(u.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Invitations waiting for the signed-in user's answer.
export async function myInvitations(userId: string) {
  return prisma.joinRequest.findMany({
    where: { userId, status: "INVITED", trip: { status: { notIn: ["CANCELLED", "COMPLETED"] }, hidden: false } },
    include: { trip: { include: { owner: { select: { id: true, name: true, photoUrl: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function myJoinRequests(userId: string) {
  return prisma.joinRequest.findMany({
    where: { userId },
    include: { trip: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function myJoinRequestForTrip(tripId: string, userId: string) {
  return prisma.joinRequest.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
}
