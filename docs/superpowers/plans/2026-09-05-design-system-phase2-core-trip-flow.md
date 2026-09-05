# Triply Design System Phase 2 (Core Trip Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Phase 1 design-system foundation to Discover, My Trips, Trip Details, and the shared `TripCard` component — consolidating their already-token-adjacent hardcoded colors onto `mobile/src/theme/tokens.ts`, reusing existing shared components where they fit, and adding a gradient header band to Discover.

**Architecture:** Two small foundation extensions (new token color pairs, a `variant` prop on `PrimaryButton`) land first, then four screen/component files are token-ized one at a time, each a self-contained, independently reviewable diff. No new files, no new shared components — everything reuses Phase 1's `mobile/src/theme/tokens.ts` and `mobile/src/components/theme/`.

**Tech Stack:** React Native (Expo), TypeScript, `expo-linear-gradient`, `@expo/vector-icons`. No test framework in this repo — verification is `npx tsc --noEmit` plus a manual code-trace confirming zero behavior change.

**Spec:** docs/superpowers/specs/2026-09-05-design-system-phase2-core-trip-flow-design.md

## Global Constraints

- **Zero behavior changes.** Every `useState`, handler, query/mutation hook call, and conditional-rendering branch in `TripCard.tsx`, `DiscoverScreen.tsx`, `MyTripsScreen.tsx`, and `TripDetailScreen.tsx` must be byte-identical before and after. Only JSX structure needed to apply new styling (e.g. wrapping the Discover header in `GradientBackground`, swapping a `TouchableOpacity` for `PrimaryButton`) and `StyleSheet`/inline-color values change.
- **Token substitution rule:** replace a hardcoded color/radius value with its token equivalent ONLY when the literal value already exactly matches a token (e.g. `"#0f766e"` → `COLORS.primary`, `"#e2e8f0"` → `COLORS.border`). A literal that does NOT exactly match any token (e.g. `"#334155"`, `"#f1f5f9"`, `"#cbd5e1"`) stays a literal — do not "round" it to the nearest token, and do not introduce new tokens for it. This preserves the "no visual change" constraint exactly.
- **No new components, no new files.** Every task modifies an existing file. `SelectableChip` is NOT used for Discover's filter chips, the FAB, or My Trips' segmented tab row — those keep their bespoke shapes (per spec Non-goals).
- **`PrimaryButton`'s existing (no-`variant`) call sites keep rendering identically** — `variant` defaults to `"solid"`, which must produce pixel-identical output to the current unconditional-solid implementation.

---

### Task 1: Token additions + PrimaryButton outline variant

**Files:**
- Modify: `mobile/src/theme/tokens.ts`
- Modify: `mobile/src/components/theme/PrimaryButton.tsx`

**Interfaces:**
- Produces: `COLORS.dangerBg`, `COLORS.dangerBorderLight`, `COLORS.successBg`, `COLORS.successBorderLight`, `COLORS.warningBg`, `COLORS.warningText` (all `string`, hex values below) — consumed by Task 5 (`TripDetailScreen.tsx`) and Task 3 (`DiscoverScreen.tsx`).
- Produces: `PrimaryButton`'s new optional prop `variant?: "solid" | "outline"` (default `"solid"`) — consumed by Task 5.

- [ ] **Step 1: Add the three color pairs to `tokens.ts`**

In `mobile/src/theme/tokens.ts`, replace the `COLORS` export:

```ts
export const COLORS = {
  ink: "#0f172a",
  muted: "#64748b",
  mutedLight: "#94a3b8",
  border: "#e2e8f0",
  fieldBg: "#f8fafc",
  cardBg: "rgba(255,255,255,0.96)",
  cardBorder: "rgba(255,255,255,0.5)",
  primary: "#0f766e",
  danger: "#dc2626",
  white: "#ffffff",
  dangerBg: "#fef2f2",
  dangerBorderLight: "#fecaca",
  successBg: "#ecfdf5",
  successBorderLight: "#a7f3d0",
  warningBg: "#fef9c3",
  warningText: "#854d0e",
};
```

Everything else in the file (`GRADIENT_PRIMARY`, `RADIUS`, `SHADOW`, `TYPE`) is unchanged.

- [ ] **Step 2: Verify the file still type-checks**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors (the file has no runtime tests; this is a pure data addition).

- [ ] **Step 3: Add the `variant` prop to `PrimaryButton`**

Replace the full contents of `mobile/src/components/theme/PrimaryButton.tsx`:

```tsx
import type { ComponentProps } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS, SHADOW } from "../../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function PrimaryButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
  style,
  variant = "solid",
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: "solid" | "outline";
}) {
  const isOutline = variant === "outline";
  const contentColor = isOutline ? COLORS.primary : COLORS.white;

  return (
    <TouchableOpacity
      style={[styles.button, isOutline && styles.buttonOutline, disabled && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.9}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <>
          <Text style={[styles.text, isOutline && styles.textOutline]}>{label}</Text>
          {icon && <MaterialCommunityIcons name={icon} size={18} color={contentColor} />}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.field,
    paddingVertical: 15,
    ...SHADOW.button,
  },
  buttonOutline: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  buttonDisabled: { opacity: 0.6 },
  text: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  textOutline: { color: COLORS.primary },
});
```

Note for later tasks: this fixes the icon to render AFTER the label (never before), same as the current Create Trip usage. Task 5 converts Trip Details buttons whose original hand-written JSX places the icon BEFORE the label — adopting `PrimaryButton` moves the icon to the trailing position for those buttons. This is an accepted, deliberate consequence of reusing the shared component (matching how `PrimaryButton` already behaves everywhere else), not a defect to work around.

- [ ] **Step 4: Verify no existing call site breaks**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. Then run: `grep -rn "PrimaryButton" mobile/src/screens/CreateTripScreen.tsx` and confirm none of its call sites pass a `variant` prop — they must keep defaulting to `"solid"` and render identically to before this change.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/theme/tokens.ts mobile/src/components/theme/PrimaryButton.tsx
git commit -m "Add danger/success/warning tokens and a PrimaryButton outline variant"
```

---

### Task 2: Token-ize `TripCard.tsx`

**Files:**
- Modify: `mobile/src/components/TripCard.tsx`

**Interfaces:**
- Consumes: `COLORS` from `mobile/src/theme/tokens.ts` (Task 1, unchanged fields only — this task does not use the new color pairs).
- No new exports; `TripCard`'s props (`trip`, `onPress`, `onDelete`) are unchanged.

- [ ] **Step 1: Replace the full file contents**

Replace all of `mobile/src/components/TripCard.tsx` with:

```tsx
import { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Trip } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { TRIP_STATUS_COLORS, TRIP_STATUS_LABELS } from "../utils/tripStatus";
import { COLORS } from "../theme/tokens";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripCard({
  trip,
  onPress,
  onDelete,
}: {
  trip: Trip;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.imageWrap}>
        {trip.images[0] && !imageFailed ? (
          <Image source={{ uri: trip.images[0] }} style={styles.image} onError={() => setImageFailed(true)} />
        ) : (
          <LinearGradient colors={["#1d4ed8", "#0f766e"]} style={[styles.image, styles.imagePlaceholder]}>
            <MaterialCommunityIcons
              name={TRAVEL_MODE_ICONS[trip.travelMode]}
              size={104}
              color="rgba(255,255,255,0.22)"
              style={styles.imagePlaceholderIcon}
            />
          </LinearGradient>
        )}

        <View style={[styles.statusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
          <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
        </View>

        {onDelete && (
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={15} color={COLORS.white} />
          </TouchableOpacity>
        )}

        <LinearGradient colors={["transparent", "rgba(15,23,42,0.88)"]} style={styles.imageScrim}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title}
          </Text>
          <View style={styles.overlayMetaRow}>
            <MaterialCommunityIcons name="map-marker" size={13} color={COLORS.border} />
            <Text style={styles.overlayMeta} numberOfLines={1}>
              {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
              {typeof trip.distanceKm === "number"
                ? ` · ${trip.distanceKm < 1 ? "<1" : Math.round(trip.distanceKm)} km away`
                : ""}
            </Text>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.body}>
        <View style={styles.modeRow}>
          <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={14} color={COLORS.primary} />
          <Text style={styles.mode}>{travelModeText(trip.travelMode)}</Text>
        </View>
        <View style={styles.rowBetween}>
          <View style={styles.metaGroup}>
            <MaterialCommunityIcons name="account-multiple" size={14} color={COLORS.muted} />
            <Text style={styles.meta}>
              {trip.seatsFilled}/{trip.seats} joined
            </Text>
          </View>
          <View style={styles.metaGroup}>
            <MaterialCommunityIcons
              name={trip.isLiked ? "heart" : "heart-outline"}
              size={14}
              color={trip.isLiked ? COLORS.danger : COLORS.muted}
            />
            <Text style={styles.meta}>{trip._count.likes}</Text>
            <MaterialCommunityIcons name="comment-outline" size={14} color={COLORS.muted} style={styles.metaIconSpacer} />
            <Text style={styles.meta}>{trip._count.comments}</Text>
            <MaterialCommunityIcons name="hand-front-right" size={14} color={COLORS.muted} style={styles.metaIconSpacer} />
            <Text style={styles.meta}>{trip._count.joinRequests}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  imageWrap: { width: "100%", height: 170 },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { alignItems: "flex-end", justifyContent: "flex-end", overflow: "hidden" },
  imagePlaceholderIcon: { marginRight: -18, marginBottom: -18 },
  imageScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 28,
    paddingBottom: 12,
  },
  statusPill: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { color: COLORS.white, fontSize: 10, fontWeight: "700" },
  deleteButton: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: 999,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: 14, paddingTop: 10, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 17, fontWeight: "700", color: COLORS.white },
  overlayMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  overlayMeta: { fontSize: 12, color: COLORS.border, flexShrink: 1 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  mode: { fontSize: 12, fontWeight: "600", color: COLORS.primary },
  metaGroup: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaIconSpacer: { marginLeft: 6 },
  meta: { fontSize: 12, color: COLORS.muted },
});
```

Note: `card.borderRadius: 20`, the card's shadow (`shadowOpacity: 0.08`, `shadowRadius: 16`, `shadowOffset.height: 6`, `elevation: 3`), the `deleteButton`'s `rgba(15,23,42,0.6)` overlay, and both `LinearGradient` two-stop color arrays are deliberately left as literals — none exactly match a token, and the spec requires no visual change (see Global Constraints).

- [ ] **Step 2: Verify with tsc**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual diff check**

Run: `git diff mobile/src/components/TripCard.tsx` and confirm every changed line is either the new `import { COLORS } ...` line or a color-value substitution listed above — no JSX structure, prop, or logic changed.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/TripCard.tsx
git commit -m "Token-ize TripCard colors (no visual change)"
```

---

### Task 3: Discover screen — token-ize + gradient header band

**Files:**
- Modify: `mobile/src/screens/DiscoverScreen.tsx`

**Interfaces:**
- Consumes: `GradientBackground` from `mobile/src/components/theme/GradientBackground.tsx` (Phase 1, props `{ children, style }`); `COLORS`, `RADIUS` from `mobile/src/theme/tokens.ts` (Task 1).
- No changes to `DiscoverScreen`'s own exports or navigation props.

- [ ] **Step 1: Replace the full file contents**

Replace all of `mobile/src/screens/DiscoverScreen.tsx` with:

```tsx
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useTrips } from "../api/trips";
import { useMe } from "../api/users";
import { TRAVEL_MODES, type TravelMode } from "../types";
import { TripCard } from "../components/TripCard";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { getCurrentLocationOrThrow } from "../utils/currentLocation";
import { GradientBackground } from "../components/theme/GradientBackground";
import { COLORS, RADIUS } from "../theme/tokens";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "Discover">,
  NativeStackScreenProps<AppStackParamList>
>;

const RADIUS_OPTIONS_KM = [10, 25, 50, 100];
const DEFAULT_RADIUS_KM = 50;

export function DiscoverScreen({ navigation }: Props) {
  const [search, setSearch] = useState("");
  const [travelMode, setTravelMode] = useState<TravelMode | undefined>();
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [locating, setLocating] = useState(false);
  const [radiusSheetVisible, setRadiusSheetVisible] = useState(false);
  const [locationDeniedVisible, setLocationDeniedVisible] = useState(false);

  const { data: me } = useMe();

  const { data, isLoading, isFetching, refetch } = useTrips({
    search: search || undefined,
    travelMode,
    lat: nearMe?.lat,
    lng: nearMe?.lng,
    radiusKm: nearMe ? radiusKm : undefined,
  });

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

  const clearNearMe = () => {
    setNearMe(null);
    setRadiusSheetVisible(false);
  };

  const onNearMePress = () => {
    if (nearMe) {
      setRadiusSheetVisible(true);
    } else {
      activateNearMe();
    }
  };

  return (
    <View style={styles.container}>
      <GradientBackground style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Hi, {me?.name?.split(" ")[0] ?? "there"} 👋</Text>
            <Text style={styles.greetingSub}>Where to next?</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("Profile")}>
            {me?.photoUrl ? (
              <Image source={{ uri: me.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{(me?.name ?? "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </GradientBackground>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={COLORS.mutedLight} />
        <TextInput
          style={styles.search}
          placeholder="Search trips, destinations..."
          placeholderTextColor={COLORS.mutedLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
        data={["NEAR_ME" as const, ...TRAVEL_MODES]}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          if (item === "NEAR_ME") {
            return (
              <TouchableOpacity
                style={[styles.chip, nearMe && styles.chipActive]}
                onPress={onNearMePress}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={nearMe ? COLORS.white : COLORS.primary} />
                ) : (
                  <MaterialCommunityIcons name="map-marker" size={15} color={nearMe ? COLORS.white : "#334155"} />
                )}
                <Text style={[styles.chipText, nearMe && styles.chipTextActive]}>
                  {nearMe ? `Near me · ${radiusKm} km` : "Near me"}
                </Text>
                {nearMe && <MaterialCommunityIcons name="chevron-down" size={14} color={COLORS.white} />}
              </TouchableOpacity>
            );
          }
          const active = travelMode === item;
          return (
            <TouchableOpacity
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setTravelMode(active ? undefined : item)}
            >
              <MaterialCommunityIcons
                name={TRAVEL_MODE_ICONS[item]}
                size={15}
                color={active ? COLORS.white : "#334155"}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{travelModeText(item)}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={data?.items ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons
                name={nearMe ? "map-marker-radius-outline" : "compass-outline"}
                size={40}
                color="#cbd5e1"
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
          }
          renderItem={({ item }) => (
            <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateTrip")} activeOpacity={0.9}>
        <MaterialCommunityIcons name="plus" size={18} color={COLORS.white} />
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
              <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.danger} />
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
              <MaterialCommunityIcons name="map-marker-off-outline" size={26} color={COLORS.danger} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fieldBg },
  header: { paddingBottom: 20 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  greeting: { fontSize: 21, fontWeight: "700", color: COLORS.white },
  greetingSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontWeight: "700", fontSize: 16 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  search: { flex: 1, paddingVertical: 12, fontSize: 14, color: COLORS.ink },
  filterRow: { height: 46, marginTop: 12, flexGrow: 0 },
  filterRowContent: { paddingHorizontal: 16, paddingRight: 24, alignItems: "center", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, color: "#334155", fontWeight: "500" },
  chipTextActive: { color: COLORS.white, fontWeight: "700" },
  list: { padding: 16, paddingBottom: 110 },
  emptyWrap: { alignItems: "center", marginTop: 48, gap: 10 },
  empty: { textAlign: "center", color: COLORS.mutedLight, fontSize: 13, paddingHorizontal: 32 },
  emptyClearLink: { color: COLORS.primary, fontSize: 13, fontWeight: "700", marginTop: 2 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: COLORS.ink, textAlign: "center" },
  sheetSubtitle: { fontSize: 13, color: COLORS.muted, textAlign: "center", marginTop: 6, lineHeight: 18 },
  radiusOptionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "center" },
  radiusOption: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.fieldBg,
  },
  radiusOptionActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  radiusOptionText: { fontSize: 13, fontWeight: "600", color: "#334155" },
  radiusOptionTextActive: { color: COLORS.white },
  clearFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.dangerBg,
  },
  clearFilterText: { color: COLORS.danger, fontWeight: "700", fontSize: 13 },
  permissionIconWrap: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.dangerBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  permissionButtonRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  permissionCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#f1f5f9",
  },
  permissionCancelText: { color: "#334155", fontWeight: "700", fontSize: 13 },
  permissionRetryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.primary,
  },
  permissionRetryText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: { color: COLORS.white, fontWeight: "700", fontSize: 14 },
});
```

Notes on decisions baked into the code above (so the reviewer doesn't flag them as gaps):
- `header`/`headerRow` split: `header` is the new `GradientBackground`'s own style (just `paddingBottom: 20`, matching Create Trip's hero pattern), `headerRow` is the original `header` style (the flex row), renamed because `GradientBackground` needs its own outer style slot.
- `greeting`/`greetingSub` become white/translucent-white per the spec's explicit instruction (text now sits on a gradient); `avatar`/`avatarPlaceholder`/`avatarInitial` are UNCHANGED in appearance (still `COLORS.primary` circle with white initial) — the spec says the avatar itself stays as today.
- The FAB's shadow (`shadowColor: "#0f172a"`, `shadowOpacity: 0.25`, `shadowRadius: 10`, `shadowOffset.height: 4`) is kept as a literal, NOT replaced with `SHADOW.button` — on inspection those two shadows differ enough (different shadow color, opacity, radius, offset) that substituting would be a visible change, contradicting the zero-visual-change constraint. Only the FAB's `backgroundColor` and `borderRadius` are token-ized.
- `"#334155"`, `"#f1f5f9"`, `"#cbd5e1"` appear repeatedly and are intentionally left as literals — none is an exact match for any token (see Global Constraints).

- [ ] **Step 2: Verify with tsc**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual diff check**

Run: `git diff mobile/src/screens/DiscoverScreen.tsx` and confirm: (a) every `useState`, the `useTrips`/`useMe` calls, `activateNearMe`/`clearNearMe`/`onNearMePress` are unchanged; (b) the only JSX structural change is the `GradientBackground` wrapper + the `header`/`headerRow` split; (c) every other change is a color/radius literal replaced by its exact token per the rule above.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/DiscoverScreen.tsx
git commit -m "Add gradient header band and token-ize Discover screen"
```

---

### Task 4: Token-ize `MyTripsScreen.tsx`

**Files:**
- Modify: `mobile/src/screens/MyTripsScreen.tsx`

**Interfaces:**
- Consumes: `COLORS` from `mobile/src/theme/tokens.ts` (Task 1).
- No changes to `MyTripsScreen`'s exports or navigation props.

- [ ] **Step 1: Replace the full file contents**

Replace all of `mobile/src/screens/MyTripsScreen.tsx` with:

```tsx
import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList, AppTabParamList } from "../navigation/types";
import { useBookmarkedTrips, useDeleteTrip, useMyTrips } from "../api/trips";
import { TripCard } from "../components/TripCard";
import type { Trip } from "../types";
import { Alert } from "../utils/alert";
import { COLORS } from "../theme/tokens";

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, "MyTrips">,
  NativeStackScreenProps<AppStackParamList>
>;

export function MyTripsScreen({ navigation }: Props) {
  const [tab, setTab] = useState<"mine" | "saved">("mine");
  const myTrips = useMyTrips();
  const savedTrips = useBookmarkedTrips();
  const deleteTrip = useDeleteTrip();

  const data = tab === "mine" ? myTrips.data : savedTrips.data;
  const isLoading = tab === "mine" ? myTrips.isLoading : savedTrips.isLoading;

  const confirmDelete = (trip: Trip) => {
    Alert.alert("Delete this trip?", `"${trip.title}" will be permanently deleted. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteTrip.mutate(trip.id, {
            onError: () => Alert.alert("Couldn't delete trip", "Please try again"),
          }),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === "mine" && styles.tabActive]} onPress={() => setTab("mine")}>
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>My Trips</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "saved" && styles.tabActive]} onPress={() => setTab("saved")}>
          <Text style={[styles.tabText, tab === "saved" && styles.tabTextActive]}>Saved</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={data ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === "mine" ? "You haven't created any trips yet." : "You haven't saved any trips yet."}
            </Text>
          }
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onPress={() => navigation.navigate("TripDetail", { tripId: item.id })}
              onDelete={tab === "mine" ? () => confirmDelete(item) : undefined}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fieldBg },
  tabRow: { flexDirection: "row", padding: 12, gap: 8 },
  tab: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { color: "#334155", fontWeight: "600" },
  tabTextActive: { color: COLORS.white },
  list: { padding: 12 },
  empty: { textAlign: "center", color: COLORS.mutedLight, marginTop: 40 },
});
```

`tab`'s `borderRadius: 10` stays a literal (not an exact match for any `RADIUS` token); `tabText`'s `"#334155"` stays a literal per the same rule.

- [ ] **Step 2: Verify with tsc**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual diff check**

Run: `git diff mobile/src/screens/MyTripsScreen.tsx` and confirm every changed line is the new import or a color substitution — `useState`, the three query/mutation hooks, `confirmDelete`, and the tab-switching logic are untouched.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/MyTripsScreen.tsx
git commit -m "Token-ize MyTrips screen (no visual change)"
```

---

### Task 5: Trip Details — token-ize + swap action buttons to PrimaryButton

**Files:**
- Modify: `mobile/src/screens/TripDetailScreen.tsx`

**Interfaces:**
- Consumes: `PrimaryButton` from `mobile/src/components/theme/PrimaryButton.tsx` (Task 1's new `variant` prop); `COLORS` from `mobile/src/theme/tokens.ts` (Task 1, including the new `dangerBg`/`dangerBorderLight`/`successBg`/`successBorderLight`/`warningBg`/`warningText` pairs).
- No changes to `TripDetailScreen`'s route props, any of its 6 query/mutation hooks, or the `actionSlot` branching logic (`isOwner` / `isMember` / `myRequest.status` / `trip.joinType` / `trip.status`).

- [ ] **Step 1: Replace the full file contents**

Replace all of `mobile/src/screens/TripDetailScreen.tsx` with:

```tsx
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import {
  useAddComment,
  useBookmarkTrip,
  useLikeTrip,
  useTrip,
  useTripComments,
  useUpdateTripImages,
  useUploadTripImages,
} from "../api/trips";
import { useExpressInterest } from "../api/joinRequests";
import { useMyJoinRequests } from "../api/joinRequests";
import { useGroupByTrip } from "../api/groups";
import { Alert } from "../utils/alert";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { TRIP_STATUS_COLORS, TRIP_STATUS_LABELS } from "../utils/tripStatus";
import { PrimaryButton } from "../components/theme/PrimaryButton";
import { COLORS } from "../theme/tokens";

type Props = NativeStackScreenProps<AppStackParamList, "TripDetail">;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const me = useAuthStore((s) => s.user);
  const { data: trip, isLoading } = useTrip(tripId);
  const { data: comments } = useTripComments(tripId);
  const { data: myRequests } = useMyJoinRequests();
  const { data: group } = useGroupByTrip(tripId);
  const [commentText, setCommentText] = useState("");
  const [editingPhotos, setEditingPhotos] = useState(false);
  const [editImages, setEditImages] = useState<string[]>([]);
  const [newPhotoAssets, setNewPhotoAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [heroWidth, setHeroWidth] = useState(width);
  const heroHeight = isWeb ? Math.min(Math.round(heroWidth / 2.4), 380) : 260;

  const likeTrip = useLikeTrip();
  const bookmarkTrip = useBookmarkTrip();
  const expressInterest = useExpressInterest(tripId);
  const addComment = useAddComment(tripId);
  const uploadImages = useUploadTripImages();
  const updateTripImages = useUpdateTripImages();

  if (isLoading || !trip) {
    return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;
  }

  const isOwner = trip.ownerId === me?.id;
  const myRequest = myRequests?.find((r) => r.tripId === tripId);
  const isMember = !!group?.members.some((m) => m.userId === me?.id);

  const startEditingPhotos = () => {
    setEditImages(trip.images);
    setNewPhotoAssets([]);
    setEditingPhotos(true);
  };

  const pickNewPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.7,
    });
    if (!result.canceled) {
      setNewPhotoAssets((prev) => [...prev, ...result.assets]);
    }
  };

  const savePhotos = async () => {
    try {
      const uploadedUrls = newPhotoAssets.length > 0 ? await uploadImages.mutateAsync(newPhotoAssets) : [];
      await updateTripImages.mutateAsync({ tripId, input: [...editImages, ...uploadedUrls] });
      setEditingPhotos(false);
    } catch (err: any) {
      Alert.alert("Couldn't save photos", err?.response?.data?.error ?? "Please try again");
    }
  };

  const isSavingPhotos = uploadImages.isPending || updateTripImages.isPending;

  const onExpressInterest = () => {
    expressInterest.mutate(undefined, {
      onSuccess: (req) =>
        Alert.alert(
          req.status === "APPROVED" ? "You're in!" : "Request sent",
          req.status === "APPROVED"
            ? "This trip is open — you've been added to the group."
            : "The organizer will review your request soon."
        ),
      onError: (err: any) => Alert.alert("Couldn't send request", err?.response?.data?.error ?? "Try again"),
    });
  };

  const onSendComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate(commentText.trim(), { onSuccess: () => setCommentText("") });
  };

  let actionSlot: React.ReactNode;
  if (isOwner) {
    actionSlot = (
      <View style={styles.ownerActions}>
        <PrimaryButton
          label="Edit Trip"
          icon="pencil-outline"
          onPress={() => navigation.navigate("CreateTrip", { tripId })}
        />
        <View style={styles.stickyRow}>
          <PrimaryButton
            variant="outline"
            style={styles.stickyFlex}
            label={`Requests (${trip._count.joinRequests})`}
            icon="account-group-outline"
            onPress={() => navigation.navigate("JoinRequestsInbox", { tripId })}
          />
          {group && (
            <PrimaryButton
              variant="outline"
              style={styles.stickyFlex}
              label="Group Chat"
              icon="chat-processing-outline"
              onPress={() => navigation.navigate("GroupChat", { groupId: group.id, tripTitle: trip.title })}
            />
          )}
        </View>
      </View>
    );
  } else if (isMember && group) {
    actionSlot = (
      <PrimaryButton
        label="Open Group Chat"
        icon="chat-processing-outline"
        onPress={() => navigation.navigate("GroupChat", { groupId: group.id, tripTitle: trip.title })}
      />
    );
  } else if (myRequest?.status === "PENDING") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <MaterialCommunityIcons name="clock-outline" size={16} color={COLORS.warningText} />
        <Text style={styles.pendingText}>Your request is pending approval</Text>
      </View>
    );
  } else if (myRequest?.status === "REJECTED") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <Text style={styles.pendingText}>Your request wasn't approved for this trip</Text>
      </View>
    );
  } else if (trip.joinType === "INVITE_ONLY") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <MaterialCommunityIcons name="lock-outline" size={16} color={COLORS.warningText} />
        <Text style={styles.pendingText}>Invite-only — ask the organizer to add you</Text>
      </View>
    );
  } else if (trip.status === "FULL") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <Text style={styles.pendingText}>This trip is full</Text>
      </View>
    );
  } else if (trip.status === "COMPLETED") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <Text style={styles.pendingText}>This trip has ended</Text>
      </View>
    );
  } else {
    actionSlot = (
      <PrimaryButton
        label="I'm Interested"
        icon="hand-front-right"
        onPress={onExpressInterest}
        loading={expressInterest.isPending}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Trip Details
        </Text>
        {isOwner ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate("CreateTrip", { tripId })}
          >
            <MaterialCommunityIcons name="pencil" size={18} color={COLORS.ink} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={isWeb ? styles.pageInnerWeb : undefined}>
        {editingPhotos ? (
          <View style={styles.photoEditPanel}>
            <Text style={styles.blockTitle}>Edit photos</Text>
            <View style={styles.photoEditRow}>
              {editImages.map((uri) => (
                <View key={uri} style={styles.photoEditThumbWrap}>
                  <Image source={{ uri }} style={styles.photoEditThumb} />
                  <TouchableOpacity
                    style={styles.photoRemoveBadge}
                    onPress={() => setEditImages((prev) => prev.filter((i) => i !== uri))}
                  >
                    <MaterialCommunityIcons name="close" size={13} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              ))}
              {newPhotoAssets.map((asset) => (
                <View key={asset.uri} style={styles.photoEditThumbWrap}>
                  <Image source={{ uri: asset.uri }} style={styles.photoEditThumb} />
                  <TouchableOpacity
                    style={styles.photoRemoveBadge}
                    onPress={() => setNewPhotoAssets((prev) => prev.filter((a) => a.uri !== asset.uri))}
                  >
                    <MaterialCommunityIcons name="close" size={13} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.photoAddTile} onPress={pickNewPhotos}>
                <MaterialCommunityIcons name="plus" size={24} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <View style={styles.photoEditActions}>
              <PrimaryButton
                variant="outline"
                style={styles.stickyFlex}
                label="Cancel"
                onPress={() => setEditingPhotos(false)}
                disabled={isSavingPhotos}
              />
              <PrimaryButton
                style={styles.stickyFlex}
                label="Save photos"
                onPress={savePhotos}
                disabled={isSavingPhotos}
                loading={isSavingPhotos}
              />
            </View>
          </View>
        ) : (
          <View
            style={[styles.hero, { height: heroHeight }, isWeb && styles.heroWeb]}
            onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
          >
            {trip.images.length > 0 ? (
              <FlatList
                style={styles.heroList}
                data={trip.images}
                keyExtractor={(uri) => uri}
                renderItem={({ item }) =>
                  failedImages.has(item) ? (
                    <LinearGradient
                      colors={["#2563eb", "#0f766e"]}
                      style={[styles.heroImage, { width: heroWidth, height: heroHeight }]}
                    />
                  ) : (
                    <Image
                      source={{ uri: item }}
                      style={[styles.heroImage, { width: heroWidth, height: heroHeight }]}
                      onError={() => setFailedImages((prev) => new Set(prev).add(item))}
                    />
                  )
                }
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) =>
                  setActiveImageIndex(Math.round(e.nativeEvent.contentOffset.x / heroWidth))
                }
              />
            ) : (
              <LinearGradient colors={["#2563eb", "#0f766e"]} style={styles.heroImage} />
            )}

            {trip.images.length > 1 && (
              <View style={styles.dotsRow}>
                {trip.images.map((_, i) => (
                  <View key={i} style={[styles.dot, i === activeImageIndex && styles.dotActive]} />
                ))}
              </View>
            )}

            <View style={[styles.statusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
              <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
            </View>

            {isOwner && (
              <TouchableOpacity style={styles.photoEditTrigger} onPress={startEditingPhotos}>
                <MaterialCommunityIcons name="camera-outline" size={14} color={COLORS.white} />
                <Text style={styles.photoEditTriggerText}>Edit photos</Text>
              </TouchableOpacity>
            )}

            <LinearGradient colors={["transparent", "rgba(15,23,42,0.85)"]} style={styles.heroScrim}>
              <Text style={styles.title} numberOfLines={2}>
                {trip.title}
              </Text>
              <View style={styles.heroMetaRow}>
                <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.border} />
                <Text style={styles.heroSubtitle} numberOfLines={1}>
                  {trip.destination}
                </Text>
              </View>
            </LinearGradient>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="routes" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {trip.startLocation} → {trip.destination}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="calendar-range" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>{travelModeText(trip.travelMode)}</Text>
          </View>
          {trip.budget != null && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="cash" size={18} color={COLORS.primary} />
              <Text style={styles.infoText}>Approx. budget ₹{trip.budget}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="account-multiple" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {trip.seatsFilled}/{trip.seats} seats filled
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="account-circle" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>Organized by {trip.owner.name}</Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={() => likeTrip.mutate({ tripId, input: !trip.isLiked })}
              style={[styles.iconAction, trip.isLiked && styles.iconActionLikeActive]}
            >
              <MaterialCommunityIcons
                name={trip.isLiked ? "heart" : "heart-outline"}
                size={16}
                color={trip.isLiked ? COLORS.danger : "#334155"}
              />
              <Text style={[styles.iconActionText, trip.isLiked && { color: COLORS.danger }]}>{trip._count.likes}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => bookmarkTrip.mutate({ tripId, input: !trip.isBookmarked })}
              style={[styles.iconAction, trip.isBookmarked && styles.iconActionSaveActive]}
            >
              <MaterialCommunityIcons
                name={trip.isBookmarked ? "bookmark" : "bookmark-outline"}
                size={16}
                color={trip.isBookmarked ? COLORS.primary : "#334155"}
              />
              <Text style={[styles.iconActionText, trip.isBookmarked && { color: COLORS.primary }]}>
                {trip.isBookmarked ? "Saved" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>{trip.description}</Text>

          {trip.placesToVisit.length > 0 && (
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <MaterialCommunityIcons name="map-marker-distance" size={16} color={COLORS.ink} />
                <Text style={styles.blockTitle}>Places to visit</Text>
              </View>
              {trip.placesToVisit.map((place) => (
                <View key={place} style={styles.listItemRow}>
                  <View style={styles.listDot} />
                  <Text style={styles.listItem}>{place}</Text>
                </View>
              ))}
            </View>
          )}

          {trip.notes && (
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <MaterialCommunityIcons name="note-text-outline" size={16} color={COLORS.ink} />
                <Text style={styles.blockTitle}>Special notes</Text>
              </View>
              <Text style={styles.notesText}>{trip.notes}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.blockHeaderRow}>
            <MaterialCommunityIcons name="comment-text-outline" size={16} color={COLORS.ink} />
            <Text style={styles.blockTitle}>Comments ({comments?.length ?? 0})</Text>
          </View>

          {!comments || comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <MaterialCommunityIcons name="comment-text-outline" size={32} color="#cbd5e1" />
              <Text style={styles.emptyCommentsText}>No comments yet. Start the conversation!</Text>
            </View>
          ) : (
            <ScrollView
              nestedScrollEnabled
              style={styles.commentsList}
              contentContainerStyle={styles.commentsListContent}
            >
              {comments.map((c) => (
                <View key={c.id} style={styles.commentCard}>
                  {c.user.photoUrl ? (
                    <Image source={{ uri: c.user.photoUrl }} style={styles.commentAvatar} />
                  ) : (
                    <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder]}>
                      <Text style={styles.commentAvatarInitial}>{c.user.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.commentBody}>
                    <View style={styles.commentHeaderRow}>
                      <Text style={styles.commentAuthor}>{c.user.name}</Text>
                      <Text style={styles.commentTime}>{formatRelativeTime(c.createdAt)}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor={COLORS.mutedLight}
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={onSendComment}
              disabled={!commentText.trim() || addComment.isPending}
            >
              {addComment.isPending ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <MaterialCommunityIcons name="send" size={18} color={COLORS.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={isWeb ? styles.stickyBarInnerWeb : undefined}>{actionSlot}</View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexScreen: { flex: 1, backgroundColor: COLORS.white },
  container: { flex: 1, backgroundColor: COLORS.white },
  scrollContent: { paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.fieldBg,
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: COLORS.ink },
  headerSpacer: { width: 40, height: 40 },
  pageInnerWeb: { width: "100%", maxWidth: 760, alignSelf: "center" },
  hero: { width: "100%", borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden" },
  heroWeb: { borderRadius: 20, marginTop: 20 },
  heroList: { flex: 1 },
  heroImage: { width: "100%", height: "100%" },
  statusPill: {
    position: "absolute",
    top: 14,
    right: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
  photoEditTrigger: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15,23,42,0.55)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoEditTriggerText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
  heroScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 18,
  },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  heroSubtitle: { fontSize: 13, color: COLORS.border, flexShrink: 1 },
  dotsRow: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: COLORS.white },
  photoEditPanel: { padding: 16, borderBottomWidth: 8, borderBottomColor: "#f1f5f9" },
  photoEditRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  photoEditThumbWrap: { width: 76, height: 76 },
  photoEditThumb: { width: 76, height: 76, borderRadius: 10 },
  photoRemoveBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  photoAddTile: {
    width: 76,
    height: 76,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoEditActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  section: { paddingHorizontal: 16, paddingVertical: 20, borderBottomWidth: 8, borderBottomColor: "#f1f5f9" },
  title: { fontSize: 21, fontWeight: "700", color: COLORS.white },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  infoText: { fontSize: 14, color: "#334155", flexShrink: 1 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12, marginBottom: 4 },
  iconAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: COLORS.fieldBg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconActionLikeActive: { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorderLight },
  iconActionSaveActive: { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorderLight },
  iconActionText: { fontSize: 13, fontWeight: "600", color: "#334155" },
  description: { fontSize: 14, color: "#1e293b", marginTop: 16, lineHeight: 21 },
  block: { marginTop: 20 },
  blockHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  blockTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  listItemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  listDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.primary, marginTop: 7 },
  listItem: { fontSize: 13.5, color: "#334155", flexShrink: 1, lineHeight: 19 },
  notesText: {
    fontSize: 13.5,
    color: "#475569",
    lineHeight: 20,
    backgroundColor: COLORS.fieldBg,
    borderRadius: 12,
    padding: 12,
  },
  ownerActions: { gap: 10 },
  stickyRow: { flexDirection: "row", gap: 10 },
  stickyFlex: { flex: 1 },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  pendingText: { color: COLORS.warningText, textAlign: "center", fontSize: 13.5, flexShrink: 1 },
  stickyBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  stickyBarInnerWeb: { width: "100%", maxWidth: 480, alignSelf: "center" },
  emptyComments: { alignItems: "center", paddingVertical: 28, gap: 10 },
  emptyCommentsText: { fontSize: 13.5, color: COLORS.mutedLight, textAlign: "center" },
  commentsList: { maxHeight: 320, borderWidth: 1, borderColor: "#f1f5f9", borderRadius: 14 },
  commentsListContent: { padding: 10, gap: 10 },
  commentCard: { flexDirection: "row", gap: 10 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17 },
  commentAvatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  commentAvatarInitial: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  commentBody: { flex: 1 },
  commentHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  commentAuthor: { fontWeight: "700", fontSize: 13, color: COLORS.ink },
  commentTime: { fontSize: 11, color: COLORS.mutedLight },
  commentText: { fontSize: 13.5, color: "#334155", marginTop: 2, lineHeight: 19 },
  commentInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 14 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.ink,
    maxHeight: 100,
    backgroundColor: COLORS.fieldBg,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
```

Notes on decisions baked into the code above:
- `primaryButton`/`primaryButtonText`/`secondaryButton`/`secondaryButtonText` style entries are REMOVED — they're superseded by `PrimaryButton`'s own internal styles. `ownerActions`/`stickyRow`/`stickyFlex` are KEPT (they're layout wrappers around the buttons, not the button styles themselves).
- The "I'm Interested" button's `ActivityIndicator`/icon markup is replaced by `PrimaryButton`'s own `loading` prop (`loading={expressInterest.isPending}`) — same `expressInterest.isPending` value drives the same visual state, just through the shared component instead of hand-written conditional JSX.
- The photo-edit panel's Cancel/Save buttons also move to `PrimaryButton` (`variant="outline"` / default `"solid"`) for consistency, even though the spec's Section 6 didn't call them out by name — they are visually and functionally the same "secondary/primary action pair" pattern the spec describes for the owner actions, and leaving them as raw `TouchableOpacity` styled with the now-deleted `secondaryButton`/`primaryButton` styles would break (those styles no longer exist). `savePhotos`'s `isSavingPhotos` now drives `PrimaryButton`'s `loading` prop instead of the removed manual `ActivityIndicator` conditional.
- `"#334155"`, `"#f1f5f9"`, `"#cbd5e1"`, `"#1e293b"`, `"#475569"` are intentionally left as literals throughout (no exact token match).

- [ ] **Step 2: Verify with tsc**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual diff check**

Run: `git diff mobile/src/screens/TripDetailScreen.tsx` and confirm: (a) all 6 query/mutation hooks, every `useState`, `startEditingPhotos`/`pickNewPhotos`/`savePhotos`/`onExpressInterest`/`onSendComment`, and the entire `actionSlot` if/else-if chain's CONDITIONS are byte-identical to before; (b) the only functional-looking change is button markup swapped for `PrimaryButton` (same handlers, same disabled/loading sources); (c) every other change is a token substitution per the rule.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/TripDetailScreen.tsx
git commit -m "Swap Trip Details action buttons to PrimaryButton and token-ize styles"
```
