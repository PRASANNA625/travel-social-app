# Travel Buddies — Design

## Goal

Let users discover other travelers who share real, existing profile signals
(interests, travel modes, location text, upcoming-trip patterns), view their
public profile, and send/accept/reject connection requests — all reusing
existing architecture (the `JoinRequest` pattern, `UserProfileScreen`,
`publicUserSelect`, the Discover screen's section layout) rather than
inventing parallel systems.

## Existing architecture this design builds on

(Established by direct inspection — file paths and field names below are
exact, not assumed.)

- **No connections/follow/friend system exists today.** Confirmed via
  schema and backend-wide grep: no model, no module, no endpoint. This
  design adds one, modeled directly on `JoinRequest`.
- **`User` model** (`backend/prisma/schema.prisma`): has `bio: String?`,
  `location: String?` (free text, **no lat/lng anywhere on User**),
  `interests: String[]`, `preferredModes: TravelMode[]`, `lastSeenAt:
  DateTime?`. No privacy flags in the schema — privacy is enforced entirely
  by which Prisma `select` an endpoint uses.
- **`publicUserSelect`** (`backend/src/modules/users/users.service.ts`):
  `{ id, name, photoUrl, coverPhotoUrl, age, location, bio, interests,
  preferredModes, createdAt }` — already excludes `email`/`phone`/
  `phoneVerified`/`passwordHash`. This design's matching query reuses this
  exact select; no new field is ever exposed.
- **`GET /users/:id`** (`users.routes.ts` → `controller.getById` →
  `service.getUserById`) already returns another user's public profile
  via `publicUserSelect`. `mobile/src/api/users.ts`'s `useUser(userId)`
  hook already fetches it.
- **`UserProfileScreen.tsx`** already exists as the reusable "view someone
  else's profile" screen, navigated via `navigation.navigate("UserProfile",
  { userId })` (two existing call sites: `JoinRequestsInboxScreen.tsx:88`,
  `GroupChatScreen.tsx:414`). This design reuses it unchanged — the third
  call site.
- **`JoinRequest` pattern** (`backend/src/modules/joinRequests/`) is the
  template this design's `BuddyConnection` mirrors: a `PENDING/APPROVED-
  style status enum, a `notify()` call on state transitions, a dedicated
  inbox screen (`JoinRequestsInboxScreen.tsx`) rather than inline
  notification actions.
- **`notify(userId, type, payload)`** (`backend/src/modules/
  notifications/notify.ts`) is the generic notification helper — `type` is
  a free-form string (no enum), new types are just new string literals
  used consistently between the emitter and `NotificationsScreen.tsx`'s
  `NOTIFICATION_COPY`/`notificationIconMap`.
- **In-memory candidate-pool-then-score pattern**: already established
  twice (Near Me geo-sort, and Trending/Recommended trips in
  `trips.service.ts`) — bounded candidate fetch, score in memory, sort,
  paginate. This design's matching endpoint follows the identical shape,
  not a new architecture.
- **Discover screen** (`mobile/src/screens/DiscoverScreen.tsx`): a single
  `FlatList` with all "personalized" content — greeting header, hero
  carousel, search, filter chips, four trip `DiscoverSection`s — packed
  into `ListHeaderComponent`. A 5th, person-based section slots in here.
- **Pagination**: `parsePageParams`/`toSkipTake`
  (`backend/src/utils/pagination.ts`) — reused for the buddies list
  endpoint exactly as trips use it.

## Non-goals / explicitly deferred

- No real geo-distance matching — `User` has no coordinates. Location
  matching is a text comparison against `location`, clearly not framed as
  a distance/"X km away" claim anywhere in the UI.
- No inline accept/reject from within a notification — matches the
  existing `JoinRequest` UX (dedicated inbox screen), not a new pattern.
- No "mutual friends"/social-graph-beyond-one-hop features.
- No blocking/reporting system — out of scope for this pass.
- No push notifications beyond the existing in-app `notify()` +
  socket `"notification:new"` mechanism already used everywhere else.

## Backend changes

### Schema (`backend/prisma/schema.prisma`)

```prisma
enum BuddyConnectionStatus {
  PENDING
  ACCEPTED
  REJECTED
}

model BuddyConnection {
  id         String                @id @default(cuid())
  fromUserId String
  fromUser   User                  @relation("BuddyRequestsSent", fields: [fromUserId], references: [id])
  toUserId   String
  toUser     User                  @relation("BuddyRequestsReceived", fields: [toUserId], references: [id])
  status     BuddyConnectionStatus @default(PENDING)
  createdAt  DateTime              @default(now())
  updatedAt  DateTime              @updatedAt

  @@unique([fromUserId, toUserId])
  @@index([toUserId, status])
  @@index([fromUserId, status])
}
```

Add to `User` model's relation block:
```prisma
buddyRequestsSent     BuddyConnection[] @relation("BuddyRequestsSent")
buddyRequestsReceived BuddyConnection[] @relation("BuddyRequestsReceived")
```

A migration is required (`npx prisma migrate dev`) — this is the one
schema change in the whole feature; everything else reuses existing
fields.

### New module `backend/src/modules/buddies/`

**`buddies.service.ts`**

```ts
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { notify } from "../notifications/notify";
import { parsePageParams, toSkipTake } from "../../utils/pagination";
import { publicUserSelect } from "../users/users.service";
import type { TravelMode } from "@prisma/client";

const CANDIDATE_POOL_LIMIT = 150;

interface BuddyFilters {
  search?: string;
  interest?: string;
  travelMode?: TravelMode;
  location?: string;
  page?: number;
  pageSize?: number;
}

async function connectionStateMap(viewerId: string, candidateIds: string[]) {
  const rows = await prisma.buddyConnection.findMany({
    where: {
      OR: [
        { fromUserId: viewerId, toUserId: { in: candidateIds } },
        { toUserId: viewerId, fromUserId: { in: candidateIds } },
      ],
    },
  });
  const map = new Map<string, { state: "pending_sent" | "pending_received" | "connected"; requestId: string }>();
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
    // REJECTED rows are intentionally not surfaced as a distinct card
    // state - a rejected candidate is simply excluded from the pool below.
  }
  return map;
}

async function excludedUserIds(viewerId: string): Promise<Set<string>> {
  const rows = await prisma.buddyConnection.findMany({
    where: { OR: [{ fromUserId: viewerId }, { toUserId: viewerId }] },
    select: { fromUserId: true, toUserId: true, status: true },
  });
  const excluded = new Set<string>([viewerId]);
  for (const row of rows) {
    const otherId = row.fromUserId === viewerId ? row.toUserId : row.fromUserId;
    // Already connected, already pending in either direction, or already
    // rejected - none of these should re-appear as a fresh "Connect" card.
    excluded.add(otherId);
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

  const where: Parameters<typeof prisma.user.findMany>[0]["where"] = {
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
    connectionState: stateMap.get(c.id)?.state ?? "none",
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
```

**`buddies.controller.ts`**

```ts
import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import * as service from "./buddies.service";
import { buddyFiltersSchema } from "./buddies.types";

export async function matches(req: AuthedRequest, res: Response) {
  const filters = buddyFiltersSchema.parse(req.query);
  const result = await service.getBuddyMatches(req.userId!, filters);
  res.json(result);
}

export async function connect(req: AuthedRequest, res: Response) {
  const request = await service.sendBuddyRequest(req.userId!, req.params.userId);
  res.status(201).json(request);
}

export async function accept(req: AuthedRequest, res: Response) {
  const request = await service.respondToBuddyRequest(req.params.id, req.userId!, true);
  res.json(request);
}

export async function reject(req: AuthedRequest, res: Response) {
  const request = await service.respondToBuddyRequest(req.params.id, req.userId!, false);
  res.json(request);
}

export async function pending(req: AuthedRequest, res: Response) {
  const requests = await service.myPendingBuddyRequests(req.userId!);
  res.json(requests);
}
```

**`buddies.types.ts`**

```ts
import { z } from "zod";
import { travelModes } from "../trips/trips.types";

export const buddyFiltersSchema = z.object({
  search: z.string().optional(),
  interest: z.string().optional(),
  travelMode: z.enum(travelModes).optional(),
  location: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

export type BuddyFilters = z.infer<typeof buddyFiltersSchema>;
```

**`buddies.routes.ts`**

```ts
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./buddies.controller";

export const buddiesRouter = Router();
buddiesRouter.use(requireAuth);

buddiesRouter.get("/matches", asyncHandler(controller.matches));
buddiesRouter.get("/requests/pending", asyncHandler(controller.pending));
buddiesRouter.post("/:userId/connect", asyncHandler(controller.connect));
buddiesRouter.post("/requests/:id/accept", asyncHandler(controller.accept));
buddiesRouter.post("/requests/:id/reject", asyncHandler(controller.reject));
```

Registered in `backend/src/app.ts` alongside the other routers:
`app.use("/buddies", buddiesRouter);` — placed after `app.use("/join-requests",
joinRequestsRouter)` for readability, order doesn't matter functionally.

`travelModes` is already exported from `backend/src/modules/trips/
trips.types.ts` — reused here rather than redefined.

## Frontend changes

### Types (`mobile/src/types/index.ts`)

```ts
export type BuddyConnectionState = "none" | "pending_sent" | "pending_received" | "connected";

export interface BuddyMatch extends Omit<User, "email" | "phone" | "phoneVerified"> {
  sharedInterests: string[];
  sharedModesCount: number;
  locationMatch: boolean;
  compatibilityPercent: number | null;
  connectionState: BuddyConnectionState;
  connectionRequestId: string | null;
}

export interface BuddyConnection {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  fromUser?: User;
}
```

### New file `mobile/src/api/buddies.ts`

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { BuddyConnection, BuddyMatch, Paginated, TravelMode } from "../types";

export interface BuddyFilters {
  search?: string;
  interest?: string;
  travelMode?: TravelMode;
  location?: string;
  page?: number;
  pageSize?: number;
}

export function useBuddyMatches(filters: BuddyFilters = {}) {
  return useQuery({
    queryKey: ["buddies", "matches", filters],
    queryFn: async () => (await apiClient.get<Paginated<BuddyMatch>>("/buddies/matches", { params: filters })).data,
  });
}

export function usePendingBuddyRequests() {
  return useQuery({
    queryKey: ["buddies", "requests", "pending"],
    queryFn: async () => (await apiClient.get<BuddyConnection[]>("/buddies/requests/pending")).data,
  });
}

export function useSendBuddyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => (await apiClient.post<BuddyConnection>(`/buddies/${userId}/connect`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buddies"] }),
  });
}

export function useRespondToBuddyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) =>
      (await apiClient.post<BuddyConnection>(`/buddies/requests/${requestId}/${accept ? "accept" : "reject"}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buddies"] }),
  });
}
```

### New file `mobile/src/components/BuddyCard.tsx`

A person-card matching `TripCard`'s visual language (radius, shadow,
`colors.surfaceElevated`/`colors.primary`), rendering only present fields:

```tsx
import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BuddyMatch } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";

const CONNECT_BUTTON_COPY: Record<BuddyMatch["connectionState"], { label: string; disabled: boolean }> = {
  none: { label: "Connect", disabled: false },
  pending_sent: { label: "Requested", disabled: true },
  pending_received: { label: "Respond", disabled: false },
  connected: { label: "Connected", disabled: true },
};

export function BuddyCard({
  buddy,
  onViewProfile,
  onConnect,
  onRespond,
}: {
  buddy: BuddyMatch;
  onViewProfile: () => void;
  onConnect: () => void;
  onRespond: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [imageFailed, setImageFailed] = useState(false);
  const buttonMeta = CONNECT_BUTTON_COPY[buddy.connectionState];

  const onButtonPress = buddy.connectionState === "pending_received" ? onRespond : onConnect;

  return (
    <TouchableOpacity style={styles.card} onPress={onViewProfile} activeOpacity={0.9}>
      {buddy.photoUrl && !imageFailed ? (
        <Image
          source={{ uri: optimizedImageUrl(buddy.photoUrl, 300) }}
          style={styles.avatar}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{buddy.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <Text style={styles.name} numberOfLines={1}>
        {buddy.name}
      </Text>
      {buddy.location && (
        <Text style={styles.meta} numberOfLines={1}>
          📍 {buddy.location}
        </Text>
      )}
      {buddy.bio && (
        <Text style={styles.bio} numberOfLines={2}>
          {buddy.bio}
        </Text>
      )}

      {(buddy.interests.length > 0 || buddy.preferredModes.length > 0) && (
        <View style={styles.chipRow}>
          {buddy.interests.slice(0, 2).map((interest) => (
            <View key={interest} style={styles.chip}>
              <Text style={styles.chipText}>{interest}</Text>
            </View>
          ))}
          {buddy.preferredModes.slice(0, 1).map((mode) => (
            <View key={mode} style={styles.chip}>
              <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[mode]} size={12} color={colors.primary} />
              <Text style={styles.chipText}>{travelModeText(mode)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.matchRow}>
        {buddy.compatibilityPercent !== null ? (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>{buddy.compatibilityPercent}% match</Text>
          </View>
        ) : (
          <Text style={styles.matchText}>
            {buddy.sharedInterests.length > 0
              ? `${buddy.sharedInterests.length} shared interest${buddy.sharedInterests.length === 1 ? "" : "s"}`
              : buddy.sharedModesCount > 0
                ? `${buddy.sharedModesCount} shared travel mode${buddy.sharedModesCount === 1 ? "" : "s"}`
                : "New to Triply"}
          </Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onViewProfile}>
          <Text style={styles.secondaryButtonText}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, buttonMeta.disabled && styles.primaryButtonDisabled]}
          onPress={onButtonPress}
          disabled={buttonMeta.disabled}
        >
          <Text style={styles.primaryButtonText}>{buttonMeta.label}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      width: 240,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 20,
      padding: 14,
      alignItems: "center",
      shadowColor: colors.ink,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 24 },
    name: { fontSize: 15, fontWeight: "700", color: colors.ink },
    meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
    bio: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 6, lineHeight: 16 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    chipText: { fontSize: 11, color: colors.ink, fontWeight: "600" },
    matchRow: { marginTop: 10 },
    matchBadge: { backgroundColor: colors.successBg, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
    matchBadgeText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    matchText: { fontSize: 12, color: colors.mutedLight },
    actionsRow: { flexDirection: "row", gap: 8, marginTop: 12, width: "100%" },
    secondaryButton: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: RADIUS.field,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    secondaryButtonText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
    primaryButton: { flex: 1, paddingVertical: 9, borderRadius: RADIUS.field, backgroundColor: colors.primary, alignItems: "center" },
    primaryButtonDisabled: { backgroundColor: colors.mutedLight },
    primaryButtonText: { fontSize: 12.5, fontWeight: "700", color: colors.white },
  });
}
```

### New file `mobile/src/components/BuddyCardSkeleton.tsx`

Same shape as `TripCardSkeleton.tsx`, built on the shared `Skeleton`
primitive (`mobile/src/components/theme/Skeleton.tsx`) — a 240-wide card
with an avatar-circle skeleton, two line skeletons, and a button-row
skeleton, mirroring `BuddyCard`'s layout dimensions.

### `DiscoverScreen.tsx` changes

Add one more section inside the same `ListHeaderComponent`, after the
existing four `DiscoverSection`s:

```tsx
const { data: buddyMatches, isLoading: buddiesLoading } = useBuddyMatches({ pageSize: 6 });

// ...inside ListHeaderComponent, after the four DiscoverSection instances:
{(buddiesLoading || (buddyMatches?.items.length ?? 0) > 0) && (
  <View style={styles.section}>
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>👥 Travel Buddies</Text>
      <TouchableOpacity onPress={() => navigation.navigate("TravelBuddies")}>
        <Text style={styles.seeAllLink}>See All</Text>
      </TouchableOpacity>
    </View>
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.buddyRow}
      data={buddiesLoading ? [] : buddyMatches?.items}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={buddiesLoading ? (
        <View style={styles.buddyRow}>
          <BuddyCardSkeleton />
          <BuddyCardSkeleton />
        </View>
      ) : null}
      renderItem={({ item }) => (
        <BuddyCard
          buddy={item}
          onViewProfile={() => navigation.navigate("UserProfile", { userId: item.id })}
          onConnect={() => sendRequest.mutate(item.id)}
          onRespond={() => navigation.navigate("ConnectionRequests")}
        />
      )}
    />
  </View>
)}
```

(`sendRequest = useSendBuddyRequest()` declared alongside the other hooks
near the top of the component; `styles.buddyRow` gets `flexDirection:
"row"` explicitly from the start, learning directly from the earlier
Personalized Discover fix-round finding about `DiscoverSection`'s missing
`flexDirection`.)

### New file `mobile/src/screens/TravelBuddiesScreen.tsx`

The "See All" destination — search box, interest filter chips (built from
the union of interests present in the current result page, since there's
no fixed interest taxonomy), travel-mode filter chips (reusing
`TRAVEL_MODES/TRAVEL_MODE_ICONS` exactly like `DiscoverScreen`'s existing
filter row), a location text filter, a sort toggle (Best match / Newest —
"Best match" is the default server-side ordering, "Newest" re-sorts the
already-fetched page client-side by `createdAt` since a second server
round-trip for a client-only re-sort of the same page isn't warranted),
and a paginated vertical `FlatList` of `BuddyCard`s with a "Requests (N)"
pill (from `usePendingBuddyRequests()`) linking to `ConnectionRequests`.
Structurally mirrors `DiscoverScreen`'s filter-chip `FlatList` pattern and
`JoinRequestsInboxScreen`'s loading-skeleton/empty-state conventions.

### New file `mobile/src/screens/ConnectionRequestsScreen.tsx`

Mirrors `JoinRequestsInboxScreen.tsx`'s structure exactly: a `FlatList` of
`usePendingBuddyRequests()` results, each row showing the requester's
name/location/bio (via `request.fromUser`) with Accept/Reject buttons
calling `useRespondToBuddyRequest()`.

### Navigation

`mobile/src/navigation/types.ts` — add to `AppStackParamList`:
```ts
TravelBuddies: undefined;
ConnectionRequests: undefined;
```

`mobile/src/navigation/AppNavigator.tsx` — register both, same pattern as
the existing `Settings`/`JoinRequestsInbox` entries:
```tsx
<Stack.Screen name="TravelBuddies" component={TravelBuddiesScreen} options={{ title: "Travel Buddies" }} />
<Stack.Screen name="ConnectionRequests" component={ConnectionRequestsScreen} options={{ title: "Connection Requests" }} />
```

### Notifications integration

`mobile/src/screens/NotificationsScreen.tsx` — add two entries each to
`NOTIFICATION_COPY` and `notificationIconMap`:
```ts
BUDDY_REQUEST: (p) => `Someone wants to be travel buddies`,
BUDDY_REQUEST_ACCEPTED: (p) => `Your travel buddy request was accepted`,
```
```ts
BUDDY_REQUEST: { icon: "account-heart-outline", bg: colors.fieldBg, color: colors.primary },
BUDDY_REQUEST_ACCEPTED: { icon: "check-circle", bg: colors.successBg, color: colors.primary },
```
And a case in `onPressNotification`'s switch: `BUDDY_REQUEST` navigates to
`ConnectionRequests`. `BUDDY_REQUEST_ACCEPTED` navigates to `UserProfile`
using `payload.toUserId` — recall `notify(request.fromUserId,
"BUDDY_REQUEST_ACCEPTED", { toUserId })` sends this notification to the
original requester (`fromUserId`), with the accepter's id as
`payload.toUserId`, so tapping it correctly opens the profile of the
person who just accepted.

## Data flow summary

```
Discover mount
 └─ useBuddyMatches({ pageSize: 6 }) ──► GET /buddies/matches (auth)
      → candidate pool (bounded, excludes self/connected/pending/rejected)
      → scored in memory (interests, modes, location text, trip-pattern overlap)
      → connection state batched in (like isLiked/isBookmarked on trips)

TravelBuddiesScreen mount
 ├─ useBuddyMatches({ ...filters, page }) ──► GET /buddies/matches (same endpoint, more params)
 └─ usePendingBuddyRequests() ──► GET /buddies/requests/pending

Connect tap ──► useSendBuddyRequest ──► POST /buddies/:userId/connect ──► notify(toUserId, "BUDDY_REQUEST")
Accept/Reject tap ──► useRespondToBuddyRequest ──► POST /buddies/requests/:id/accept|reject
```

## Privacy

Every field surfaced anywhere in this feature (`BuddyCard`, `TravelBuddiesScreen`,
`ConnectionRequestsScreen`) comes from `publicUserSelect` — the exact
same select `GET /users/:id` already uses. No new field is added to any
select; `email`/`phone`/`phoneVerified`/`passwordHash` are structurally
impossible to leak through this feature since they're never selected in
the first place. `BuddyMatch`'s TypeScript type explicitly `Omit`s them
from `User` as a compile-time reminder, even though the backend already
enforces this at the query level.

## Performance

- Matching is one paginated query per screen load (`useBuddyMatches`),
  same shape as `useTrips` — no per-card follow-up requests.
- Connection state is batched via `connectionStateMap` (one query for the
  whole page of candidates), mirroring `attachViewerFlags`'s batching
  pattern for trip likes/bookmarks.
- Candidate pool is capped at 150 (same order of magnitude as the
  existing Trending/Recommended trips' 100-candidate cap), scored in
  memory, then paginated — not a full-table scan per request.
- `tripSignals()` runs once per viewer per request (not per candidate) for
  the viewer, but does run once per candidate too (inside the `.map`) —
  this is the one place worth flagging as a known N+1-shaped cost at
  scale; acceptable at this candidate-pool size (≤150) and consistent with
  this repo's existing "correctness over micro-optimization at MVP scale"
  posture (see Trending's own similar bounded-candidate approach), but a
  future optimization would batch trip signals for the whole candidate
  page in one query instead of per-candidate.
- React Query caching: `["buddies", "matches", filters]` and
  `["buddies", "requests", "pending"]` are independent, normal cache keys
  — no duplicate fetching between Discover's 6-item preview and the full
  `TravelBuddiesScreen` (different `filters` objects, different cache
  entries, exactly like the existing Discover/filtered-list relationship
  for trips).

## Non-breaking safeguards

- No existing route, model, hook, or component is modified in a
  breaking way. `publicUserSelect` is imported and reused, not changed.
  `User` gains two new relation fields (additive, no existing query
  breaks). `travelModes` is imported from `trips.types.ts`, not
  redefined.
- `DiscoverScreen.tsx` gains one more section inside the existing
  `ListHeaderComponent` — the four trip sections, search, filters, and
  main list are untouched.
- `UserProfileScreen.tsx` is used exactly as-is, zero changes.
- `NotificationsScreen.tsx` only gains two new map entries and one new
  switch case — every existing notification type's behavior is untouched.

## Testing plan

Following this repo's established convention (no unit-test framework;
black-box smoke-test scripts):

- **Backend**: `backend/scripts/smoke-test-buddies.mjs` — register two
  users with overlapping interests/modes, verify `/buddies/matches`
  surfaces the match with a non-null `compatibilityPercent` and correct
  `sharedInterests`; register a third user with zero overlap, verify they
  either don't appear or appear with `compatibilityPercent: null` and a
  "shared interests" fallback; send a connect request, verify the target
  sees `connectionState: "pending_received"` and the sender sees
  `"pending_sent"`; accept it, verify both sides now see `"connected"` and
  neither appears in a fresh `/buddies/matches` call for the other;
  attempt a duplicate request, verify 409; attempt responding as a
  non-recipient, verify 403.
- **Frontend**: no new pure functions warranting a standalone `tsx`
  verification script this time (scoring lives server-side, matching the
  precedent that trending/recommended scoring is backend-only); manual
  verification per "Final validation" below covers the UI layer.

## Final validation (manual, both platforms)

Login → Discover (verify the Travel Buddies section appears with ≤6
cards, shows compatibility % or shared-interest text correctly, hides
gracefully if there are truly no candidates) → tap **View Profile** on a
card → `UserProfileScreen` opens with correct data → back → tap
**Connect** → button becomes **Requested** → (as the other user) check
Notifications → tap the buddy-request notification → `ConnectionRequests`
screen → **Accept** → (as the original user) card now shows **Connected**
→ **See All** → `TravelBuddiesScreen` loads with search/filters working →
verify a user with an empty profile (no interests/modes/location/bio)
still renders a valid card with no broken layout → spot-check existing
Discover filters, trip sections, Notifications, Group Chat, and
authentication are all unaffected.
