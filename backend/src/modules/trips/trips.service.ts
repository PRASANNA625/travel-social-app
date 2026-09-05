import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { parsePageParams } from "../../utils/pagination";
import { createGroupWithOwner } from "../groups/groups.service";
import type { CreateTripInput, TripFilters, UpdateTripInput } from "./trips.types";

const cardInclude = {
  owner: { select: { id: true, name: true, photoUrl: true } },
  _count: { select: { likes: true, comments: true, joinRequests: true } },
} satisfies Prisma.TripInclude;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayUTCStart(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function assertValidTripDates(start: Date, end: Date): void {
  const todayUTC = todayUTCStart();
  if (end.getTime() < start.getTime()) {
    throw new HttpError(400, "End date cannot be before the start date");
  }
  if (end.getTime() < todayUTC.getTime()) {
    throw new HttpError(400, "End date must be today or in the future");
  }
}

export async function closeExpiredTrips(): Promise<void> {
  await prisma.trip.updateMany({
    where: { endDate: { lt: todayUTCStart() }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
    data: { status: "COMPLETED" },
  });
}

async function attachViewerFlags<T extends { id: string }>(trips: T[], viewerId?: string) {
  if (!viewerId || trips.length === 0) return trips.map((t) => ({ ...t, isLiked: false, isBookmarked: false }));

  const tripIds = trips.map((t) => t.id);
  const [likes, bookmarks] = await Promise.all([
    prisma.tripLike.findMany({ where: { tripId: { in: tripIds }, userId: viewerId } }),
    prisma.tripBookmark.findMany({ where: { tripId: { in: tripIds }, userId: viewerId } }),
  ]);
  const likedSet = new Set(likes.map((l) => l.tripId));
  const bookmarkedSet = new Set(bookmarks.map((b) => b.tripId));

  return trips.map((t) => ({ ...t, isLiked: likedSet.has(t.id), isBookmarked: bookmarkedSet.has(t.id) }));
}

export async function createTrip(ownerId: string, input: CreateTripInput) {
  assertValidTripDates(input.startDate, input.endDate);
  const trip = await prisma.trip.create({
    data: { ...input, ownerId },
  });
  await createGroupWithOwner(trip.id, ownerId);
  return trip;
}

export async function listTrips(filters: TripFilters, viewerId?: string) {
  // Run the expired-trips sweep concurrently with the read below instead of
  // blocking in front of it - it touches the same table but not the same
  // rows a viewer cares about within a single request, so serializing them
  // only adds a redundant round-trip to every list load for no benefit.
  const closeExpiredPromise = closeExpiredTrips();
  const pageParams = parsePageParams(filters as unknown as Record<string, unknown>);

  const where: Prisma.TripWhereInput = {
    status: { notIn: ["CANCELLED"] },
  };

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { destination: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.destination) where.destination = { contains: filters.destination, mode: "insensitive" };
  if (filters.travelMode) where.travelMode = filters.travelMode;
  if (filters.dateFrom || filters.dateTo) {
    where.startDate = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  if (filters.budgetMin || filters.budgetMax) {
    where.budget = {
      ...(filters.budgetMin ? { gte: filters.budgetMin } : {}),
      ...(filters.budgetMax ? { lte: filters.budgetMax } : {}),
    };
  }

  const useGeoSort = filters.lat !== undefined && filters.lng !== undefined;

  if (useGeoSort) {
    // Geo sort/filter happens in-memory (no PostGIS in this MVP), so pull a
    // bounded working set ordered by recency, then re-sort by distance.
    const [candidates] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: cardInclude,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      closeExpiredPromise,
    ]);

    let withDistance = candidates
      .filter((t) => t.startLat !== null && t.startLng !== null)
      .map((t) => ({ ...t, distanceKm: haversineKm(filters.lat!, filters.lng!, t.startLat!, t.startLng!) }));

    if (filters.radiusKm) {
      withDistance = withDistance.filter((t) => t.distanceKm <= filters.radiusKm!);
    }
    withDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    const total = withDistance.length;
    const start = (pageParams.page - 1) * pageParams.pageSize;
    const pageItems = withDistance.slice(start, start + pageParams.pageSize);

    return { items: await attachViewerFlags(pageItems, viewerId), total, ...pageParams };
  }

  const [items, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      include: cardInclude,
      orderBy: { startDate: "asc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
    }),
    prisma.trip.count({ where }),
    closeExpiredPromise,
  ]);

  return { items: await attachViewerFlags(items, viewerId), total, ...pageParams };
}

export async function getTripById(id: string, viewerId?: string) {
  const [trip] = await Promise.all([
    prisma.trip.findUnique({ where: { id }, include: cardInclude }),
    closeExpiredTrips(),
  ]);
  if (!trip) throw new HttpError(404, "Trip not found");
  const [withFlags] = await attachViewerFlags([trip], viewerId);
  return withFlags;
}

export async function getMyTrips(ownerId: string) {
  const [trips] = await Promise.all([
    prisma.trip.findMany({ where: { ownerId }, include: cardInclude, orderBy: { createdAt: "desc" } }),
    closeExpiredTrips(),
  ]);
  return trips;
}

async function assertOwner(tripId: string, ownerId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.ownerId !== ownerId) throw new HttpError(403, "Only the trip owner can do this");
  return trip;
}

export async function updateTrip(tripId: string, ownerId: string, input: UpdateTripInput) {
  const existing = await assertOwner(tripId, ownerId);
  const effectiveStart = input.startDate ?? existing.startDate;
  const effectiveEnd = input.endDate ?? existing.endDate;

  if (input.startDate !== undefined || input.endDate !== undefined) {
    assertValidTripDates(effectiveStart, effectiveEnd);
  }

  let data = input;
  if (effectiveEnd.getTime() < todayUTCStart().getTime() && data.status && data.status !== "CANCELLED") {
    data = { ...data, status: "COMPLETED" };
  }

  return prisma.trip.update({ where: { id: tripId }, data });
}

export async function cancelTrip(tripId: string, ownerId: string) {
  await assertOwner(tripId, ownerId);
  return prisma.trip.update({ where: { id: tripId }, data: { status: "CANCELLED" } });
}

export async function deleteTrip(tripId: string, ownerId: string) {
  await assertOwner(tripId, ownerId);
  await prisma.trip.delete({ where: { id: tripId } });
}

export async function likeTrip(tripId: string, userId: string) {
  await prisma.tripLike.upsert({
    where: { tripId_userId: { tripId, userId } },
    update: {},
    create: { tripId, userId },
  });
}

export async function unlikeTrip(tripId: string, userId: string) {
  await prisma.tripLike.deleteMany({ where: { tripId, userId } });
}

export async function bookmarkTrip(tripId: string, userId: string) {
  await prisma.tripBookmark.upsert({
    where: { tripId_userId: { tripId, userId } },
    update: {},
    create: { tripId, userId },
  });
}

export async function unbookmarkTrip(tripId: string, userId: string) {
  await prisma.tripBookmark.deleteMany({ where: { tripId, userId } });
}

export async function getBookmarkedTrips(userId: string) {
  const [bookmarks] = await Promise.all([
    prisma.tripBookmark.findMany({
      where: { userId },
      include: { trip: { include: cardInclude } },
      orderBy: { createdAt: "desc" },
    }),
    closeExpiredTrips(),
  ]);
  return bookmarks.map((b) => b.trip);
}

export async function addComment(tripId: string, userId: string, text: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  return prisma.tripComment.create({
    data: { tripId, userId, text },
    include: { user: { select: { id: true, name: true, photoUrl: true } } },
  });
}

export async function listComments(tripId: string) {
  return prisma.tripComment.findMany({
    where: { tripId },
    include: { user: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
}
