# Personalized Discover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four personalized, server-scored/reused-filter sections (Recommended For You, Trending Trips, Near You, This Weekend) to the top of the mobile/web Discover screen, using only data that already exists in the schema.

**Architecture:** Two new backend endpoints (`GET /trips/trending`, `GET /trips/recommended`) extend the existing `trips.service.ts` using the same in-memory "candidate pool → score → sort → slice" pattern the current Near Me geo-sort already uses. Near You and This Weekend reuse the existing `GET /trips` endpoint with different params (no backend changes). The mobile Discover screen is restructured so the whole screen scrolls as one `ListHeaderComponent`-driven `FlatList` instead of a fixed, ever-growing header.

**Tech Stack:** Express + Prisma (backend), Expo/React Native + React Query (mobile, shared with web via React Native Web). No new dependencies — this repo has no unit-test framework on either side; the existing precedent (`backend/scripts/smoke-test.mjs`) is a plain-Node black-box HTTP script, which this plan follows for backend verification, plus a matching lightweight `tsx`-run verification script on the mobile side for the one new pure function.

**Spec:** [docs/superpowers/specs/2026-09-09-personalized-discover-design.md](../specs/2026-09-09-personalized-discover-design.md)

## Global Constraints

- No new database fields, tables, or migrations.
- No new npm dependencies on either `backend` or `mobile`.
- Do not change the behavior, signature, or callers of any existing route, hook, or component beyond the one additive optional `options` param on `useTrips` (Task 2).
- `/trips/trending` and `/trips/recommended` must be registered in `trips.routes.ts` **before** the `/:id` route (same convention as the existing `/mine` and `/bookmarked` routes).
- Every new query reuses `cardInclude` and `attachViewerFlags` from `trips.service.ts` — do not duplicate that shape.
- Follow the existing black-box smoke-test convention (`backend/scripts/smoke-test.mjs`: plain ESM + `fetch`, a local `assert()` helper, run against a live dev server) — do not introduce Jest/Vitest/supertest or any other test framework.

---

### Task 1: Backend — Trending & Recommended endpoints

**Files:**
- Modify: `backend/src/modules/trips/trips.service.ts`
- Modify: `backend/src/modules/trips/trips.controller.ts`
- Modify: `backend/src/modules/trips/trips.routes.ts`
- Create: `backend/scripts/smoke-test-discover.mjs`

**Interfaces:**
- Consumes: `prisma` (`../../config/prisma`), `cardInclude`, `attachViewerFlags` (existing, defined earlier in `trips.service.ts`), `Prisma` types from `@prisma/client`.
- Produces: `getTrendingTrips(viewerId?: string, limit = 10): Promise<TripWithScore[]>`, `getRecommendedTrips(userId: string, limit = 10): Promise<TripWithScore[]>` (both exported from `trips.service.ts`); `GET /trips/trending` (public), `GET /trips/recommended` (auth required) — both return `{ items: Trip[] }` using the same card shape as `GET /trips`. Later tasks (2-4) consume these two routes by URL only.

- [ ] **Step 1: Add scoring helpers and the two new service functions**

Open `backend/src/modules/trips/trips.service.ts`. Add this block directly after the existing `attachViewerFlags` function (after line 59, before `export async function createTrip`):

```ts
const TRENDING_CANDIDATE_LIMIT = 100;
const SECTION_RESULT_LIMIT = 10;

const upcomingOpenWhere: Prisma.TripWhereInput = {
  status: { in: ["PLANNING", "OPEN", "ALMOST_FULL"] },
  startDate: { gte: new Date() },
};

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
    return getTrendingTrips(userId, limit);
  }

  const ownTripIds = (await prisma.trip.findMany({ where: { ownerId: userId }, select: { id: true } })).map(
    (t) => t.id
  );
  const joinedTripIds = joinedGroups.map((g) => g.group.tripId);
  const bookmarkedTripIds = bookmarks.map((b) => b.tripId);
  const excludeIds = [...new Set([...ownTripIds, ...joinedTripIds, ...bookmarkedTripIds])];

  const candidates = await prisma.trip.findMany({
    where: { ...upcomingOpenWhere, id: { notIn: excludeIds } },
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
    .slice(0, limit);

  return attachViewerFlags(ranked, userId);
}
```

- [ ] **Step 2: Add controller handlers**

Open `backend/src/modules/trips/trips.controller.ts`. Add after the existing `list` function (after line 19):

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

- [ ] **Step 3: Register the two new routes before `/:id`**

Open `backend/src/modules/trips/trips.routes.ts`. Insert two new lines directly after the existing `bookmarked` route (after line 12, before the `upload.array` line):

```ts
tripsRouter.get("/trending", optionalAuth, asyncHandler(controller.trending));
tripsRouter.get("/recommended", requireAuth, asyncHandler(controller.recommended));
```

The file's route block should now read (for the GET routes, in order): `/`, `/mine`, `/bookmarked`, `/trending`, `/recommended`, `/images` (POST), `/:id`, `/:id/comments`.

- [ ] **Step 4: Write the smoke-test script**

Create `backend/scripts/smoke-test-discover.mjs`:

```js
// Black-box smoke test for the Personalized Discover backend endpoints:
// GET /trips/trending and GET /trips/recommended. Follows the same
// conventions as scripts/smoke-test.mjs (plain fetch, no framework).
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const rand = () => Math.random().toString(36).slice(2, 8);

async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function futureDate(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

async function registerUser(label) {
  const email = `${label}-${rand()}@example.com`;
  return request("POST", "/auth/register", { body: { email, password: "password123", name: label } });
}

async function createTrip(token, overrides = {}) {
  return request("POST", "/trips", {
    token,
    body: {
      title: `Discover Test Trip ${rand()}`,
      destination: "Goa",
      startLocation: "Bengaluru",
      startDate: futureDate(10),
      endDate: futureDate(12),
      travelMode: "BEACH",
      seats: 6,
      description: "Smoke-test trip for Discover sections",
      placesToVisit: [],
      images: [],
      joinType: "OPEN",
      ...overrides,
    },
  });
}

async function main() {
  console.log(`Smoke testing Personalized Discover against ${BASE}`);

  // --- Trending: two trips, one with more engagement, verify ordering ---
  const owner = await registerUser("trending-owner");
  const liker = await registerUser("trending-liker");

  const quietTrip = await createTrip(owner.token);
  const popularTrip = await createTrip(owner.token, { destination: "Manali", travelMode: "TREK" });
  await request("POST", `/trips/${popularTrip.id}/like`, { token: liker.token });

  const trending = await request("GET", "/trips/trending");
  assert(Array.isArray(trending.items), "trending.items should be an array");
  const popularIndex = trending.items.findIndex((t) => t.id === popularTrip.id);
  const quietIndex = trending.items.findIndex((t) => t.id === quietTrip.id);
  assert(popularIndex !== -1, "liked trip should appear in trending");
  assert(quietIndex === -1 || popularIndex < quietIndex, "liked trip should rank above the unliked trip");
  console.log("✓ trending ranks a liked trip above an unliked one");

  // --- Recommended: user with a preferred mode should see matching trips ranked up ---
  const recommendedUser = await registerUser("recommended-user");
  const bikeOwner = await registerUser("bike-owner");
  const beachTripByBikeOwner = await createTrip(bikeOwner.token, { travelMode: "BEACH" });
  const bikeTrip = await createTrip(bikeOwner.token, { travelMode: "BIKE", destination: "Ladakh" });

  // Bookmark a BIKE trip so recommendedUser has a structured history signal
  // (preferredModes is empty at registration, so history must supply it).
  await request("POST", `/trips/${bikeTrip.id}/bookmark`, { token: recommendedUser.token });
  const anotherBikeTrip = await createTrip(bikeOwner.token, { travelMode: "BIKE", destination: "Spiti" });

  const recommended = await request("GET", "/trips/recommended", { token: recommendedUser.token });
  assert(Array.isArray(recommended.items), "recommended.items should be an array");
  const bikeIndex = recommended.items.findIndex((t) => t.id === anotherBikeTrip.id);
  const beachIndex = recommended.items.findIndex((t) => t.id === beachTripByBikeOwner.id);
  assert(bikeIndex !== -1, "a BIKE trip should be recommended given the user's bookmarked-BIKE history");
  if (beachIndex !== -1) {
    assert(bikeIndex < beachIndex, "BIKE trip should rank above the non-preferred BEACH trip");
  }
  console.log("✓ recommended ranks trips matching the user's history higher");

  // --- Fallback: a brand new user with zero signal should get a non-empty, trending-like result ---
  const freshUser = await registerUser("fresh-user");
  const fallback = await request("GET", "/trips/recommended", { token: freshUser.token });
  assert(Array.isArray(fallback.items), "fallback recommended.items should be an array");
  assert(fallback.items.length > 0, "fresh user with no signal should still get fallback results");
  console.log("✓ recommended falls back to trending-style results for a user with no signal");

  console.log("All Personalized Discover smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
```

- [ ] **Step 5: Run the smoke test against a live dev server**

In one terminal: `cd backend && npm run dev`
In another terminal: `cd backend && node scripts/smoke-test-discover.mjs`

Expected: all three `✓` lines print, then `All Personalized Discover smoke tests passed.`, exit code 0. If it fails, read the assertion message — it names exactly which ranking expectation broke.

- [ ] **Step 6: Typecheck and commit**

```bash
cd backend && npx tsc -p tsconfig.json --noEmit
git add backend/src/modules/trips/trips.service.ts backend/src/modules/trips/trips.controller.ts backend/src/modules/trips/trips.routes.ts backend/scripts/smoke-test-discover.mjs
git commit -m "Add trending and recommended trip endpoints"
```

---

### Task 2: Frontend data layer — weekend range util, new hooks, useTrips `enabled` option

**Files:**
- Create: `mobile/src/utils/weekendRange.ts`
- Create: `mobile/scripts/verify-weekend-range.ts`
- Modify: `mobile/src/api/trips.ts`

**Interfaces:**
- Consumes: `GET /trips/trending`, `GET /trips/recommended` (Task 1); `apiClient` (`mobile/src/api/client.ts`, existing); `useAuthStore` (`mobile/src/store/authStore.ts`, existing); `Trip` type (`mobile/src/types`, existing, already has `_count`/`distanceKm`).
- Produces: `getUpcomingWeekendRange(now?: Date): { dateFrom: string; dateTo: string }`; `useTrendingTrips(): UseQueryResult<Trip[]>`; `useRecommendedTrips(): UseQueryResult<Trip[]>`; `useTrips(filters: TripFilters, options?: { enabled?: boolean }): UseQueryResult<Paginated<Trip>>` (existing signature extended, fully backward compatible — every existing call site keeps working unchanged). Task 4 consumes all four of these by name.

- [ ] **Step 1: Write the weekend-range function**

Create `mobile/src/utils/weekendRange.ts`:

```ts
// Computes the upcoming Saturday 00:00 through Sunday 23:59 window, in the
// device's local time. If `now` already falls on a Saturday or Sunday, the
// window starts today (today still counts as "this weekend").
export function getUpcomingWeekendRange(now: Date = new Date()): { dateFrom: string; dateTo: string } {
  const day = now.getDay(); // 0 = Sunday ... 6 = Saturday
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

- [ ] **Step 2: Write the verification script and confirm it fails before implementation is wrong / passes after**

Create `mobile/scripts/verify-weekend-range.ts`:

```ts
// Standalone verification for getUpcomingWeekendRange - this repo has no
// unit-test framework, so this mirrors backend/scripts/smoke-test.mjs's
// homegrown assert() convention. Run with: npx tsx mobile/scripts/verify-weekend-range.ts
import { getUpcomingWeekendRange } from "../src/utils/weekendRange";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function dayName(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long" });
}

// Monday -> should jump forward to the coming Saturday/Sunday.
const monday = new Date("2026-09-14T10:00:00"); // a Monday
const fromMonday = getUpcomingWeekendRange(monday);
assert(dayName(fromMonday.dateFrom) === "Saturday", `expected Saturday, got ${dayName(fromMonday.dateFrom)}`);
assert(dayName(fromMonday.dateTo) === "Sunday", `expected Sunday, got ${dayName(fromMonday.dateTo)}`);
assert(new Date(fromMonday.dateFrom) > monday, "Saturday should be after Monday");

// Sunday -> should keep today (Sunday) as the start of the window, not jump a full week ahead.
const sunday = new Date("2026-09-13T10:00:00"); // a Sunday
const fromSunday = getUpcomingWeekendRange(sunday);
assert(dayName(fromSunday.dateTo) === "Sunday", `expected Sunday, got ${dayName(fromSunday.dateTo)}`);
assert(
  new Date(fromSunday.dateTo).toDateString() === sunday.toDateString(),
  "the Sunday window should end on today when today is already Sunday"
);

// Saturday -> should keep today as the start.
const saturday = new Date("2026-09-12T10:00:00"); // a Saturday
const fromSaturday = getUpcomingWeekendRange(saturday);
assert(
  new Date(fromSaturday.dateFrom).toDateString() === saturday.toDateString(),
  "the Saturday window should start today when today is already Saturday"
);

console.log("✓ getUpcomingWeekendRange: Monday jumps to the coming weekend");
console.log("✓ getUpcomingWeekendRange: Sunday keeps today in range");
console.log("✓ getUpcomingWeekendRange: Saturday keeps today in range");
console.log("All weekendRange checks passed.");
```

Run: `cd mobile && npx tsx scripts/verify-weekend-range.ts`
Expected right now: FAIL with a module-not-found error, since `src/utils/weekendRange.ts` doesn't exist yet — reorder if needed, but confirm this script actually exercises real failure before moving on (create the script first, watch it fail, then add the Step 1 file, or run both steps and just verify the final pass — either order is fine as long as you observe the assertions actually run against real logic, not a stub).

- [ ] **Step 3: Run again and confirm all four lines pass**

Run: `cd mobile && npx tsx scripts/verify-weekend-range.ts`
Expected: four `✓` lines then `All weekendRange checks passed.`, exit code 0.

- [ ] **Step 4: Add the two new hooks and the `useTrips` `enabled` option**

Open `mobile/src/api/trips.ts`. Add the import at the top (line 1 area, alongside the existing imports):

```ts
import { useAuthStore } from "../store/authStore";
```

Change the `useTrips` function (lines 22-30) to:

```ts
export function useTrips(filters: TripFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["trips", filters],
    queryFn: async () => {
      const params = { ...filters, travelMode: filters.travelMode?.length ? filters.travelMode.join(",") : undefined };
      return (await apiClient.get<Paginated<Trip>>("/trips", { params })).data;
    },
    enabled: options?.enabled ?? true,
  });
}
```

Add two new hooks directly after `useTrips` (after the closing brace, before `useTrip`):

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

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors. (This will still show any pre-existing unrelated errors in the codebase, if any — only confirm no *new* ones from this file.)

- [ ] **Step 6: Commit**

```bash
git add mobile/src/utils/weekendRange.ts mobile/scripts/verify-weekend-range.ts mobile/src/api/trips.ts
git commit -m "Add weekend-range util and trending/recommended trip hooks"
```

---

### Task 3: `DiscoverSection` reusable component

**Files:**
- Create: `mobile/src/components/DiscoverSection.tsx`

**Interfaces:**
- Consumes: `TripCard` (`./TripCard`, existing), `TripCardSkeleton` (`./TripCardSkeleton`, existing), `useTheme`/`Palette` (`../theme/ThemeContext`, `../theme/palettes`, existing), `Trip` type (`../types`, existing).
- Produces: `DiscoverSection({ title, emoji, trips, isLoading, onTripPress }): JSX.Element | null`. Task 4 renders one `DiscoverSection` per new section (4 instances).

- [ ] **Step 1: Write the component**

Create `mobile/src/components/DiscoverSection.tsx`:

```tsx
import { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import type { Trip } from "../types";
import { TripCard } from "./TripCard";
import { TripCardSkeleton } from "./TripCardSkeleton";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

const CARD_WIDTH = 280;

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

  if (!isLoading && (!trips || trips.length === 0)) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {emoji} {title}
      </Text>
      {isLoading ? (
        <View style={styles.row}>
          <View style={styles.cardWrap}>
            <TripCardSkeleton />
          </View>
          <View style={styles.cardWrap}>
            <TripCardSkeleton />
          </View>
        </View>
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <TripCard trip={item} onPress={() => onTripPress(item)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    section: { marginTop: 18 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.ink, marginBottom: 10, marginHorizontal: 16 },
    row: { paddingHorizontal: 16, gap: 12 },
    cardWrap: { width: CARD_WIDTH },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/DiscoverSection.tsx
git commit -m "Add reusable DiscoverSection horizontal-row component"
```

---

### Task 4: `DiscoverScreen` integration — wire in all 4 sections, restructure to single scroll

**Files:**
- Modify: `mobile/src/screens/DiscoverScreen.tsx`

**Interfaces:**
- Consumes: `useTrendingTrips`, `useRecommendedTrips`, `useTrips` with `options.enabled` (Task 2); `DiscoverSection` (Task 3); `getUpcomingWeekendRange` (Task 2); `getCurrentLocationOrThrow` (`../utils/currentLocation`, existing, unchanged).
- Produces: the completed feature — nothing downstream consumes this screen.

- [ ] **Step 1: Add new imports and state/hooks**

Open `mobile/src/screens/DiscoverScreen.tsx`. Add to the import block (after line 26, `import { getCurrentLocationOrThrow } ...`):

```ts
import { useEffect } from "react";
```

Change line 1 from:
```ts
import { useMemo, useRef, useState } from "react";
```
to:
```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

Add after the existing trips/hooks imports (after line 26):

```ts
import { DiscoverSection } from "../components/DiscoverSection";
import { useTrendingTrips, useRecommendedTrips } from "../api/trips";
import { getUpcomingWeekendRange } from "../utils/weekendRange";
```

Inside the `DiscoverScreen` function, after the existing `const { data: me } = useMe();` line (line 58), add:

```ts
const [nearYouCoords, setNearYouCoords] = useState<{ lat: number; lng: number } | null>(null);

useEffect(() => {
  let cancelled = false;
  getCurrentLocationOrThrow()
    .then((coords) => {
      if (!cancelled) setNearYouCoords(coords);
    })
    .catch(() => {
      // Silent - Near You section simply stays hidden if location isn't available.
    });
  return () => {
    cancelled = true;
  };
}, []);

const weekendRange = useMemo(() => getUpcomingWeekendRange(), []);

const { data: trendingTrips, isLoading: trendingLoading } = useTrendingTrips();
const { data: recommendedTrips, isLoading: recommendedLoading } = useRecommendedTrips();
const { data: nearYouData, isLoading: nearYouLoading } = useTrips(
  { lat: nearYouCoords?.lat, lng: nearYouCoords?.lng, radiusKm: DEFAULT_RADIUS_KM },
  { enabled: !!nearYouCoords }
);
const { data: weekendData, isLoading: weekendLoading } = useTrips(
  { dateFrom: weekendRange.dateFrom, dateTo: weekendRange.dateTo },
  { enabled: true }
);

const onSectionTripPress = (trip: { id: string }) => navigation.navigate("TripDetail", { tripId: trip.id });
```

- [ ] **Step 2: Restructure rendering into a single `ListHeaderComponent`-driven list**

Replace the entire `return (...)` block of `DiscoverScreen` (lines 116-350, from `return (` through the closing `);` right before the final `}` of the function) with:

```tsx
return (
  <View style={styles.container}>
    <FlatList
      contentContainerStyle={styles.list}
      data={data?.items ?? []}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
      ListHeaderComponent={
        <>
          <GradientBackground style={styles.header}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.greeting}>Hi, {me?.name?.split(" ")[0] ?? "there"} 👋</Text>
                <Text style={styles.greetingSub}>Where to next?</Text>
              </View>
              <View ref={avatarWrapRef} collapsable={false}>
                <TouchableOpacity onPress={onAvatarPress} accessibilityRole="button" accessibilityLabel="Profile menu">
                  {me?.photoUrl ? (
                    <Image source={{ uri: optimizedImageUrl(me.photoUrl, 84) }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>{(me?.name ?? "?").charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </GradientBackground>

          <DiscoverHeroCarousel />

          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.mutedLight} />
            <TextInput
              style={styles.search}
              placeholder="Search trips, destinations..."
              placeholderTextColor={colors.mutedLight}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterRowContent}
            data={[
              "NEAR_ME" as const,
              "SORT" as const,
              ...TRAVEL_MODES,
              ...(activeFilterCount > 1 ? (["CLEAR_ALL"] as const) : []),
            ]}
            keyExtractor={(item) => item}
            renderItem={({ item }) => {
              if (item === "SORT") {
                return (
                  <TouchableOpacity style={styles.chip} onPress={toggleSortOrder}>
                    <MaterialCommunityIcons
                      name={sortOrder === "asc" ? "sort-calendar-ascending" : "sort-calendar-descending"}
                      size={15}
                      color={colors.ink}
                    />
                    <Text style={styles.chipText}>{sortOrder === "asc" ? "Soonest first" : "Latest first"}</Text>
                  </TouchableOpacity>
                );
              }
              if (item === "NEAR_ME") {
                return (
                  <TouchableOpacity
                    style={[styles.chip, nearMe && styles.chipActive]}
                    onPress={onNearMePress}
                    disabled={locating}
                  >
                    {locating ? (
                      <ActivityIndicator size="small" color={nearMe ? colors.white : colors.primary} />
                    ) : (
                      <MaterialCommunityIcons name="map-marker" size={15} color={nearMe ? colors.white : colors.ink} />
                    )}
                    <Text style={[styles.chipText, nearMe && styles.chipTextActive]}>
                      {nearMe ? `Near me · ${radiusKm} km` : "Near me"}
                    </Text>
                    {nearMe && (
                      <>
                        <MaterialCommunityIcons name="chevron-down" size={14} color={colors.white} />
                        <TouchableOpacity
                          style={styles.chipRemoveButton}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={clearNearMe}
                        >
                          <MaterialCommunityIcons name="close-circle" size={14} color="rgba(255,255,255,0.85)" />
                        </TouchableOpacity>
                      </>
                    )}
                  </TouchableOpacity>
                );
              }
              if (item === "CLEAR_ALL") {
                return (
                  <TouchableOpacity style={styles.clearAllChip} onPress={clearAllFilters}>
                    <MaterialCommunityIcons name="close" size={14} color={colors.danger} />
                    <Text style={styles.clearAllChipText}>Clear all</Text>
                  </TouchableOpacity>
                );
              }
              const active = travelModes.includes(item);
              return (
                <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => toggleTravelMode(item)}>
                  <MaterialCommunityIcons
                    name={TRAVEL_MODE_ICONS[item]}
                    size={15}
                    color={active ? colors.white : colors.ink}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{travelModeText(item)}</Text>
                  {active && <MaterialCommunityIcons name="close-circle" size={14} color="rgba(255,255,255,0.85)" />}
                </TouchableOpacity>
              );
            }}
          />

          <DiscoverSection
            title="Recommended For You"
            emoji="✨"
            trips={recommendedTrips}
            isLoading={recommendedLoading}
            onTripPress={onSectionTripPress}
          />
          <DiscoverSection
            title="Trending Trips"
            emoji="🔥"
            trips={trendingTrips}
            isLoading={trendingLoading}
            onTripPress={onSectionTripPress}
          />
          <DiscoverSection
            title="Near You"
            emoji="📍"
            trips={nearYouData?.items}
            isLoading={!!nearYouCoords && nearYouLoading}
            onTripPress={onSectionTripPress}
          />
          <DiscoverSection
            title="This Weekend"
            emoji="📅"
            trips={weekendData?.items}
            isLoading={weekendLoading}
            onTripPress={onSectionTripPress}
          />

          {isLoading && (
            <View style={styles.list}>
              <TripCardSkeleton />
              <TripCardSkeleton />
              <TripCardSkeleton />
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        isLoading ? null : (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons
              name={nearMe ? "map-marker-radius-outline" : "compass-outline"}
              size={40}
              color={colors.mutedLight}
            />
            <Text style={styles.empty}>
              {nearMe
                ? `No trips found within ${radiusKm} km of you.`
                : "No trips match yet — try widening your filters."}
            </Text>
            {nearMe && (
              <TouchableOpacity onPress={clearNearMe}>
                <Text style={styles.emptyClearLink}>Clear filter to see all trips</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      }
      renderItem={({ item }) => (
        isLoading ? null : (
          <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
        )
      )}
    />

    <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateTrip")} activeOpacity={0.9}>
      <MaterialCommunityIcons name="plus" size={18} color={colors.white} />
      <Text style={styles.fabText}>Create Trip</Text>
    </TouchableOpacity>

    <Modal
      visible={radiusSheetVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setRadiusSheetVisible(false)}
    >
      <Pressable style={styles.backdrop} onPress={() => setRadiusSheetVisible(false)}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>Near me</Text>
          <Text style={styles.sheetSubtitle}>Showing trips within {radiusKm} km of your location</Text>
          <View style={styles.radiusOptionsRow}>
            {RADIUS_OPTIONS_KM.map((km) => (
              <TouchableOpacity
                key={km}
                style={[styles.radiusOption, radiusKm === km && styles.radiusOptionActive]}
                onPress={() => {
                  setRadiusKm(km);
                  setRadiusSheetVisible(false);
                }}
              >
                <Text style={[styles.radiusOptionText, radiusKm === km && styles.radiusOptionTextActive]}>
                  {km} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.clearFilterButton} onPress={clearNearMe}>
            <MaterialCommunityIcons name="close-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.clearFilterText}>Clear filter</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>

    <Modal
      visible={locationDeniedVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setLocationDeniedVisible(false)}
    >
      <Pressable style={styles.backdrop} onPress={() => setLocationDeniedVisible(false)}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.permissionIconWrap}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={26} color={colors.danger} />
          </View>
          <Text style={styles.sheetTitle}>Location access needed</Text>
          <Text style={styles.sheetSubtitle}>
            To show trips near you, we need permission to use your device's location. Please allow location
            access and try again.
          </Text>
          <View style={styles.permissionButtonRow}>
            <TouchableOpacity
              style={styles.permissionCancelButton}
              onPress={() => setLocationDeniedVisible(false)}
            >
              <Text style={styles.permissionCancelText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.permissionRetryButton}
              onPress={() => {
                setLocationDeniedVisible(false);
                activateNearMe();
              }}
            >
              <Text style={styles.permissionRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>

    <ProfileMenu
      visible={profileMenuVisible}
      anchor={profileMenuAnchor}
      onClose={() => setProfileMenuVisible(false)}
      onViewProfile={() => navigation.navigate("Profile")}
      onOpenSettings={() => navigation.navigate("Settings")}
    />
  </View>
);
```

Notes on this replacement (so the reviewer can verify intent, not just diff):
- The `isLoading` skeleton for the *main* list now renders inside `ListHeaderComponent` (so it appears below the new sections) instead of replacing the whole `FlatList`; `renderItem`/`ListEmptyComponent` both no-op while `isLoading` is true so nothing double-renders.
- Everything from `GradientBackground` through the filter-chip `FlatList` is byte-for-byte the same JSX as before — only its position (sibling → inside `ListHeaderComponent`) changed.
- `nearYouLoading` is gated by `!!nearYouCoords` in the `isLoading` prop passed to `DiscoverSection` so the Near You section doesn't show a skeleton forever before location resolves — it simply stays absent (per `DiscoverSection`'s empty-hide rule) until coordinates exist and the query starts loading.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Manual validation — mobile (Expo Go / dev client)**

Start the app (`cd mobile && npx expo start`), then walk through:
1. Login → Discover loads. Verify skeletons appear briefly for Recommended, Trending, and the main list, then resolve.
2. Verify This Weekend shows only if there are seeded trips with a `startDate` inside the coming Sat–Sun; otherwise confirm the section is simply absent (no broken empty box).
3. Grant location permission when prompted (silent Near You request) — verify a Near You section appears once resolved. Deny it once (test on a fresh install or reset permissions) and confirm no error modal appears and the section just stays hidden.
4. Tap a card in each of the 4 new sections — confirm it navigates to the correct Trip Details screen.
5. Use the existing filter chips (travel mode multi-select, Near Me chip + radius sheet, sort toggle, Clear all) — confirm all behave exactly as before.
6. Search — confirm the main list still filters correctly and the 4 sections above are unaffected by the search text (they're independent queries).
7. Pull to refresh — confirm the main list still refreshes via `RefreshControl`.

- [ ] **Step 5: Manual validation — web**

Run `cd mobile && npx expo start --web`, repeat the same checklist as Step 4 in a browser window, and additionally:
1. Resize the browser to a narrow (mobile-width) viewport and confirm the horizontal sections still scroll smoothly with mouse-drag/trackpad.
2. Confirm the browser's own geolocation permission prompt appears for Near You and behaves the same as native (grant → section appears; deny → section silently stays hidden).

- [ ] **Step 6: Check for runtime/build errors**

```bash
cd mobile && npm run typecheck
```
Expected: clean. Also watch the Metro/Expo terminal output during Steps 4-5 for any red-screen errors or warnings about nested `VirtualizedList`s — if that specific warning appears, it means a horizontal `FlatList` ended up nested inside another *vertical* `FlatList`'s item list rather than its `ListHeaderComponent`; re-check that `DiscoverSection`'s `FlatList` calls are only reached via `ListHeaderComponent`, not `renderItem`.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/DiscoverScreen.tsx
git commit -m "Wire Personalized Discover sections into DiscoverScreen"
```

---

## Post-implementation summary (for the final report to the user)

After all 4 tasks are complete and verified, report back to the user covering exactly what the spec's "Final validation" section asked for:
- What existing data was used for personalization (`User.preferredModes`, plus travelMode/destination derived from the user's joined/liked/bookmarked trip history).
- Which files/components changed (list the Files sections from all 4 tasks).
- How recommendations/trending are calculated (the `engagementScore` formula and the preferred-mode/destination scoring bonuses, in plain language).
- Confirmation that existing functionality (filters, search, Near Me, sort, trip cards, navigation, Trip Details, Notifications, Group Chat, auth) was not modified — only additive changes plus the one structural `ListHeaderComponent` change to `DiscoverScreen.tsx`.
- What currently uses a fallback: `Recommended For You` falls back to the Trending algorithm for any user with an empty `preferredModes` and no joined/liked/bookmarked history.
