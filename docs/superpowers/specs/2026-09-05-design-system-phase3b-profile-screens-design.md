# Triply Design System Phase 3b (Edit Profile & User Profile) — Design Spec

## Goal

Bring `EditProfileScreen.tsx` and `UserProfileScreen.tsx` onto the same
visual language as the rest of the app (`theme/tokens.ts` +
`components/theme/`), completing the profile-family trio alongside the
already-redesigned `ProfileScreen.tsx`. These are 2 of the original 7
screens identified in the app-wide consistency audit; Phase 3c
(`GroupChatScreen`, `JoinRequestsInboxScreen`) remains the other deferred
sub-phase, not started by this plan.

## Audit findings that shape this spec

- **`EditProfileScreen.tsx` already uses near-exact token values as
  literals** (`#0f172a`=`COLORS.ink`, `#0f766e`=`COLORS.primary`,
  `#64748b`=`COLORS.muted`, `#94a3b8`=`COLORS.mutedLight`,
  `#e2e8f0`=`COLORS.border`, `#f8fafc`=`COLORS.fieldBg`,
  `#fff`/`#ffffff`=`COLORS.white`). This phase de-duplicates it onto the
  shared components (`Card`, `IconInput`, `PrimaryButton`,
  `SelectableChip`) the same way Phase 3a de-duplicated `RegisterScreen`
  onto them — **not** a from-scratch redesign.
- **`ProfileScreen.tsx` already established the precedent** of using the
  shared `Card` component (with its `cardBg`/`cardBorder`/`SHADOW.card`
  values, tuned for gradient screens) for plain sections sitting on a
  `COLORS.fieldBg` background — see its `section` style overriding only
  `padding`/`gap`/`marginTop`. This spec follows that same precedent for
  `EditProfileScreen`'s three sections rather than treating the
  heavier shadow/translucent border as a new problem to solve.
- **`UserProfileScreen.tsx` is currently bare** — no cover photo, no age,
  a plain centered avatar, and interests/modes shown as neutral chips
  with no icons. Unlike Register, this is a genuine restyle (mirroring
  `ProfileScreen`'s already-redesigned structure), not a pure
  de-duplication, because there is little existing visual structure to
  preserve. `useUser(userId)` already returns `coverPhotoUrl` and `age`
  on the shared `User` type (confirmed in `types/index.ts:49-57`) — they
  are fetched but simply not rendered today, so displaying them is a
  render-layer change, not a new data dependency.
- **`SelectableChip` is already used elsewhere** (`CreateTripScreen.tsx`)
  without a trailing checkmark icon when active — confirming that
  dropping `EditProfileScreen`'s current chip's extra
  `check-circle-outline` icon (present only on that screen today) when
  switching to the shared component is consistent with the app's
  existing convention, not a one-off regression.

## Non-goals

- No change to any mutation, validation rule, navigation target, or
  `useState` in either file. `onSave`, `onChangePhoto`, `onChangeCover`,
  `completionChecks`/`completionPercent`, and the `INTEREST_OPTIONS`
  list in `EditProfileScreen` are unchanged. `UserProfileScreen`'s data
  fetching (`useUser`, `useCompletedTrips`) is unchanged.
- No new stats-count row (à la `ProfileScreen`'s 3 stat cards) on
  `UserProfileScreen` — that would be new content beyond what the screen
  showed before, not a restyle of existing content. Interests, modes,
  and previous trips stay exactly as their own sections, only restyled.
- No owner-only affordances added to `UserProfileScreen` (no photo/cover
  upload, no Edit Profile / Log Out buttons) — it remains strictly a
  read-only view of someone else's profile.
- `EditProfileScreen`'s fixed top header bar (back button + title) is
  **not** replaced with `GradientBackground` or any hero pattern — it is
  a compact, non-scrolling utility bar, structurally unlike Discover's or
  Notification's hero bands. Only its literal colors are token-ized.

## 1. `EditProfileScreen.tsx` — de-duplicate onto shared components

- **Header bar**: keep its exact current structure (back button, centered
  title, empty spacer for symmetry). Token-ize: `#0f172a`→`COLORS.ink`,
  `#f8fafc`→`COLORS.fieldBg` (both the button bg and screen bg),
  `#fff`→`COLORS.white` (header bg). `#f1f5f9` (header's bottom border)
  has no exact token match — left as a literal.
- **Cover photo section**: replace the raw
  `<LinearGradient colors={["#1d4ed8", "#0f766e"]}>` placeholder with
  `<GradientBackground style={styles.cover} />` (matching
  `ProfileScreen`'s own placeholder-cover pattern exactly). Apply
  `optimizedImageUrl(user.coverPhotoUrl, windowWidth)` to the real photo
  the same way `ProfileScreen` does (import `useWindowDimensions` for
  `windowWidth`). The "Change Cover Photo" pill button keeps its exact
  current structure/copy — only its literal colors are token-ized
  (`rgba(15,23,42,0.55)` has no exact token match and stays literal;
  `#fff` text/icon → `COLORS.white`).
- **Avatar block**: token-ize colors only
  (`#0f766e`→`COLORS.primary`, `#f8fafc`→`COLORS.fieldBg`,
  `#fff`→`COLORS.white`). Apply `optimizedImageUrl(user.photoUrl, 184)`
  (92 display size × 2 for retina, matching the sizing convention
  `ProfileScreen` uses for its own 104px avatar → 208px request).
  Structure, upload handlers, and the completion badge/progress bar are
  unchanged (colors token-ized: `#0f766e`→`COLORS.primary`,
  `#e2e8f0`→`COLORS.border`; `#334155` on `completionText` has no exact
  token match and stays literal).
- **The three sections** (Basic Information / About You / Travel
  Preferences): replace `<View style={styles.card}>` with
  `<Card style={styles.card}>`, where `styles.card` is overridden to
  `{ padding: 16, gap: 12 }` to preserve the screen's original spacing
  exactly (mirrors `ProfileScreen`'s own `section` override and Phase
  3a's `RegisterScreen` `Card` override — the same pattern, not a new
  one). `Card`'s own `cardBg`/`cardBorder`/`SHADOW.card` replace the
  section's current opaque-white/`#e2e8f0`-border/subtle-shadow look;
  this is the same accepted trade-off `ProfileScreen`'s sections already
  made, not a new regression. The `cardHeaderRow` (icon + title) keeps
  its exact current structure, token-izing `#0f766e`→`COLORS.primary`,
  `#0f172a`→`COLORS.ink`.
- **Name / Age / City fields**: replace each `fieldWrap` + `TextInput`
  pair with `IconInput`:
  ```tsx
  <IconInput icon="account-outline" placeholder="Your name" value={name} onChangeText={setName} />
  <IconInput icon="cake-variant-outline" placeholder="e.g., 28" keyboardType="numeric" value={age} onChangeText={setAge} />
  <IconInput icon="map-marker-outline" placeholder="e.g., Bengaluru" value={location} onChangeText={setLocation} />
  ```
  (`IconInput`'s own icon color `COLORS.muted` and placeholder color
  `COLORS.mutedLight` match the current literals exactly.) The
  `fieldLabel` "Name"/"Age"/"Home / Current City" text above each field
  is unchanged — `IconInput` has no label prop, so labels stay as
  sibling `<Text style={styles.fieldLabel}>` elements exactly as today.
  **Accepted exception** (same category as Phase 3a's documented 1px
  note): `IconInput`'s internal `paddingVertical: 13` vs the original
  `fieldInput`'s `12` — no prop exists to override this; imperceptible.
- **Bio field**: replace with
  `<IconInput icon="note-text-outline" placeholder="Tell other travelers a bit about yourself..." multiline maxLength={BIO_MAX_LENGTH} value={bio} onChangeText={setBio} />`.
  `IconInput` already supports `multiline` (confirmed in
  `IconInput.tsx:24,33,36` — adds `wrapMultiline`/`inputMultiline`
  styles when the prop is set), producing the same top-aligned multiline
  box the current `bioInput` style produces. The character counter
  `{bio.length}/{BIO_MAX_LENGTH}` stays as its own `<Text>` below,
  unchanged.
- **Travel-mode and interest chip rows**: replace each chip
  `TouchableOpacity` with `SelectableChip`:
  ```tsx
  <SelectableChip
    icon={TRAVEL_MODE_ICONS[mode]}
    label={travelModeText(mode)}
    active={preferredModes.includes(mode)}
    onPress={() => toggleMode(mode)}
  />
  ```
  and equivalently for `INTEREST_OPTIONS` using `option.icon`/`option.value`.
  **Accepted exceptions** (component-adoption trade-offs, same category
  as the IconInput 1px note): `SelectableChip`'s fixed icon size `16` vs
  the original `14`; its active-state label color uses `COLORS.ink`
  where the original inactive label used the very-close but
  non-token-matching `#334155`; and it does not render a trailing
  `check-circle-outline` icon when active (the current screen's only
  chip with that extra icon) — `SelectableChip` never renders one
  anywhere else in the app (confirmed: `CreateTripScreen.tsx` is its only
  other current usage, also without a checkmark), so this brings
  `EditProfileScreen` in line with the app's one existing convention
  rather than introducing a new inconsistency.
- **Save button**: replace with
  ```tsx
  <PrimaryButton
    label="Save Changes"
    icon="check"
    onPress={onSave}
    disabled={updateProfile.isPending}
    loading={updateProfile.isPending}
  />
  ```
  (`PrimaryButton`'s own shadow/radius/padding already match the current
  `saveButton` style closely; exact `SHADOW.button` values differ
  slightly from the current inline shadow — accepted, same category as
  Phase 3a's Register `PrimaryButton` adoption.)
- **Success banner**: keep its exact current structure/copy. `#dcfce7`
  and `#166534` have no exact token match (`COLORS.successBg` is
  `#ecfdf5`, a different green) — left as literals per the exact-match
  substitution rule used in every prior phase.
- Deleted from the stylesheet (no longer referenced):
  `card`, `fieldWrap`, `fieldInput`, `bioInput`, `chip`, `chipActive`,
  `chipText`, `chipTextActive`, `saveButton`, `saveText`.

## 2. `UserProfileScreen.tsx` — restyle to match Profile's read-only twin

Rebuild using `ProfileScreen`'s structural pattern, stripped of every
owner-only affordance:

- **Cover band**: same `coverWrap`/`coverHeight` aspect-ratio approach as
  `ProfileScreen` (`Math.min(Math.max(windowWidth / 2.2, 200), 280)`),
  same 3-stop scrim gradient over a real photo
  (`optimizedImageUrl(user.coverPhotoUrl, windowWidth)`), same
  `GradientBackground` placeholder when `user.coverPhotoUrl` is absent.
  **No** cover-edit button — this user isn't the viewer.
- **Sheet + avatar**: same rounded `sheet` (`marginTop: -26`,
  `borderTopLeftRadius/borderTopRightRadius: 26`) rising over the cover,
  same avatar overlap (`marginTop: -58`, 104px, white 4px border,
  `optimizedImageUrl(user.photoUrl, 208)`) with the same placeholder
  initial-letter fallback. **No** avatar edit badge/camera icon, **no**
  `onPress` upload handler — the avatar is not touchable.
  Name/location/age/bio rendered exactly like `ProfileScreen`'s
  `headerBlock` (same `metaRow` with location pin + age-in-years, same
  centered bio text) using `user.location`, `user.age`, `user.bio` (all
  already present on the fetched `user` object, just newly rendered).
- **Interests** (`user.interests.length > 0`): `<Card>` with a
  `SectionHeader`-style icon+title row ("Travel interests",
  `tag-multiple-outline`) and a `chipRow` of read-only chips — reuse the
  exact same filled-`COLORS.primary` `StaticChip`-style rendering
  `ProfileScreen` uses (a plain `View`, not `TouchableOpacity`, since
  these are non-interactive display chips both on Profile and here).
- **Preferred travel modes** (`user.preferredModes.length > 0`): same
  `Card` + chip-row pattern, icon `compass-outline`, using
  `TRAVEL_MODE_ICONS[m]`/`travelModeText(m)` exactly as `ProfileScreen`
  already imports and uses for its own equivalent section.
- **Previous trips**: `<Card>` with title
  `` `Previous trips (${completedTrips?.length ?? 0})` ``, rendering each
  trip as a row (title + destination) matching `ProfileScreen`'s
  `tripRow` styling — **without** the `onPress`/`navigation.navigate`
  used on `ProfileScreen`'s equivalent row, since `UserProfileScreen`'s
  current version has no such navigation today and this spec changes no
  behavior. An empty state ("No completed trips yet") mirrors
  `ProfileScreen`'s empty-state copy pattern, adjusted to third person
  ("No completed trips yet.") since this is someone else's profile.
- **Loading state**: replace the bare
  `<ActivityIndicator style={{ marginTop: 40 }} size="large" />` with a
  skeleton reusing the existing `Skeleton` component
  (`components/theme/Skeleton.tsx`, already used by `ProfileScreen`,
  `NotificationsScreen`, etc.) in the same cover/avatar/name/meta shape
  `ProfileScreen`'s own `ProfileSkeleton` uses, sized for this screen's
  layout. This mirrors the app-wide skeleton convention rather than
  introducing a new one.
- Screen background changes from plain `#fff` to `COLORS.fieldBg`,
  matching `ProfileScreen`'s screen background (needed for the sheet's
  rounded-corner overlap effect to read correctly — a plain white
  background behind a white sheet would hide the rounding entirely).

No new props, no new navigation params, no change to `useUser`/
`useCompletedTrips` call signatures.

## Testing / verification

Same as every prior phase: no test framework exists in this repo.
Verification is `npx tsc --noEmit` (mobile) plus a manual diff/code-trace
confirming every piece of state and every navigation target in both
files is unchanged — only render/style code differs. A temporary
`expo start --web` bundle-compile check (free port, killed after, never
touching the live tunnel on 8081) is the fallback smoke check for the
web platform, consistent with every prior phase in this session.
