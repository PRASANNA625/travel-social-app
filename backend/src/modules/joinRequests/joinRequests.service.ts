import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { addMemberToGroup } from "../groups/groups.service";
import { notify } from "../notifications/notify";
import { emitToGroup } from "../../config/socket";

async function finalizeApproval(tripId: string, userId: string) {
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

  await notify(userId, "JOIN_REQUEST_APPROVED", { tripId, tripTitle: trip.title });
}

export async function createJoinRequest(tripId: string, userId: string, message?: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.ownerId === userId) throw new HttpError(400, "You can't request to join your own trip");
  if (trip.status === "CANCELLED" || trip.status === "FULL" || trip.status === "COMPLETED") {
    throw new HttpError(400, "This trip is no longer accepting participants");
  }
  if (trip.joinType === "INVITE_ONLY") {
    throw new HttpError(403, "This trip is invite-only. The organizer must add you directly.");
  }

  const existing = await prisma.joinRequest.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
  if (existing) throw new HttpError(409, "You've already requested to join this trip");

  const autoApprove = trip.joinType === "OPEN";
  const request = await prisma.joinRequest.create({
    data: { tripId, userId, message, status: autoApprove ? "APPROVED" : "PENDING" },
  });

  if (autoApprove) {
    await finalizeApproval(tripId, userId);
  } else {
    await notify(trip.ownerId, "NEW_JOIN_REQUEST", { tripId, tripTitle: trip.title, userId });
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

export async function inviteUser(tripId: string, ownerId: string, userId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.ownerId !== ownerId) throw new HttpError(403, "Only the trip owner can invite participants");

  const existing = await prisma.joinRequest.findUnique({ where: { tripId_userId: { tripId, userId } } });
  if (existing?.status === "APPROVED") throw new HttpError(409, "This user is already a participant");

  const request = await prisma.joinRequest.upsert({
    where: { tripId_userId: { tripId, userId } },
    update: { status: "APPROVED" },
    create: { tripId, userId, status: "APPROVED" },
  });

  await finalizeApproval(tripId, userId);
  return request;
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
