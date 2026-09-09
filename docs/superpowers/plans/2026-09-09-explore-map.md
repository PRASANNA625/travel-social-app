# Explore Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users visually discover trips on an interactive map — tap a marker to preview a trip, jump to trending destinations, and switch between Map and List views on Discover without losing their filters.

**Architecture:** Extends the existing Leaflet + `WebView`/`iframe` foundation from `LocationPickerModal.tsx`/`.web.tsx` into a new multi-marker `ExploreMap` component pair, reusing the existing `GET /trips` filtering/pagination/geo-sort logic (with a raised page-size cap) and the existing `engagementScore()` trending formula (aggregated by destination) for a new lightweight trending-destinations endpoint. `DiscoverScreen` gains a List/Map toggle that swaps its trip-card body for the map while keeping the same filter state and search bar.

**Tech Stack:** Express + Prisma (backend), Expo/React Native + React Query (mobile, shared with web via React Native Web), Leaflet + OpenStreetMap tiles (already used via CDN inside the existing WebView/iframe pattern — no new dependency). Backend testing follows this repo's only convention: a plain-Node black-box smoke-test script, matching `smoke-test.mjs`/`smoke-test-discover.mjs`/`smoke-test-buddies.mjs` — no test framework.

**Spec:** [docs/superpowers/specs/2026-09-09-explore-map-design.md](../specs/2026-09-09-explore-map-design.md)

## Global Constraints

- No new npm dependencies on either `backend` or `mobile` — reuse Leaflet (CDN, already embedded via the existing WebView/iframe HTML), `expo-location` (already installed), `react-native-webview` (already installed).
- Reuse `getCurrentLocationOrThrow()` (`mobile/src/utils/currentLocation.ts`) — do not add a second location-fetching utility.
- Reuse the existing `GET /trips` filtering/pagination/geo-sort logic (`backend/src/modules/trips/trips.service.ts`) — no new trip-list endpoint, no new geo index.
- Reuse the existing `engagementScore()` trending formula (`trips.service.ts`) for trending-destination ranking — do not invent a second trending metric.
- Reuse the existing `TripDetail` screen unchanged for full trip viewing — no new detail screen.
- Internal scoring fields (e.g. an aggregated `score`) must never leak into an API response — strip them before returning, matching the precedent already set for `getTrendingTrips`.
- Map mode must not trigger a fetch of the same filtered trip set already fetched for List mode when Map mode isn't active — gate the map-specific query with `enabled: viewMode === "map"`.
- Silent, non-blocking location handling on entering Map mode — same pattern as Discover's existing "Near You" section (no eager permission dialog), and only requested once per screen lifetime (not re-requested on every toggle back into Map mode).
- Purely additive to `DiscoverScreen.tsx` — the 5 existing sections, the List-mode `FlatList` body, and all existing filters must remain unmodified in behavior.

---

### Task 1: Backend — raise page-size cap, add trending-destinations endpoint, smoke test

**Files:**
- Modify: `backend/src/modules/trips/trips.service.ts`
- Modify: `backend/src/modules/trips/trips.controller.ts`
- Modify: `backend/src/modules/trips/trips.routes.ts`
- Create: `backend/scripts/smoke-test-explore-map.mjs`

**Interfaces:**
- Consumes: `prisma` (`../../config/prisma`), the existing `upcomingOpenWhere()`, `engagementScore()`, `cardInclude`, `TRENDING_CANDIDATE_LIMIT` (all already defined earlier in `trips.service.ts`), `parsePageParams` (`../../utils/pagination`).
- Produces: `GET /trips` now accepts `pageSize` up to 200 (was 50); `GET /trips/trending-destinations` → `{ items: TrendingDestination[] }` where `TrendingDestination = { destination: string; tripCount: number; lat: number; lng: number }` (no `score` field — stripped before response). Task 3's mobile `useTrendingDestinations()` hook consumes this exact shape.

- [ ] **Step 1: Raise the trips list endpoint's max page size**

Open `backend/src/modules/trips/trips.service.ts`. Find this line (inside the `listTrips` function, near the top):

```ts
  const pageParams = parsePageParams(filters as unknown as Record<string, unknown>);
```

Change it to:

```ts
  const pageParams = parsePageParams(filters as unknown as Record<string, unknown>, 20, 200);
```

This raises the max requestable `pageSize` from 50 to 200 while keeping the default (used by every existing caller that doesn't pass an explicit `pageSize`) unchanged at 20.

- [ ] **Step 2: Add `getTrendingDestinations` to `trips.service.ts`**

Add this directly after the existing `getTrendingTrips` function (which ends with `return attachViewerFlags(ranked, viewerId);` followed by a closing `}`):

```ts
export interface TrendingDestination {
  destination: string;
  tripCount: number;
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
    .slice(0, TRENDING_DESTINATIONS_LIMIT)
    .map(({ score, ...rest }) => rest);
}
```

The `.map(({ score, ...rest }) => rest)` at the end strips the internal `score` field before returning — the same pattern already used by `getTrendingTrips` in this file, so the response never leaks the ranking internals.

- [ ] **Step 3: Add the controller handler**

Open `backend/src/modules/trips/trips.controller.ts`. Add this directly after the existing `trending` function:

```ts
export async function trendingDestinations(_req: AuthedRequest, res: Response) {
  const items = await service.getTrendingDestinations();
  res.json({ items });
}
```

- [ ] **Step 4: Register the route**

Open `backend/src/modules/trips/trips.routes.ts`. Add this line directly after the existing `tripsRouter.get("/trending", ...)` line:

```ts
tripsRouter.get("/trending-destinations", optionalAuth, asyncHandler(controller.trendingDestinations));
```

It must be registered before `tripsRouter.get("/:id", ...)` (it already is, since you're adding it next to `/trending` which is above `/:id`) — otherwise Express would match `/trending-destinations` as a trip id lookup.

- [ ] **Step 5: Write the smoke test**

Create `backend/scripts/smoke-test-explore-map.mjs`:

```js
// Black-box smoke test for the Explore Map backend changes: the raised
// /trips pageSize cap and the new /trips/trending-destinations endpoint.
// Follows the same conventions as scripts/smoke-test.mjs (plain fetch, no framework).
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
      title: `Explore Map Test Trip ${rand()}`,
      destination: "Goa",
      startLocation: "Bengaluru",
      startLat: 15.2993,
      startLng: 74.124,
      startDate: futureDate(10),
      endDate: futureDate(12),
      travelMode: "BEACH",
      seats: 6,
      description: "Smoke-test trip for Explore Map",
      placesToVisit: [],
      images: [],
      joinType: "OPEN",
      ...overrides,
    },
  });
}

async function main() {
  console.log(`Smoke testing Explore Map against ${BASE}`);

  // --- Raised pageSize cap: GET /trips?pageSize=200 should echo pageSize:200, not clamp to 50 ---
  const owner = await registerUser("explore-map-owner");
  await createTrip(owner.token);
  const paged = await request("GET", "/trips?pageSize=200");
  assert(paged.pageSize === 200, `expected pageSize 200, got ${paged.pageSize}`);
  console.log("✓ /trips accepts pageSize up to 200 (previously clamped to 50)");

  // --- Trending destinations: two trips in Goa (one liked), one trip in Manali ---
  const liker = await registerUser("explore-map-liker");
  const goaTripA = await createTrip(owner.token, { destination: "Goa", startLat: 15.2993, startLng: 74.124 });
  const goaTripB = await createTrip(owner.token, { destination: "Goa", startLat: 15.4, startLng: 73.9 });
  await request("POST", `/trips/${goaTripA.id}/like`, { token: liker.token });
  const manaliTrip = await createTrip(owner.token, {
    destination: "Manali",
    startLat: 32.2432,
    startLng: 77.1892,
    travelMode: "TREK",
  });

  const destinations = await request("GET", "/trips/trending-destinations");
  assert(Array.isArray(destinations.items), "trending-destinations.items should be an array");
  const goa = destinations.items.find((d) => d.destination === "Goa");
  const manali = destinations.items.find((d) => d.destination === "Manali");
  assert(!!goa, "Goa should appear in trending destinations");
  assert(goa.tripCount >= 2, `Goa should aggregate at least 2 trips, got ${goa.tripCount}`);
  assert(
    goa.lat > 15 && goa.lat < 15.5 && goa.lng > 73.5 && goa.lng < 74.5,
    `Goa's centroid should be near its contributing trips' coordinates, got ${goa.lat},${goa.lng}`
  );
  assert(!("score" in goa), "trending-destinations items must never expose the internal score field");
  if (manali) {
    const goaIndex = destinations.items.indexOf(goa);
    const manaliIndex = destinations.items.indexOf(manali);
    assert(goaIndex < manaliIndex, "Goa (liked trip, more engagement) should rank above Manali (no likes)");
  }
  console.log("✓ trending-destinations aggregates real trips by destination with a correct centroid, ranked by engagement, no leaked score field");

  console.log("All Explore Map backend smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
```

- [ ] **Step 6: Run the smoke test against a live dev server**

In one terminal: `cd backend && npm run dev`
In another terminal: `cd backend && node scripts/smoke-test-explore-map.mjs`

Expected: all `✓` lines print in order, then `All Explore Map backend smoke tests passed.`, exit code 0.

- [ ] **Step 7: Typecheck and commit**

```bash
cd backend && npx tsc -p tsconfig.json --noEmit
git add backend/src/modules/trips/trips.service.ts backend/src/modules/trips/trips.controller.ts backend/src/modules/trips/trips.routes.ts backend/scripts/smoke-test-explore-map.mjs
git commit -m "Add trending-destinations endpoint and raise /trips pageSize cap"
```

---

### Task 2: `ExploreMap` component pair (multi-marker Leaflet map)

**Files:**
- Create: `mobile/src/components/ExploreMap.tsx`
- Create: `mobile/src/components/ExploreMap.web.tsx`

**Interfaces:**
- Consumes: `react-native-webview`'s `WebView`/`WebViewMessageEvent` (native file only, already installed).
- Produces: `ExploreMapPin = { id: string; lat: number; lng: number }`, `ExploreMapPanTarget = { lat: number; lng: number; zoom?: number }`, and `ExploreMap({ pins, userLocation, panTarget, onMarkerPress })` — same props/exports on both platform files. Task 4 (`DiscoverScreen.tsx`) imports `ExploreMap` from `"../components/ExploreMap"` (Metro resolves `.web.tsx` automatically on web) and both exported types.

- [ ] **Step 1: Write `ExploreMap.tsx` (native)**

Create `mobile/src/components/ExploreMap.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export interface ExploreMapPin {
  id: string;
  lat: number;
  lng: number;
}

export interface ExploreMapPanTarget {
  lat: number;
  lng: number;
  zoom?: number;
}

const DEFAULT_CENTER = { lat: 22.5937, lng: 78.9629 }; // India centroid, matches LocationPickerModal

// Shared verbatim with ExploreMap.web.tsx (Metro's platform-split sibling for
// web, since react-native-webview has no web implementation): the page posts
// messages via window.ReactNativeWebView.postMessage when embedded in a
// native WebView, and falls back to window.parent.postMessage when embedded
// in a plain <iframe> on web. It exposes window.setPins/setUserLocation/panTo
// as plain globals - called directly via injectJavaScript on native - AND
// listens for {type:"SET_PINS"|"SET_USER_LOCATION"|"PAN_TO", ...} postMessage,
// which is how the web variant drives the same functions (injectJavaScript
// does not apply to iframes). Both paths converge on one implementation.
// Follows the same pattern as LocationPickerModal.tsx's buildMapHtml.
function buildExploreMapHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map').setView([${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    var tripMarkers = {};
    var userMarker = null;

    function sendToHost(payload) {
      var json = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(json);
      } else if (window.parent) {
        window.parent.postMessage(json, '*');
      }
    }

    window.setPins = function (pins) {
      Object.keys(tripMarkers).forEach(function (id) {
        map.removeLayer(tripMarkers[id]);
      });
      tripMarkers = {};
      var bounds = [];
      pins.forEach(function (pin) {
        var marker = L.marker([pin.lat, pin.lng]).addTo(map);
        marker.on('click', function () {
          sendToHost({ type: 'MARKER_TAPPED', tripId: pin.id });
        });
        tripMarkers[pin.id] = marker;
        bounds.push([pin.lat, pin.lng]);
      });
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    };

    window.setUserLocation = function (lat, lng) {
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      } else {
        userMarker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#2563eb',
          fillOpacity: 1,
        }).addTo(map);
      }
    };

    window.panTo = function (lat, lng, zoom) {
      map.setView([lat, lng], zoom || 10);
    };

    // Native drives the map via injectJavaScript calling these functions
    // directly. Web (iframe) cannot use injectJavaScript, so it posts
    // messages instead, and this listener forwards them into the exact same
    // functions. Inert on native (nothing posts to it).
    window.addEventListener('message', function (event) {
      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data || !data.type) return;
        if (data.type === 'SET_PINS') {
          window.setPins(data.pins);
        } else if (data.type === 'SET_USER_LOCATION') {
          window.setUserLocation(data.lat, data.lng);
        } else if (data.type === 'PAN_TO') {
          window.panTo(data.lat, data.lng, data.zoom);
        }
      } catch (e) {
        // ignore malformed messages
      }
    });

    window.onload = function () {
      sendToHost({ type: 'MAP_READY' });
    };
  </script>
</body>
</html>`;
}

export function ExploreMap({
  pins,
  userLocation,
  panTarget,
  onMarkerPress,
}: {
  pins: ExploreMapPin[];
  userLocation: { lat: number; lng: number } | null;
  panTarget: ExploreMapPanTarget | null;
  onMarkerPress: (tripId: string) => void;
}) {
  const webviewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapHtml = useMemo(buildExploreMapHtml, []);
  // WebView diffs `source` by reference, so a fresh `{ html: mapHtml }` object
  // literal on every render would otherwise look like a new source and could
  // reload the map. Memoize it (same reasoning as LocationPickerModal).
  const mapSource = useMemo(() => ({ html: mapHtml }), [mapHtml]);

  useEffect(() => {
    if (!mapReady) return;
    webviewRef.current?.injectJavaScript(`window.setPins(${JSON.stringify(pins)}); true;`);
  }, [mapReady, pins]);

  useEffect(() => {
    if (!mapReady || !userLocation) return;
    webviewRef.current?.injectJavaScript(
      `window.setUserLocation(${userLocation.lat}, ${userLocation.lng}); true;`
    );
  }, [mapReady, userLocation]);

  useEffect(() => {
    if (!mapReady || !panTarget) return;
    webviewRef.current?.injectJavaScript(
      `window.panTo(${panTarget.lat}, ${panTarget.lng}, ${panTarget.zoom ?? 10}); true;`
    );
  }, [mapReady, panTarget]);

  const onWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "MAP_READY") {
        setMapReady(true);
      } else if (message.type === "MARKER_TAPPED") {
        onMarkerPress(message.tripId);
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View style={styles.container}>
      <WebView ref={webviewRef} source={mapSource} onMessage={onWebViewMessage} style={styles.map} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
```

- [ ] **Step 2: Write `ExploreMap.web.tsx`**

Create `mobile/src/components/ExploreMap.web.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { View } from "react-native";

// Metro-platform-split sibling of ExploreMap.tsx (same convention as
// LocationPickerModal.tsx / LocationPickerModal.web.tsx): react-native-webview
// has no web implementation, so this variant renders the same Leaflet page in
// a plain <iframe> instead of a native WebView. Same exported interface, same
// props, same marker/pan logic as the native file - only the map-rendering
// and messaging mechanism differs.

export interface ExploreMapPin {
  id: string;
  lat: number;
  lng: number;
}

export interface ExploreMapPanTarget {
  lat: number;
  lng: number;
  zoom?: number;
}

const DEFAULT_CENTER = { lat: 22.5937, lng: 78.9629 }; // India centroid, matches LocationPickerModal

// Shared verbatim with ExploreMap.tsx: see that file's comment for the full
// explanation of the postMessage/injectJavaScript bridge convention.
function buildExploreMapHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map').setView([${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    var tripMarkers = {};
    var userMarker = null;

    function sendToHost(payload) {
      var json = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(json);
      } else if (window.parent) {
        window.parent.postMessage(json, '*');
      }
    }

    window.setPins = function (pins) {
      Object.keys(tripMarkers).forEach(function (id) {
        map.removeLayer(tripMarkers[id]);
      });
      tripMarkers = {};
      var bounds = [];
      pins.forEach(function (pin) {
        var marker = L.marker([pin.lat, pin.lng]).addTo(map);
        marker.on('click', function () {
          sendToHost({ type: 'MARKER_TAPPED', tripId: pin.id });
        });
        tripMarkers[pin.id] = marker;
        bounds.push([pin.lat, pin.lng]);
      });
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    };

    window.setUserLocation = function (lat, lng) {
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      } else {
        userMarker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#2563eb',
          fillOpacity: 1,
        }).addTo(map);
      }
    };

    window.panTo = function (lat, lng, zoom) {
      map.setView([lat, lng], zoom || 10);
    };

    window.addEventListener('message', function (event) {
      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data || !data.type) return;
        if (data.type === 'SET_PINS') {
          window.setPins(data.pins);
        } else if (data.type === 'SET_USER_LOCATION') {
          window.setUserLocation(data.lat, data.lng);
        } else if (data.type === 'PAN_TO') {
          window.panTo(data.lat, data.lng, data.zoom);
        }
      } catch (e) {
        // ignore malformed messages
      }
    });

    window.onload = function () {
      sendToHost({ type: 'MAP_READY' });
    };
  </script>
</body>
</html>`;
}

// Plain CSS for the raw DOM <iframe> element - it is not a react-native-web
// component, so it takes a normal React DOM style object rather than an RN
// StyleSheet style.
const iframeStyle: CSSProperties = { flex: 1, width: "100%", height: "100%", border: "none" };

export function ExploreMap({
  pins,
  userLocation,
  panTarget,
  onMarkerPress,
}: {
  pins: ExploreMapPin[];
  userLocation: { lat: number; lng: number } | null;
  panTarget: ExploreMapPanTarget | null;
  onMarkerPress: (tripId: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapHtml = useMemo(buildExploreMapHtml, []);

  // Native's equivalent of this is webviewRef.current?.injectJavaScript(...);
  // an iframe has no injectJavaScript, so this posts a message that the
  // page's own listener (above) forwards into the matching window.* function.
  const sendToMap = (payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), "*");
  };

  useEffect(() => {
    if (!mapReady) return;
    sendToMap({ type: "SET_PINS", pins });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pins]);

  useEffect(() => {
    if (!mapReady || !userLocation) return;
    sendToMap({ type: "SET_USER_LOCATION", lat: userLocation.lat, lng: userLocation.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, userLocation]);

  useEffect(() => {
    if (!mapReady || !panTarget) return;
    sendToMap({ type: "PAN_TO", lat: panTarget.lat, lng: panTarget.lng, zoom: panTarget.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, panTarget]);

  // Native's equivalent of this is the WebView's onMessage prop; an iframe
  // instead posts to window.parent, so this listens on the window itself and
  // filters to messages that actually came from this component's own iframe.
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (message.type === "MAP_READY") {
          setMapReady(true);
        } else if (message.type === "MARKER_TAPPED") {
          onMarkerPress(message.tripId);
        }
      } catch {
        // ignore malformed messages
      }
    };
    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <iframe ref={iframeRef} srcDoc={mapHtml} style={iframeStyle} title="Explore map" />
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/ExploreMap.tsx mobile/src/components/ExploreMap.web.tsx
git commit -m "Add ExploreMap multi-marker component (native WebView + web iframe)"
```

---

### Task 3: `TripMapPreviewCard` component + `useTrendingDestinations` hook

**Files:**
- Create: `mobile/src/components/TripMapPreviewCard.tsx`
- Modify: `mobile/src/api/trips.ts`

**Interfaces:**
- Consumes: `Trip` type (`../types`, existing), `TRAVEL_MODE_ICONS`/`travelModeText` (`../utils/travelModeIcons`, existing), `optimizedImageUrl` (`../utils/optimizedImage`, existing), `useTheme`/`Palette` (existing); `GET /trips/trending-destinations` (Task 1).
- Produces: `TripMapPreviewCard({ trip, onPress, onClose })`; `TripFilters.pageSize?: number` (new field on the existing interface); `TrendingDestination` type; `useTrendingDestinations()` hook. Task 4 consumes all of these by name.

- [ ] **Step 1: Write `TripMapPreviewCard.tsx`**

Create `mobile/src/components/TripMapPreviewCard.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripMapPreviewCard({
  trip,
  onPress,
  onClose,
}: {
  trip: Trip;
  onPress: () => void;
  onClose: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={8}>
        <MaterialCommunityIcons name="close" size={16} color={colors.white} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.body} onPress={onPress} activeOpacity={0.9}>
        {trip.images[0] && !imageFailed ? (
          <Image
            source={{ uri: optimizedImageUrl(trip.images[0], 200) }}
            style={styles.thumbnail}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={28} color={colors.white} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker" size={12} color={colors.muted} />
            <Text style={styles.meta} numberOfLines={1}>
              {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
              {typeof trip.distanceKm === "number"
                ? ` · ${trip.distanceKm < 1 ? "<1" : Math.round(trip.distanceKm)} km away`
                : ""}
            </Text>
          </View>
          <View style={styles.modeRow}>
            <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={13} color={colors.primary} />
            <Text style={styles.mode}>{travelModeText(trip.travelMode)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 18,
      shadowColor: colors.ink,
      shadowOpacity: 0.15,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    closeButton: {
      position: "absolute",
      top: -10,
      right: -10,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.ink,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },
    body: { flexDirection: "row", padding: 12, gap: 12, alignItems: "center" },
    thumbnail: { width: 64, height: 64, borderRadius: 12 },
    thumbnailPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    info: { flex: 1, gap: 4 },
    title: { fontSize: 14, fontWeight: "700", color: colors.ink },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    meta: { fontSize: 11.5, color: colors.muted, flexShrink: 1 },
    modeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    mode: { fontSize: 11.5, fontWeight: "600", color: colors.primary },
  });
}
```

- [ ] **Step 2: Add `pageSize` to `TripFilters` and add `useTrendingDestinations`**

Open `mobile/src/api/trips.ts`. Add `pageSize?: number;` to the existing `TripFilters` interface (after the existing `page?: number;` line):

```ts
export interface TripFilters {
  search?: string;
  destination?: string;
  travelMode?: TravelMode[];
  dateFrom?: string;
  dateTo?: string;
  budgetMin?: number;
  budgetMax?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
```

Add this directly after the existing `useTrendingTrips` function:

```ts
export interface TrendingDestination {
  destination: string;
  tripCount: number;
  lat: number;
  lng: number;
}

export function useTrendingDestinations() {
  return useQuery({
    queryKey: ["trips", "trending-destinations"],
    queryFn: async () =>
      (await apiClient.get<{ items: TrendingDestination[] }>("/trips/trending-destinations")).data.items,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/TripMapPreviewCard.tsx mobile/src/api/trips.ts
git commit -m "Add TripMapPreviewCard and useTrendingDestinations hook"
```

---

### Task 4: `DiscoverScreen` integration — List/Map toggle

**Files:**
- Modify: `mobile/src/screens/DiscoverScreen.tsx`

**Interfaces:**
- Consumes: `ExploreMap`, `ExploreMapPin`, `ExploreMapPanTarget` (Task 2); `TripMapPreviewCard` (Task 3); `useTrendingDestinations`, `TrendingDestination`, `TripFilters.pageSize` (Task 3); `getCurrentLocationOrThrow` (existing, already imported in this file); `useTrips` (existing, already imported).
- Produces: nothing consumed by a later task — this is the final integration task.

- [ ] **Step 1: Add imports**

Open `mobile/src/screens/DiscoverScreen.tsx`. Add to the top import block (after `import { getUpcomingWeekendRange } from "../utils/weekendRange";`):

```ts
import { Dimensions } from "react-native";
import { ExploreMap, type ExploreMapPanTarget, type ExploreMapPin } from "../components/ExploreMap";
import { TripMapPreviewCard } from "../components/TripMapPreviewCard";
import { useTrendingDestinations } from "../api/trips";
```

Note: `Dimensions` must be added to the existing `react-native` import block at the top of the file (the one starting `import { ActivityIndicator, FlatList, Image, ... } from "react-native";`) rather than as a separate import statement — add `Dimensions` alphabetically into that existing destructured list.

`useTrendingDestinations` must be added to the existing `import { useTrips, useTrendingTrips, useRecommendedTrips } from "../api/trips";` line (extend that same import, don't create a second import from the same module):

```ts
import { useTrips, useTrendingTrips, useRecommendedTrips, useTrendingDestinations } from "../api/trips";
```

- [ ] **Step 2: Add state and derived values**

Inside the `DiscoverScreen` function, add this after the existing `const [nearYouCoords, setNearYouCoords] = useState<{ lat: number; lng: number } | null>(null);` line and its accompanying `useEffect` (which ends around line 78 with the closing `}, []);`):

```ts
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [mapUserLocation, setMapUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [previewTripId, setPreviewTripId] = useState<string | null>(null);
  const [panTarget, setPanTarget] = useState<ExploreMapPanTarget | null>(null);
  const mapLocationRequested = useRef(false);

  useEffect(() => {
    if (viewMode !== "map" || mapLocationRequested.current) return;
    mapLocationRequested.current = true;
    let cancelled = false;
    getCurrentLocationOrThrow()
      .then((coords) => {
        if (!cancelled) setMapUserLocation(coords);
      })
      .catch(() => {
        // Silent - the map just opens centered on the default region if location isn't available.
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode]);
```

Add this after the existing `const { data, isLoading, isFetching } = useTrips({...})` block (ends around line 102 with `});`):

```ts
  const mapFilters = {
    search: search || undefined,
    travelMode: travelModes,
    lat: nearMe?.lat ?? mapUserLocation?.lat,
    lng: nearMe?.lng ?? mapUserLocation?.lng,
    radiusKm: nearMe ? radiusKm : undefined,
    sortOrder,
    pageSize: 200,
  };
  const { data: mapData, isLoading: mapLoading } = useTrips(mapFilters, { enabled: viewMode === "map" });
  const { data: trendingDestinations } = useTrendingDestinations();

  const mapPins: ExploreMapPin[] = useMemo(
    () =>
      (mapData?.items ?? [])
        .filter((t) => typeof t.startLat === "number" && typeof t.startLng === "number")
        .map((t) => ({ id: t.id, lat: t.startLat as number, lng: t.startLng as number })),
    [mapData]
  );
  const previewTrip = mapData?.items.find((t) => t.id === previewTripId) ?? null;
```

`useRef` is already imported in this file's top import line (`import { useEffect, useMemo, useRef, useState } from "react";`), so no import change is needed for `mapLocationRequested`.

- [ ] **Step 3: Add the List/Map toggle to the JSX**

Inside `ListHeaderComponent`'s JSX, find the existing search bar block:

```tsx
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
```

Add this directly after its closing `</View>`, before the filter-chip `<FlatList ...>`:

```tsx
            <View style={styles.viewModeRow}>
              <TouchableOpacity
                style={[styles.viewModeButton, viewMode === "list" && styles.viewModeButtonActive]}
                onPress={() => setViewMode("list")}
              >
                <MaterialCommunityIcons
                  name="view-list"
                  size={15}
                  color={viewMode === "list" ? colors.white : colors.ink}
                />
                <Text style={[styles.viewModeButtonText, viewMode === "list" && styles.viewModeButtonTextActive]}>
                  List
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewModeButton, viewMode === "map" && styles.viewModeButtonActive]}
                onPress={() => setViewMode("map")}
              >
                <MaterialCommunityIcons name="map" size={15} color={viewMode === "map" ? colors.white : colors.ink} />
                <Text style={[styles.viewModeButtonText, viewMode === "map" && styles.viewModeButtonTextActive]}>
                  Map
                </Text>
              </TouchableOpacity>
            </View>
```

- [ ] **Step 4: Render the map section**

Find the existing filter-chip `<FlatList ... />` block's closing `/>` (it's the horizontal chip row rendering `NEAR_ME`/`SORT`/travel modes/`CLEAR_ALL`). Add this directly after that closing `/>`, before the four existing `<DiscoverSection .../>` blocks:

```tsx
            {viewMode === "map" && (
              <View style={styles.mapSection}>
                {trendingDestinations && trendingDestinations.length > 0 && (
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.trendingChipsRow}
                    contentContainerStyle={styles.trendingChipsRowContent}
                    data={trendingDestinations}
                    keyExtractor={(item) => item.destination}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.trendingChip}
                        onPress={() => setPanTarget({ lat: item.lat, lng: item.lng, zoom: 9 })}
                      >
                        <Text style={styles.trendingChipText}>
                          🔥 {item.destination} · {item.tripCount}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
                <View style={styles.mapAreaWrap}>
                  <ExploreMap
                    pins={mapPins}
                    userLocation={mapUserLocation}
                    panTarget={panTarget}
                    onMarkerPress={setPreviewTripId}
                  />
                  {!mapLoading && mapPins.length === 0 && (
                    <View style={styles.mapEmptyOverlay} pointerEvents="none">
                      <Text style={styles.mapEmptyText}>No trips with a location match your filters yet.</Text>
                    </View>
                  )}
                  {previewTrip && (
                    <TripMapPreviewCard
                      trip={previewTrip}
                      onPress={() => navigation.navigate("TripDetail", { tripId: previewTrip.id })}
                      onClose={() => setPreviewTripId(null)}
                    />
                  )}
                </View>
              </View>
            )}
```

- [ ] **Step 5: Hide the trip-card list body while in map mode**

Find the `FlatList`'s `data` prop:

```tsx
        data={data?.items ?? []}
```

Change it to:

```tsx
        data={viewMode === "list" ? (data?.items ?? []) : []}
```

Find the `ListEmptyComponent` prop's condition:

```tsx
        ListEmptyComponent={
          isLoading ? null : (
```

Change it to:

```tsx
        ListEmptyComponent={
          isLoading || viewMode === "map" ? null : (
```

Do not change anything else inside `ListEmptyComponent` or `renderItem` — with `data={[]}` in map mode, `renderItem` is simply never invoked, so it needs no guard changes.

- [ ] **Step 6: Add the new styles**

Inside `createStyles(colors)`'s returned `StyleSheet.create({...})` object, add these entries (e.g. right after the existing `filterRowContent` entry):

```ts
    viewModeRow: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginTop: 10,
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.pill,
      padding: 3,
      gap: 3,
    },
    viewModeButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
    },
    viewModeButtonActive: { backgroundColor: colors.primary },
    viewModeButtonText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
    viewModeButtonTextActive: { color: colors.white },
    mapSection: { marginTop: 4 },
    trendingChipsRow: { minHeight: 40, marginTop: 10, flexGrow: 0 },
    trendingChipsRowContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
    trendingChip: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.border,
    },
    trendingChipText: { fontSize: 12, fontWeight: "600", color: colors.ink },
    mapAreaWrap: {
      height: Dimensions.get("window").height * 0.6,
      marginHorizontal: 16,
      marginTop: 10,
      borderRadius: 16,
      overflow: "hidden",
      position: "relative",
    },
    mapEmptyOverlay: {
      position: "absolute",
      top: 12,
      left: 12,
      right: 12,
      backgroundColor: colors.overlay,
      borderRadius: 12,
      padding: 10,
      alignItems: "center",
    },
    mapEmptyText: { color: colors.white, fontSize: 12, textAlign: "center" },
```

- [ ] **Step 7: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 8: Manual validation — mobile (Expo Go / dev client)**

Start the app (`cd mobile && npx expo start`) with the backend running (`cd backend && npm run dev`), and walk through:
1. Discover → tap **Map** → verify the search bar and filter chips stay visible, and the map renders (either centered on your real location if you grant permission, or the default India-centroid region if you deny/skip it) with no blocking prompt.
2. Verify pins appear for trips that have coordinates; tap one → a preview card slides up from the bottom of the map with the correct trip's photo/title/destination/dates/travel mode (and distance, if Near Me is active or location was granted).
3. Tap the preview card → `TripDetail` opens for the correct trip. Go back, tap the preview's ✕ → it closes without navigating.
4. Tap a trending-destination chip → the map pans there.
5. Toggle a filter (e.g. a travel mode chip) while in Map mode → verify the pins update to match.
6. Toggle back to **List** → verify the existing card list, 4 sections, and all filters behave exactly as before (unaffected).
7. With zero trips matching the current filters, verify the map still renders (not blank/broken) with the "No trips with a location match your filters yet" overlay.
8. Spot-check the existing Discover sections, `TripDetail`, `ProfileScreen`, Notifications, Group Chat, and login/logout are all unaffected.

- [ ] **Step 9: Manual validation — web**

Run `cd mobile && npx expo start --web`, repeat steps 1-6 above in a browser window, and additionally resize to a narrow (mobile-width) viewport to confirm the map and trending-chip row both remain usable.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/screens/DiscoverScreen.tsx
git commit -m "Add List/Map toggle to DiscoverScreen with trending destinations"
```

---

## Post-implementation summary (for the final report to the user)

After all 4 tasks are complete and verified, report back to the user covering:
- Which files/components changed (list the Files sections from all 4 tasks).
- How the map's pins/distance/trending-destinations are sourced from real data (`GET /trips` with a raised pageSize cap, `startLat`/`startLng`, the existing `distanceKm` computation, and `engagementScore()` aggregated by destination).
- Confirmation that existing functionality (the 4 pre-existing Discover sections, List-mode filters/pagination, `TripDetail`, other screens) was not modified — only additive changes plus the new toggle and map render branch.
- That no new dependency was introduced — the map reuses the same Leaflet/WebView/iframe foundation as `LocationPickerModal`.
- What still needs the user's own device/browser walkthrough (Steps 8-9 of Task 4) since no subagent has a physical device or interactive browser.
