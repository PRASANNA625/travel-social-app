# Triply — Step 3: Explore Map — Design Spec

## Goal

Let users visually discover trips on an interactive map instead of only scrolling cards — tap a marker to preview a trip, jump to trending destinations, and switch between Map and List views without losing their filters.

## Architecture Overview

```
DiscoverScreen (existing filter state: search, travelModes, nearMe{lat,lng}, radiusKm, sortOrder)
        │
        ├─ List mode (existing): useTrips(filters) → FlatList of TripCards
        │
        └─ Map mode (new): same useTrips(filters, {pageSize: 200}) → ExploreMap
                                  │
                                  ├─ pins: trips with startLat/startLng, distanceKm if Near Me active
                                  ├─ user marker: silent getCurrentLocationOrThrow() (same as Near You)
                                  └─ trending chips: new GET /trips/trending-destinations
```

A Map/List toggle sits beside the existing search bar in `DiscoverScreen`. Both modes read the *same* filter state and the *same* `useTrips(filters)` React Query hook — switching modes does not refetch, it only changes how the already-fetched trips render (list vs. pins). This mirrors the "single source of data, two renderings" pattern already used for Discover's other sections.

There is an existing, proven cross-platform map foundation in this codebase — `mobile/src/components/LocationPickerModal.tsx` / `.web.tsx` — a Leaflet + OpenStreetMap page embedded in a `react-native-webview` `WebView` on native and a plain `<iframe>` on web, with the same page HTML shared verbatim between both, communicating via `injectJavaScript` (native) / `postMessage` (web) into one convergent `window.setPin`-style JS API. This spec extends that exact foundation to render multiple markers instead of one draggable pin. No new map library or dependency (`react-native-maps`, Mapbox, etc.) is introduced.

## Global Constraints

- No new npm dependencies on either `backend` or `mobile` — reuse Leaflet (already loaded via CDN inside the existing WebView/iframe HTML), `expo-location` (already installed), and `react-native-webview` (already installed).
- Reuse `getCurrentLocationOrThrow()` (`mobile/src/utils/currentLocation.ts`) — do not add a second location-fetching utility.
- Reuse the existing `GET /trips` filtering/pagination/geo-sort logic (`backend/src/modules/trips/trips.service.ts`) — no new trip-list endpoint, no new geo index (PostGIS etc.).
- Reuse the existing `engagementScore()` trending formula (`trips.service.ts`) for trending-destination ranking — do not invent a second trending metric.
- Reuse the existing `TripDetail` screen unchanged for full trip viewing — no new detail screen.
- Map mode must not trigger a duplicate fetch of the same filtered trip set already fetched for List mode.
- Silent, non-blocking location handling on entering Map mode — same pattern as Discover's existing "Near You" section (no eager permission dialog).
- Purely additive to `DiscoverScreen` — the 5 existing sections and List-mode `FlatList` must remain unmodified in behavior.

## Backend Changes

### 1. Raise the trips list endpoint's max page size

**File:** `backend/src/modules/trips/trips.service.ts`

The call `parsePageParams(filters as unknown as Record<string, unknown>)` currently uses the utility's defaults (`defaultPageSize = 20, maxPageSize = 50`). Map mode needs to request up to ~200 pins in one call to match the geo-sort branch's own internal candidate-pool cap (`take: 200`, already present in the same function for the Near Me code path). Change the call to pass an explicit higher max:

```ts
const pageParams = parsePageParams(filters as unknown as Record<string, unknown>, 20, 200);
```

This is backward compatible: the default page size for existing callers (10-20 depending on the caller) is unchanged; only the *ceiling* a caller may request is raised. No existing UI requests a pageSize anywhere near 200 today, so no existing behavior changes.

### 2. New endpoint: `GET /trips/trending-destinations`

**File:** `backend/src/modules/trips/trips.service.ts` (new function), `trips.controller.ts` (new handler), `trips.routes.ts` (new route, registered before `/:id` alongside the existing `/trending`/`/recommended` routes).

Groups the same candidate pool `getTrendingTrips` already scores (`upcomingOpenWhere()`, `TRENDING_CANDIDATE_LIMIT = 100`, `engagementScore()`) by `destination`, summing each destination's contributing trips' scores, and returns the top N (8) destinations:

```ts
export interface TrendingDestination {
  destination: string;
  tripCount: number;
  score: number;
  lat: number;
  lng: number;
}

const TRENDING_DESTINATIONS_LIMIT = 8;

export async function getTrendingDestinations(): Promise<TrendingDestination[]> {
  const candidates = await prisma.trip.findMany({
    where: { ...upcomingOpenWhere(), startLat: { not: null }, startLng: { not: null } },
    include: cardInclude,
    orderBy: { createdAt: "desc" },
    take: TRENDING_CANDIDATE_LIMIT,
  });

  const byDestination = new Map<
    string,
    { tripCount: number; score: number; latSum: number; lngSum: number }
  >();

  for (const trip of candidates) {
    const key = trip.destination;
    const score = engagementScore(trip);
    const entry = byDestination.get(key) ?? { tripCount: 0, score: 0, latSum: 0, lngSum: 0 };
    entry.tripCount += 1;
    entry.score += score;
    entry.latSum += trip.startLat!;
    entry.lngSum += trip.startLng!;
    byDestination.set(key, entry);
  }

  return Array.from(byDestination.entries())
    .map(([destination, agg]) => ({
      destination,
      tripCount: agg.tripCount,
      score: agg.score,
      lat: agg.latSum / agg.tripCount,
      lng: agg.lngSum / agg.tripCount,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TRENDING_DESTINATIONS_LIMIT);
}
```

Route: `GET /trips/trending-destinations` → `{ items: TrendingDestination[] }`, no auth required (same as `/trips/trending`), no pagination (fixed small top-N list).

## Frontend Changes

### 1. `ExploreMap` component (new)

**Files:** `mobile/src/components/ExploreMap.tsx` (native — WebView), `mobile/src/components/ExploreMap.web.tsx` (web — iframe).

Both files share the same embedded-page HTML-building approach as `LocationPickerModal`'s pair, extended to:
- Accept a `pins: {id: string; lat: number; lng: number}[]` prop; render one `L.marker` per pin in a loop (replacing the picker's single `marker` variable with a `Map<string, L.Marker>` keyed by trip id).
- Accept an optional `userLocation: {lat: number; lng: number} | null` prop; render a visually distinct marker (different Leaflet icon) at that position when present.
- On tap of a trip marker, post `{type: "MARKER_TAPPED", tripId}` back to React Native (new message type, added alongside the existing `MAP_READY`/`PIN_MOVED` types the picker's page already sends).
- On mount / whenever `pins` changes, call Leaflet's `map.fitBounds(...)` over all pin coordinates (falling back to the same `DEFAULT_CENTER` India-centroid constant already defined in the picker's files when there are zero pins).
- Expose a `panTo(lat, lng, zoom)` bridge function (mirroring the picker's existing `window.setPin`, minus the marker-drop side effect) so trending-destination chips outside the WebView can pan the map via the same `injectJavaScript`/`postMessage` convergent-bridge pattern.

Props: `{ pins, userLocation, onMarkerPress: (tripId: string) => void, panToRef?: RefObject<{panTo: (lat, lng, zoom?) => void}> }`.

### 2. `TripMapPreviewCard` component (new)

**File:** `mobile/src/components/TripMapPreviewCard.tsx`.

A bottom-sheet-style card (`position: absolute`, bottom of the map container, following the same visual language — rounded corners, shadow, theme tokens — as `BuddyCard`/`TripCard`) showing photo, title, destination, dates, travel mode chip, and `distanceKm` (formatted, only when present on the trip object). Two actions: tap the card body (or a "View Trip" button) navigates to `navigation.navigate("TripDetail", { tripId })`; a small close (✕) dismisses the preview without navigating.

### 3. `mobile/src/api/trips.ts` — trending destinations hook

Add `useTrendingDestinations()` following the existing `useTrendingTrips()`/`useRecommendedTrips()` pattern already in this file:

```ts
export function useTrendingDestinations() {
  return useQuery({
    queryKey: ["trips", "trending-destinations"],
    queryFn: async () => (await apiClient.get<{ items: TrendingDestination[] }>("/trips/trending-destinations")).data.items,
  });
}
```

### 4. `DiscoverScreen.tsx` integration

- New local state: `const [viewMode, setViewMode] = useState<"list" | "map">("list")`.
- New silent-location state for map mode, following the exact pattern already used for `nearYouCoords` (silent `useEffect` on entering map mode, not on screen mount, so List-mode users never trigger a location prompt they didn't ask for): `const [mapUserLocation, setMapUserLocation] = useState<{lat: number; lng: number} | null>(null)`.
- A small segmented-control toggle (`📋 List` / `🗺️ Map`) rendered beside the existing search bar.
- When `viewMode === "map"`: render `ExploreMap` instead of the trip `FlatList`, fed from the *same* `useTrips(filters)` call already used for List mode (filters gain `lat`/`lng` from `mapUserLocation` only when the user hasn't already set an explicit Near Me filter — Near Me's explicit choice always takes precedence over the silent map-location attempt). Trip objects with `startLat`/`startLng` become `pins`; tapping a pin looks up the full trip object already in the fetched list (no extra request) and opens `TripMapPreviewCard`.
- A horizontal row of trending-destination chips (from `useTrendingDestinations()`) renders above the map; tapping one calls the map's `panTo(lat, lng, 10)`.
- Empty state (zero pins matching filters): map still renders (centered on default/user location) with a small overlay message, consistent with List mode's existing empty-state text/pattern.
- All 5 existing Discover sections and the List-mode `FlatList`/filters remain byte-for-byte unmodified — this integration only adds the toggle and a new conditional render branch.

## Testing Plan

**Backend:** extend `backend/scripts/smoke-test-discover.mjs` (or add a focused addition) covering `GET /trips/trending-destinations` — asserts the response is derived from real trip data (correct per-destination trip counts and centroid coordinates for a known set of test trips), and a `pageSize=200` request against `GET /trips` returns more than 50 items when more than 50 matching trips exist.

**Frontend:** `npm run typecheck` clean on both packages (no test framework exists in this repo, per established convention).

**Manual QA (needs a human device/browser walkthrough — noted explicitly, same as Travel Buddies):** toggle List ↔ Map preserves filters; map centers on real location when granted, default region when denied; tapping a marker shows the correct trip's preview card; tapping the preview navigates to the correct `TripDetail`; trending-destination chips pan the map correctly; empty-filter state renders a working (not broken) map; web responsiveness at narrow viewport widths.
