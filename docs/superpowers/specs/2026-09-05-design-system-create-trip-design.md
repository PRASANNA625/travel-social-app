# Triply Design System (Phase 1: Foundation + Create Trip) — Design Spec

## Goal

Extract the visual language already used on the Welcome and Login screens
(gradient, typography, cards, inputs, buttons) into a small, reusable
design-system foundation, and apply it to redesign Create Trip (which
also serves as Edit Trip — one screen, `isEditMode`-gated) with a modern,
premium, blue→teal aesthetic: rounded icon inputs, clear section
hierarchy, a restyled Travel Mode selector, and subtle shadows/gradient
accents — without changing any of the screen's existing functionality,
validation, or data flow (dates, the location picker, and destination
coordinates all shipped in the immediately preceding work and are
untouched here).

## Non-goals

- **No rollout to other screens in this phase.** Discover, Trip Details,
  Profile, Edit Profile, Group Chat, Notifications, and the rest get
  their own follow-on spec once this foundation and Create Trip are
  shipped and validated (explicit user decision during design: two
  phases, not one).
- **No behavior changes.** Every field's validation, state, and submit
  logic (title/destination/dates/location picker/travel
  mode/budget/seats/description/images/notes/join type) stays exactly as
  it is — this is a visual/structural restyle on top of already-shipped
  logic, not a rewrite.
- **No forcing every screen into one identical look.** The design system
  is a shared vocabulary (tokens + a handful of primitives), not a
  single rigid template — this spec explicitly keeps Welcome's white-pill
  hero button as its own variant rather than unifying it with the new
  general-purpose `PrimaryButton`.

## 1. Design tokens — `mobile/src/theme/tokens.ts` (new)

Extracted from Welcome (`mobile/src/screens/WelcomeScreen.tsx`) and Login
(`mobile/src/screens/LoginScreen.tsx`), standardized on Login's three-stop
gradient (the more refined of the two — used behind real content, not a
decorative-only screen) as the system's one canonical gradient:

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
    shadowColor: "#0f172a", shadowOpacity: 0.25, shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 }, elevation: 8,
  },
  button: {
    shadowColor: "#0f766e", shadowOpacity: 0.35, shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
};

export const TYPE = {
  heading: { fontSize: 24, fontWeight: "800" as const, color: COLORS.ink },
  subheading: { fontSize: 13.5, color: COLORS.muted, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "600" as const, color: COLORS.ink },
  body: { fontSize: 15, color: COLORS.ink },
};
```

User-confirmed during design review: values match Welcome/Login exactly,
no adjustment requested.

## 2. Shared components — `mobile/src/components/theme/` (new directory)

One file per component, each importing only from `tokens.ts` and RN
primitives — no screen-specific logic in any of them.

- **`GradientBackground.tsx`** — wraps `LinearGradient` (using
  `GRADIENT_PRIMARY`) plus the two decorative translucent circles and the
  large low-opacity compass icon pattern already duplicated between
  `WelcomeScreen.tsx` and `LoginScreen.tsx`. Props: `children`, optional
  `style` for the outer container. This is a straight extraction of
  existing duplicated JSX into one place — a real, small de-duplication
  win alongside the redesign.
- **`Card.tsx`** — `View` styled with `COLORS.cardBg`, `COLORS.cardBorder`,
  `RADIUS.card`, `SHADOW.card`. Props: `children`, `style`.
- **`IconInput.tsx`** — the icon + `TextInput` row pattern from Login's
  email/password fields. Props: `icon` (a `MaterialCommunityIcons` name),
  `value`, `onChangeText`, `placeholder`, plus pass-through `TextInput`
  props (`keyboardType`, `secureTextEntry`, `multiline`, etc.) and an
  optional `error` boolean that swaps the border color to `COLORS.danger`
  and an optional `rightElement` slot (for the existing show/hide-password
  eye icon pattern, or Create Trip's "Pick on map" trigger).
- **`PrimaryButton.tsx`** — solid `COLORS.primary` button, `RADIUS.field`,
  `SHADOW.button`, white bold text, optional `icon`, `loading` (shows an
  `ActivityIndicator` in place of the label, matching Login's existing
  pattern), `disabled`. This becomes the general-purpose action button
  used wherever a screen needs a primary "do the thing" button on a light
  background — Welcome's white-pill hero button is NOT touched or
  unified with this; it remains its own one-off, used only over a
  full-bleed gradient hero, per the explicit design decision above.
- **`SelectableChip.tsx`** — a card-style selectable option: icon + label,
  `RADIUS.chip`, `COLORS.fieldBg`/border when inactive, `COLORS.primary`
  fill + white text/icon when active. Props: `icon`, `label`, `active`,
  `onPress`. Used for Travel Mode and Join Type.

## 3. Create Trip redesign — `mobile/src/screens/CreateTripScreen.tsx`

Restructures the screen's layout into visually distinct sections; does
not change any handler, validation function, or piece of state. Current
functions this spec reuses as-is and must not alter: `onSubmit`,
`handleStartDateChange`, `pickCoverPhoto`, `pickImages`, the
`LocationPickerModal` wiring, all `useState` declarations, and the
`createTrip`/`updateTrip` mutation calls.

- **Header**: `GradientBackground` wraps just a hero band containing the
  existing title text ("Create a Trip" / "Edit Trip" per `isEditMode`)
  and subtitle — no card, sits directly on the gradient, mirroring
  Login's brand-row-on-gradient treatment. The rest of the screen (the
  `ScrollView` with all form fields) sits below this band on a plain
  `COLORS.fieldBg`-toned background — not on the gradient — per the
  confirmed "gradient header band" decision.
- **Section grouping**: the existing flat sequence of fields is wrapped
  into `Card` components under new section headers (`TYPE.label` style),
  in this order: **Trip Basics** (title, cover photo/images — existing
  `pickCoverPhoto`/`pickImages` UI restyled inside the card, same
  handlers), **Route** (Starting Location / Destination, each an
  `IconInput` with a `map-marker-outline` icon and a `rightElement` of
  the existing "Pick on map" `TouchableOpacity`, wired to the exact same
  `setActivePicker`/`LocationPickerModal` logic already in the file — the
  location picker itself is untouched), **When** (start/end dates —
  `TripDateFields` keeps its own internal logic entirely; only the outer
  button styling it receives via its `inputStyle`/`errorStyle` props
  changes to match `IconInput`'s visual treatment, so a calendar icon and
  the field's rounded/bordered look appear identically on both
  `TripDateFields.tsx` and `TripDateFields.web.tsx` without touching
  either file's date logic), **Travel & Capacity** (the existing
  `TRAVEL_MODES` grid restyled using `SelectableChip` in place of the
  current `modeCard` markup — same `travelMode`/`setTravelMode` state,
  same grid data source; budget and seats as side-by-side `IconInput`s),
  **Details** (description, places to visit, notes, and join-type
  restyled as `SelectableChip`s in place of the current join-type pill
  list — same `joinType`/`setJoinType` state).
- **Submit button**: the existing submit `TouchableOpacity` becomes a
  `PrimaryButton`, same `onSubmit` handler, same `isSubmitting` state
  driving its `loading` prop.

## Testing / verification

No test framework exists in this repo — verification is `npx tsc
--noEmit` plus a manual walkthrough on a temporary web dev server
(established practice this session: check for a free port, verify, kill
only that server's PID, never touch the user's live tunnel). Full
interactive click-through of Create Trip may not be possible in the
implementation environment (it requires auth against the live production
backend with no local test account available — the same accepted
limitation the previous plan's tasks hit repeatedly); a clean typecheck
plus a compiling/loading web bundle plus a careful visual code-trace is
the fallback evidence, consistent with how the prior plan verified its
own UI work.
