# Triply Design System Phase 3b (Profile Screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-duplicate `EditProfileScreen.tsx` onto the shared design-system tokens/components and restyle `UserProfileScreen.tsx` to mirror `ProfileScreen.tsx`'s already-redesigned structure, with zero behavior or data changes to either screen.

**Architecture:** Both tasks are render-layer-only rewrites of a single existing screen file each. `EditProfileScreen` replaces hand-rolled card/field/chip/button markup with the shared `Card`, `IconInput`, `SelectableChip`, and `PrimaryButton` components (the same de-duplication Phase 3a did for `RegisterScreen`). `UserProfileScreen` is rebuilt to structurally mirror `ProfileScreen`'s cover/sheet/avatar/stat-card-free layout, stripped of every owner-only affordance (no photo/cover upload, no Edit Profile / Log Out buttons, no new stats row).

**Tech Stack:** React Native (Expo), TypeScript, `@expo/vector-icons` (MaterialCommunityIcons), `expo-linear-gradient`, React Query (already-existing hooks, unchanged).

**Spec:** docs/superpowers/specs/2026-09-05-design-system-phase3b-profile-screens-design.md

## Global Constraints

- Zero behavior/data changes: every `useState`, mutation call (`updateProfile.mutate`, `uploadPhoto.mutate`, `uploadCover.mutate`), and navigation target in `EditProfileScreen.tsx` stays exactly as it is. `UserProfileScreen.tsx`'s `useUser`/`useCompletedTrips` calls and the `route.params.userId` usage are unchanged.
- Only exact-value token matches are substituted (e.g. `#0f172a` → `COLORS.ink`, `#0f766e` → `COLORS.primary`, `borderRadius: 999` → `RADIUS.pill`). A literal with no exact match in `theme/tokens.ts` stays a literal — do not "round" a close-but-different color to the nearest token.
- `EditProfileScreen`'s fixed top header bar is NOT replaced with `GradientBackground` or any hero pattern — it stays its own compact, non-scrolling bar; only its literal colors are token-ized.
- `UserProfileScreen` gets no new stats-count row, no owner-only affordances (no upload buttons, no Edit Profile / Log Out), and no new navigation — it is strictly a read-only restyle.
- Accepted component-adoption exceptions (documented in the spec, not defects a reviewer should flag): `IconInput`'s internal `paddingVertical: 13` vs the original fields' `12`; `SelectableChip`'s fixed icon size `16` vs the original chips' `14`; `SelectableChip` has no trailing checkmark icon when active (the current screen's chips are the only chips in the app with one today); `PrimaryButton`'s `SHADOW.button` values differing slightly from the original inline save-button shadow.
- No test framework exists in this repo. Verification is `npx tsc --noEmit` (run from `mobile/`) for every task.

---

### Task 1: De-duplicate EditProfileScreen.tsx onto shared components

**Files:**
- Modify: `mobile/src/screens/EditProfileScreen.tsx` (full-file rewrite of imports, JSX, and styles — behavior/state untouched)

**Interfaces:**
- Consumes (all pre-existing, unchanged): `useMe`, `useUpdateProfile`, `useUploadCoverPhoto`, `useUploadProfilePhoto` from `../api/users`; `TRAVEL_MODES`, `TravelMode` from `../types`; `TRAVEL_MODE_ICONS`, `travelModeText` from `../utils/travelModeIcons`; `Alert` from `../utils/alert`; `GradientBackground` from `../components/theme/GradientBackground`; `Card` from `../components/theme/Card`; `IconInput` from `../components/theme/IconInput`; `PrimaryButton` from `../components/theme/PrimaryButton`; `SelectableChip` from `../components/theme/SelectableChip`; `COLORS`, `RADIUS` from `../theme/tokens`; `optimizedImageUrl` from `../utils/optimizedImage`.
- Produces: nothing new — `EditProfileScreen` is a leaf screen component with no other file depending on its internals.

- [ ] **Step 1: Replace the full contents of `mobile/src/screens/EditProfileScreen.tsx`**

```tsx
import { useState } from "react";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useMe, useUpdateProfile, useUploadCoverPhoto, useUploadProfilePhoto } from "../api/users";
import { TRAVEL_MODES, type TravelMode } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { Alert } from "../utils/alert";
import { GradientBackground } from "../components/theme/GradientBackground";
import { Card } from "../components/theme/Card";
import { IconInput } from "../components/theme/IconInput";
import { PrimaryButton } from "../components/theme/PrimaryButton";
import { SelectableChip } from "../components/theme/SelectableChip";
import { COLORS, RADIUS } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

type Props = NativeStackScreenProps<AppStackParamList, "EditProfile">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const BIO_MAX_LENGTH = 300;

const INTEREST_OPTIONS: { value: string; icon: IconName }[] = [
  { value: "Adventure", icon: "terrain" },
  { value: "Nature", icon: "leaf" },
  { value: "Beaches", icon: "beach" },
  { value: "Food", icon: "silverware-fork-knife" },
  { value: "Photography", icon: "camera-outline" },
  { value: "Culture", icon: "bank" },
  { value: "Nightlife", icon: "glass-cocktail" },
  { value: "Wildlife", icon: "paw" },
  { value: "Trekking", icon: "hiking" },
];

export function EditProfileScreen({ navigation }: Props) {
  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();
  const uploadPhoto = useUploadProfilePhoto();
  const uploadCover = useUploadCoverPhoto();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { width: windowWidth } = useWindowDimensions();

  const [name, setName] = useState(user?.name ?? "");
  const [age, setAge] = useState(user?.age?.toString() ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [preferredModes, setPreferredModes] = useState<TravelMode[]>(user?.preferredModes ?? []);
  const [saved, setSaved] = useState(false);

  const toggleMode = (mode: TravelMode) => {
    setPreferredModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  };

  const toggleInterest = (value: string) => {
    setInterests((prev) => (prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value]));
  };

  const onChangePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled) return;
    uploadPhoto.mutate(result.assets[0], {
      onError: () => Alert.alert("Couldn't upload photo", "Please try again"),
    });
  };

  const onChangeCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled) return;
    uploadCover.mutate(result.assets[0], {
      onError: () => Alert.alert("Couldn't upload cover photo", "Please try again"),
    });
  };

  const onSave = () => {
    setSaved(false);
    updateProfile.mutate(
      {
        name: name.trim() || undefined,
        age: age ? Number(age) : null,
        location: location.trim() || null,
        bio: bio.trim() || null,
        interests,
        preferredModes,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => navigation.goBack(), 900);
        },
        onError: () => Alert.alert("Couldn't save profile", "Please try again"),
      }
    );
  };

  const completionChecks = [
    !!user?.photoUrl,
    !!user?.coverPhotoUrl,
    !!name.trim(),
    !!age,
    !!location.trim(),
    !!bio.trim(),
    interests.length > 0,
    preferredModes.length > 0,
  ];
  const completionPercent = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100
  );

  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Edit Profile
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.coverWrap, isWeb && styles.coverWrapWeb]}>
          {user?.coverPhotoUrl ? (
            <Image source={{ uri: optimizedImageUrl(user.coverPhotoUrl, windowWidth) }} style={styles.cover} />
          ) : (
            <GradientBackground style={styles.cover} />
          )}
          <TouchableOpacity style={styles.coverEditButton} onPress={onChangeCover} disabled={uploadCover.isPending}>
            {uploadCover.isPending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <MaterialCommunityIcons name="image-multiple-outline" size={14} color={COLORS.white} />
                <Text style={styles.coverEditText}>Change Cover Photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.page, isWeb && styles.pageWeb]}>
          <View style={styles.avatarBlock}>
            <TouchableOpacity onPress={onChangePhoto} style={styles.avatarWrap} disabled={uploadPhoto.isPending}>
              {user?.photoUrl ? (
                <Image source={{ uri: optimizedImageUrl(user.photoUrl, 184) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{(user?.name ?? "?").charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                {uploadPhoto.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <MaterialCommunityIcons name="camera-outline" size={13} color={COLORS.white} />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.changePhotoText}>Change Photo</Text>

            <View style={styles.completionBadge}>
              <MaterialCommunityIcons name="progress-check" size={14} color={COLORS.primary} />
              <Text style={styles.completionText}>Profile {completionPercent}% complete</Text>
            </View>
            <View style={styles.completionTrack}>
              <View style={[styles.completionFill, { width: `${completionPercent}%` }]} />
            </View>
          </View>

          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Basic Information</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <IconInput icon="account-outline" placeholder="Your name" value={name} onChangeText={setName} />
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.fieldGroup, styles.fieldHalf]}>
                <Text style={styles.fieldLabel}>Age</Text>
                <IconInput
                  icon="cake-variant-outline"
                  placeholder="e.g., 28"
                  keyboardType="numeric"
                  value={age}
                  onChangeText={setAge}
                />
              </View>
              <View style={[styles.fieldGroup, styles.fieldHalf]}>
                <Text style={styles.fieldLabel}>Home / Current City</Text>
                <IconInput
                  icon="map-marker-outline"
                  placeholder="e.g., Bengaluru"
                  value={location}
                  onChangeText={setLocation}
                />
              </View>
            </View>
          </Card>

          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="note-text-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>About You</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <IconInput
                icon="note-text-outline"
                placeholder="Tell other travelers a bit about yourself..."
                multiline
                maxLength={BIO_MAX_LENGTH}
                value={bio}
                onChangeText={setBio}
              />
              <Text style={styles.charCounter}>
                {bio.length}/{BIO_MAX_LENGTH}
              </Text>
            </View>
          </Card>

          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons name="compass-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Travel Preferences</Text>
            </View>

            <Text style={styles.fieldLabel}>Preferred travel modes</Text>
            <View style={styles.chipRow}>
              {TRAVEL_MODES.map((mode) => (
                <SelectableChip
                  key={mode}
                  icon={TRAVEL_MODE_ICONS[mode]}
                  label={travelModeText(mode)}
                  active={preferredModes.includes(mode)}
                  onPress={() => toggleMode(mode)}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Travel interests</Text>
            <View style={styles.chipRow}>
              {INTEREST_OPTIONS.map((option) => (
                <SelectableChip
                  key={option.value}
                  icon={option.icon}
                  label={option.value}
                  active={interests.includes(option.value)}
                  onPress={() => toggleInterest(option.value)}
                />
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
        {saved && (
          <View style={styles.successBanner}>
            <MaterialCommunityIcons name="check-circle-outline" size={16} color="#166534" />
            <Text style={styles.successText}>Profile updated successfully</Text>
          </View>
        )}
        <PrimaryButton
          label="Save Changes"
          icon="check"
          onPress={onSave}
          disabled={updateProfile.isPending}
          loading={updateProfile.isPending}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexScreen: { flex: 1, backgroundColor: COLORS.fieldBg },
  container: { flex: 1 },
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
  coverWrap: { width: "100%", height: 150 },
  coverWrapWeb: { height: 200 },
  cover: { width: "100%", height: "100%" },
  coverEditButton: {
    position: "absolute",
    right: 14,
    bottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15,23,42,0.55)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  coverEditText: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  page: { paddingHorizontal: 20, gap: 16 },
  pageWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  avatarBlock: { alignItems: "center" },
  avatarWrap: { marginTop: -48 },
  avatar: { width: 92, height: 92, borderRadius: 46, borderWidth: 4, borderColor: COLORS.fieldBg },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontSize: 30, fontWeight: "700" },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.fieldBg,
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoText: { color: COLORS.primary, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
  completionBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
  completionText: { fontSize: 12.5, color: "#334155", fontWeight: "600" },
  completionTrack: {
    width: "100%",
    maxWidth: 260,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    marginTop: 8,
    overflow: "hidden",
  },
  completionFill: { height: "100%", backgroundColor: COLORS.primary, borderRadius: 3 },
  card: { padding: 16, gap: 12 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  fieldRow: { flexDirection: "row", gap: 12 },
  fieldHalf: { flex: 1 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: "700", color: "#334155" },
  fieldLabelSpaced: { marginTop: 4 },
  charCounter: { alignSelf: "flex-end", fontSize: 11, color: COLORS.mutedLight },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stickyBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#dcfce7",
    borderRadius: 10,
    paddingVertical: 8,
  },
  successText: { color: "#166534", fontSize: 12.5, fontWeight: "700" },
});
```

Notes for the implementer:
- `card: { padding: 16, gap: 12 }` intentionally overrides `Card`'s own default `padding: 18, gap: 12` to preserve this screen's original spacing exactly — the same override pattern Phase 3a used for `RegisterScreen`'s `Card` usage. Do not remove this override.
- `#f1f5f9` (header/sticky-bar border), `#334155` (`completionText`/`fieldLabel`), `#dcfce7`/`#166534` (success banner) have no exact match anywhere in `theme/tokens.ts` — leave them as literals. Do not substitute a "close" token for them.
- `184` in `optimizedImageUrl(user.photoUrl, 184)` is `92 * 2` (the avatar's display size × 2 for retina), matching the same sizing convention `ProfileScreen` uses (`104 * 2 = 208`).
- Deleted from the old stylesheet (must not remain, must have zero references left in the JSX): `card` (the old 8-property block — replaced by the new 2-property override above), `fieldWrap`, `fieldInput`, `bioInput`, `chip`, `chipActive`, `chipText`, `chipTextActive`, `saveButton`, `saveText`.
- `TextInput` and `LinearGradient` are no longer imported (no longer used directly) — do not leave unused imports.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EditProfileScreen.tsx
git commit -m "De-duplicate Edit Profile screen onto shared design-system tokens and components"
```

---

### Task 2: Restyle UserProfileScreen.tsx to mirror ProfileScreen's structure

**Files:**
- Modify: `mobile/src/screens/UserProfileScreen.tsx` (full-file rewrite)

**Interfaces:**
- Consumes (all pre-existing, unchanged): `useCompletedTrips`, `useUser` from `../api/users`; `TRAVEL_MODE_ICONS`, `travelModeText` from `../utils/travelModeIcons`; `GradientBackground` from `../components/theme/GradientBackground`; `Card` from `../components/theme/Card`; `Skeleton` from `../components/theme/Skeleton`; `COLORS`, `RADIUS`, `TYPE` from `../theme/tokens`; `optimizedImageUrl` from `../utils/optimizedImage`.
- Produces: nothing new — `UserProfileScreen` is a leaf screen with no other file depending on its internals. Its local `StaticChip`/`SectionHeader`/`UserProfileSkeleton` helper components are unexported and scoped to this file only (mirroring how `ProfileScreen.tsx` already defines its own unexported `StaticChip`/`SectionHeader`/`ProfileSkeleton` — this is deliberate duplication, not an oversight; do not attempt to import them from `ProfileScreen.tsx` or extract a new shared component, which is out of this plan's scope).

- [ ] **Step 1: Replace the full contents of `mobile/src/screens/UserProfileScreen.tsx`**

```tsx
import type { ComponentProps } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useCompletedTrips, useUser } from "../api/users";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { GradientBackground } from "../components/theme/GradientBackground";
import { Card } from "../components/theme/Card";
import { Skeleton } from "../components/theme/Skeleton";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

type Props = NativeStackScreenProps<AppStackParamList, "UserProfile">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function StaticChip({ icon, label }: { icon?: IconName; label: string }) {
  return (
    <View style={styles.chip}>
      {icon && <MaterialCommunityIcons name={icon} size={14} color={COLORS.white} />}
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: IconName; title: string }) {
  return (
    <View style={styles.blockHeaderRow}>
      <MaterialCommunityIcons name={icon} size={16} color={COLORS.ink} />
      <Text style={styles.blockTitle}>{title}</Text>
    </View>
  );
}

function UserProfileSkeleton() {
  return (
    <View style={styles.container}>
      <Skeleton style={styles.skeletonCover} />
      <View style={styles.sheet}>
        <View style={styles.page}>
          <View style={styles.headerBlock}>
            <Skeleton style={styles.skeletonAvatar} />
            <Skeleton style={styles.skeletonName} />
            <Skeleton style={styles.skeletonMeta} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function UserProfileScreen({ route }: Props) {
  const { userId } = route.params;
  const { data: user, isLoading } = useUser(userId);
  const { data: completedTrips } = useCompletedTrips(userId);
  const isWeb = Platform.OS === "web";
  const { width: windowWidth } = useWindowDimensions();
  const coverHeight = Math.min(Math.max(windowWidth / 2.2, 200), 280);

  if (isLoading || !user) return <UserProfileSkeleton />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.coverWrap, { height: coverHeight }]}>
        {user.coverPhotoUrl ? (
          <>
            <Image source={{ uri: optimizedImageUrl(user.coverPhotoUrl, windowWidth) }} style={styles.cover} />
            <LinearGradient
              colors={["transparent", "rgba(12,20,38,0.15)", "rgba(12,20,38,0.6)"]}
              style={styles.coverScrim}
            />
          </>
        ) : (
          <GradientBackground style={styles.cover} />
        )}
      </View>

      <View style={styles.sheet}>
        <View style={[styles.page, isWeb && styles.pageWeb]}>
          <View style={styles.headerBlock}>
            <View style={styles.avatarWrap}>
              {user.photoUrl ? (
                <Image source={{ uri: optimizedImageUrl(user.photoUrl, 208) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{user.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>

            <Text style={styles.name}>{user.name}</Text>
            {(user.location || user.age != null) && (
              <View style={styles.metaRow}>
                {user.location && (
                  <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="map-marker-outline" size={13} color={COLORS.muted} />
                    <Text style={styles.metaText}>{user.location}</Text>
                  </View>
                )}
                {user.age != null && (
                  <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="cake-variant-outline" size={13} color={COLORS.muted} />
                    <Text style={styles.metaText}>{user.age} yrs</Text>
                  </View>
                )}
              </View>
            )}
            {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
          </View>

          {user.interests.length > 0 && (
            <Card style={styles.section}>
              <SectionHeader icon="tag-multiple-outline" title="Travel interests" />
              <View style={styles.chipRow}>
                {user.interests.map((i) => (
                  <StaticChip key={i} icon="tag-outline" label={i} />
                ))}
              </View>
            </Card>
          )}

          {user.preferredModes.length > 0 && (
            <Card style={styles.section}>
              <SectionHeader icon="compass-outline" title="Preferred travel modes" />
              <View style={styles.chipRow}>
                {user.preferredModes.map((m) => (
                  <StaticChip key={m} icon={TRAVEL_MODE_ICONS[m]} label={travelModeText(m)} />
                ))}
              </View>
            </Card>
          )}

          <Card style={styles.section}>
            <SectionHeader icon="map-check-outline" title={`Previous trips (${completedTrips?.length ?? 0})`} />
            {completedTrips && completedTrips.length > 0 ? (
              completedTrips.map((t) => (
                <View key={t.id} style={styles.tripRow}>
                  <View style={styles.tripDot} />
                  <View style={styles.tripTextWrap}>
                    <Text style={styles.tripTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.tripMeta} numberOfLines={1}>
                      {t.destination}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyWrap}>
                <MaterialCommunityIcons name="compass-off-outline" size={32} color={COLORS.mutedLight} />
                <Text style={styles.emptyText}>No completed trips yet.</Text>
              </View>
            )}
          </Card>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fieldBg },
  scrollContent: { paddingBottom: 40 },
  coverWrap: { width: "100%" },
  cover: { width: "100%", height: "100%" },
  coverScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" },
  sheet: {
    marginTop: -26,
    backgroundColor: COLORS.fieldBg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderTopColor: "rgba(15,118,110,0.14)",
    paddingTop: 4,
  },
  page: { paddingHorizontal: 20 },
  pageWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  headerBlock: { alignItems: "center" },
  avatarWrap: {
    marginTop: -58,
    borderRadius: 56,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  avatar: { width: 104, height: 104, borderRadius: 52, borderWidth: 4, borderColor: COLORS.white },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontSize: 34, fontWeight: "700" },
  name: { ...TYPE.heading, fontSize: 21, marginTop: 10 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13, color: COLORS.muted },
  bio: { ...TYPE.body, fontSize: 13.5, color: COLORS.muted, textAlign: "center", marginTop: 10, lineHeight: 20, maxWidth: 340 },
  section: { marginTop: 22, padding: 16, gap: 10 },
  blockHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  blockTitle: { fontWeight: "700", fontSize: 14.5, color: COLORS.ink },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.chip,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipText: { fontSize: 12.5, color: COLORS.white, fontWeight: "600" },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tripDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.primary },
  tripTextWrap: { flex: 1 },
  tripTitle: { fontSize: 14, fontWeight: "600", color: COLORS.ink },
  tripMeta: { fontSize: 12, color: COLORS.muted, marginTop: 1 },
  emptyWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 26,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: { fontSize: 12.5, color: COLORS.mutedLight, textAlign: "center", paddingHorizontal: 32 },
  skeletonCover: { width: "100%", height: 220, borderRadius: 0 },
  skeletonAvatar: { width: 104, height: 104, borderRadius: 52, marginTop: -58 },
  skeletonName: { width: 140, height: 18, marginTop: 14 },
  skeletonMeta: { width: 100, height: 12, marginTop: 8 },
});
```

Notes for the implementer:
- `useUser(userId)` and `useCompletedTrips(userId)` are called exactly as before — do not change their arguments or add new hooks.
- No `TouchableOpacity`/`onPress`/navigation is added anywhere in this file (the original screen had none — trip rows and chips are plain, non-interactive `View`s, matching the original's behavior exactly, not `ProfileScreen`'s touchable/navigable trip rows).
- No stats-count row, no cover-edit button, no avatar camera badge, no Edit Profile / Log Out button — these are `ProfileScreen`-only, owner-facing affordances that must not appear here.
- `avatarWrap`'s `marginTop: -58` is what creates the avatar-overlapping-the-sheet effect — it is a plain `View`, not a `TouchableOpacity` (there is nothing to press).
- The empty-state copy is "No completed trips yet." (third person, matching that this is someone else's profile) — this deliberately differs from `ProfileScreen`'s first-person "No completed trips yet — your travel history will show up here."
- `ActivityIndicator` is no longer imported/used — the loading state is now `UserProfileSkeleton`, not a spinner.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/UserProfileScreen.tsx
git commit -m "Restyle User Profile screen to match Profile's gradient cover and card layout"
```
