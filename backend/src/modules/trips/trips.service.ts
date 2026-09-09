import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { parsePageParams } from "../../utils/pagination";
import { createGroupWithOwner } from "../groups/groups.service";
import { notifyTripComment } from "../notifications/notify";
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

const TRENDING_CANDIDATE_LIMIT = 100;
const SECTION_RESULT_LIMIT = 10;

function upcomingOpenWhere(): Prisma.TripWhereInput {
  return {
    status: { in: ["PLANNING", "OPEN", "ALMOST_FULL"] },
    startDate: { gte: new Date() },
  };
}

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function engagementScore(trip: {
  _count: { likes: number; comments: number; joinRequests: number };
  createdAt: Date;
}): number {
  const recencyBoost = Math.max(0, 5 - daysSince(trip.createdAt) * 0.5);
  return trip._count.likes * 2 + trip._count.comments * 1.5 + trip._count.joinRequests * 3 + recencyBoost;
}

export async function getTrendingTrips(viewerId?: string, limit = SECTION_RESULT_LIMIT) {
  const candidates = await prisma.trip.findMany({
    where: upcomingOpenWhere(),
    include: cardInclude,
    orderBy: { createdAt: "desc" },
    take: TRENDING_CANDIDATE_LIMIT,
  });

  const ranked = candidates
    .map((t) => ({ ...t, score: engagementScore(t) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...rest }) => rest);

  return attachViewerFlags(ranked, viewerId);
}

export async function getRecommendedTrips(userId: string, limit = SECTION_RESULT_LIMIT) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferredModes: true } });

  const [joinedGroups, likes, bookmarks] = await Promise.all([
    prisma.groupMember.findMany({
      where: { userId },
      include: { group: { include: { trip: { select: { travelMode: true, destination: true } } } } },
      orderBy: { joinedAt: "desc" },
      take: 20,
    }),
    prisma.tripLike.findMany({
      where: { userId },
      include: { trip: { select: { travelMode: true, destination: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.tripBookmark.findMany({
      where: { userId },
      include: { trip: { select: { travelMode: true, destination: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const historyTrips = [
    ...joinedGroups.map((g) => g.group.trip),
    ...likes.map((l) => l.trip),
    ...bookmarks.map((b) => b.trip),
  ];
  const preferredModes = new Set<string>([...(user?.preferredModes ?? []), ...historyTrips.map((t) => t.travelMode)]);
  const preferredDestinations = new Set(historyTrips.map((t) => t.destination.toLowerCase()));

  if (preferredModes.size === 0 && preferredDestinations.size === 0) {
    return getTrendingTrips(userId, limit);
  }

  const ownTripIds = (await prisma.trip.findMany({ where: { ownerId: userId }, select: { id: true } })).map(
    (t) => t.id
  );
  const joinedTripIds = joinedGroups.map((g) => g.group.tripId);
  const bookmarkedTripIds = bookmarks.map((b) => b.tripId);
  const excludeIds = [...new Set([...ownTripIds, ...joinedTripIds, ...bookmarkedTripIds])];

  const candidates = await prisma.trip.findMany({
    where: { ...upcomingOpenWhere(), id: { notIn: excludeIds } },
    include: cardInclude,
    orderBy: { createdAt: "desc" },
    take: TRENDING_CANDIDATE_LIMIT,
  });

  const ranked = candidates
    .map((t) => {
      let score = engagementScore(t) * 0.3;
      if (preferredModes.has(t.travelMode)) score += 10;
      if (preferredDestinations.has(t.destination.toLowerCase())) score += 6;
      return { ...t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...rest }) => rest);

  return attachViewerFlags(ranked, userId);
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
  if (filters.travelMode && filters.travelMode.length > 0) where.travelMode = { in: filters.travelMode };
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
      orderBy: { startDate: filters.sortOrder },
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
  if (existing.status === "COMPLETED") {
    throw new HttpError(403, "This trip is closed and can no longer be edited");
  }
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

const REVIEW_ELIGIBILITY_REASONS = {
  TRIP_NOT_ENDED: "You can review this trip once it has ended",
  OWNER_CANNOT_REVIEW: "Trip owners can't review their own trip",
  NOT_A_MEMBER: "Only trip participants can leave a review",
  TRIP_CANCELLED: "Cancelled trips can't be reviewed",
} as const;

async function canReviewTrip(
  tripId: string,
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.status === "CANCELLED") {
    return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.TRIP_CANCELLED };
  }
  if (trip.endDate.getTime() >= Date.now()) {
    return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.TRIP_NOT_ENDED };
  }
  if (trip.ownerId === userId) {
    return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.OWNER_CANNOT_REVIEW };
  }

  const group = await prisma.group.findUnique({ where: { tripId } });
  if (!group) return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.NOT_A_MEMBER };
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId } },
  });
  if (!membership) return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.NOT_A_MEMBER };

  return { allowed: true };
}

async function recomputeTripRatingAggregate(tx: Prisma.TransactionClient, tripId: string) {
  await tx.$executeRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
  const agg = await tx.tripReview.aggregate({
    where: { tripId },
    _avg: { rating: true },
    _count: true,
  });
  await tx.trip.update({
    where: { id: tripId },
    data: { avgRating: agg._avg.rating, reviewCount: agg._count },
  });
}

export async function addComment(tripId: string, userId: string, text: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.status === "COMPLETED") {
    throw new HttpError(403, "This trip is closed. New comments are disabled");
  }
  const comment = await prisma.tripComment.create({
    data: { tripId, userId, text },
    include: { user: { select: { id: true, name: true, photoUrl: true } } },
  });

  if (trip.ownerId !== userId) {
    try {
      await notifyTripComment(trip.ownerId, {
        tripId,
        tripTitle: trip.title,
        commentId: comment.id,
        commenterId: userId,
        commenterName: comment.user.name,
        commenterPhotoUrl: comment.user.photoUrl,
        content: text,
      });
    } catch (err) {
      console.error("[trips] comment notification failed", err);
    }
  }

  return comment;
}

export async function listComments(tripId: string) {
  return prisma.tripComment.findMany({
    where: { tripId },
    include: { user: { select: { id: true, name: true, photoUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
}

const reviewInclude = { user: { select: { id: true, name: true, photoUrl: true } } } satisfies Prisma.TripReviewInclude;

export async function listReviews(tripId: string, viewerId?: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");

  const items = await prisma.tripReview.findMany({
    where: { tripId },
    include: reviewInclude,
    orderBy: { createdAt: "desc" },
  });

  let viewerCanReview = false;
  let viewerReview = null as (typeof items)[number] | null;
  if (viewerId) {
    viewerReview = items.find((r) => r.userId === viewerId) ?? null;
    if (!viewerReview) {
      const eligibility = await canReviewTrip(tripId, viewerId);
      viewerCanReview = eligibility.allowed;
    }
  }

  return {
    items,
    avgRating: trip.avgRating,
    reviewCount: trip.reviewCount,
    viewerCanReview,
    viewerReview,
  };
}

export async function submitReview(
  tripId: string,
  userId: string,
  input: { rating: number; comment?: string }
) {
  const eligibility = await canReviewTrip(tripId, userId);
  if (!eligibility.allowed) throw new HttpError(403, eligibility.reason!);

  return prisma.$transaction(async (tx) => {
    const row = await tx.tripReview.upsert({
      where: { tripId_userId: { tripId, userId } },
      update: { rating: input.rating, comment: input.comment ?? null },
      create: { tripId, userId, rating: input.rating, comment: input.comment ?? null },
      include: reviewInclude,
    });
    await recomputeTripRatingAggregate(tx, tripId);
    return row;
  });
}

export async function deleteReview(tripId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.tripReview.deleteMany({ where: { tripId, userId } });
    if (result.count === 0) throw new HttpError(404, "You haven't reviewed this trip");
    await recomputeTripRatingAggregate(tx, tripId);
  });
}
