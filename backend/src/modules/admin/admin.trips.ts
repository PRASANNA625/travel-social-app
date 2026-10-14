import type { Prisma, TravelMode, TripStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { emitToGroup } from "../../config/socket";
import { parsePageParams } from "../../utils/pagination";
import { notify } from "../notifications/notify";
import { respondToRequest } from "../joinRequests/joinRequests.service";
import { logAction } from "./audit";

const adminTripSelect = {
  id: true,
  title: true,
  destination: true,
  startLocation: true,
  startDate: true,
  endDate: true,
  travelMode: true,
  category: true,
  sport: true,
  status: true,
  featured: true,
  hidden: true,
  seats: true,
  seatsFilled: true,
  joinType: true,
  images: true,
  avgRating: true,
  reviewCount: true,
  createdAt: true,
  owner: { select: { id: true, name: true, photoUrl: true, status: true } },
  _count: { select: { joinRequests: true, comments: true, reviews: true, likes: true } },
} satisfies Prisma.TripSelect;

export interface TripListFilters {
  search?: string;
  status?: TripStatus;
  travelMode?: TravelMode;
  featured?: boolean;
  hidden?: boolean;
  upcoming?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listTrips(filters: TripListFilters) {
  const pageParams = parsePageParams(filters as Record<string, unknown>, 20, 100);
  const where: Prisma.TripWhereInput = {};
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { destination: { contains: filters.search, mode: "insensitive" } },
      { owner: { name: { contains: filters.search, mode: "insensitive" } } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.travelMode) where.travelMode = filters.travelMode;
  if (filters.featured !== undefined) where.featured = filters.featured;
  if (filters.hidden !== undefined) where.hidden = filters.hidden;
  if (filters.upcoming) where.startDate = { gte: new Date() };

  const [items, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      select: adminTripSelect,
      orderBy: { createdAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
    }),
    prisma.trip.count({ where }),
  ]);
  return { items, total, ...pageParams };
}

// Trip detail for admins, including its "event" side: participants and join requests.
export async function getTripDetail(id: string) {
  const trip = await prisma.trip.findUnique({
    where: { id },
    select: {
      ...adminTripSelect,
      description: true,
      budget: true,
      group: {
        select: {
          id: true,
          members: {
            select: { role: true, joinedAt: true, user: { select: { id: true, name: true, photoUrl: true, status: true } } },
            orderBy: { joinedAt: "asc" },
          },
        },
      },
      joinRequests: {
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
          user: { select: { id: true, name: true, photoUrl: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!trip) throw new HttpError(404, "Trip not found");
  const auditTrail = await prisma.auditLog.findMany({
    where: { targetType: "TRIP", targetId: id },
    select: { id: true, action: true, details: true, createdAt: true, actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return { ...trip, auditTrail };
}

export interface AdminTripUpdate {
  title?: string;
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  travelMode?: TravelMode;
  status?: TripStatus;
  featured?: boolean;
  hidden?: boolean;
}

export async function updateTrip(actorId: string, id: string, data: AdminTripUpdate) {
  const existing = await prisma.trip.findUnique({ where: { id }, select: { startDate: true, endDate: true } });
  if (!existing) throw new HttpError(404, "Trip not found");
  const startDate = data.startDate ?? existing.startDate;
  const endDate = data.endDate ?? existing.endDate;
  if (endDate < startDate) throw new HttpError(400, "End date can't be before the start date");

  const trip = await prisma.trip.update({ where: { id }, data, select: adminTripSelect });
  await logAction(actorId, actionFor(data), "TRIP", id, { changes: serializeChanges(data) });
  return trip;
}

// A specific action name for the common one-flag changes; "trip.update" otherwise.
function actionFor(data: AdminTripUpdate) {
  const keys = Object.keys(data);
  if (keys.length === 1) {
    if (data.featured !== undefined) return data.featured ? "trip.feature" : "trip.unfeature";
    if (data.hidden !== undefined) return data.hidden ? "trip.hide" : "trip.unhide";
    if (data.status === "CANCELLED") return "trip.cancel";
    if (data.status === "COMPLETED") return "trip.close";
  }
  return "trip.update";
}

function serializeChanges(data: AdminTripUpdate) {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
  );
}

export type TripBulkAction = "feature" | "unfeature" | "hide" | "unhide" | "cancel" | "close";

const BULK_UPDATES: Record<TripBulkAction, AdminTripUpdate> = {
  feature: { featured: true },
  unfeature: { featured: false },
  hide: { hidden: true },
  unhide: { hidden: false },
  cancel: { status: "CANCELLED" },
  close: { status: "COMPLETED" },
};

export async function bulkUpdateTrips(actorId: string, ids: string[], action: TripBulkAction) {
  const result = await prisma.trip.updateMany({ where: { id: { in: ids } }, data: BULK_UPDATES[action] });
  await Promise.all(ids.map((id) => logAction(actorId, actionFor(BULK_UPDATES[action]), "TRIP", id, { bulk: true })));
  return { updated: result.count };
}

export async function deleteTrip(actorId: string, id: string, reason: string) {
  const trip = await prisma.trip.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true } });
  if (!trip) throw new HttpError(404, "Trip not found");
  await prisma.trip.delete({ where: { id } });
  await notify(trip.ownerId, "TRIP_REMOVED_BY_ADMIN", { tripTitle: trip.title, reason });
  await logAction(actorId, "trip.delete", "TRIP", id, { title: trip.title, ownerId: trip.ownerId, reason });
}

// Event management: approve/decline a pending join request on the organizer's behalf.
// Goes through the normal flow, so seats, the trip group and notifications stay consistent.
export async function decideJoinRequest(actorId: string, requestId: string, approve: boolean) {
  const request = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    select: { id: true, tripId: true, userId: true, trip: { select: { ownerId: true } } },
  });
  if (!request) throw new HttpError(404, "Join request not found");
  const updated = await respondToRequest(requestId, request.trip.ownerId, approve);
  await logAction(actorId, approve ? "join_request.approve" : "join_request.reject", "JOIN_REQUEST", requestId, {
    tripId: request.tripId,
    userId: request.userId,
  });
  return updated;
}

// Removes a participant (never the organizer) and frees their seat.
export async function removeParticipant(actorId: string, tripId: string, userId: string, reason: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, title: true, ownerId: true, seats: true, seatsFilled: true, status: true, group: { select: { id: true } } },
  });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (userId === trip.ownerId) throw new HttpError(400, "The organizer can't be removed from their own trip");
  if (!trip.group) throw new HttpError(404, "This trip has no participants yet");

  const removed = await prisma.groupMember.deleteMany({ where: { groupId: trip.group.id, userId } });
  if (removed.count === 0) throw new HttpError(404, "This person isn't a participant");

  const seatsFilled = Math.max(0, trip.seatsFilled - 1);
  // Reopen a full trip once a seat frees up; leave every other status alone.
  const status =
    (trip.status === "FULL" || trip.status === "ALMOST_FULL") && seatsFilled < trip.seats * 0.8 ? "OPEN" : trip.status;
  await prisma.trip.update({ where: { id: tripId }, data: { seatsFilled, status } });
  await prisma.joinRequest.updateMany({ where: { tripId, userId }, data: { status: "REJECTED" } });

  emitToGroup(trip.group.id, "group:member_left", { groupId: trip.group.id, userId });
  await notify(userId, "REMOVED_FROM_TRIP", { tripId, tripTitle: trip.title });
  await logAction(actorId, "trip.remove_participant", "GROUP_MEMBER", userId, { tripId, reason });
}
