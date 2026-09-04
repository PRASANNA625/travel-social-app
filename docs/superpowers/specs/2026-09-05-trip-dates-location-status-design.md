# Trip Dates, Location Picker & Auto-Status — Design Spec

## Goal

Update Create Trip and Edit Trip so that: (1) dates are shown as DD/MM/YYYY,
reject past dates, and enforce start ≤ end with no timezone bugs; (2)
Starting Location and Destination can be set via map pin, current device
location, or manual search — always capturing coordinates alongside the
name; (3) a trip's status automatically becomes "Closed" once its end date
has passed, consistently everywhere status is shown, and can't be manually
reopened.

## Non-goals

- No changes to the Near Me filter itself (built in the previous session) —
  this work only makes sure trips actually have coordinates for it to use.
- No native Google Maps / Places integration (user chose the free
  OpenStreetMap approach over Google Maps + Places during design review).
- No cron/scheduled job for status transitions — computed lazily on read
  (see Trip Status section).
- No change to Discover's short trip-card date format (`Sep 5`) or to
  Discover/TripDetail's other unrelated UI — only the Create/Edit form
  fields get DD/MM/YYYY, per the request's scope ("update the Create Trip
  and Edit Trip screens").

## Context corrections from the design conversation

During implementation research two assumptions from the initial design
proposal turned out to be wrong and are corrected here:

1. **The web date picker is not broken.** `TripDateFields.web.tsx` already
   exists as a Metro platform-split sibling of `TripDateFields.tsx` (picked
   automatically for web builds) and already fixed a prior timezone/off-by-one
   bug (commit `53b98f6`) by building dates from local components instead of
   `toISOString()`. This file will be extended, not replaced.
2. **No new native `<input type="date">` element.** `tsc --noEmit` type-checks
   `.web.tsx` files as regular TypeScript regardless of Metro's platform
   resolution, and this project has no DOM lib / react-native-web element
   types wired in. Introducing a raw `<input>` risks a type-check break for
   uncertain UX benefit. The web field stays a `TextInput` with the existing
   local-date parsing, upgraded to DD/MM/YYYY format and to reject
   (not silently ignore) past dates with inline error text — the correctness
   guarantee is the same as "disabled," just enforced on commit rather than
   greyed out in a calendar widget that doesn't exist for a text field.

## 1. Dates

### Shared date utilities — `mobile/src/utils/date.ts` (new)

One file, imported by both `TripDateFields.tsx` (native) and
`TripDateFields.web.tsx` (web) — no duplicated date-math between them.

```
formatDDMMYYYY(date: Date): string       // "05/09/2026"
startOfToday(): Date                      // today at local midnight
toDateOnly(date: Date): Date              // date, local midnight
isBeforeToday(date: Date): boolean        // date-only compare, local time
isAfterDate(a: Date, b: Date): boolean    // date-only compare, local time
```

All comparisons operate on local calendar-day values (`setHours(0,0,0,0)`),
matching the local-time approach `TripDateFields.web.tsx` already uses —
never `toISOString()`/UTC, which is what caused the prior off-by-one bug.

### `TripDateFields.tsx` (native)

- Display text changes from `startDate.toDateString()` to
  `formatDDMMYYYY(startDate)` (and same for end).
- `DateTimePicker` gets `minimumDate={startOfToday()}` on both start and end
  pickers — the OS calendar widget greys out/disables past dates natively.
- When the start date changes to something after the current end date,
  clear the end date (forces re-selection) rather than silently allowing an
  invalid range.

### `TripDateFields.web.tsx` (web)

- `toDateInputValue`/display format switches from `YYYY-MM-DD` to
  `DD/MM/YYYY` (`formatDDMMYYYY`), input placeholder becomes `"DD/MM/YYYY"`.
- `parseDateInput` regex switches from `^\d{4}-\d{2}-\d{2}$` to
  `^(\d{2})\/(\d{2})\/(\d{4})$`, constructing the `Date` from local
  components exactly as today (no UTC).
- A parsed date that is before today is **not** committed via
  `onChangeValidDate` — the text buffer still updates (so typing isn't
  fought), but the field shows an error style (reuses the existing
  `errorStyle` prop, same pattern as today's `endError`) until corrected.
- Same auto-clear-end-on-invalid-range behavior as native, applied in
  `CreateTripScreen.tsx` (platform-agnostic, lives in the parent since both
  `TripDateFields` variants call the same `onChangeStart`/`onChangeEnd`
  callbacks).

### Cross-field validation — shared, one place, both Create and Edit

`CreateTripScreen.tsx`'s existing `onSubmit` validation gains two checks
(using the same `mobile/src/utils/date.ts` helpers):

- End date must not be before today (`!isBeforeToday(endDate)`).
- Start date must not be after end date (`!isAfterDate(startDate, endDate)`).

Both checks run identically whether `isEditMode` is true or false — the
function doesn't branch on mode today and won't need to for this.

### Backend

`backend/src/modules/trips/trips.service.ts` gains one function:

```ts
function assertValidTripDates(start: Date, end: Date): void
```

Throws `HttpError(400, ...)` if `end < start` or `end` is before today
(UTC-midnight-normalized server-side, since the server has no notion of the
client's timezone — the client already prevents this case via the rule
above, so this is a defense-in-depth boundary check, not the primary UX).

- `createTrip`: calls it unconditionally (both dates always present on
  create).
- `updateTrip`: calls it only when the incoming `input` actually changes
  `startDate` or `endDate` (i.e. `input.startDate !== undefined ||
  input.endDate !== undefined`), comparing the *effective* dates (input
  value if present, else the existing trip's stored value). This avoids
  retroactively blocking unrelated edits (e.g. changing `notes`) on a trip
  whose dates were valid when created but have since passed — that case is
  handled by the status logic below, not by rejecting the edit outright.

## 2. Location picker

### Data model

`Trip.destLat`/`Trip.destLng` (nullable `Float`, mirroring the existing
`startLat`/`startLng`) are added to `backend/prisma/schema.prisma` via a new
migration in `backend/prisma/migrations/`. Render's existing build command
(`npx prisma migrate deploy`, in `render.yaml`) applies it automatically on
the next backend deploy — no manual production step.

`backend/src/modules/trips/trips.types.ts`: `createTripSchema` gains
`destLat: z.number().optional()`, `destLng: z.number().optional()`
(mirroring `startLat`/`startLng`); flows through `updateTripSchema`
automatically via `.partial()`.

`mobile/src/types/index.ts` (`Trip`) and `mobile/src/api/trips.ts`
(`CreateTripInput`) gain the matching optional `destLat`/`destLng` fields.

### New shared component — `mobile/src/components/LocationPickerModal.tsx`

One component, used for **both** Starting Location and Destination (two
separate instances/invocations, zero duplicated picker logic). Props:

```ts
interface LocationValue { name: string; lat: number; lng: number }

function LocationPickerModal({
  visible: boolean,
  title: string,               // "Starting Location" | "Destination"
  initialValue: LocationValue | null,
  onClose: () => void,
  onSelect: (value: LocationValue) => void,
}): JSX.Element
```

A single sheet (not tabs) containing, top to bottom:

1. **Search box** — debounced (~450ms) free-text query against Nominatim's
   `/search` endpoint. Results list below the box; tapping a result moves
   the map pin to that result's coordinates and sets the preview name from
   its `display_name`.
2. **"Use current location" button** — calls the *same*
   `expo-location` permission request + `getCurrentPositionAsync` already
   built for Near Me (`DiscoverScreen.tsx`'s `activateNearMe` pattern is
   reused as a shared helper, not re-implemented — see below). On success,
   moves the pin and reverse-geocodes via Nominatim's `/reverse` endpoint
   for a display name. On denial, reuses the same location-denied popup
   pattern (copy adapted to the picker context).
3. **Map** — a Leaflet + OpenStreetMap tile map rendered inside a
   `react-native-webview` `<WebView>` (new dependency: `react-native-webview`,
   works on both native and Expo Web, where it renders as an iframe). The
   WebView's HTML is a self-contained inline string (Leaflet loaded from its
   public CDN inside that HTML document — this is normal app code, not
   subject to any artifact-publishing CDN allowlist). A draggable marker;
   dragging posts `{ type: "PIN_MOVED", lat, lng }` back to React Native via
   `window.ReactNativeWebView.postMessage`, which reverse-geocodes for a
   name the same way the current-location button does.

   Communication is two-way: the WebView→RN direction is `postMessage` as
   above; the RN→WebView direction (search result tapped, or current
   location resolved, needs to move the pin the map is already showing)
   uses a `WebView` ref's `injectJavaScript`, calling a small `setPin(lat,
   lng)` function defined in the page's inline `<script>` that re-centers
   the map and moves the marker. Both directions funnel through the same
   `setPreviewLocation({ name, lat, lng })` state update in
   `LocationPickerModal`, so the map, the search results, and the
   current-location button all drive one shared piece of state rather than
   three independent ones.
4. **Preview + confirm** — read-only resolved name text, "Use this
   location" button (disabled until a pin exists) calling `onSelect`, and
   "Cancel" calling `onClose`.

Default map center: India centroid (`22.5937, 78.9629`) at low zoom when no
`initialValue` and no location has been resolved yet in the session;
`initialValue`'s coordinates (edit mode) or a just-resolved pin, at a close
zoom, otherwise.

**Shared location-permission helper**: `activateNearMe`'s permission
request + position fetch in `DiscoverScreen.tsx` is extracted into
`mobile/src/utils/currentLocation.ts` (`getCurrentLocationOrThrow()`
throwing a typed error the caller turns into its own denied-state UI) and
both `DiscoverScreen.tsx` and `LocationPickerModal.tsx` call it — this
satisfies "don't create duplicate location logic" literally, not just in
spirit. `DiscoverScreen.tsx`'s own permission-denied modal copy/UI is
unchanged; only the underlying permission+fetch call is shared.

### Nominatim usage

- `https://nominatim.openstreetmap.org/search?q=<query>&format=json&limit=8`
- `https://nominatim.openstreetmap.org/reverse?lat=<lat>&lon=<lng>&format=json`
- On native, requests set a `User-Agent` header identifying the app (React
  Native's `fetch` allows this). On web, the header is omitted — browsers
  block scripts from setting `User-Agent`, and Nominatim's usage policy
  accepts the browser's automatic `Referer` for web-app identification
  instead.
- No backend proxy — the client calls Nominatim directly, matching how
  `expo-location` is already called directly from the client rather than
  through the backend. Keeps this MVP-scoped; a proxy can be added later if
  usage policy limits become a real problem.

### `CreateTripScreen.tsx` changes

Starting Location and Destination keep their existing `TextInput`s
unchanged (typing a name directly still works exactly as today — "don't
break existing location functionality") and each gains a small button
("📍 Pick on map") next to it that opens `LocationPickerModal`.

Two new pieces of state, `startLocationCoords` and `destinationCoords`
(each `{ lat: number; lng: number } | null`), alongside the existing
`startLocation`/`destination` string state:

- Selecting a result in the modal sets **both** the text field (to the
  resolved name) and the coords state together — name and coordinates are
  always set as a pair, never independently.
- Manually editing the text field after a pick clears that field's coords
  state (`onChangeText` also resets coords to `null`) — this guarantees the
  stored coordinates are always for the currently-displayed name, never a
  stale pair from a name the user has since edited away. (Known, accepted
  tradeoff: a trivial typo-fix after picking also clears the coordinates;
  re-picking is one tap.)
- On submit, `startLat`/`startLng`/`destLat`/`destLng` are sent from the
  coords state (`undefined` if never picked — same as today's behavior for
  `startLat`/`startLng`, which are already optional).
- Edit mode prefills coords state from `existingTrip.startLat`/`startLng`/
  `destLat`/`destLng` when present (existing trips created before this
  feature will have `null` coords and just show their existing text names,
  same as today).

## 3. Trip status → "Closed"

### Reusing the existing `COMPLETED` status

`backend/src/modules/users/users.service.ts`'s `getCompletedTrips` already
queries `status: "COMPLETED"`, but nothing in the codebase currently sets
that status — it's an existing field with no writer. This feature becomes
that writer. No new enum value, no migration for status.

### Auto-closing — `backend/src/modules/trips/trips.service.ts`

```ts
async function closeExpiredTrips(): Promise<void> {
  await prisma.trip.updateMany({
    where: { endDate: { lt: new Date() }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
    data: { status: "COMPLETED" },
  });
}
```

Called at the start of the four trip-read paths: `listTrips` (Discover),
`getTripById` (Trip Detail *and* Edit Trip, which loads via the same
`useTrip` hook), `getMyTrips` (My Trips), `getBookmarkedTrips`. One
function, four call sites, no per-endpoint reimplementation — this is what
makes the status consistent across Discover/Trip Details/My
Trips/Edit Trip as requested, without a cron job: the sweep runs
opportunistically on whichever read path is hit next, and is a cheap no-op
`updateMany` (matches zero rows) once trips are already closed.

### Blocking manual reopen — `updateTrip`

After merging `input` with the existing trip to get the effective end date,
if that effective end date is in the past and `input.status` is present and
is not `"CANCELLED"`, the update coerces `status` to `"COMPLETED"`
regardless of what was requested, before writing. (Today's mobile UI never
sends `status` in update payloads at all — this is a server-side boundary
guard for correctness, not a UI change.) Cancelling an already-closed trip
remains allowed (a user can still cancel a trip that's ended without
happening, e.g. a no-show group).

### Display — de-duplicating an existing duplication

`TripCard.tsx` and `TripDetailScreen.tsx` each currently define their own
copy of `STATUS_COLORS` and both render `trip.status.replace("_", " ")` as
the label text. Both copies move into one new file,
`mobile/src/utils/tripStatus.ts`:

```ts
export const TRIP_STATUS_COLORS: Record<TripStatus, string> = { ... };
export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNING: "Planning", OPEN: "Open", ALMOST_FULL: "Almost full",
  FULL: "Full", STARTED: "Started", COMPLETED: "Closed", CANCELLED: "Cancelled",
};
```

`TripCard.tsx` and `TripDetailScreen.tsx` both import from here instead of
declaring their own copy, and both render `TRIP_STATUS_LABELS[trip.status]`
instead of `trip.status.replace("_", " ")`. `MyTripsScreen.tsx` needs no
change — it already renders trips through `TripCard`.

## Testing / verification

No test framework exists in this repo (confirmed, established convention
this session) — verification is `npx tsc --noEmit` plus a manual walkthrough
of Create Trip and Edit Trip on the temporary web dev server (per this
session's established port/cleanup discipline), covering: past-date
rejection on both platforms' date fields, start-after-end rejection, all
three location-picker input modes for both fields, and a trip whose end
date is in the past showing "Closed" on Discover/Trip Detail/My Trips and
refusing to reopen via Edit.
