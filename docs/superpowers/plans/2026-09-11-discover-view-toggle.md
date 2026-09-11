# Discover Grid/List View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Grid/List view switcher to Discover's main "all trips" list, reusing `TripCard` for both layouts, with no remount of the page's header content when switching.

**Architecture:** A `viewLayout: "grid" | "list"` state in `DiscoverScreen`, persisted via `AsyncStorage`, drives a new `layout` prop on `TripCard`/`TripCardSkeleton` and a manual row-grouping of the outer `FlatList`'s data (instead of `numColumns`, which would force an unwanted remount of the page's `ListHeaderComponent`). A small reusable `ViewModeToggle` is extracted from the existing List/Map pill control and used for both toggles.

**Tech Stack:** React Native (Expo), React Native Web, `@react-native-async-storage/async-storage` (already a dependency), React Native's built-in `Animated` API. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-11-discover-view-toggle-design.md`

## Global Constraints

- No new dependencies — `Animated` is built into React Native, `AsyncStorage` is already installed.
- Mobile verification is `npx tsc --noEmit` from the `mobile/` directory only — no component/UI test framework exists in this repo.
- Do not touch the four horizontal `DiscoverSection` carousels (Recommended, Trending, Near You, This Weekend) or `DiscoverHeroCarousel` — out of scope per spec.
- Do not change the existing List/Map toggle's behavior — only extract its markup into the shared `ViewModeToggle` component.
- `TripCard`'s and `TripCardSkeleton`'s new `layout` prop must default to `"grid"` so every other existing call site (`DiscoverSection.tsx`, `MyTripsScreen.tsx`) is unaffected without passing the new prop.
- Do not use `FlatList`'s `numColumns` prop or change the outer `FlatList`'s `key` — the outer `FlatList`'s `ListHeaderComponent` carries the entire page (hero carousel, search, toggles, filters, sections), so remounting it would reset scroll position and the hero carousel on every toggle.

---

### Task 1: Extract `ViewModeToggle` and refactor the existing List/Map toggle

**Files:**
- Create: `mobile/src/components/ViewModeToggle.tsx`
- Modify: `mobile/src/screens/DiscoverScreen.tsx:267-294` (List/Map toggle markup), `mobile/src/screens/DiscoverScreen.tsx:639-659` (`viewModeRow`/`viewModeButton*` styles)

**Interfaces:**
- Produces: `ViewModeToggle<T extends string>` component, `import { ViewModeToggle, type ViewModeToggleOption } from "../components/ViewModeToggle";`. Props: `{ options: [ViewModeToggleOption<T>, ViewModeToggleOption<T>]; value: T; onChange: (value: T) => void }` where `ViewModeToggleOption<T> = { value: T; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }`.
- Produces (in `DiscoverScreen.tsx`): `styles.toggleRow` and `styles.toggleFlexItem`, a flex row that Task 4 adds a second child to.

- [ ] **Step 1: Create `ViewModeToggle.tsx`**

```tsx
import { useMemo, type ComponentProps } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface ViewModeToggleOption<T extends string> {
  value: T;
  icon: IconName;
  label: string;
}

export function ViewModeToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [ViewModeToggleOption<T>, ViewModeToggleOption<T>];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.button, active && styles.buttonActive]}
            onPress={() => onChange(option.value)}
          >
            <MaterialCommunityIcons name={option.icon} size={15} color={active ? colors.white : colors.ink} />
            <Text style={[styles.buttonText, active && styles.buttonTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.pill,
      padding: 3,
      gap: 3,
    },
    button: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
    },
    buttonActive: { backgroundColor: colors.primary },
    buttonText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
    buttonTextActive: { color: colors.white },
  });
}
```

- [ ] **Step 2: Import `ViewModeToggle` in `DiscoverScreen.tsx`**

Add near the other component imports (after the `TripCardSkeleton` import, `DiscoverScreen.tsx:26`):

```ts
import { ViewModeToggle, type ViewModeToggleOption } from "../components/ViewModeToggle";
```

- [ ] **Step 3: Add the `LIST_MAP_OPTIONS` constant and `onViewModeChange` handler**

Add above the `DiscoverScreen` function (after `DEFAULT_RADIUS_KM`, `DiscoverScreen.tsx:51`):

```ts
const LIST_MAP_OPTIONS: [ViewModeToggleOption<"list" | "map">, ViewModeToggleOption<"list" | "map">] = [
  { value: "list", icon: "view-list", label: "List" },
  { value: "map", icon: "map", label: "Map" },
];
```

Inside `DiscoverScreen`, after the `viewMode`/`mapUserLocation`/etc. state declarations (after `DiscoverScreen.tsx:92`, right after `const mapLocationRequested = useRef(false);`), add:

```ts
const onViewModeChange = (next: "list" | "map") => {
  setViewMode(next);
  if (next === "list") {
    setPanTarget(null);
    setPreviewTripId(null);
  }
};
```

- [ ] **Step 4: Replace the inline List/Map toggle markup with `ViewModeToggle`**

Replace `DiscoverScreen.tsx:267-294`:

```tsx
            <View style={styles.viewModeRow}>
              <TouchableOpacity
                style={[styles.viewModeButton, viewMode === "list" && styles.viewModeButtonActive]}
                onPress={() => {
                  setViewMode("list");
                  setPanTarget(null);
                  setPreviewTripId(null);
                }}
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

with:

```tsx
            <View style={styles.toggleRow}>
              <View style={styles.toggleFlexItem}>
                <ViewModeToggle options={LIST_MAP_OPTIONS} value={viewMode} onChange={onViewModeChange} />
              </View>
            </View>
```

(Task 4 adds a second `toggleFlexItem` child here for the Grid/List toggle.)

- [ ] **Step 5: Replace the now-unused styles**

Replace `DiscoverScreen.tsx:639-659`:

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
```

with:

```ts
    toggleRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 10, gap: 8 },
    toggleFlexItem: { flex: 1 },
```

- [ ] **Step 6: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. (The `MaterialCommunityIcons` import in `DiscoverScreen.tsx` stays in use elsewhere in the file, so it should not become an unused import — confirm no "unused import" error; if one appears, it means no other `MaterialCommunityIcons` usage remains in this exact edit region, which is not expected here since the file uses it extensively elsewhere.)

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/ViewModeToggle.tsx mobile/src/screens/DiscoverScreen.tsx
git commit -m "refactor: extract ViewModeToggle from Discover's List/Map control"
```

---

### Task 2: Add `layout` prop and horizontal variant to `TripCard`

**Files:**
- Modify: `mobile/src/components/TripCard.tsx`

**Interfaces:**
- Consumes: `Trip` type (`mobile/src/types/index.ts`), specifically `trip.owner.name`, `trip.owner.photoUrl`, `trip.seats`, `trip.seatsFilled` (used by the new list variant).
- Produces: `TripCard` accepts an additional optional prop `layout?: "grid" | "list"` (default `"grid"`). Grid output is byte-identical to today's card. Task 3 and Task 5 both pass this prop.

- [ ] **Step 1: Add the `layout` prop and branch into the list variant**

Replace the function signature (`TripCard.tsx:16-24`):

```tsx
export function TripCard({
  trip,
  onPress,
  onDelete,
}: {
  trip: Trip;
  onPress: () => void;
  onDelete?: () => void;
}) {
```

with:

```tsx
export function TripCard({
  trip,
  onPress,
  onDelete,
  layout = "grid",
}: {
  trip: Trip;
  onPress: () => void;
  onDelete?: () => void;
  layout?: "grid" | "list";
}) {
```

Immediately after `const { colors } = useTheme();` (`TripCard.tsx:26`), before the existing `return (`, insert the list-variant branch:

```tsx
  if (layout === "list") {
    return (
      <TouchableOpacity
        style={[styles.listCard, { backgroundColor: colors.surfaceElevated, shadowColor: colors.ink, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.listImageWrap}>
          {trip.images[0] && !imageFailed ? (
            <Image
              source={{ uri: optimizedImageUrl(trip.images[0], 200) }}
              style={styles.listImage}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <LinearGradient colors={["#1d4ed8", "#0f766e"]} style={[styles.listImage, styles.listImagePlaceholder]}>
              <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={40} color="rgba(255,255,255,0.35)" />
            </LinearGradient>
          )}
        </View>

        <View style={styles.listBody}>
          <View style={styles.listTitleRow}>
            <Text style={[styles.listTitle, { color: colors.ink }]} numberOfLines={1}>
              {trip.title}
            </Text>
            <View style={[styles.listStatusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
              <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
            </View>
          </View>

          <View style={styles.listMetaRow}>
            <MaterialCommunityIcons name="map-marker" size={13} color={colors.muted} />
            <Text style={[styles.listMetaText, { color: colors.muted }]} numberOfLines={1}>
              {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </Text>
          </View>

          <View style={styles.listMetaRow}>
            <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={14} color={colors.primary} />
            <Text style={[styles.mode, { color: colors.primary }]}>{travelModeText(trip.travelMode)}</Text>
          </View>

          <View style={styles.listFooterRow}>
            <View style={styles.listOwnerRow}>
              {trip.owner.photoUrl ? (
                <Image source={{ uri: optimizedImageUrl(trip.owner.photoUrl, 48) }} style={styles.listOwnerAvatar} />
              ) : (
                <View style={[styles.listOwnerAvatar, styles.listOwnerAvatarPlaceholder]}>
                  <Text style={styles.listOwnerInitial}>{trip.owner.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={[styles.listOwnerName, { color: colors.ink }]} numberOfLines={1}>
                {trip.owner.name}
              </Text>
            </View>
            <View style={styles.metaGroup}>
              <MaterialCommunityIcons name="account-multiple" size={14} color={colors.muted} />
              <Text style={[styles.meta, { color: colors.muted }]}>
                {trip.seatsFilled}/{trip.seats} joined
              </Text>
            </View>
          </View>
        </View>

        {onDelete && (
          <TouchableOpacity style={styles.listDeleteButton} onPress={onDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={15} color={colors.danger} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

```

Leave the existing `return (` block (the grid card) exactly as-is below this new branch — it becomes the `"grid"` (default) path.

- [ ] **Step 2: Add the new list-variant styles**

Add to the `StyleSheet.create({...})` call at the bottom of `TripCard.tsx` (after the existing `meta: { fontSize: 12 },` line, `TripCard.tsx:168`):

```ts
  listCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    marginBottom: 16,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  listImageWrap: { width: 96, height: 96, borderRadius: 16, overflow: "hidden" },
  listImage: { width: "100%", height: "100%" },
  listImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  listBody: { flex: 1, gap: 6 },
  listTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  listTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  listStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  listMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  listMetaText: { fontSize: 12, flexShrink: 1 },
  listFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  listOwnerRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  listOwnerAvatar: { width: 20, height: 20, borderRadius: 10 },
  listOwnerAvatarPlaceholder: { backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  listOwnerInitial: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  listOwnerName: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  listDeleteButton: { padding: 4 },
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/TripCard.tsx
git commit -m "feat: add list layout variant to TripCard"
```

---

### Task 3: Add matching `layout` prop to `TripCardSkeleton`

**Files:**
- Modify: `mobile/src/components/TripCardSkeleton.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TripCardSkeleton` accepts `layout?: "grid" | "list"` (default `"grid"`). Task 5 passes this when rendering loading placeholders.

- [ ] **Step 1: Replace the component body**

Replace the full file content (`TripCardSkeleton.tsx`) with:

```tsx
import { StyleSheet, View } from "react-native";
import { Skeleton } from "./theme/Skeleton";
import { useTheme } from "../theme/ThemeContext";

// Mirrors TripCard's shape (image + title row + meta row) so the loading
// state reads as "trip cards are coming" instead of a blank list.
export function TripCardSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  const { colors } = useTheme();

  if (layout === "list") {
    return (
      <View style={[styles.listCard, { backgroundColor: colors.surfaceElevated }]}>
        <Skeleton style={styles.listImage} />
        <View style={styles.listBody}>
          <Skeleton style={styles.line} />
          <Skeleton style={styles.lineShort} />
          <Skeleton style={styles.lineShort} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]}>
      <Skeleton style={styles.image} />
      <View style={styles.body}>
        <Skeleton style={styles.line} />
        <Skeleton style={styles.lineShort} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: "hidden", marginBottom: 16 },
  image: { width: "100%", height: 170, borderRadius: 0 },
  body: { padding: 14, paddingTop: 10, gap: 8 },
  line: { height: 14, width: "70%" },
  lineShort: { height: 12, width: "45%" },
  listCard: { flexDirection: "row", alignItems: "flex-start", borderRadius: 20, padding: 12, gap: 12, marginBottom: 16 },
  listImage: { width: 96, height: 96, borderRadius: 16 },
  listBody: { flex: 1, gap: 8, justifyContent: "center" },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/TripCardSkeleton.tsx
git commit -m "feat: add list layout variant to TripCardSkeleton"
```

---

### Task 4: Wire `viewLayout` state, persistence, and the Grid/List toggle into `DiscoverScreen`

**Files:**
- Modify: `mobile/src/screens/DiscoverScreen.tsx`

**Interfaces:**
- Consumes: `ViewModeToggle`/`ViewModeToggleOption` from Task 1 (`styles.toggleRow`/`styles.toggleFlexItem`, and the `<View style={styles.toggleRow}>` block Task 1 left with one child).
- Produces: `viewLayout: "grid" | "list"` state, `setViewLayout: (next: "grid" | "list") => void` setter — both consumed by Task 5.

- [ ] **Step 1: Import `AsyncStorage`**

Add near the top of `DiscoverScreen.tsx`, after the `useQueryClient` import (`DiscoverScreen.tsx:2`):

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
```

- [ ] **Step 2: Add the `VIEW_LAYOUT_STORAGE_KEY` and `GRID_LIST_OPTIONS` constants**

Add directly below the `LIST_MAP_OPTIONS` constant from Task 1:

```ts
const VIEW_LAYOUT_STORAGE_KEY = "discover_view_layout";

const GRID_LIST_OPTIONS: [ViewModeToggleOption<"grid" | "list">, ViewModeToggleOption<"grid" | "list">] = [
  { value: "grid", icon: "view-grid-outline", label: "Grid" },
  { value: "list", icon: "view-agenda-outline", label: "List" },
];
```

- [ ] **Step 3: Add `viewLayout` state, hydration effect, and setter**

Inside `DiscoverScreen`, directly after the `onViewModeChange` function added in Task 1, add:

```ts
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

- [ ] **Step 4: Add the Grid/List toggle next to the List/Map toggle**

Replace the `toggleRow` block Task 1 left (currently one `toggleFlexItem` child):

```tsx
            <View style={styles.toggleRow}>
              <View style={styles.toggleFlexItem}>
                <ViewModeToggle options={LIST_MAP_OPTIONS} value={viewMode} onChange={onViewModeChange} />
              </View>
            </View>
```

with:

```tsx
            <View style={styles.toggleRow}>
              <View style={styles.toggleFlexItem}>
                <ViewModeToggle options={LIST_MAP_OPTIONS} value={viewMode} onChange={onViewModeChange} />
              </View>
              {viewMode === "list" && (
                <View style={styles.toggleFlexItem}>
                  <ViewModeToggle options={GRID_LIST_OPTIONS} value={viewLayout} onChange={setViewLayout} />
                </View>
              )}
            </View>
```

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/DiscoverScreen.tsx
git commit -m "feat: add Grid/List view-layout state and toggle to Discover"
```

---

### Task 5: Row-group the trip list, wire `layout` into `TripCard`/`TripCardSkeleton`, and add the fade transition

**Files:**
- Modify: `mobile/src/screens/DiscoverScreen.tsx`

**Interfaces:**
- Consumes: `viewLayout`/`setViewLayout` from Task 4; `layout` prop on `TripCard` (Task 2) and `TripCardSkeleton` (Task 3).
- Produces: final feature behavior — no further tasks depend on this one.

- [ ] **Step 1: Import `Animated` and destructure `windowWidth`**

Add `Animated` to the `react-native` import list at the top of `DiscoverScreen.tsx` (`DiscoverScreen.tsx:3-16`) — insert `Animated,` alphabetically before `FlatList,`:

```ts
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
```

Replace the existing window-dimensions line (`DiscoverScreen.tsx:68`):

```ts
  const { height: windowHeight } = useWindowDimensions();
```

with:

```ts
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
```

- [ ] **Step 2: Add the row-grouping and fade-animation logic**

Directly after the `data, isLoading, isFetching` destructure from `useTrips` (`DiscoverScreen.tsx:138-145`), add:

```ts
  const rowSize = viewLayout === "list" ? 1 : windowWidth < 360 ? 1 : 2;

  const rows = useMemo(() => {
    const items = viewMode === "list" ? (data?.items ?? []) : [];
    const grouped: (typeof items)[number][][] = [];
    for (let i = 0; i < items.length; i += rowSize) {
      grouped.push(items.slice(i, i + rowSize));
    }
    return grouped;
  }, [data, viewMode, rowSize]);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isFirstLayoutRender = useRef(true);

  useEffect(() => {
    if (isFirstLayoutRender.current) {
      isFirstLayoutRender.current = false;
      return;
    }
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [viewLayout, fadeAnim]);
```

`useMemo` is already imported in `DiscoverScreen.tsx` (used for `styles`), so no new import is needed for it.

- [ ] **Step 3: Switch the outer `FlatList` from flat trip data to grouped rows**

Replace the `data`/`keyExtractor` props on the outer `FlatList` (`DiscoverScreen.tsx:222-225`):

```tsx
        data={viewMode === "list" ? (data?.items ?? []) : []}
        keyExtractor={(item) => item.id}
```

with:

```tsx
        data={rows}
        keyExtractor={(row) => row.map((t) => t.id).join("-")}
```

- [ ] **Step 4: Replace `renderItem` to render a row of 1 or 2 `TripCard`s**

Replace `DiscoverScreen.tsx:512-518`:

```tsx
        renderItem={({ item }) =>
          isLoading ? null : (
            <View style={styles.horizontalInset}>
              <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
            </View>
          )
        }
```

with:

```tsx
        renderItem={({ item: row }) =>
          isLoading ? null : (
            <Animated.View
              style={[viewLayout === "grid" ? styles.gridRow : styles.horizontalInset, { opacity: fadeAnim }]}
            >
              {row.map((trip) => (
                <View key={trip.id} style={viewLayout === "grid" ? styles.gridCell : styles.listCell}>
                  <TripCard
                    trip={trip}
                    layout={viewLayout}
                    onPress={() => navigation.navigate("TripDetail", { tripId: trip.id })}
                  />
                </View>
              ))}
              {viewLayout === "grid" && row.length === 1 && <View style={styles.gridCell} />}
            </Animated.View>
          )
        }
```

- [ ] **Step 5: Make the loading-skeleton block in the header respect `viewLayout`**

Replace `DiscoverScreen.tsx:482-488`:

```tsx
            {viewMode === "list" && isLoading && (
              <View style={styles.horizontalInset}>
                <TripCardSkeleton />
                <TripCardSkeleton />
                <TripCardSkeleton />
              </View>
            )}
```

with:

```tsx
            {viewMode === "list" && isLoading && (
              viewLayout === "grid" ? (
                <>
                  <View style={styles.gridRow}>
                    <View style={styles.gridCell}>
                      <TripCardSkeleton layout="grid" />
                    </View>
                    <View style={styles.gridCell}>
                      <TripCardSkeleton layout="grid" />
                    </View>
                  </View>
                  <View style={styles.gridRow}>
                    <View style={styles.gridCell}>
                      <TripCardSkeleton layout="grid" />
                    </View>
                    <View style={styles.gridCell} />
                  </View>
                </>
              ) : (
                <View style={styles.horizontalInset}>
                  <TripCardSkeleton layout="list" />
                  <TripCardSkeleton layout="list" />
                  <TripCardSkeleton layout="list" />
                </View>
              )
            )}
```

- [ ] **Step 6: Add the `gridRow`/`gridCell`/`listCell` styles**

Add to the `createStyles` `StyleSheet.create({...})` call, directly after `horizontalInset: { paddingHorizontal: 16 },` (`DiscoverScreen.tsx:733`):

```ts
    gridRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
    gridCell: { flex: 1 },
    listCell: { flex: 1 },
```

- [ ] **Step 7: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual QA pass**

Following the spec's Testing Plan section, in a running Expo instance (Web and/or a device):

1. Open Discover in List/Map = "List" mode. Confirm the Grid/List toggle appears next to it; switch to "Map" and confirm the Grid/List toggle disappears; switch back to "List" and confirm it reappears with the same selection it had before.
2. With Grid selected, confirm 2 columns on a normal-width viewport, and that an odd trailing trip leaves an empty half-width gap rather than stretching full width.
3. Apply a filter (a travel-mode chip, or Near Me) in both Grid and List — confirm the same trips appear in both, just laid out differently.
4. Switch Grid ↔ List after scrolling partway down the page — confirm scroll position, the hero carousel, and search text are all undisturbed (this is the specific regression the row-grouping approach avoids).
5. Trigger the loading state (e.g. pull-to-refresh or a fresh filter) in both Grid and List — confirm skeletons match the selected layout.
6. Close the app fully and reopen it — confirm the last-selected layout is restored.
7. On `MyTripsScreen`, confirm cards still render exactly as before (no `layout` prop is passed there, so they use the `"grid"` default, i.e. today's appearance).

- [ ] **Step 9: Commit**

```bash
git add mobile/src/screens/DiscoverScreen.tsx
git commit -m "feat: row-group Discover's trip list into Grid/List layouts with fade transition"
```
