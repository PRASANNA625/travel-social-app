# Triply Design System (Phase 1: Foundation + Create Trip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Welcome/Login's visual language into a small shared
design-system foundation (tokens + 5 primitive components), then
restructure Create Trip (which also serves as Edit Trip) to use them,
with zero changes to existing validation, state, or submit logic.

**Architecture:** One new tokens file, five new small presentational
components (no shared dependencies between them, only on tokens), a
presentational-only restyle of the two existing `TripDateFields`
platform-split files (adds a calendar icon, no date-logic changes), and a
full render/style replacement of `CreateTripScreen.tsx` that leaves every
handler, state variable, and effect completely untouched.

**Tech Stack:** Existing stack only (React Native/Expo, `@expo/vector-icons`,
`expo-linear-gradient`) — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-design-system-create-trip-design.md`

## File Structure

- `mobile/src/theme/tokens.ts` (new) — colors, gradient, radii, shadows, type scale. No logic, no imports beyond RN types.
- `mobile/src/components/theme/GradientBackground.tsx` (new) — gradient + decorative compass wrapper.
- `mobile/src/components/theme/Card.tsx` (new) — the white glass card container.
- `mobile/src/components/theme/IconInput.tsx` (new) — icon + `TextInput` row.
- `mobile/src/components/theme/PrimaryButton.tsx` (new) — solid teal action button.
- `mobile/src/components/theme/SelectableChip.tsx` (new) — selectable card/chip with active/inactive states.
- `mobile/src/components/TripDateFields.tsx` (modify) — presentational only: add a calendar icon, adopt token-based styling. No change to `DateTimePicker` wiring or date logic.
- `mobile/src/components/TripDateFields.web.tsx` (modify) — same presentational change; no change to parsing/validation logic.
- `mobile/src/screens/CreateTripScreen.tsx` (modify) — full render/style replacement using the components above; every handler/state/effect stays byte-identical.

## Global Constraints

- Zero behavior changes: every field's validation, state, and submit logic in `CreateTripScreen.tsx` (title/destination/dates/location picker/travel mode/budget/seats/description/images/notes/join type) must be byte-identical after this plan — only rendering and styling change.
- No test framework may be added — verify via `npx tsc --noEmit` plus a manual walkthrough on a temporary web dev server (check for a free port via `netstat`, verify, kill only that server's own PID, never touch the user's live tunnel on port 8081).
- This plan does not touch Welcome, Login, Discover, Trip Details, Profile, Edit Profile, Group Chat, Notifications, or any other screen — Phase 2 (a separate spec/plan) covers those.
- The design tokens must exactly match what was confirmed during design review (same colors/gradient/radii/shadows as Welcome/Login) — no new color values invented.
- Full interactive click-through of Create Trip may not be possible in the implementation environment (requires auth against the live production backend, no local test account) — this is an accepted, already-established limitation; typecheck + a compiling/loading web bundle + a careful code-trace is sufficient evidence when that's the case.

---

### Task 1: Design tokens

**Files:**
- Create: `mobile/src/theme/tokens.ts`

**Interfaces:**
- Produces: `GRADIENT_PRIMARY`, `COLORS`, `RADIUS`, `SHADOW`, `TYPE` — consumed by every component in Task 2, by Task 3's date-field restyle, and by Task 4's screen restyle.

- [ ] **Step 1: Create the file**

```ts
export const GRADIENT_PRIMARY = {
  colors: ["#1d4ed8", "#0f766e", "#0c2b28"] as const,
  locations: [0, 0.55, 1] as const,
};

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
};

export const RADIUS = { pill: 999, card: 24, field: 14, chip: 16, badge: 14 };

export const SHADOW = {
  card: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  button: {
    shadowColor: "#0f766e",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
};

export const TYPE = {
  heading: { fontSize: 24, fontWeight: "800" as const, color: COLORS.ink },
  subheading: { fontSize: 13.5, color: COLORS.muted, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "600" as const, color: COLORS.ink },
  body: { fontSize: 15, color: COLORS.ink },
};
```

- [ ] **Step 2: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/tokens.ts
git commit -m "Add Triply design system tokens (colors, gradient, radii, shadows, type scale)"
```

---

### Task 2: Shared theme components

**Files:**
- Create: `mobile/src/components/theme/GradientBackground.tsx`
- Create: `mobile/src/components/theme/Card.tsx`
- Create: `mobile/src/components/theme/IconInput.tsx`
- Create: `mobile/src/components/theme/PrimaryButton.tsx`
- Create: `mobile/src/components/theme/SelectableChip.tsx`

**Interfaces:**
- Consumes: `GRADIENT_PRIMARY`, `COLORS`, `RADIUS`, `SHADOW` from `mobile/src/theme/tokens.ts` (Task 1).
- Produces (all consumed by Task 4):
  - `GradientBackground(props: { children?: ReactNode; style?: StyleProp<ViewStyle> })`
  - `Card(props: { children?: ReactNode; style?: StyleProp<ViewStyle> })`
  - `IconInput(props: TextInputProps & { icon: IconName; error?: boolean; rightElement?: ReactNode; style?: StyleProp<ViewStyle> })`
  - `PrimaryButton(props: { label: string; onPress: () => void; icon?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> })`
  - `SelectableChip(props: { icon?: IconName; label: string; active: boolean; onPress: () => void; style?: StyleProp<ViewStyle> })`
  - where `IconName = ComponentProps<typeof MaterialCommunityIcons>["name"]`, defined locally in each file that needs it.

- [ ] **Step 1: Create `GradientBackground.tsx`**

```tsx
import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GRADIENT_PRIMARY } from "../../theme/tokens";

export function GradientBackground({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={GRADIENT_PRIMARY.colors}
      locations={GRADIENT_PRIMARY.locations}
      style={[styles.gradient, style]}
    >
      <MaterialCommunityIcons name="compass-outline" size={130} color="rgba(255,255,255,0.08)" style={styles.compass} />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { overflow: "hidden" },
  compass: { position: "absolute", top: -20, right: -20, transform: [{ rotate: "-18deg" }] },
});
```

- [ ] **Step 2: Create `Card.tsx`**

```tsx
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { COLORS, RADIUS, SHADOW } from "../../theme/tokens";

export function Card({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 18,
    gap: 12,
    ...SHADOW.card,
  },
});
```

- [ ] **Step 3: Create `IconInput.tsx`**

```tsx
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS } from "../../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function IconInput({
  icon,
  error,
  rightElement,
  style,
  ...textInputProps
}: TextInputProps & {
  icon: IconName;
  error?: boolean;
  rightElement?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.wrap,
        textInputProps.multiline && styles.wrapMultiline,
        error && styles.wrapError,
        style,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={COLORS.muted}
        style={textInputProps.multiline ? styles.iconMultiline : undefined}
      />
      <TextInput
        style={[styles.input, textInputProps.multiline && styles.inputMultiline]}
        placeholderTextColor={COLORS.mutedLight}
        {...textInputProps}
      />
      {rightElement}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.field,
    paddingHorizontal: 14,
  },
  wrapMultiline: { alignItems: "flex-start", paddingVertical: 12 },
  wrapError: { borderColor: COLORS.danger },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.ink },
  inputMultiline: { minHeight: 80, textAlignVertical: "top", paddingVertical: 0 },
  iconMultiline: { marginTop: 3 },
});
```

- [ ] **Step 4: Create `PrimaryButton.tsx`**

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
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.9}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <>
          <Text style={styles.text}>{label}</Text>
          {icon && <MaterialCommunityIcons name={icon} size={18} color={COLORS.white} />}
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
  buttonDisabled: { opacity: 0.6 },
  text: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
```

- [ ] **Step 5: Create `SelectableChip.tsx`**

```tsx
import type { ComponentProps } from "react";
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS } from "../../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function SelectableChip({
  icon,
  label,
  active,
  onPress,
  style,
}: {
  icon?: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive, style]} onPress={onPress} activeOpacity={0.85}>
      {icon && <MaterialCommunityIcons name={icon} size={16} color={active ? COLORS.white : COLORS.muted} />}
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.chip,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  label: { fontSize: 12.5, color: COLORS.ink, fontWeight: "600", textAlign: "center" },
  labelActive: { color: COLORS.white, fontWeight: "700" },
});
```

- [ ] **Step 6: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/theme/
git commit -m "Add shared theme components: GradientBackground, Card, IconInput, PrimaryButton, SelectableChip"
```

---

### Task 3: Restyle the date fields (presentational only)

**Files:**
- Modify: `mobile/src/components/TripDateFields.tsx`
- Modify: `mobile/src/components/TripDateFields.web.tsx`

**Interfaces:**
- Consumes: `COLORS` from `mobile/src/theme/tokens.ts` (Task 1).
- No change to either file's exported prop signature — both keep exactly `{ startDate, endDate, onChangeStart, onChangeEnd, endError, inputStyle, errorStyle, placeholderStyle }`. `inputStyle` will start receiving a new token-based style object from Task 4, but that is a caller-side change, not a signature change.
- No change to any date-handling logic in either file: `DateTimePicker` wiring, `minimumDate`, `formatDDMMYYYY` usage in the native file, and `parseDateInput`/`isBeforeToday`/the local-time construction/the invalid-state buffer logic in the web file must all remain byte-identical to their current implementation — only the JSX gains an icon and a row wrapper.

- [ ] **Step 1: Replace the full contents of `mobile/src/components/TripDateFields.tsx`**

```tsx
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDDMMYYYY, startOfToday } from "../utils/date";
import { COLORS } from "../theme/tokens";

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
      <TouchableOpacity style={[inputStyle, styles.flex1, styles.fieldRow]} onPress={() => setShowStartPicker(true)}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={COLORS.muted} />
        <Text>Start: {formatDDMMYYYY(startDate)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[inputStyle, styles.flex1, styles.fieldRow, endError && errorStyle]}
        onPress={() => setShowEndPicker(true)}
      >
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={COLORS.muted} />
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
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
```

- [ ] **Step 2: Replace the full contents of `mobile/src/components/TripDateFields.web.tsx`**

```tsx
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDDMMYYYY, isBeforeToday } from "../utils/date";
import { COLORS } from "../theme/tokens";

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
    <View style={[style, styles.fieldRow, invalid && errorStyle]}>
      <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={COLORS.muted} />
      <TextInput
        style={styles.textInput}
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
    </View>
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
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  textInput: { flex: 1, fontSize: 15, color: COLORS.ink },
});
```

Note: `textInput` here intentionally carries no `paddingVertical` — vertical padding now lives on the outer container (supplied by `inputStyle`, which Task 4 defines with `paddingVertical: 13`), matching the native file's approach where padding is applied once, on the outer element.

- [ ] **Step 3: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start a temporary web dev server on a free port (check via `netstat -ano | grep LISTENING` first), confirm the bundle compiles with no errors, then kill that server's specific PID and confirm the user's live tunnel (port 8081, if running) is unaffected. Do a code-trace confirming: the native file's `DateTimePicker` still receives `minimumDate={startOfToday()}` unchanged, and the web file's `parseDateInput`/`isBeforeToday` guard and the local `text`/`invalid` state buffer are unchanged from before this task — only JSX structure (the icon, the wrapping row) changed.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/TripDateFields.tsx mobile/src/components/TripDateFields.web.tsx
git commit -m "Add calendar icon and token-based styling to date fields (no logic changes)"
```

---

### Task 4: Restyle Create Trip using the design system

**Files:**
- Modify: `mobile/src/screens/CreateTripScreen.tsx`

**Interfaces:**
- Consumes: `GradientBackground`, `Card`, `IconInput`, `PrimaryButton`, `SelectableChip` (Task 2); `COLORS`, `RADIUS`, `TYPE` (Task 1); `TripDateFields` (Task 3, unchanged signature); `TRAVEL_MODE_ICONS`, `travelModeText` from the already-existing `mobile/src/utils/travelModeIcons.ts` (used elsewhere in the app by Discover/TripCard — reusing it here for the first time in Create Trip, replacing the old `TRAVEL_MODE_LABELS`/`splitModeLabel` emoji approach for consistency with how travel modes are already shown elsewhere).
- Every non-rendering piece of this file (all `useState` declarations, the prefill `useEffect`, `pickCoverPhoto`, `pickImages`, `handleStartDateChange`, `onSubmit` including its `datesChanged` computation, and the `createTrip.mutateAsync`/`updateTrip.mutateAsync` payload construction) must be preserved exactly as-is — only imports, the two small local constants (`JOIN_TYPE_ICONS` replacing the removed `splitModeLabel`), the returned JSX, and the `StyleSheet.create` block change.

- [ ] **Step 1: Replace the full contents of `mobile/src/screens/CreateTripScreen.tsx`**

```tsx
import { useEffect, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useCreateTrip, useTrip, useUpdateTrip, useUploadTripImages } from "../api/trips";
import { TRAVEL_MODES, type JoinType, type TravelMode } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { TripDateFields } from "../components/TripDateFields";
import { LocationPickerModal, type LocationValue } from "../components/LocationPickerModal";
import { GradientBackground } from "../components/theme/GradientBackground";
import { Card } from "../components/theme/Card";
import { IconInput } from "../components/theme/IconInput";
import { PrimaryButton } from "../components/theme/PrimaryButton";
import { SelectableChip } from "../components/theme/SelectableChip";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";
import { Alert } from "../utils/alert";
import { isAfterDate, isBeforeToday } from "../utils/date";

type Props = NativeStackScreenProps<AppStackParamList, "CreateTrip">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const JOIN_TYPES: { value: JoinType; label: string }[] = [
  { value: "OPEN", label: "Open to everyone" },
  { value: "APPROVAL", label: "Requires approval" },
  { value: "INVITE_ONLY", label: "Invite-only" },
];

const JOIN_TYPE_ICONS: Record<JoinType, IconName> = {
  OPEN: "earth",
  APPROVAL: "shield-check-outline",
  INVITE_ONLY: "lock-outline",
};

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {text}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
  );
}

export function CreateTripScreen({ navigation, route }: Props) {
  const tripId = route.params?.tripId;
  const isEditMode = !!tripId;
  const { data: existingTrip, isLoading: isLoadingTrip } = useTrip(tripId);
  const [prefilled, setPrefilled] = useState(false);

  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [startLocationCoords, setStartLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activePicker, setActivePicker] = useState<"start" | "destination" | null>(null);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [travelMode, setTravelMode] = useState<TravelMode | undefined>(undefined);
  const [budget, setBudget] = useState("");
  const [seats, setSeats] = useState("");
  const [description, setDescription] = useState("");
  const [placesToVisit, setPlacesToVisit] = useState("");
  const [notes, setNotes] = useState("");
  const [joinType, setJoinType] = useState<JoinType | undefined>(undefined);
  const [coverPhoto, setCoverPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const uploadImages = useUploadTripImages();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isEditMode || !existingTrip || prefilled) return;
    setTitle(existingTrip.title);
    setDestination(existingTrip.destination);
    setStartLocation(existingTrip.startLocation);
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
    setStartDate(new Date(existingTrip.startDate));
    setEndDate(new Date(existingTrip.endDate));
    setTravelMode(existingTrip.travelMode);
    setBudget(existingTrip.budget != null ? String(existingTrip.budget) : "");
    setSeats(String(existingTrip.seats));
    setDescription(existingTrip.description);
    setPlacesToVisit(existingTrip.placesToVisit.join(", "));
    setNotes(existingTrip.notes ?? "");
    setJoinType(existingTrip.joinType);
    setPrefilled(true);
  }, [isEditMode, existingTrip, prefilled]);

  const pickCoverPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      setCoverPhoto(result.assets[0]);
    }
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.7,
    });
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets]);
    }
  };

  const handleStartDateChange = (date: Date) => {
    setStartDate(date);
    if (endDate && isAfterDate(date, endDate)) {
      setEndDate(undefined);
    }
  };

  const onSubmit = async () => {
    setSubmitted(true);

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

    const datesChanged =
      !isEditMode ||
      !existingTrip ||
      startDate.getTime() !== new Date(existingTrip.startDate).getTime() ||
      (endDate?.getTime() ?? null) !== new Date(existingTrip.endDate).getTime();

    if (datesChanged) {
      if (endDate && isBeforeToday(endDate)) {
        Alert.alert("Invalid end date", "End date must be today or a future date.");
        return;
      }
      if (endDate && isAfterDate(startDate, endDate)) {
        Alert.alert("Invalid dates", "Start date cannot be after the end date.");
        return;
      }
    }
    const seatsNum = Number(seats);
    if (!seatsNum || seatsNum < 1) {
      Alert.alert("Invalid seats", "Number of seats must be at least 1.");
      return;
    }

    try {
      if (isEditMode && tripId) {
        await updateTrip.mutateAsync({
          tripId,
          input: {
            title: title.trim(),
            destination: destination.trim(),
            startLocation: startLocation.trim(),
            startLat: startLocationCoords?.lat ?? null,
            startLng: startLocationCoords?.lng ?? null,
            destLat: destinationCoords?.lat ?? null,
            destLng: destinationCoords?.lng ?? null,
            ...(datesChanged
              ? { startDate: startDate.toISOString(), endDate: endDate.toISOString() }
              : {}),
            travelMode,
            budget: budget ? Number(budget) : undefined,
            seats: seatsNum,
            description: description.trim(),
            placesToVisit: placesToVisit
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean),
            notes: notes.trim() || undefined,
            joinType,
          },
        });
        navigation.navigate("TripDetail", { tripId });
        return;
      }

      const allImages = coverPhoto ? [coverPhoto, ...images] : images;
      let uploadedUrls: string[] = [];
      if (allImages.length > 0) {
        uploadedUrls = await uploadImages.mutateAsync(allImages);
      }

      const trip = await createTrip.mutateAsync({
        title: title.trim(),
        destination: destination.trim(),
        startLocation: startLocation.trim(),
        startLat: startLocationCoords?.lat ?? null,
        startLng: startLocationCoords?.lng ?? null,
        destLat: destinationCoords?.lat ?? null,
        destLng: destinationCoords?.lng ?? null,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        travelMode,
        budget: budget ? Number(budget) : undefined,
        seats: seatsNum,
        description: description.trim(),
        placesToVisit: placesToVisit
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        images: uploadedUrls,
        notes: notes.trim() || undefined,
        joinType,
      });

      navigation.replace("TripDetail", { tripId: trip.id });
    } catch (err: any) {
      Alert.alert(
        isEditMode ? "Couldn't save changes" : "Couldn't create trip",
        err?.response?.data?.error ?? "Please try again"
      );
    }
  };

  const isSubmitting = createTrip.isPending || uploadImages.isPending || updateTrip.isPending;

  if (isEditMode && (isLoadingTrip || !prefilled)) {
    return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;
  }

  return (
    <View style={styles.screen}>
      <GradientBackground style={styles.hero}>
        <View style={{ paddingTop: insets.top + 20 }}>
          <Text style={styles.heroTitle}>{isEditMode ? "Edit Trip" : "Create a Trip"}</Text>
          <Text style={styles.heroSubtitle}>
            {isEditMode ? "Update your trip details below" : "Share your travel plan and find like-minded companions"}
          </Text>
        </View>
      </GradientBackground>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 16 }}
      >
        <Card>
          <Text style={styles.sectionHeading}>Trip Basics</Text>
          <View>
            <FieldLabel text="Trip title" required />
            <IconInput
              icon="format-title"
              error={submitted && !title.trim()}
              placeholder="e.g., Spiti Valley Road Trip"
              maxLength={60}
              value={title}
              onChangeText={setTitle}
            />
            <Text style={styles.counter}>{title.length}/60</Text>
          </View>

          {!isEditMode && (
            <View style={{ gap: 12 }}>
              <View>
                <Text style={styles.label}>Cover photo</Text>
                {coverPhoto ? (
                  <TouchableOpacity onPress={pickCoverPhoto}>
                    <Image source={{ uri: coverPhoto.uri }} style={styles.coverPreview} />
                    <View style={styles.coverChangeBadge}>
                      <Text style={styles.coverChangeText}>Change</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.coverPicker} onPress={pickCoverPhoto}>
                    <Text style={{ fontSize: 28 }}>🖼️</Text>
                    <Text style={styles.coverPickerText}>Add a cover photo</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View>
                <Text style={styles.label}>Additional photos</Text>
                <View style={styles.row}>
                  {images.map((asset) => (
                    <Image key={asset.uri} source={{ uri: asset.uri }} style={styles.thumb} />
                  ))}
                  <TouchableOpacity style={styles.addImage} onPress={pickImages}>
                    <Text style={{ fontSize: 24 }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </Card>

        <Card>
          <Text style={styles.sectionHeading}>Route</Text>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <FieldLabel text="Starting location" required />
              <IconInput
                icon="map-marker-outline"
                error={submitted && !startLocation.trim()}
                placeholder="e.g., Chennai, India"
                value={startLocation}
                onChangeText={(text) => {
                  setStartLocation(text);
                  if (startLocationCoords) setStartLocationCoords(null);
                }}
              />
              <TouchableOpacity style={styles.pickOnMapLink} onPress={() => setActivePicker("start")}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pickOnMapText}>Pick on map</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.flex1}>
              <FieldLabel text="Destination" required />
              <IconInput
                icon="flag-checkered"
                error={submitted && !destination.trim()}
                placeholder="e.g., Ladakh, India"
                value={destination}
                onChangeText={(text) => {
                  setDestination(text);
                  if (destinationCoords) setDestinationCoords(null);
                }}
              />
              <TouchableOpacity style={styles.pickOnMapLink} onPress={() => setActivePicker("destination")}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color={COLORS.primary} />
                <Text style={styles.pickOnMapText}>Pick on map</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>

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

        <Card>
          <Text style={styles.sectionHeading}>When</Text>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <FieldLabel text="Start date" required />
            </View>
            <View style={styles.flex1}>
              <FieldLabel text="End date" required />
            </View>
          </View>
          <TripDateFields
            startDate={startDate}
            endDate={endDate}
            onChangeStart={handleStartDateChange}
            onChangeEnd={setEndDate}
            endError={submitted && !endDate}
            inputStyle={styles.dateField}
            errorStyle={styles.inputError}
            placeholderStyle={styles.placeholderText}
          />
        </Card>

        <Card>
          <Text style={styles.sectionHeading}>Travel & Capacity</Text>
          <View>
            <FieldLabel text="Travel mode" required />
            <Text style={styles.helperText}>Select how you are planning to travel</Text>
            <View style={[styles.modeGrid, submitted && !travelMode && styles.selectorError]}>
              {TRAVEL_MODES.map((mode) => (
                <SelectableChip
                  key={mode}
                  icon={TRAVEL_MODE_ICONS[mode]}
                  label={travelModeText(mode)}
                  active={travelMode === mode}
                  onPress={() => setTravelMode(mode)}
                  style={styles.modeChip}
                />
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.flex1}>
              <FieldLabel text="Budget (₹, optional)" />
              <IconInput
                icon="currency-inr"
                placeholder="e.g., 10000"
                keyboardType="numeric"
                value={budget}
                onChangeText={setBudget}
              />
            </View>
            <View style={styles.flex1}>
              <FieldLabel text="Seats available" required />
              <IconInput
                icon="account-multiple"
                error={submitted && (!seats.trim() || Number(seats) < 1)}
                placeholder="e.g., 4"
                keyboardType="numeric"
                value={seats}
                onChangeText={setSeats}
              />
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionHeading}>Details</Text>
          <View>
            <FieldLabel text="Describe the trip" required />
            <IconInput
              icon="text-box-outline"
              error={submitted && !description.trim()}
              placeholder="Share a short description about your trip, what you plan to do, and what kind of companions you're looking for..."
              multiline
              maxLength={500}
              value={description}
              onChangeText={setDescription}
            />
            <Text style={styles.counter}>{description.length}/500</Text>
          </View>

          <View>
            <FieldLabel text="Places to visit (comma-separated)" />
            <IconInput
              icon="map-marker-multiple"
              placeholder="e.g., Pangong Lake, Nubra Valley, Khardung La"
              value={placesToVisit}
              onChangeText={setPlacesToVisit}
            />
          </View>

          <View>
            <FieldLabel text="Special requirements or notes (optional)" />
            <IconInput
              icon="note-text-outline"
              placeholder="e.g., fitness level, equipment needed, language preference, etc."
              multiline
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          <View>
            <FieldLabel text="Who can join?" required />
            <View style={[styles.joinTypeList, submitted && !joinType && styles.selectorError]}>
              {JOIN_TYPES.map((jt) => (
                <SelectableChip
                  key={jt.value}
                  icon={JOIN_TYPE_ICONS[jt.value]}
                  label={jt.label}
                  active={joinType === jt.value}
                  onPress={() => setJoinType(jt.value)}
                  style={styles.joinTypeChip}
                />
              ))}
            </View>
          </View>
        </Card>

        <PrimaryButton
          label={isEditMode ? "Save Changes" : "Publish Trip"}
          onPress={onSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
          icon={isEditMode ? "check" : "arrow-right"}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.fieldBg },
  hero: { paddingHorizontal: 20, paddingBottom: 24 },
  heroTitle: { color: COLORS.white, fontSize: 22, fontWeight: "800" },
  heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },
  scroll: { flex: 1 },
  sectionHeading: { ...TYPE.heading, fontSize: 16 },
  label: { ...TYPE.label, marginTop: 4 },
  required: { color: COLORS.danger },
  counter: { alignSelf: "flex-end", fontSize: 11, color: COLORS.mutedLight, marginTop: 2 },
  helperText: { fontSize: 12, color: COLORS.muted, marginTop: -2, marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
  inputError: { borderColor: COLORS.danger },
  placeholderText: { color: COLORS.mutedLight },
  selectorError: { borderWidth: 1, borderColor: COLORS.danger, borderRadius: RADIUS.field, padding: 6 },
  dateField: {
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.field,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  modeChip: { flexBasis: "31%", flexGrow: 1 },
  joinTypeList: { gap: 8, marginTop: 8 },
  joinTypeChip: { width: "100%", justifyContent: "flex-start", paddingHorizontal: 14 },
  pickOnMapLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  pickOnMapText: { color: COLORS.primary, fontSize: 12, fontWeight: "600" },
  coverPicker: {
    height: 150,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.fieldBg,
    gap: 6,
  },
  coverPickerText: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
  coverPreview: { width: "100%", height: 150, borderRadius: RADIUS.field },
  coverChangeBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(15,23,42,0.75)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coverChangeText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  addImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
```

Note on `sectionHeading`: the spec described section headers loosely as
label-styled text; this implementation gives them `TYPE.heading`'s weight
and color but a smaller `fontSize: 16` (vs. the token's 24, meant for
full-page headings) — appropriately sized for a card's inner section
title while staying visually consistent with the system's heading style.

Note on `JOIN_TYPE_ICONS`/`TRAVEL_MODE_ICONS`/date-field icon: all use
`MaterialCommunityIcons` names already confirmed to exist and render
correctly elsewhere in this codebase (`lock-outline` — Login's password
field; `account-multiple` — `TripCard`'s seats icon; `arrow-right` —
Login/Welcome's button icon; `map-marker-outline`,
`map-marker-radius-outline` — the location picker; `calendar-blank-outline`
— a standard, widely-used glyph) to minimize the risk of an invalid icon
name silently rendering blank.

- [ ] **Step 2: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Start a temporary web dev server on a free port (check via `netstat`
first), confirm the bundle compiles cleanly, then kill that server's
specific PID and confirm the user's live tunnel (port 8081, if running)
is unaffected. Since Create Trip requires auth against the live
production backend with no local test account available, full
interactive click-through may not be possible — if so, that's an
accepted, already-established limitation from the previous plan; rely
instead on: a clean typecheck, the bundle compiling and including the
new component imports (grep the built bundle output for
`GradientBackground`, `SelectableChip`, etc.), and a careful code-trace
confirming `onSubmit`, `handleStartDateChange`, the prefill effect, and
both mutation payload objects are byte-identical to the pre-restyle
version (diff them against git history if useful) — this task must not
change behavior, only rendering.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/CreateTripScreen.tsx
git commit -m "Redesign Create Trip with the Triply design system (sections, icon inputs, chips)"
```
