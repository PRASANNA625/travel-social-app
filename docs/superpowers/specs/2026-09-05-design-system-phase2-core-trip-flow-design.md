# Triply Design System (Phase 2: Core Trip Flow) — Design Spec

## Goal

Extend the Phase 1 design-system foundation (`mobile/src/theme/tokens.ts`,
`mobile/src/components/theme/`) to the three screens users spend the most
time in — Discover, My Trips, and Trip Details — plus the shared `TripCard`
component they all render. Consolidate the hardcoded colors/radii/shadows
already scattered across these files (which mostly already match the
Phase 1 palette by coincidence) onto the shared tokens, reuse existing
shared components where they genuinely fit, and add one new visual touch:
a gradient header band on Discover, matching Create Trip's.

## Non-goals

- **No rollout to the remaining screens.** Profile, Edit Profile, User
  Profile, Group Chat, Notifications, Join Requests Inbox, Onboarding,
  Register, and Phone Login get their own follow-on spec (explicit user
  decision: scope this phase to the core trip flow only).
- **No behavior changes.** Every handler, state variable, query hook, and
  piece of business logic in Discover/MyTrips/TripDetail/TripCard stays
  exactly as it is — this is a visual/token consolidation, not a rewrite.
- **No forcing a uniform look.** TripCard and TripDetail's existing
  image-gradient hero treatment already works well and is NOT restructured
  into `Card`-based blocks this phase (explicit user choice: "componentize
  + light gradient touch," not "full visual refresh"). Discover's filter
  chips, FAB, and modal sheets keep their current shapes — they pull
  colors from tokens but are not force-fit into `SelectableChip` or other
  Phase 1 components where those components' shape doesn't match (chip
  pills in a horizontal scroll list, a floating action button, a
  segmented two-tab control are all different shapes than what
  `SelectableChip`/`PrimaryButton` model).

## 1. Token additions — `mobile/src/theme/tokens.ts` (extend existing file)

Add three new color pairs to the existing `COLORS` export, values taken
verbatim from where they already appear today (`TripDetailScreen.tsx`'s
like/save/pending states):

```ts
export const COLORS = {
  // ...existing fields unchanged...
  dangerBg: "#fef2f2",
  dangerBorderLight: "#fecaca",
  successBg: "#ecfdf5",
  successBorderLight: "#a7f3d0",
  warningBg: "#fef9c3",
  warningText: "#854d0e",
};
```

No other token file changes. `GRADIENT_PRIMARY`, `RADIUS`, `SHADOW`,
`TYPE` are reused as-is.

## 2. `PrimaryButton` — add a `variant` prop (extend existing component)

`mobile/src/components/theme/PrimaryButton.tsx` currently renders one
solid-teal style. Trip Details needs a second, outlined style for its
secondary actions (Requests, Group Chat, Cancel). Add:

```ts
variant?: "solid" | "outline"; // default "solid"
```

- `"solid"` (default): unchanged from Phase 1 — `COLORS.primary`
  background, white text/icon, `SHADOW.button`. Existing Create Trip
  usage (no `variant` prop passed) is visually identical after this
  change.
- `"outline"`: transparent/white background, `COLORS.primary` border
  (1.5pt) and text/icon color, no shadow. `loading`'s `ActivityIndicator`
  color switches to `COLORS.primary` (instead of white) in this variant.

All other props (`label`, `icon`, `loading`, `disabled`, `onPress`) behave
identically in both variants.

## 3. `TripCard.tsx` — token-ize, no layout change

Replace hardcoded values with token references, 1:1, no visual change:

- `#0f172a` → `COLORS.ink` (shadow color, comment/title colors)
- `#64748b` → `COLORS.muted`
- `#94a3b8` → `COLORS.mutedLight` (not currently used here but matches)
- `#e2e8f0` → `COLORS.border`
- `#0f766e` → `COLORS.primary`
- `#dc2626` → `COLORS.danger`
- `#fff` → `COLORS.white`
- card `borderRadius: 20` → `RADIUS.card - 4` is NOT a token; keep the
  literal `20` (TripCard's radius is intentionally smaller than the
  24px `RADIUS.card` used for full-width form cards — it's a denser list
  item). Do not force `RADIUS.card` here — literal `20` stays.
- the card's shadow values (`shadowOpacity: 0.08`, `shadowRadius: 16`,
  `shadowOffset: { height: 6 }`, `elevation: 3`) are deliberately lighter
  than `SHADOW.card` (a list-item shadow vs. a floating-card shadow) —
  keep these literal, do not replace with `SHADOW.card`.

The `LinearGradient` placeholder colors (`["#1d4ed8", "#0f766e"]` and
`["#2563eb", "#0f766e"]` used here and in TripDetail's hero) are visually
distinct two-stop gradients, not `GRADIENT_PRIMARY`'s three-stop teal
gradient — leave them as local literals; they are a different, intentional
visual (an image placeholder accent, not a full-screen brand gradient).

## 4. `DiscoverScreen.tsx`

- **Header**: wrap the greeting row (`"Hi, {name} 👋"` / `"Where to
  next?"` + avatar) in `GradientBackground`, mirroring Create Trip's hero
  band structure — `<GradientBackground style={styles.hero}>` containing
  a `View` with the existing greeting `Text`s (now white/light-colored
  for contrast on the gradient: `heroTitle` in `COLORS.white`,
  `heroSubtitle` in a light translucent white) and the avatar
  (unchanged, `onPress` navigates to Profile as today). No new state, no
  new handlers.
- **Below the header**: the search bar, filter-chip row, trip list, FAB,
  and both modals move to a plain `COLORS.fieldBg` background (replacing
  the current single flat `#f8fafc` container background — same value,
  now sourced from the token) — unchanged layout and logic.
- **Filter chips** (`Near Me` + travel-mode pills): token-ize colors only
  (`COLORS.white`/`primary`/`border`/`ink`-adjacent slate tones,
  `RADIUS.pill` for the `999` radius) — shape, horizontal-scroll
  behavior, and active-state logic (`nearMe`, `travelMode` state) stay
  exactly as-is. Not converted to `SelectableChip` (see Non-goals).
- **FAB**: token-ize colors (`COLORS.primary`, `SHADOW.button` in place
  of its current bespoke shadow values, since they're already
  nearly identical) — position, shape, and `onPress` unchanged.
- **Modals** (radius sheet, location-denied sheet): token-ize colors
  (`COLORS.ink`/`muted`/`border`/`danger`/`dangerBg`/`primary`,
  `RADIUS.card` for the sheet's `20`px radius) — no structural change.

## 5. `MyTripsScreen.tsx`

- **Tab row** (`My Trips` / `Saved`): token-ize colors
  (`COLORS.white`/`border`/`primary`, existing `10`px radius kept
  literal — it's a small segmented control, not a card) — the two-tab
  segmented shape stays bespoke, not converted to `SelectableChip` (a
  2-way segmented control is a different shape/interaction than a
  multi-option chip grid).
- **Container/empty state**: token-ize (`COLORS.fieldBg`, `COLORS.mutedLight`).
- No changes to `useMyTrips`/`useBookmarkedTrips`/`useDeleteTrip` wiring,
  the delete-confirmation flow, or `TripCard` usage.

## 6. `TripDetailScreen.tsx`

- **Action buttons**: the owner's "Edit Trip" button and the
  non-owner's "I'm Interested" button become
  `<PrimaryButton variant="solid" .../>` (same `onPress`, `disabled`,
  `loading` wiring as today). The owner's "Requests (N)" / "Group Chat"
  buttons, and the photo-edit panel's "Cancel" button, become
  `<PrimaryButton variant="outline" .../>`. The photo-edit panel's "Save
  photos" button stays `variant="solid"`. No change to which button
  renders when (`isOwner`/`isMember`/`myRequest`/`joinType`/`status`
  branching in `actionSlot` is untouched), no change to any mutation
  call.
- **Pending badges** (pending-approval, invite-only, full, ended):
  token-ize (`COLORS.warningBg`, `COLORS.warningText`) — same
  conditional rendering, same text.
- **Header, hero, info rows, description, places/notes blocks, comments
  section**: token-ize colors/radii in place (`COLORS.ink/muted/
  mutedLight/border/fieldBg/primary/danger/dangerBg/dangerBorderLight/
  successBg/successBorderLight`, `RADIUS.field` for the `14`px radii
  already in use) — no structural change, no new `Card` wrapping (see
  Non-goals). The hero image gradient placeholders keep their literal
  two-stop colors per the TripCard section above.
- **Status pill** (`TRIP_STATUS_COLORS`/`TRIP_STATUS_LABELS`): untouched,
  already a shared token-like utility from the previous plan.

## Testing / verification

Same as Phase 1: no test framework exists in this repo. Verification is
`npx tsc --noEmit` plus a manual code-trace confirming every state
variable, handler, and mutation call in these four files is byte-identical
before/after (the same verification method the Phase 1 final reviewer used
for Create Trip — diffing the extracted logic block, not just skimming).
A temporary `expo start --web` server (free port, killed after, never
touching the user's live tunnel on 8081) provides a compiling-bundle
smoke check; full interactive click-through may not be possible without a
local test account, same accepted limitation as both prior plans.
