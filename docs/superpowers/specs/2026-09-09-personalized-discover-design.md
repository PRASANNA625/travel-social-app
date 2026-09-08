# Personalized Discover — Design

## Goal

Add four personalized sections to the top of the existing Discover screen —
**Recommended For You**, **Trending Trips**, **Near You**, **This Weekend** —
using only data that already exists in the schema, without breaking any
existing Discover functionality (search, multi-select filters, Near Me,
sort, the main trip list, navigation to Trip Details).

## Existing architecture this design builds on

(Established by direct inspection of the codebase — file paths and field
names below are exact, not assumed.)

- **Trip model** (`backend/prisma/schema.prisma`): no interest/tag/category
  field. `travelMode: TravelMode` is a single required enum. Real engagement
  signals available via `_count`: `likes`, `comments`, `joinRequests`.
  `status: TripStatus` = `PLANNING | OPEN | ALMOST_FULL | FULL | STARTED |
  COMPLETED | CANCELLED`. `startDate`/`endDate` are required `DateTime`.
  `startLat`/`startLng` are nullable `Float`.
- **User model**: `interests: String[]` (free text, unused by this design —
  no structured field on Trip to match it against), `preferredModes:
  TravelMode[]` (matches `Trip.travelMode` directly), `location: String?`
  (home location, not a preference list). No direct "joined trips"
  relation — joined-ness is derived via `GroupMember` (after an
  `APPROVED` `JoinRequest`) or via `TripBookmark`/`TripLike`.
- **`GET /trips`** (`backend/src/modules/trips/trips.controller.ts` →
  `trips.service.ts` `listTrips`): accepts `search, destination, travelMode,
  dateFrom, dateTo, budgetMin, budgetMax, lat, lng, radiusKm, sortOrder,
  page, pageSize` (schema: `trips.types.ts` `tripFiltersSchema`). Near-me
  geo-sort already works exactly as: pull up to 200 open candidates ordered
  by `createdAt desc`, compute `haversineKm` distance in-memory (no
  PostGIS), filter by `radiusKm`, sort by distance, paginate in-memory. This
  in-memory "candidate pool → score → sort → slice" shape is the existing
  precedent this design's two new endpoints will follow.
- **`cardInclude`** (`trips.service.ts`): `{ owner: {id,name,photoUrl},
  _count: {likes,comments,joinRequests} }` — reused by every trip-returning
  query, including the two new ones.
- **`attachViewerFlags`**: stitches `isLiked`/`isBookmarked` onto results
  for the current viewer — reused by the new endpoints too.
- **`closeExpiredTrips`**: flips `status` to `COMPLETED` once `endDate` has
  passed; already fired (unawaited, concurrent) on every list-style query.
  Same pattern reused here.
- **Frontend hook pattern** (`mobile/src/api/trips.ts`): `useTrips(filters)`
  → `useQuery({ queryKey: ["trips", filters], queryFn: ... GET /trips
  ...})`. New hooks follow this exact shape.
- **`DiscoverScreen.tsx`**: today renders, as fixed (non-scrolling) siblings
  above the trip-list `FlatList`: gradient header, `DiscoverHeroCarousel`,
  search box, horizontal filter-chip row. Only the trip list itself
  scrolls vertically. **This design moves all of that plus the four new
  sections into the trip list's `ListHeaderComponent`**, so the whole
  screen scrolls as one flow instead of permanently occupying vertical
  space — see "Frontend changes" below.
- **`TripCard`** (`mobile/src/components/TripCard.tsx`) and
  **`TripCardSkeleton`** (`mobile/src/components/TripCardSkeleton.tsx`):
  reused unchanged by every new section.
- **`getCurrentLocationOrThrow`** (`mobile/src/utils/currentLocation.ts`):
  existing Expo-Location permission+coordinate flow, reused unchanged.

## Non-goals / explicitly deferred

- No new database fields, tables, or migrations. No `viewCount` tracking.
- No true geo-indexed query (PostGIS) — trending/recommended candidate
  pools are bounded in-memory scans, matching the existing near-me
  precedent, not a new architecture.
- No infinite scroll within the 4 new sections (fixed small `limit`).
- Web gets the same components (single RN/RN-Web codebase) — no separate
  web implementation.

## Backend changes

All in `backend/src/modules/trips/` (no new modules).

### `trips.service.ts` additions

```ts
const TRENDING_CANDIDATE_LIMIT = 100;
const SECTION_RESULT_LIMIT = 10;

const upcomingOpenWhere: Prisma.TripWhereInput = {
  status: { in: ["PLANNING", "OPEN", "ALMOST_FULL"] },
  startDate: { gte: new Date() },
};

function engagementScore(trip: { _count: { likes: number; comments: number; joinRequests: number }; createdAt: Date }): number {
  const recencyBoost = Math.max(0, 5 - daysSince(trip.createdAt) * 0.5);
  return trip._count.likes * 2 + trip._count.comments * 1.5 + trip._count.joinRequests * 3 + recencyBoost;
}

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

export async function getTrendingTrips(viewerId?: string, limit = SECTION_RESULT_LIMIT) {
  const candidates = await prisma.trip.findMany({
    where: upcomingOpenWhere,
    include: cardInclude,
    orderBy: { createdAt: "desc" },
    take: TRENDING_CANDIDATE_LIMIT,
  });
  const ranked = candidates
    .map((t) => ({ ...t, score: engagementScore(t) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
    // No signal at all yet - graceful fallback to trending/popular.
    return getTrendingTrips(userId, limit);
  }

  const [ownTripIds, joinedTripIds, bookmarkedTripIds] = await Promise.all([
    prisma.trip.findMany({ where: { ownerId: userId }, select: { id: true } }).then((r) => r.map((t) => t.id)),
    Promise.resolve(joinedGroups.map((g) => g.group.tripId)),
    Promise.resolve(bookmarks.map((b) => b.tripId)),
  ]);
  const excludeIds = new Set([...ownTripIds, ...joinedTripIds, ...bookmarkedTripIds]);

  const candidates = await prisma.trip.findMany({
    where: { ...upcomingOpenWhere, id: { notIn: [...excludeIds] } },
    include: cardInclude,
    orderBy: { createdAt: "desc" },
    take: TRENDING_CANDIDATE_LIMIT,
  });

  const ranked = candidates
    .map((t) => {
      let score = engagementScore(t) * 0.3; // trending as a tiebreaker
      if (preferredModes.has(t.travelMode)) score += 10;
      if (preferredDestinations.has(t.destination.toLowerCase())) score += 6;
      return { ...t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return attachViewerFlags(ranked, userId);
}
```

Both functions live directly under the existing `listTrips` in the same
file, next to `attachViewerFlags`/`haversineKm`, matching the file's
current organization (no new file).

### `trips.controller.ts` additions

```ts
export async function trending(req: AuthedRequest, res: Response) {
  const items = await service.getTrendingTrips(req.userId);
  res.json({ items });
}

export async function recommended(req: AuthedRequest, res: Response) {
  const items = await service.getRecommendedTrips(req.userId!);
  res.json({ items });
}
```

### `trips.routes.ts` additions

Registered **before** `/:id` (Express matches path segments in order, and
`/mine`/`/bookmarked` already establish this convention):

```ts
tripsRouter.get("/trending", optionalAuth, asyncHandler(controller.trending));
tripsRouter.get("/recommended", requireAuth, asyncHandler(controller.recommended));
```

`/trending` is public (like the main list) so logged-out users still see
it; `/recommended` requires auth since it's inherently personalized.

No changes to `trips.types.ts` — neither endpoint takes query params.

## Frontend changes

### `mobile/src/api/trips.ts` additions

```ts
export function useTrendingTrips() {
  return useQuery({
    queryKey: ["trips", "trending"],
    queryFn: async () => (await apiClient.get<{ items: Trip[] }>("/trips/trending")).data.items,
  });
}

export function useRecommendedTrips() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["trips", "recommended"],
    queryFn: async () => (await apiClient.get<{ items: Trip[] }>("/trips/recommended")).data.items,
    enabled: !!token,
  });
}
```

(`useAuthStore` import added from `../store/authStore`, matching how
`useMe()` gates itself in `mobile/src/api/users.ts`.)

### New file: `mobile/src/utils/weekendRange.ts`

```ts
export function getUpcomingWeekendRange(now = new Date()): { dateFrom: string; dateTo: string } {
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  const daysUntilSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day;
  const saturday = new Date(now);
  saturday.setDate(now.getDate() + daysUntilSaturday);
  saturday.setHours(0, 0, 0, 0);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59, 999);
  return { dateFrom: saturday.toISOString(), dateTo: sunday.toISOString() };
}
```

`day === 0` (Sunday) case sets `daysUntilSaturday = -1` so `saturday`
resolves to *yesterday*, keeping today (Sunday) inside the window — matches
the approved "if today is Sat/Sun, window starts today" rule.

### New file: `mobile/src/components/DiscoverSection.tsx`

A generic horizontal-row section, reused for all four sections:

```ts
export function DiscoverSection({
  title,
  emoji,
  trips,
  isLoading,
  onTripPress,
}: {
  title: string;
  emoji: string;
  trips: Trip[] | undefined;
  isLoading: boolean;
  onTripPress: (trip: Trip) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!isLoading && (!trips || trips.length === 0)) return null; // graceful hide, no empty-state clutter

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{emoji} {title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        data={isLoading ? [] : trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <TripCard trip={item} onPress={() => onTripPress(item)} />
          </View>
        )}
        ListEmptyComponent={isLoading ? (
          <View style={styles.row}>
            <View style={styles.cardWrap}><TripCardSkeleton /></View>
            <View style={styles.cardWrap}><TripCardSkeleton /></View>
          </View>
        ) : null}
      />
    </View>
  );
}
```

`cardWrap` gives each card a fixed width (matching `TripCard`'s existing
card width style) so horizontal `FlatList` sizing is stable; `TripCard`
itself is unmodified.

### `DiscoverScreen.tsx` changes

1. Add four hooks: `useTrendingTrips()`, `useRecommendedTrips()`, plus two
   more calls to the *existing* `useTrips()`:
   - Near You: `useTrips({ lat: nearYouCoords?.lat, lng: nearYouCoords?.lng, radiusKm: DEFAULT_RADIUS_KM })`, `enabled` implicitly via `lat`/`lng` being `undefined` until resolved (React Query still fires with undefined parts, but the query key differs from the main list's, so it's cached independently; the hook can early-return via a local `enabled: !!nearYouCoords` passed through — this requires threading an `enabled` option into `useTrips`, a small backward-compatible addition since it's currently always-enabled).
   - This Weekend: `useTrips({ dateFrom, dateTo })` from `getUpcomingWeekendRange()`, computed once via `useMemo`. No extra status filtering is needed here: `dateFrom` is always today-or-later, and a trip can only reach `COMPLETED`/be otherwise "expired" after its `endDate` (always ≥ `startDate`) has passed, so the date range itself excludes closed/expired trips.
2. Add local state `nearYouCoords` and a `useEffect` on mount that calls
   `getCurrentLocationOrThrow()` silently (catch → leave `nearYouCoords`
   null, section hides via `DiscoverSection`'s empty-hide behavior — no
   error modal, unlike the explicit Near Me filter chip's flow).
3. **Restructure rendering**: move `GradientBackground` header,
   `DiscoverHeroCarousel`, search box, and the filter-chip `FlatList` out
   of being fixed siblings and into the main list's `ListHeaderComponent`,
   with the four `DiscoverSection`s appended after the filter row and
   before the main list's own items. This makes the entire screen one
   scrollable `FlatList` instead of a fixed header eating permanent
   vertical space. Horizontal `FlatList`s nested inside a vertical
   `FlatList`'s `ListHeaderComponent` is safe (React Native's
   nested-VirtualizedList warning applies to same-axis nesting, not
   cross-axis) and is a standard RN pattern.
4. `onTripPress` for every section navigates identically to the existing
   card press handler: `navigation.navigate("TripDetail", { tripId: trip.id })`.

### `useTrips` — minimal backward-compatible addition

```ts
export function useTrips(filters: TripFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["trips", filters],
    queryFn: async () => { /* unchanged */ },
    enabled: options?.enabled ?? true,
  });
}
```

Every existing call site omits `options`, so behavior is unchanged there;
only the new Near You call site passes `{ enabled: !!nearYouCoords }`.

## Data flow summary

```
DiscoverScreen mount
 ├─ useMe() ─────────────────────── (unchanged)
 ├─ useTrendingTrips() ───────────► GET /trips/trending (public)
 ├─ useRecommendedTrips() ───────► GET /trips/recommended (auth)
 ├─ useEffect → silent geolocation → useTrips({lat,lng}, {enabled}) ─► GET /trips
 ├─ useMemo(weekendRange) → useTrips({dateFrom,dateTo}) ─────────────► GET /trips
 └─ useTrips(existing filters) ──► GET /trips        (unchanged, main list)
```

Five independent React Query caches, five independent loading states,
each section skeletons/hides on its own — no section blocks another.

## Empty / fallback states

- **Recommended**: only truly empty if `getRecommendedTrips` returns `[]`,
  which only happens if the trending fallback itself has no upcoming open
  trips platform-wide — same as Trending's empty case.
- **Trending**: empty only if there are literally no upcoming
  open/planning/almost-full trips.
- **Near You**: hidden if location permission is denied, unavailable, or
  no trips fall within the default radius — no modal, since this is a
  passive background attempt, not a user-initiated action (existing Near
  Me filter chip keeps its own explicit denial modal, untouched).
- **This Weekend**: hidden if no trips start within the computed Sat–Sun
  window.
- All four use `DiscoverSection`'s `return null` when empty and not
  loading — no visible empty-state text for these compact rows, per the
  approved "avoid clutter" design.

## Error handling

- Each new hook follows existing React Query defaults already used
  elsewhere in the app (no custom retry/backoff introduced) — a failed
  section fetch simply leaves that section's `data` undefined, which
  `DiscoverSection` treats the same as "still loading forever" only if
  `isLoading` also stays true; in practice a network error resolves
  `isLoading` to `false` with `data` undefined, so the section hides
  rather than showing a broken UI. This matches how the rest of the app
  already handles query errors on Discover (no existing error banners on
  this screen today).

## Testing plan

- **Backend**: unit-test `engagementScore` (pure function — verify
  ordering for a few synthetic count/date combinations) and integration
  tests for `getTrendingTrips`/`getRecommendedTrips` against a seeded test
  DB (verify: excludes own/joined/bookmarked trips from recommendations,
  falls back to trending when a user has no signal, excludes
  `CANCELLED`/`COMPLETED`/`STARTED`/`FULL` trips, respects `limit`).
- **Frontend**: `getUpcomingWeekendRange` unit tests for Mon–Sun boundary
  cases (verify Sunday-input keeps today in range, Monday-input jumps to
  the coming Saturday). Manual verification (per "Final validation" below)
  for the composed screen, since this codebase has no existing
  screen-level test harness for Discover to extend.

## Non-breaking safeguards

- No existing route, hook signature (beyond the additive optional
  `options` param on `useTrips`), component prop, or Prisma field is
  changed or removed.
- Main trip list's data source (`useTrips(existing filters)`), pagination,
  refresh-control, empty state, and FAB are untouched — only their visual
  container becomes `ListHeaderComponent`-driven instead of sibling views.
- `TripCard`, `TripCardSkeleton`, `ProfileMenu`, `DiscoverHeroCarousel`,
  filter chips, search, sort, Near Me chip/radius-sheet/denial-modal: all
  reused with zero prop/behavior changes.
- New backend routes are additive; existing `/trips`, `/trips/mine`,
  `/trips/bookmarked`, `/trips/:id` routes and their ordering are
  untouched (new routes inserted before the existing `/:id` catch-all,
  same pattern as `/mine`/`/bookmarked`).

## Final validation (manual, both platforms)

Login → Discover (verify all 4 new sections + existing list load, verify
skeletons appear then resolve, verify sections with no data hide cleanly)
→ toggle filters/sort (verify main list still behaves exactly as before)
→ Near Me chip (verify existing explicit flow unaffected by the new silent
Near You fetch) → tap a card in each of the 4 new sections → Trip Details
loads correctly → back → Notifications/Group Chat spot-check (unaffected,
no shared code touched).
