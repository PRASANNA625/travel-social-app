# Trip Dates, Location Picker & Auto-Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Create Trip and Edit Trip use DD/MM/YYYY, timezone-safe,
future-only dates; a map/current-location/search location picker for
Starting Location and Destination that captures coordinates; and an
automatic "Closed" trip status once the end date has passed.

**Architecture:** Three loosely-coupled slices sharing the same two
screens. Dates and status are almost entirely reused/extended logic
(existing `TripDateFields` platform-split files, existing unused
`COMPLETED` status). Location is the one new subsystem: a single
`LocationPickerModal` component (free OpenStreetMap/Nominatim + Leaflet in
a WebView) used for both Starting Location and Destination fields, and a
`destLat`/`destLng` migration mirroring the existing `startLat`/`startLng`.

**Tech Stack:** Existing stack only, plus one new dependency:
`react-native-webview` (Leaflet map surface). No test framework exists in
this repo and none is being added — verification is `npx tsc --noEmit`
plus a manual walkthrough on the project's temporary web dev server, per
this session's established practice.

**Spec:** `docs/superpowers/specs/2026-09-05-trip-dates-location-status-design.md`

## Global Constraints

- DD/MM/YYYY formatting applies only to the Create/Edit Trip date fields —
  Discover's short trip-card dates (`Sep 5`) are unchanged.
- No test framework may be added (Jest, etc.) — verify via `npx tsc --noEmit`
  plus manual walkthroughs, matching every prior task in this project.
- Location search/geocoding uses only the free OpenStreetMap stack
  (Nominatim + Leaflet via WebView) — no Google Maps/Places, no new API key,
  no billing (explicit user decision during design).
- No cron/scheduled job for trip status — closure is computed lazily via
  `closeExpiredTrips()` called from the existing trip-read paths.
- Reuse the existing `COMPLETED` `TripStatus` value for "Closed" — no new
  enum value, no status migration.
- All date comparisons use local calendar-day values (`setHours(0,0,0,0)`),
  never `toISOString()`/UTC — regressing to UTC comparison would reintroduce
  the timezone bug fixed in commit `53b98f6`.
- No duplicated logic: `TripDateFields.tsx` and `TripDateFields.web.tsx`
  both import `mobile/src/utils/date.ts`; `DiscoverScreen.tsx` and
  `LocationPickerModal.tsx` both import `mobile/src/utils/currentLocation.ts`;
  `TripCard.tsx` and `TripDetailScreen.tsx` both import
  `mobile/src/utils/tripStatus.ts`.
- Typing a location name directly (no picker) must keep working exactly as
  today for both Starting Location and Destination.
- The `destLat`/`destLng` migration relies on Render's existing
  `npx prisma migrate deploy` build step (`render.yaml`) to reach
  production — no manual production DB step.

---

### Task 1: Shared date utilities

**Files:**
- Create: `mobile/src/utils/date.ts`

**Interfaces:**
- Produces: `startOfToday(): Date`, `toDateOnly(date: Date): Date`,
  `formatDDMMYYYY(date: Date): string`, `isBeforeToday(date: Date): boolean`,
  `isAfterDate(a: Date, b: Date): boolean` — all used by Task 3.

- [ ] **Step 1: Create the file**

```ts
export function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function toDateOnly(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function formatDDMMYYYY(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function isBeforeToday(date: Date): boolean {
  return toDateOnly(date).getTime() < startOfToday().getTime();
}

export function isAfterDate(a: Date, b: Date): boolean {
  return toDateOnly(a).getTime() > toDateOnly(b).getTime();
}
```

- [ ] **Step 2: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual sanity check (no test framework in this repo)**

Verify by inspection against these concrete cases (all pure functions, no
I/O, safe to eyeball):
- `formatDDMMYYYY(new Date(2026, 8, 5))` → `"05/09/2026"` (month is
  0-indexed in the constructor, September = 8).
- `isBeforeToday(new Date(2000, 0, 1))` → `true`.
- `isAfterDate(new Date(2026, 8, 10), new Date(2026, 8, 5))` → `true`.
- `isAfterDate(new Date(2026, 8, 5), new Date(2026, 8, 5))` → `false`
  (same day is not "after").

- [ ] **Step 4: Commit**

```bash
git add mobile/src/utils/date.ts
git commit -m "Add shared timezone-safe date utilities for trip forms"
```

---

### Task 2: Backend trip date validation

**Files:**
- Modify: `backend/src/modules/trips/trips.service.ts`

**Interfaces:**
- Produces: `assertValidTripDates(start: Date, end: Date): void` (private
  to this file) — throws `HttpError(400, ...)`.
- Consumes: `HttpError` (already imported in this file from
  `../../middleware/error`).

- [ ] **Step 1: Add the validator and wire it into `createTrip`**

Add this function near the top of the file, after the existing
`haversineKm` function (around line 21):

```ts
function assertValidTripDates(start: Date, end: Date): void {
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  if (end.getTime() < start.getTime()) {
    throw new HttpError(400, "End date cannot be before the start date");
  }
  if (end.getTime() < todayUTC.getTime()) {
    throw new HttpError(400, "End date must be today or in the future");
  }
}
```

Replace the existing `createTrip` function:

```ts
export async function createTrip(ownerId: string, input: CreateTripInput) {
  const trip = await prisma.trip.create({
    data: { ...input, ownerId },
  });
  await createGroupWithOwner(trip.id, ownerId);
  return trip;
}
```

with:

```ts
export async function createTrip(ownerId: string, input: CreateTripInput) {
  assertValidTripDates(input.startDate, input.endDate);
  const trip = await prisma.trip.create({
    data: { ...input, ownerId },
  });
  await createGroupWithOwner(trip.id, ownerId);
  return trip;
}
```

- [ ] **Step 2: Wire it into `updateTrip`**

Replace the existing `updateTrip` function:

```ts
export async function updateTrip(tripId: string, ownerId: string, input: UpdateTripInput) {
  await assertOwner(tripId, ownerId);
  return prisma.trip.update({ where: { id: tripId }, data: input });
}
```

with:

```ts
export async function updateTrip(tripId: string, ownerId: string, input: UpdateTripInput) {
  const existing = await assertOwner(tripId, ownerId);
  const effectiveStart = input.startDate ?? existing.startDate;
  const effectiveEnd = input.endDate ?? existing.endDate;

  if (input.startDate !== undefined || input.endDate !== undefined) {
    assertValidTripDates(effectiveStart, effectiveEnd);
  }

  return prisma.trip.update({ where: { id: tripId }, data: input });
}
```

Note: `assertOwner` (defined earlier in this file) already does
`return trip;` at the end — `existing` above is that returned trip, no
extra fetch needed.

- [ ] **Step 3: Typecheck**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification (best-effort, optional)**

If a local backend is reachable (`docker compose up -d` from the repo
root, then `cd backend && npm run dev`), verify with:

```bash
curl -X POST http://localhost:4000/trips -H "Content-Type: application/json" \
  -H "Authorization: Bearer <a real JWT from a logged-in test user>" \
  -d '{"title":"t","destination":"d","startLocation":"s","startDate":"2026-09-10","endDate":"2026-09-05","travelMode":"CAR","seats":2,"description":"x","joinType":"OPEN"}'
```

Expected: `400` with `"End date cannot be before the start date"`. If no
local database is available in your environment, the typecheck in Step 3
is sufficient — this logic is exercised end-to-end by the manual mobile
walkthrough at the end of this plan (Task 9).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/trips/trips.service.ts
git commit -m "Validate trip start/end dates on create and update"
```

---

### Task 3: Date UI — DD/MM/YYYY, disabled past dates, start/end wiring

**Files:**
- Modify: `mobile/src/components/TripDateFields.tsx`
- Modify: `mobile/src/components/TripDateFields.web.tsx`
- Modify: `mobile/src/screens/CreateTripScreen.tsx`

**Interfaces:**
- Consumes: `formatDDMMYYYY`, `startOfToday`, `isBeforeToday`,
  `isAfterDate` from `mobile/src/utils/date.ts` (Task 1).
- No change to `TripDateFields`'s exported prop signature — both platform
  files keep the same props `CreateTripScreen.tsx` already passes
  (`startDate`, `endDate`, `onChangeStart`, `onChangeEnd`, `endError`,
  `inputStyle`, `errorStyle`, `placeholderStyle`).

- [ ] **Step 1: Update the native date fields**

Replace the full contents of `mobile/src/components/TripDateFields.tsx`
with:

```tsx
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { formatDDMMYYYY, startOfToday } from "../utils/date";

export function TripDateFields({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  endError,
  inputStyle,
  errorStyle,
  placeholderStyle,
}: {
  startDate: Date;
  endDate: Date | undefined;
  onChangeStart: (date: Date) => void;
  onChangeEnd: (date: Date) => void;
  endError: boolean;
  inputStyle: object;
  errorStyle: object;
  placeholderStyle: object;
}) {
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={[inputStyle, styles.flex1]} onPress={() => setShowStartPicker(true)}>
        <Text>Start: {formatDDMMYYYY(startDate)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[inputStyle, styles.flex1, endError && errorStyle]}
        onPress={() => setShowEndPicker(true)}
      >
        <Text style={!endDate && placeholderStyle}>
          {endDate ? `End: ${formatDDMMYYYY(endDate)}` : "End date"}
        </Text>
      </TouchableOpacity>

      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          minimumDate={startOfToday()}
          onChange={(_, date) => {
            setShowStartPicker(false);
            if (date) onChangeStart(date);
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endDate ?? new Date(startDate.getTime() + 86400000)}
          mode="date"
          minimumDate={startOfToday()}
          onChange={(_, date) => {
            setShowEndPicker(false);
            if (date) onChangeEnd(date);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
});
```

- [ ] **Step 2: Update the web date fields**

Replace the full contents of `mobile/src/components/TripDateFields.web.tsx`
with:

```tsx
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { formatDDMMYYYY, isBeforeToday } from "../utils/date";

function parseDateInput(text: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject impossible calendar dates (e.g. 31/02/2026) that Date silently rolls forward a day.
  if (parsed.getDate() !== Number(day) || parsed.getMonth() !== Number(month) - 1) return null;
  return parsed;
}

function DateTextField({
  value,
  onChangeValidDate,
  placeholder,
  style,
  errorStyle,
}: {
  value: Date | undefined;
  onChangeValidDate: (date: Date) => void;
  placeholder: string;
  style: StyleProp<TextStyle>;
  errorStyle: StyleProp<TextStyle>;
}) {
  const [text, setText] = useState(value ? formatDDMMYYYY(value) : "");
  const [invalid, setInvalid] = useState(false);

  // Keep the buffer in sync when the committed date changes from outside (e.g. cleared on submit).
  useEffect(() => {
    setText(value ? formatDDMMYYYY(value) : "");
    setInvalid(false);
  }, [value]);

  return (
    <TextInput
      style={[style, invalid && errorStyle]}
      placeholder={placeholder}
      value={text}
      onChangeText={(next) => {
        setText(next);
        const parsed = parseDateInput(next);
        if (parsed && !isBeforeToday(parsed)) {
          setInvalid(false);
          onChangeValidDate(parsed);
        } else {
          setInvalid(next.length > 0);
        }
      }}
    />
  );
}

export function TripDateFields({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  endError,
  inputStyle,
  errorStyle,
}: {
  startDate: Date;
  endDate: Date | undefined;
  onChangeStart: (date: Date) => void;
  onChangeEnd: (date: Date) => void;
  endError: boolean;
  inputStyle: object;
  errorStyle: object;
  placeholderStyle: object;
}) {
  return (
    <View style={styles.row}>
      <DateTextField
        style={[inputStyle, styles.flex1]}
        errorStyle={errorStyle}
        placeholder="DD/MM/YYYY"
        value={startDate}
        onChangeValidDate={onChangeStart}
      />
      <DateTextField
        style={[inputStyle, styles.flex1, endError && errorStyle]}
        errorStyle={errorStyle}
        placeholder="DD/MM/YYYY"
        value={endDate}
        onChangeValidDate={onChangeEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
});
```

Note: `placeholderStyle` stays in the destructured prop type (unused in
the body) to keep this file's public interface matching its native
sibling and what `CreateTripScreen.tsx` passes — the original file already
had this same unused-prop pattern, so this isn't a new risk.

- [ ] **Step 3: Wire cross-field validation into `CreateTripScreen.tsx`**

In `mobile/src/screens/CreateTripScreen.tsx`, add this import alongside
the existing ones (near the top, after the `Alert` import):

```ts
import { isAfterDate, isBeforeToday } from "../utils/date";
```

Find this block inside `onSubmit` (the required-fields check):

```ts
    if (
      !title.trim() ||
      !destination.trim() ||
      !startLocation.trim() ||
      !description.trim() ||
      !travelMode ||
      !joinType ||
      !endDate ||
      !seats.trim()
    ) {
      Alert.alert("Missing details", "Please fill in all required fields, highlighted in red.");
      return;
    }
```

Add immediately after it (still inside `onSubmit`, before the
`seatsNum` check):

```ts
    if (endDate && isBeforeToday(endDate)) {
      Alert.alert("Invalid end date", "End date must be today or a future date.");
      return;
    }
    if (endDate && isAfterDate(startDate, endDate)) {
      Alert.alert("Invalid dates", "Start date cannot be after the end date.");
      return;
    }
```

Add this handler function above `onSubmit` (so `startDate`/`endDate`
setters are in scope):

```ts
  const handleStartDateChange = (date: Date) => {
    setStartDate(date);
    if (endDate && isAfterDate(date, endDate)) {
      setEndDate(undefined);
    }
  };
```

Find the `<TripDateFields>` usage:

```tsx
      <TripDateFields
        startDate={startDate}
        endDate={endDate}
        onChangeStart={setStartDate}
        onChangeEnd={setEndDate}
        endError={submitted && !endDate}
        inputStyle={styles.input}
        errorStyle={styles.inputError}
        placeholderStyle={styles.placeholderText}
      />
```

Change `onChangeStart={setStartDate}` to `onChangeStart={handleStartDateChange}`.

- [ ] **Step 4: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start a temporary web dev server on an unused port (check `netstat -ano`
first, per this project's established verification practice this
session), e.g. `npx expo start --web --port 8154`, wait for it to be
ready, then walk through in a browser: open Create Trip, confirm the date
fields show `DD/MM/YYYY` placeholders, typing a past date shows the error
style and does not update the summary date, typing a valid future end
date before the current start date and submitting shows the "Start date
cannot be after the end date" alert, and picking a start date after the
current end date clears the end date field. Kill only that verification
server's PID afterward (never the user's live tunnel on port 8081) and
confirm the tunnel still responds `200`.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/TripDateFields.tsx mobile/src/components/TripDateFields.web.tsx mobile/src/screens/CreateTripScreen.tsx
git commit -m "Show DD/MM/YYYY dates and enforce future-only, start<=end on Create/Edit Trip"
```

---

### Task 4: Backend — destination coordinates

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_destination_coordinates/migration.sql`
- Modify: `backend/src/modules/trips/trips.types.ts`

**Interfaces:**
- Produces: `Trip.destLat`, `Trip.destLng` (nullable `Float` columns);
  `createTripSchema`/`updateTripSchema` accept optional `destLat`,
  `destLng` numbers — consumed by Task 7.

- [ ] **Step 1: Add the columns to the Prisma schema**

In `backend/prisma/schema.prisma`, find:

```
  startLat           Float?
  startLng           Float?
```

Change to:

```
  startLat           Float?
  startLng           Float?
  destLat            Float?
  destLng            Float?
```

- [ ] **Step 2: Generate and apply the migration**

From `backend/`, with a local Postgres reachable (per `DATABASE_URL` in
`backend/.env`; `docker compose up -d` from the repo root starts one if
needed):

```bash
npx prisma migrate dev --name add_destination_coordinates
```

This both writes the migration file and applies it to your local
database, and regenerates the Prisma Client types used by
`trips.service.ts`.

If no local database is reachable in your environment, hand-author the
migration file instead so the change still ships (Render applies it via
`prisma migrate deploy` on the next deploy regardless of how it was
authored locally):

```bash
mkdir -p "backend/prisma/migrations/$(date -u +%Y%m%d%H%M%S)_add_destination_coordinates"
```

and write this into that directory's `migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "destLat" DOUBLE PRECISION,
ADD COLUMN "destLng" DOUBLE PRECISION;
```

then run `npx prisma generate` (needs no live database — only reads
`schema.prisma`) so `trips.service.ts` type-checks against the new
columns.

- [ ] **Step 3: Extend the trip schemas**

In `backend/src/modules/trips/trips.types.ts`, find:

```ts
  startLat: z.number().optional(),
  startLng: z.number().optional(),
```

Change to:

```ts
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  destLat: z.number().optional(),
  destLng: z.number().optional(),
```

(`updateTripSchema` already inherits this via `createTripSchema.partial()`
— no separate change needed there.)

- [ ] **Step 4: Typecheck**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors. If Step 2 used the hand-authored path and
`npx prisma generate` was not run, this step will fail with `destLat`/
`destLng` not existing on the Prisma `Trip` type — run `npx prisma generate`
first.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/modules/trips/trips.types.ts
git commit -m "Add destination latitude/longitude to the Trip model"
```

---

### Task 5: Shared current-location helper

**Files:**
- Create: `mobile/src/utils/currentLocation.ts`
- Modify: `mobile/src/screens/DiscoverScreen.tsx`

**Interfaces:**
- Produces: `getCurrentLocationOrThrow(): Promise<{ lat: number; lng: number }>`
  — throws on permission denial or any location-fetch failure. Consumed by
  `DiscoverScreen.tsx` (this task) and `LocationPickerModal.tsx` (Task 6).

- [ ] **Step 1: Create the helper**

```ts
import * as Location from "expo-location";

export async function getCurrentLocationOrThrow(): Promise<{ lat: number; lng: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission not granted");
  }
  const position = await Location.getCurrentPositionAsync({});
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
```

- [ ] **Step 2: Refactor `DiscoverScreen.tsx` to use it**

Remove this import line:

```ts
import * as Location from "expo-location";
```

Add in its place:

```ts
import { getCurrentLocationOrThrow } from "../utils/currentLocation";
```

Find the existing `activateNearMe` function:

```ts
  const activateNearMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationDeniedVisible(true);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setNearMe({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      setLocationDeniedVisible(true);
    } finally {
      setLocating(false);
    }
  };
```

Replace with:

```ts
  const activateNearMe = async () => {
    setLocating(true);
    try {
      const coords = await getCurrentLocationOrThrow();
      setNearMe(coords);
    } catch {
      setLocationDeniedVisible(true);
    } finally {
      setLocating(false);
    }
  };
```

Behavior is identical to before (both the "permission not granted" case
and any other fetch failure land in the same `catch`, exactly as the
original code did with its own inline `if (status !== "granted")` early
return plus a separate `catch`).

- [ ] **Step 3: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual regression check**

On the temporary web dev server, open Discover and confirm Near Me still:
requests permission, activates and shows "Near me · 50 km" on the chip,
and shows the location-denied popup if permission is refused (deny it in
the browser's site-permission prompt to check this path). This is a pure
refactor — behavior must be unchanged from before this task.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/utils/currentLocation.ts mobile/src/screens/DiscoverScreen.tsx
git commit -m "Extract shared current-location helper from Discover's Near Me"
```

---

### Task 6: Location picker component (search + current location + map)

**Files:**
- Create: `mobile/src/components/LocationPickerModal.tsx`
- Modify: `mobile/package.json` (new dependency)

**Interfaces:**
- Consumes: `getCurrentLocationOrThrow` from `mobile/src/utils/currentLocation.ts` (Task 5).
- Produces:
  ```ts
  export interface LocationValue { name: string; lat: number; lng: number }

  export function LocationPickerModal(props: {
    visible: boolean;
    title: string;
    initialValue: LocationValue | null;
    onClose: () => void;
    onSelect: (value: LocationValue) => void;
  }): JSX.Element
  ```
  Consumed by `CreateTripScreen.tsx` (Task 7).

- [ ] **Step 1: Add the WebView dependency**

From `mobile/`:

```bash
npx expo install react-native-webview
```

This adds `react-native-webview` to `mobile/package.json` at the version
Expo SDK ~57 expects.

- [ ] **Step 2: Create the component**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getCurrentLocationOrThrow } from "../utils/currentLocation";

export interface LocationValue {
  name: string;
  lat: number;
  lng: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

const DEFAULT_CENTER = { lat: 22.5937, lng: 78.9629 }; // India centroid

async function nominatimFetch(url: string): Promise<Response> {
  const headers = Platform.OS === "web" ? undefined : { "User-Agent": "TriplyApp/1.0 (Expo app)" };
  return fetch(url, headers ? { headers } : undefined);
}

function buildMapHtml(): string {
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
    var map = L.map('map', { attributionControl: false }).setView([${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    var marker = null;

    function post(lat, lng) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "PIN_MOVED", lat: lat, lng: lng }));
    }

    function placeMarker(lat, lng) {
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', function () {
          var pos = marker.getLatLng();
          post(pos.lat, pos.lng);
        });
      }
    }

    map.on('click', function (e) {
      placeMarker(e.latlng.lat, e.latlng.lng);
      post(e.latlng.lat, e.latlng.lng);
    });

    window.setPin = function (lat, lng, zoom) {
      placeMarker(lat, lng);
      map.setView([lat, lng], zoom || 12);
    };

    window.onload = function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "MAP_READY" }));
    };
  </script>
</body>
</html>`;
}

export function LocationPickerModal({
  visible,
  title,
  initialValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  initialValue: LocationValue | null;
  onClose: () => void;
  onSelect: (value: LocationValue) => void;
}) {
  const webviewRef = useRef<WebView>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationValue[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [preview, setPreview] = useState<LocationValue | null>(null);
  const mapHtml = useMemo(buildMapHtml, []);

  useEffect(() => {
    if (!visible) {
      setMapReady(false);
      return;
    }
    setQuery("");
    setResults([]);
    setPreview(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible && mapReady && initialValue) {
      webviewRef.current?.injectJavaScript(
        `window.setPin(${initialValue.lat}, ${initialValue.lng}, 12); true;`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mapReady]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const response = await nominatimFetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8`
        );
        const data: NominatimResult[] = await response.json();
        setResults(
          data.map((item) => ({
            name: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }))
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [query]);

  const movePin = (value: LocationValue) => {
    setPreview(value);
    setResults([]);
    setQuery("");
    webviewRef.current?.injectJavaScript(`window.setPin(${value.lat}, ${value.lng}, 12); true;`);
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const response = await nominatimFetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
      );
      const data: NominatimResult = await response.json();
      setPreview({ name: data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    } catch {
      setPreview({ name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    } finally {
      setResolving(false);
    }
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const coords = await getCurrentLocationOrThrow();
      webviewRef.current?.injectJavaScript(`window.setPin(${coords.lat}, ${coords.lng}, 13); true;`);
      await reverseGeocode(coords.lat, coords.lng);
    } catch {
      // Discover's own Near Me flow already owns the user-facing
      // permission-denied messaging pattern this helper is shared with;
      // this picker just silently no-ops so the user can try again or
      // fall back to search/map.
    } finally {
      setLocating(false);
    }
  };

  const onWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "MAP_READY") {
        setMapReady(true);
      } else if (message.type === "PIN_MOVED") {
        reverseGeocode(message.lat, message.lng);
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a place..."
            placeholderTextColor="#94a3b8"
            value={query}
            onChangeText={setQuery}
          />
          {searching && <ActivityIndicator size="small" color="#0f766e" />}
        </View>

        {results.length > 0 && (
          <View style={styles.resultsList}>
            {results.map((result, index) => (
              <TouchableOpacity
                key={`${result.lat}-${result.lng}-${index}`}
                style={styles.resultRow}
                onPress={() => movePin(result)}
              >
                <MaterialCommunityIcons name="map-marker-outline" size={16} color="#64748b" />
                <Text style={styles.resultText} numberOfLines={2}>
                  {result.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.currentLocationButton} onPress={useCurrentLocation} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color="#0f766e" />
          ) : (
            <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#0f766e" />
          )}
          <Text style={styles.currentLocationText}>Use current location</Text>
        </TouchableOpacity>

        <View style={styles.mapWrap}>
          <WebView ref={webviewRef} source={{ html: mapHtml }} onMessage={onWebViewMessage} style={styles.map} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.previewText} numberOfLines={2}>
            {resolving
              ? "Resolving location..."
              : preview
                ? preview.name
                : "Tap the map, search, or use current location"}
          </Text>
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !preview && styles.confirmButtonDisabled]}
              disabled={!preview}
              onPress={() => {
                if (preview) onSelect(preview);
              }}
            >
              <Text style={styles.confirmButtonText}>Use this location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: "#0f172a" },
  resultsList: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    maxHeight: 160,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  resultText: { flex: 1, fontSize: 13, color: "#334155" },
  currentLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  currentLocationText: { color: "#0f766e", fontWeight: "700", fontSize: 13 },
  mapWrap: { flex: 1, marginTop: 12, marginHorizontal: 16, borderRadius: 12, overflow: "hidden" },
  map: { flex: 1 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  previewText: { fontSize: 13, color: "#334155", marginBottom: 10 },
  footerButtons: { flexDirection: "row", gap: 10 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#f1f5f9" },
  cancelButtonText: { color: "#334155", fontWeight: "700", fontSize: 13 },
  confirmButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#0f766e" },
  confirmButtonDisabled: { backgroundColor: "#94a3b8" },
  confirmButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
```

- [ ] **Step 3: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

This component has no screen wired to it yet (that's Task 7), so verify
it compiles cleanly into the web bundle: start the temporary web dev
server used in earlier tasks, confirm the bundle still builds with no new
errors, and grep the bundle output for `LocationPickerModal` to confirm
it was included. Full interactive verification (search results, dragging
the pin, current location) happens in Task 7 once it's reachable from
Create Trip.

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/components/LocationPickerModal.tsx
git commit -m "Add LocationPickerModal: free OpenStreetMap search, current location, and map pin"
```

---

### Task 7: Wire the location picker into Create/Edit Trip

**Files:**
- Modify: `mobile/src/types/index.ts`
- Modify: `mobile/src/api/trips.ts`
- Modify: `mobile/src/screens/CreateTripScreen.tsx`

**Interfaces:**
- Consumes: `LocationPickerModal`, `LocationValue` from
  `mobile/src/components/LocationPickerModal.tsx` (Task 6); backend
  `destLat`/`destLng` fields (Task 4).

- [ ] **Step 1: Add `destLat`/`destLng` to the mobile `Trip` type**

In `mobile/src/types/index.ts`, find:

```ts
  startLat?: number | null;
  startLng?: number | null;
```

Change to:

```ts
  startLat?: number | null;
  startLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
```

- [ ] **Step 2: Add `destLat`/`destLng` to `CreateTripInput`**

In `mobile/src/api/trips.ts`, find:

```ts
  startLat?: number;
  startLng?: number;
```

Change to:

```ts
  startLat?: number;
  startLng?: number;
  destLat?: number;
  destLng?: number;
```

- [ ] **Step 3: Add imports and state to `CreateTripScreen.tsx`**

Add these imports:

```ts
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LocationPickerModal, type LocationValue } from "../components/LocationPickerModal";
```

Add this state alongside the existing `startLocation`/`destination`
state declarations:

```ts
  const [startLocationCoords, setStartLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activePicker, setActivePicker] = useState<"start" | "destination" | null>(null);
```

- [ ] **Step 4: Prefill coordinates in edit mode**

In the existing `useEffect` that prefills form state from `existingTrip`,
find:

```ts
    setStartLocation(existingTrip.startLocation);
```

Add immediately after it (still inside that `useEffect`, before
`setPrefilled(true)`):

```ts
    setStartLocationCoords(
      existingTrip.startLat != null && existingTrip.startLng != null
        ? { lat: existingTrip.startLat, lng: existingTrip.startLng }
        : null
    );
    setDestinationCoords(
      existingTrip.destLat != null && existingTrip.destLng != null
        ? { lat: existingTrip.destLat, lng: existingTrip.destLng }
        : null
    );
```

- [ ] **Step 5: Wire the Starting Location / Destination fields**

Find this block:

```tsx
      <View style={styles.row}>
        <View style={styles.flex1}>
          <FieldLabel text="Starting location" required />
          <TextInput
            style={[styles.input, submitted && !startLocation.trim() && styles.inputError]}
            placeholder="e.g., Chennai, India"
            placeholderTextColor="#94a3b8"
            value={startLocation}
            onChangeText={setStartLocation}
          />
        </View>
        <View style={styles.flex1}>
          <FieldLabel text="Destination" required />
          <TextInput
            style={[styles.input, submitted && !destination.trim() && styles.inputError]}
            placeholder="e.g., Ladakh, India"
            placeholderTextColor="#94a3b8"
            value={destination}
            onChangeText={setDestination}
          />
        </View>
      </View>
```

Replace with:

```tsx
      <View style={styles.row}>
        <View style={styles.flex1}>
          <FieldLabel text="Starting location" required />
          <TextInput
            style={[styles.input, submitted && !startLocation.trim() && styles.inputError]}
            placeholder="e.g., Chennai, India"
            placeholderTextColor="#94a3b8"
            value={startLocation}
            onChangeText={(text) => {
              setStartLocation(text);
              if (startLocationCoords) setStartLocationCoords(null);
            }}
          />
          <TouchableOpacity style={styles.pickOnMapLink} onPress={() => setActivePicker("start")}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color="#0f766e" />
            <Text style={styles.pickOnMapText}>Pick on map</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.flex1}>
          <FieldLabel text="Destination" required />
          <TextInput
            style={[styles.input, submitted && !destination.trim() && styles.inputError]}
            placeholder="e.g., Ladakh, India"
            placeholderTextColor="#94a3b8"
            value={destination}
            onChangeText={(text) => {
              setDestination(text);
              if (destinationCoords) setDestinationCoords(null);
            }}
          />
          <TouchableOpacity style={styles.pickOnMapLink} onPress={() => setActivePicker("destination")}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color="#0f766e" />
            <Text style={styles.pickOnMapText}>Pick on map</Text>
          </TouchableOpacity>
        </View>
      </View>

      <LocationPickerModal
        visible={activePicker === "start"}
        title="Starting Location"
        initialValue={startLocationCoords ? { name: startLocation, ...startLocationCoords } : null}
        onClose={() => setActivePicker(null)}
        onSelect={(value: LocationValue) => {
          setStartLocation(value.name);
          setStartLocationCoords({ lat: value.lat, lng: value.lng });
          setActivePicker(null);
        }}
      />
      <LocationPickerModal
        visible={activePicker === "destination"}
        title="Destination"
        initialValue={destinationCoords ? { name: destination, ...destinationCoords } : null}
        onClose={() => setActivePicker(null)}
        onSelect={(value: LocationValue) => {
          setDestination(value.name);
          setDestinationCoords({ lat: value.lat, lng: value.lng });
          setActivePicker(null);
        }}
      />
```

- [ ] **Step 6: Send coordinates on submit**

Find the `updateTrip.mutateAsync` call's `input` object — it starts with:

```ts
          input: {
            title: title.trim(),
            destination: destination.trim(),
            startLocation: startLocation.trim(),
```

Change those three lines to:

```ts
          input: {
            title: title.trim(),
            destination: destination.trim(),
            startLocation: startLocation.trim(),
            startLat: startLocationCoords?.lat,
            startLng: startLocationCoords?.lng,
            destLat: destinationCoords?.lat,
            destLng: destinationCoords?.lng,
```

Find the `createTrip.mutateAsync` call's argument object — it starts
with:

```ts
      const trip = await createTrip.mutateAsync({
        title: title.trim(),
        destination: destination.trim(),
        startLocation: startLocation.trim(),
```

Change those three lines the same way:

```ts
      const trip = await createTrip.mutateAsync({
        title: title.trim(),
        destination: destination.trim(),
        startLocation: startLocation.trim(),
        startLat: startLocationCoords?.lat,
        startLng: startLocationCoords?.lng,
        destLat: destinationCoords?.lat,
        destLng: destinationCoords?.lng,
```

- [ ] **Step 7: Add the two new styles**

Find the `styles` `StyleSheet.create({...})` block at the bottom of the
file and add:

```ts
  pickOnMapLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  pickOnMapText: { color: "#0f766e", fontSize: 12, fontWeight: "600" },
```

- [ ] **Step 8: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Manual verification**

On the temporary web dev server: open Create Trip, tap "Pick on map" next
to Starting Location, confirm the sheet opens with the search box,
"Use current location" button, and map; type a search query and confirm
results appear and tapping one moves the map pin and updates the preview
text; drag the pin and confirm the preview text updates to a reverse-
geocoded name; tap "Use this location" and confirm the Starting Location
text field is filled; repeat for Destination; then edit the text field
directly and confirm re-opening the picker for that field doesn't crash
(coords were cleared, `initialValue` is `null`). Also open Edit Trip on a
trip that has coordinates and confirm the picker opens pre-centered on
the existing pin.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/types/index.ts mobile/src/api/trips.ts mobile/src/screens/CreateTripScreen.tsx
git commit -m "Wire LocationPickerModal into Starting Location and Destination fields"
```

---

### Task 8: Automatic trip status closure (backend)

**Files:**
- Modify: `backend/src/modules/trips/trips.service.ts`

**Interfaces:**
- Produces: `closeExpiredTrips(): Promise<void>` (private to this file),
  called from `listTrips`, `getTripById`, `getMyTrips`,
  `getBookmarkedTrips`.
- Extends `updateTrip` from Task 2 (same file) — read that task's final
  version before starting this one.

- [ ] **Step 1: Add `closeExpiredTrips` and call it from the four read paths**

Add this function near `assertValidTripDates` (from Task 2):

```ts
async function closeExpiredTrips(): Promise<void> {
  await prisma.trip.updateMany({
    where: { endDate: { lt: new Date() }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
    data: { status: "COMPLETED" },
  });
}
```

In `listTrips`, find:

```ts
export async function listTrips(filters: TripFilters, viewerId?: string) {
  const pageParams = parsePageParams(filters as unknown as Record<string, unknown>);
```

Change to:

```ts
export async function listTrips(filters: TripFilters, viewerId?: string) {
  await closeExpiredTrips();
  const pageParams = parsePageParams(filters as unknown as Record<string, unknown>);
```

In `getTripById`, find:

```ts
export async function getTripById(id: string, viewerId?: string) {
  const trip = await prisma.trip.findUnique({ where: { id }, include: cardInclude });
```

Change to:

```ts
export async function getTripById(id: string, viewerId?: string) {
  await closeExpiredTrips();
  const trip = await prisma.trip.findUnique({ where: { id }, include: cardInclude });
```

In `getMyTrips`, find:

```ts
export async function getMyTrips(ownerId: string) {
  return prisma.trip.findMany({ where: { ownerId }, include: cardInclude, orderBy: { createdAt: "desc" } });
}
```

Change to:

```ts
export async function getMyTrips(ownerId: string) {
  await closeExpiredTrips();
  return prisma.trip.findMany({ where: { ownerId }, include: cardInclude, orderBy: { createdAt: "desc" } });
}
```

In `getBookmarkedTrips`, find:

```ts
export async function getBookmarkedTrips(userId: string) {
  const bookmarks = await prisma.tripBookmark.findMany({
```

Change to:

```ts
export async function getBookmarkedTrips(userId: string) {
  await closeExpiredTrips();
  const bookmarks = await prisma.tripBookmark.findMany({
```

- [ ] **Step 2: Block manually reopening an expired trip in `updateTrip`**

Take `updateTrip` as Task 2 left it:

```ts
export async function updateTrip(tripId: string, ownerId: string, input: UpdateTripInput) {
  const existing = await assertOwner(tripId, ownerId);
  const effectiveStart = input.startDate ?? existing.startDate;
  const effectiveEnd = input.endDate ?? existing.endDate;

  if (input.startDate !== undefined || input.endDate !== undefined) {
    assertValidTripDates(effectiveStart, effectiveEnd);
  }

  return prisma.trip.update({ where: { id: tripId }, data: input });
}
```

Replace it with:

```ts
export async function updateTrip(tripId: string, ownerId: string, input: UpdateTripInput) {
  const existing = await assertOwner(tripId, ownerId);
  const effectiveStart = input.startDate ?? existing.startDate;
  const effectiveEnd = input.endDate ?? existing.endDate;

  if (input.startDate !== undefined || input.endDate !== undefined) {
    assertValidTripDates(effectiveStart, effectiveEnd);
  }

  let data = input;
  if (effectiveEnd.getTime() < Date.now() && data.status && data.status !== "CANCELLED") {
    data = { ...data, status: "COMPLETED" };
  }

  return prisma.trip.update({ where: { id: tripId }, data });
}
```

- [ ] **Step 3: Typecheck**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification (best-effort, optional)**

If a local backend + database is reachable, create a trip with an end
date in the past directly via Prisma Studio (`npx prisma studio` from
`backend/`) or a raw SQL update, then call `GET /trips/mine` (or any of
the other three read endpoints) with that user's JWT and confirm the
trip's `status` comes back `"COMPLETED"`. If no local database is
available, this is exercised by the full mobile walkthrough in Task 9.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/trips/trips.service.ts
git commit -m "Auto-close trips past their end date; block manually reopening them"
```

---

### Task 9: "Closed" status display (mobile) + end-to-end walkthrough

**Files:**
- Create: `mobile/src/utils/tripStatus.ts`
- Modify: `mobile/src/components/TripCard.tsx`
- Modify: `mobile/src/screens/TripDetailScreen.tsx`

**Interfaces:**
- Produces: `TRIP_STATUS_COLORS: Record<TripStatus, string>`,
  `TRIP_STATUS_LABELS: Record<TripStatus, string>`.
- Consumes: `TripStatus` from `mobile/src/types/index.ts` (existing).

- [ ] **Step 1: Create the shared status map**

```ts
import type { TripStatus } from "../types";

export const TRIP_STATUS_COLORS: Record<TripStatus, string> = {
  PLANNING: "#94a3b8",
  OPEN: "#0f766e",
  ALMOST_FULL: "#d97706",
  FULL: "#dc2626",
  STARTED: "#2563eb",
  COMPLETED: "#6b7280",
  CANCELLED: "#991b1b",
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNING: "Planning",
  OPEN: "Open",
  ALMOST_FULL: "Almost full",
  FULL: "Full",
  STARTED: "Started",
  COMPLETED: "Closed",
  CANCELLED: "Cancelled",
};
```

- [ ] **Step 2: Use it in `TripCard.tsx`**

Remove:

```ts
const STATUS_COLORS: Record<Trip["status"], string> = {
  PLANNING: "#94a3b8",
  OPEN: "#0f766e",
  ALMOST_FULL: "#d97706",
  FULL: "#dc2626",
  STARTED: "#2563eb",
  COMPLETED: "#6b7280",
  CANCELLED: "#991b1b",
};
```

Add this import alongside the existing ones:

```ts
import { TRIP_STATUS_COLORS, TRIP_STATUS_LABELS } from "../utils/tripStatus";
```

Find:

```tsx
        <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[trip.status] }]}>
          <Text style={styles.statusText}>{trip.status.replace("_", " ")}</Text>
        </View>
```

Change to:

```tsx
        <View style={[styles.statusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
          <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
        </View>
```

- [ ] **Step 3: Use it in `TripDetailScreen.tsx`**

Remove:

```ts
const STATUS_COLORS: Record<Trip["status"], string> = {
  PLANNING: "#94a3b8",
  OPEN: "#0f766e",
  ALMOST_FULL: "#d97706",
  FULL: "#dc2626",
  STARTED: "#2563eb",
  COMPLETED: "#6b7280",
  CANCELLED: "#991b1b",
};
```

Add this import alongside the existing ones:

```ts
import { TRIP_STATUS_COLORS, TRIP_STATUS_LABELS } from "../utils/tripStatus";
```

Find:

```tsx
            <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[trip.status] }]}>
              <Text style={styles.statusText}>{trip.status.replace("_", " ")}</Text>
            </View>
```

Change to:

```tsx
            <View style={[styles.statusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
              <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
            </View>
```

`MyTripsScreen.tsx` needs no change — it renders trips exclusively
through `TripCard`.

- [ ] **Step 4: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: End-to-end manual walkthrough**

On the temporary web dev server:
1. Create a trip with an end date of today (the earliest allowed value).
2. If a local backend/database is reachable, set that trip's `endDate` to
   yesterday directly (Prisma Studio or SQL) to simulate it having
   expired, since the UI itself can no longer create a past-dated trip
   (that's the point of Task 3's validation). If no local database is
   reachable, skip to step 3 and note that the backend logic was already
   typechecked and reasoned through in Task 8 — this step is a nice-to-
   have confirmation, not the only verification.
3. Reload Discover, My Trips, and that trip's Trip Detail page — all
   three should show a **"Closed"** pill instead of "Open".
4. Open Edit Trip for that trip and confirm it loads (via the same
   `getTripById` path that just closed it) without error.
5. Confirm the whole flow from earlier tasks still works: Near Me filter
   (Task 5's refactor), date validation (Task 3), and the location picker
   (Task 7) on a fresh trip creation.

Kill the verification server's specific PID afterward and confirm the
live tunnel on port 8081 still responds `200`, per this project's
established cleanup discipline.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/utils/tripStatus.ts mobile/src/components/TripCard.tsx mobile/src/screens/TripDetailScreen.tsx
git commit -m "Show auto-closed trips as Closed on Discover, Trip Detail, and My Trips"
```
