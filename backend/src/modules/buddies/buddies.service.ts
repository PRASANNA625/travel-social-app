import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { notify } from "../notifications/notify";
import { parsePageParams, toSkipTake } from "../../utils/pagination";
import { publicUserSelect } from "../users/users.service";
import type { BuddyFilters } from "./buddies.types";

const CANDIDATE_POOL_LIMIT = 150;

async function connectionStateMap(viewerId: string, candidateIds: string[]) {
  if (candidateIds.length === 0) return new Map<string, { state: string; requestId: string }>();

  const rows = await prisma.buddyConnection.findMany({
    where: {
      OR: [
        { fromUserId: viewerId, toUserId: { in: candidateIds } },
        { toUserId: viewerId, fromUserId: { in: candidateIds } },
      ],
    },
  });
  const map = new Map<string, { state: string; requestId: string }>();
  for (const row of rows) {
    const otherId = row.fromUserId === viewerId ? row.toUserId : row.fromUserId;
    if (row.status === "ACCEPTED") {
      map.set(otherId, { state: "connected", requestId: row.id });
    } else if (row.status === "PENDING") {
      map.set(otherId, {
        state: row.fromUserId === viewerId ? "pending_sent" : "pending_received",
        requestId: row.id,
      });
    }
    // REJECTED rows are intentionally not surfaced as a distinct card state -
    // a rejected candidate is excluded from the pool entirely (see excludedUserIds).
  }
  return map;
}

async function excludedUserIds(viewerId: string): Promise<Set<string>> {
  const rows = await prisma.buddyConnection.findMany({
    where: { OR: [{ fromUserId: viewerId }, { toUserId: viewerId }] },
    select: { fromUserId: true, toUserId: true },
  });
  const excluded = new Set<string>([viewerId]);
  for (const row of rows) {
    excluded.add(row.fromUserId === viewerId ? row.toUserId : row.fromUserId);
  }
  return excluded;
}

function overlapCount<T>(a: T[], b: T[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

async function tripSignals(userId: string): Promise<{ modes: Set<string>; destinations: Set<string> }> {
  const [owned, joined] = await Promise.all([
    prisma.trip.findMany({ where: { ownerId: userId }, select: { travelMode: true, destination: true } }),
    prisma.groupMember.findMany({
      where: { userId },
      select: { group: { select: { trip: { select: { travelMode: true, destination: true } } } } },
    }),
  ]);
  const trips = [...owned, ...joined.map((g) => g.group.trip)];
  return {
    modes: new Set(trips.map((t) => t.travelMode)),
    destinations: new Set(trips.map((t) => t.destination.toLowerCase())),
  };
}

export async function getBuddyMatches(viewerId: string, filters: BuddyFilters) {
  const pageParams = parsePageParams(filters as unknown as Record<string, unknown>, 10, 30);
  const { skip, take } = toSkipTake(pageParams);

  const viewer = await prisma.user.findUniqueOrThrow({
    where: { id: viewerId },
    select: { interests: true, preferredModes: true, location: true },
  });
  const viewerTripSignals = await tripSignals(viewerId);
  const excluded = await excludedUserIds(viewerId);

  const where: NonNullable<Parameters<typeof prisma.user.findMany>[0]>["where"] = {
    id: { notIn: [...excluded] },
  };
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { bio: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.interest) where.interests = { has: filters.interest };
  if (filters.travelMode) where.preferredModes = { has: filters.travelMode };
  if (filters.location) where.location = { contains: filters.location, mode: "insensitive" };

  const candidates = await prisma.user.findMany({
    where,
    select: publicUserSelect,
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    take: CANDIDATE_POOL_LIMIT,
  });

  const scored = await Promise.all(
    candidates.map(async (c) => {
      const sharedInterests = viewer.interests.filter((i) => c.interests.includes(i));
      const sharedModesCount = overlapCount(viewer.preferredModes, c.preferredModes);
      const locationMatch =
        !!viewer.location &&
        !!c.location &&
        (viewer.location.toLowerCase().includes(c.location.toLowerCase()) ||
          c.location.toLowerCase().includes(viewer.location.toLowerCase()));
      const candidateTripSignals = await tripSignals(c.id);
      const sharedTripModes = overlapCount([...viewerTripSignals.modes], [...candidateTripSignals.modes]);
      const sharedDestinations = overlapCount(
        [...viewerTripSignals.destinations],
        [...candidateTripSignals.destinations]
      );

      const rawScore =
        sharedInterests.length * 15 +
        sharedModesCount * 10 +
        (locationMatch ? 15 : 0) +
        Math.min(sharedTripModes, 3) * 10 +
        Math.min(sharedDestinations, 3) * 10;

      const hasStrongSignal = sharedInterests.length > 0 || sharedModesCount > 0;

      return {
        ...c,
        sharedInterests,
        sharedModesCount,
        locationMatch,
        compatibilityPercent: hasStrongSignal ? Math.min(100, rawScore) : null,
        score: rawScore,
      };
    })
  );

  scored.sort((a, b) => b.score - a.score);
  const total = scored.length;
  const pageItems = scored.slice(skip, skip + take).map(({ score, ...rest }) => rest);

  const stateMap = await connectionStateMap(
    viewerId,
    pageItems.map((c) => c.id)
  );
  const items = pageItems.map((c) => ({
    ...c,
    connectionState: (stateMap.get(c.id)?.state ?? "none") as "none" | "pending_sent" | "pending_received" | "connected",
    connectionRequestId: stateMap.get(c.id)?.requestId ?? null,
  }));

  return { items, total, ...pageParams };
}

export async function sendBuddyRequest(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) throw new HttpError(400, "You can't connect with yourself");

  const existing = await prisma.buddyConnection.findFirst({
    where: {
      OR: [
        { fromUserId, toUserId },
        { fromUserId: toUserId, toUserId: fromUserId },
      ],
    },
  });
  if (existing) {
    if (existing.status === "ACCEPTED") throw new HttpError(409, "You're already connected");
    if (existing.status === "PENDING") throw new HttpError(409, "A request is already pending");
    throw new HttpError(409, "This connection was previously declined");
  }

  const request = await prisma.buddyConnection.create({ data: { fromUserId, toUserId } });
  await notify(toUserId, "BUDDY_REQUEST", { fromUserId, requestId: request.id });
  return request;
}

export async function respondToBuddyRequest(requestId: string, toUserId: string, accept: boolean) {
  const request = await prisma.buddyConnection.findUnique({ where: { id: requestId } });
  if (!request) throw new HttpError(404, "Request not found");
  if (request.toUserId !== toUserId) throw new HttpError(403, "You can't respond to this request");
  if (request.status !== "PENDING") throw new HttpError(400, "This request has already been handled");

  const updated = await prisma.buddyConnection.update({
    where: { id: requestId },
    data: { status: accept ? "ACCEPTED" : "REJECTED" },
  });

  if (accept) {
    await notify(request.fromUserId, "BUDDY_REQUEST_ACCEPTED", { toUserId });
  }
  return updated;
}

export async function myPendingBuddyRequests(userId: string) {
  return prisma.buddyConnection.findMany({
    where: { toUserId: userId, status: "PENDING" },
    include: { fromUser: { select: publicUserSelect } },
    orderBy: { createdAt: "desc" },
  });
}
