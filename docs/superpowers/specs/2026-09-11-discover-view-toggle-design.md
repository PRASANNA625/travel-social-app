# Discover Grid/List View Toggle — Design Spec

## Goal

Add a Grid/List view switcher to the existing Discover screen's main
"all trips" vertical list, so users can choose between a compact
2-column grid and a full-width horizontal list, without duplicating
trip-card logic or disturbing any existing Discover functionality.

## Non-Goals (V1)

- The four horizontal carousel sections (Near Me, Recommended,
  Trending, This Weekend) are unaffected by this feature — they keep
  rendering as compact horizontal-scrolling rows regardless of the
  selected view. Revisiting them is explicitly deferred.
- No change to the existing List/Map toggle's behavior — the new
  control is additive and only visible when List/Map is set to "List".
- No backend/API involvement — the view preference is a device-local
  setting only.
- No new list-rendering library, and no use of `FlatList`'s built-in
  `numColumns` — see "FlatList Integration & Transition" below for why.
- No live/animated reflow between column counts — see "Transition"
  below for why, and what "smooth" means here instead.

## Existing Architecture (context this design builds on)

- **`mobile/src/screens/DiscoverScreen.tsx`** renders one outer
  `FlatList` of `Trip` items (the filtered "all trips" list) whose
  `ListHeaderComponent` contains the hero carousel, search, the
  existing List/Map toggle (`viewMode: "list" | "map"`, lines
  267-294), the filter chip row, and (when `viewMode === "map"`) the
  map itself, followed by the four `DiscoverSection` horizontal rows.
  The outer `FlatList`'s own `renderItem` (currently `numColumns`
  unset, i.e. 1) renders one `TripCard` per row — this is the list the
  new Grid/List toggle targets.
- **`mobile/src/components/TripCard.tsx`** is a single component (no
  existing layout variants) used in three places: `DiscoverScreen.tsx`
  (full-width), `DiscoverSection.tsx` (horizontal rows, fixed
  `CARD_WIDTH = 280`), and `MyTripsScreen.tsx`. Props are
  `{ trip: Trip; onPress: () => void; onDelete?: () => void }`.
  Current layout: image block on top (170px, gradient scrim with
  title/destination/dates overlay), body below (travel-mode row, meta
  row). `TripCardSkeleton.tsx` mirrors this shape for loading states.
- **Filter state** (`search`, `travelModes`, `nearMe`, `radiusKm`,
  `sortOrder`) lives in `DiscoverScreen` and feeds `useTrips(...)`,
  which produces the filtered results the outer `FlatList` renders.
  This state is entirely independent of view-mode concerns.
- **The existing List/Map toggle** (`DiscoverScreen.tsx:267-294`,
  styles `viewModeRow`/`viewModeButton`/`viewModeButtonActive` at
  lines 639-659) is a 2-segment pill control: `flex: 1` buttons inside
  a `RADIUS.pill` row, active button filled `colors.primary` with
  white icon/text. This is the visual/structural template the new
  toggle reuses.
- **Theme tokens** (`mobile/src/theme/tokens.ts`,
  `mobile/src/theme/palettes.ts`, `ThemeContext.tsx`): `RADIUS.card =
  24`, `RADIUS.pill = 999`, `SHADOW.card`, brand teal
  `colors.primary`. Every screen follows the
  `const { colors } = useTheme(); const styles = useMemo(() =>
  createStyles(colors), [colors]);` factory pattern.
- **Local persistence precedent**: `ThemeContext.tsx` persists a user
  preference via `@react-native-async-storage/async-storage` —
  hydrate once on mount (`AsyncStorage.getItem(...).then(...).catch(()
  => {})`), then optimistic state update + fire-and-forget
  `AsyncStorage.setItem(...).catch(() => {})` on every change. The new
  view-layout preference follows this exact pattern.
- **Responsive layout precedent**: no `.web.tsx` split exists for
  `DiscoverScreen` or `TripCard` (that pattern is reserved for things
  needing different native modules, e.g. `ExploreMap`/`ExploreMap.web`
  for WebView vs. iframe). Layout differences use inline
  `useWindowDimensions()` checks instead (e.g.
  `ProfileScreen.tsx:88-90`, and `DiscoverScreen.tsx` itself already
  uses `useWindowDimensions()` to size the map area). This feature
  follows the same inline-responsive convention.
- **RN `FlatList` constraint**: changing `numColumns` on a mounted
  `FlatList` is unsupported without remounting the list (new `key`).
  That would be safe for a standalone list, but this screen's single
  outer `FlatList` carries its entire page — hero carousel, search,
  toggles, filter chips, and all four horizontal sections — inside
  `ListHeaderComponent`. Forcing a remount via `key` would remount all
  of that too: scroll position reset to the top, hero carousel
  restarted, search focus lost. So this design does not use
  `numColumns` at all — see "FlatList Integration & Transition" below.

## Architecture Overview

A `viewLayout: "grid" | "list"` state in `DiscoverScreen`, persisted
via `AsyncStorage`, controls two things: which `numColumns` the outer
`FlatList` renders with, and which `layout` prop value is passed down
to each `TripCard`. `TripCard` and `TripCardSkeleton` each gain one
new optional prop (`layout?: "grid" | "list"`, defaulting to
`"grid"`) so every other call site is unaffected. A new
`ViewModeToggle` component is extracted from the existing List/Map
pill control and reused for both toggles.

## View Switcher UI

`ViewModeToggle` — a small reusable component:

```ts
type ViewModeToggleOption<T extends string> = {
  value: T;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
};

interface ViewModeToggleProps<T extends string> {
  options: [ViewModeToggleOption<T>, ViewModeToggleOption<T>];
  value: T;
  onChange: (value: T) => void;
}
```

Rendered as the existing `viewModeRow`/`viewModeButton` styles
(`colors.fieldBg` pill row, active button `colors.primary` fill with
white icon). The existing List/Map toggle is refactored to use this
component with `options=[{value:"list",icon:"view-list-outline",...},
{value:"map",icon:"map-outline",...}]` — no behavior change, purely
extracting the existing markup.

The new Grid/List toggle uses the same component:
`options=[{value:"grid",icon:"view-grid-outline",...},
{value:"list",icon:"view-agenda-outline",...}]`, placed in the same
row, immediately after the List/Map toggle. It is only rendered when
`viewMode === "list"` (hidden entirely when Map is active, since the
map doesn't render cards).

## State & Persistence

```ts
const VIEW_LAYOUT_STORAGE_KEY = "discover_view_layout";

const [viewLayout, setViewLayoutState] = useState<"grid" | "list">("grid");

useEffect(() => {
  AsyncStorage.getItem(VIEW_LAYOUT_STORAGE_KEY)
    .then((stored) => {
      if (stored === "grid" || stored === "list") setViewLayoutState(stored);
    })
    .catch(() => {});
}, []);

const setViewLayout = (next: "grid" | "list") => {
  setViewLayoutState(next);
  AsyncStorage.setItem(VIEW_LAYOUT_STORAGE_KEY, next).catch(() => {});
};
```

Default is `"grid"` on both Web and Mobile until a stored preference
is hydrated. This is a device-local setting only — no backend field,
no API call.

## TripCard Layout Variants

```ts
interface TripCardProps {
  trip: Trip;
  onPress: () => void;
  onDelete?: () => void;
  layout?: "grid" | "list"; // defaults to "grid"
}
```

Both variants share all existing data-formatting logic (status pill
text/color, travel-mode icon/label, meta-row counts, date formatting)
— only the JSX arrangement branches on `layout`:

- **`"grid"`** (default): the card's current appearance — image on
  top (170px) with gradient-scrim title/destination/dates overlay,
  body below with travel-mode row and meta row — unchanged, just
  rendered inside a 2-column grid cell instead of full width. This
  preserves every existing call site (`DiscoverSection.tsx`,
  `MyTripsScreen.tsx`) byte-for-byte without passing the new prop.
- **`"list"`** (new): horizontal arrangement — a fixed ~96×96 image on
  the left (`RADIUS.card` rounded corners), and on the right: trip
  title, destination + dates, travel-mode row, creator info
  (`trip.owner.photoUrl`/`trip.owner.name` — small avatar + name,
  `Trip` has no full member list, only the owner plus
  `seats`/`seatsFilled` capacity) shown as an avatar-plus-name row with
  `seatsFilled/seats` alongside it, and the existing action
  affordances (delete button, status pill), stacked vertically. Same
  `SHADOW.card`/`colors.border`/corner-radius tokens as the grid card
  so it reads as the same design language.

`TripCardSkeleton` gains the same `layout?: "grid" | "list"` prop
(default `"grid"`), mirroring whichever `TripCard` shape is active so
loading states match.

## Grid Column Behavior

Grid mode targets 2 columns on both Web and Mobile — "2-column layout
on Web" and "responsive layout on Mobile" are treated as the same
behavior, since 2 columns is the compact-card identity the
requirements describe. A `useWindowDimensions()` width safeguard drops
to 1 column only below a narrow-width threshold (360px) as a
defensive fallback for unusually small viewports; real devices rarely
cross this threshold, so in practice grid mode is 2 columns almost
everywhere. List mode is always 1 column, full width. This column
count is called `rowSize` below — it determines how many `Trip`s each
rendered row groups together, not a `FlatList` prop.

## FlatList Integration & Transition

The outer `FlatList`'s `data`/`renderItem` operate on **rows**, not
individual trips, so column count changes without touching
`numColumns` or the list's `key` — no remount, so the header content
inside `ListHeaderComponent` (hero carousel, search, toggles, filter
chips, all four sections) is completely unaffected by a Grid/List
toggle: scroll position, hero carousel state, and search focus are
all preserved.

```ts
const rowSize = viewLayout === "list" ? 1 : windowWidth < 360 ? 1 : 2;

const rows = useMemo(() => {
  const items = viewMode === "list" ? (data?.items ?? []) : [];
  const grouped: Trip[][] = [];
  for (let i = 0; i < items.length; i += rowSize) {
    grouped.push(items.slice(i, i + rowSize));
  }
  return grouped;
}, [data, viewMode, rowSize]);
```

```tsx
<FlatList
  data={rows}
  keyExtractor={(row) => row.map((t) => t.id).join("-")}
  renderItem={({ item: row }) => (
    <Animated.View
      style={[viewLayout === "grid" ? styles.gridRow : styles.horizontalInset, { opacity: fadeAnim }]}
    >
      {row.map((trip) => (
        <View key={trip.id} style={viewLayout === "grid" ? styles.gridCell : styles.listCell}>
          <TripCard trip={trip} layout={viewLayout} onPress={...} onDelete={...} />
        </View>
      ))}
      {viewLayout === "grid" && row.length === 1 && <View style={styles.gridCell} />}
    </Animated.View>
  )}
  ListHeaderComponent={...}
  ...
/>
```

The odd-trailing-item spacer (`row.length === 1` in grid mode) keeps
the last row's lone card at half width instead of stretching to fill
the row, matching a conventional grid's trailing-item look.

Since there's no remount to mask, "smooth transition" is a plain
opacity fade applied only to the row content (not the header): a
shared `fadeAnim` (`Animated.Value`, `useNativeDriver: true`) fades to
0 over ~150ms when `viewLayout` changes, then back to 1 over ~150ms —
driven by a `useEffect` on `viewLayout`, scoped to `renderItem`'s
wrapper so the header never visually flashes.

## Interaction with Filters, Sections, and Closed Trips

No change to what is fetched or filtered. The existing filter chips
(`search`, `travelModes`, `nearMe`, `radiusKm`, `sortOrder`) continue
to drive the same `useTrips(...)` query; `viewLayout` only changes how
each already-filtered `Trip` renders, never which trips are included.
Closed-trip status pills and disabled actions are internal to
`TripCard` and work identically in both layouts. The hero carousel and
the four horizontal `DiscoverSection` rows are untouched — they don't
read `viewLayout` at all (see Non-Goals).

## Testing Plan

No component/UI test framework exists in this repo (mobile
verification = `tsc --noEmit` only, per established project
convention). Manual QA covers:

- Grid ↔ List switching with active filters (search text, travel-mode
  chips, Near Me, sort order) — filtered results identical, only
  layout changes
- New toggle hidden when List/Map is set to Map; reappears when
  switched back to List
- Empty-results state and loading-skeleton state render correctly in
  both layouts
- Closed-trip cards render correctly (status pill, disabled actions)
  in both layouts
- Web: 2-column grid at normal widths; Mobile: 2-column grid, 1-column
  fallback only below the narrow-width safeguard
- Preference persists after fully closing and reopening the app
- Existing List/Map toggle, hero carousel, and the four horizontal
  sections remain functionally and visually unchanged
