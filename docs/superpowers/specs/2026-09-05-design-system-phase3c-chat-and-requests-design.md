# Triply Design System Phase 3c (Group Chat & Join Requests) — Design Spec

## Goal

Bring `GroupChatScreen.tsx` and `JoinRequestsInboxScreen.tsx` onto the same
visual language as the rest of the app (`theme/tokens.ts` +
`components/theme/`). These are the last 2 of the original 7 screens
identified in the app-wide consistency audit — completing the design
system rollout after Phase 1 (Create Trip), Phase 2 (Discover/MyTrips/
TripDetail/TripCard), the ad-hoc Profile/Notifications redesigns, Phase 3a
(Welcome/Register/Onboarding/PhoneLogin), and Phase 3b (EditProfile/
UserProfile).

## Audit findings that shape this spec

- **`GroupChatScreen.tsx` already uses near-exact token values as
  literals** (`#0f172a`=`COLORS.ink`, `#0f766e`=`COLORS.primary`,
  `#64748b`=`COLORS.muted`, `#94a3b8`=`COLORS.mutedLight`,
  `#e2e8f0`=`COLORS.border`, `#f8fafc`=`COLORS.fieldBg`,
  `#fff`/`#ffffff`=`COLORS.white`, `#dc2626`=`COLORS.danger`, and its
  `attachButton`'s `#ecfdf5`=`COLORS.successBg` exactly). This screen was
  also the target of an earlier session's performance work (Cloudinary
  `optimizedImageUrl` on avatars/message images, `Skeleton`-based loading
  state) — that work stays untouched.
- **Unlike the form-shaped screens de-duplicated in Phase 3a/3b, `GroupChatScreen`'s
  UI does not match the shared components' shapes.** `IconInput` is a
  labeled field with a mandatory leading icon; the chat composer is an
  icon-less rounded pill. `PrimaryButton` is a full-width button; the
  camera/send buttons are small icon-only circles, and the photo-preview
  row packs two icon buttons plus a `flex: 1` send button side by side —
  a shape `PrimaryButton` isn't built for. `Card`'s shadow/border are
  tuned for a padded standalone section, not a chat bubble. Forcing any
  of these components into this screen would be a shape mismatch, the
  same category of decision that kept the auth screens' full-screen
  gradient out of `GradientBackground` in Phase 3a. **This spec
  token-izes `GroupChatScreen`'s colors only — no component swaps.**
- **`JoinRequestsInboxScreen.tsx` is genuinely under-styled** — flat
  `#fff`/`#eee` cards with no icons, emoji-prefixed status text
  (`"✅ Approved"`), and a bare `ActivityIndicator` for loading. This is a
  real restyle, not a pure de-duplication.
- **`NotificationsScreen.tsx` already established the convention for a
  repeating list of lightweight cards**: `item` style is
  `{ backgroundColor: COLORS.white, borderRadius: RADIUS.field,
  borderWidth: 1, borderColor: COLORS.border, padding: 14 }` — an opaque
  card with no heavy shadow. This spec models `JoinRequestsInboxScreen`'s
  request cards on that same convention, **not** the shared `Card`
  component, whose `cardBg`/`cardBorder`/`SHADOW.card` values were tuned
  for grouped sections on gradient/fieldBg screens (Profile's Interests
  card), not individual repeating list items — the same categorical
  choice already made for `TripCard`, `NotificationsScreen`'s items, and
  `ProfileScreen`'s `tripRow`, none of which use the generic `Card`
  either.
- **`NotificationsScreen.tsx` already established the icon+color
  convention for join-request states**: its `NOTIFICATION_ICON` map uses
  `check-circle`/`successBg`/`primary` for `JOIN_REQUEST_APPROVED` and
  `close-circle-outline`/`dangerBg`/`danger` for `JOIN_REQUEST_REJECTED`.
  This spec reuses those exact icon/color choices for
  `JoinRequestsInboxScreen`'s own resolved-status pill, so the same
  semantic state reads identically wherever it appears in the app.
- **`PrimaryButton` has no danger variant** (`variant` is only
  `"solid" | "outline"`, and `"solid"` always uses `COLORS.primary`).
  Adding one would be a shared-component change reaching every other
  `PrimaryButton` consumer in the app — out of scope for a 2-screen
  phase. This spec keeps Approve/Reject as their own custom, token-ized
  side-by-side buttons.
- `JoinRequestsInboxScreen` has no custom header — it relies on the
  native stack header (`options={{ title: "Join Requests" }}` in
  `AppNavigator.tsx`). This spec does not add one; only the `FlatList`
  content area is restyled.

## Non-goals

- No new shared component extracted for danger-styled buttons or for
  chat-specific UI (composer, message bubble, icon-only action button) —
  real, deferred opportunities noted here, not built now.
- No behavior/data changes anywhere: every `useState`, mutation call
  (`sendMessage`, `uploadImage.mutateAsync`, `respond.mutate`), and
  navigation target in both files stays exactly as it is.
- No change to `GroupChatScreen`'s already-shipped performance work
  (`optimizedImageUrl` calls, `Skeleton` loading state) beyond what
  token-izing its surrounding colors requires.
- No custom header added to `JoinRequestsInboxScreen` — the native stack
  title stays as configured in `AppNavigator.tsx`.

## 1. `GroupChatScreen.tsx` — token-ize colors only

Substitute only exact-value matches, per the same rule used in every
prior phase:

- `#0f172a` → `COLORS.ink` (header title, message text, input text)
- `#0f766e` → `COLORS.primary` (attach-button icon, avatar placeholder bg,
  sender name, message-mine bubble bg/border, send button bg,
  previewSendButton bg)
- `#64748b` → `COLORS.muted` (header subtitle)
- `#94a3b8` → `COLORS.mutedLight` (empty-state text, input placeholder,
  timestamp text)
- `#e2e8f0` → `COLORS.border` (bubble border, input border,
  previewIconButton border)
- `#f8fafc` → `COLORS.fieldBg` (screen bg, header-button bg, input bg)
- `#fff`/`#ffffff` → `COLORS.white` (header bg, bubble bg, avatar initial
  text, message-mine text, send icon, previewSendText, ActivityIndicator
  color, inputRow/previewBar bg)
- `#dc2626` → `COLORS.danger` (preview-cancel icon)
- `#ecfdf5` → `COLORS.successBg` (attach-button bg)
- `borderRadius: 20` on `headerButton`/`attachButton`/`sendButton`/`input`
  has no exact `RADIUS` match (`RADIUS.pill` is `999`, `RADIUS.chip` is
  `16`) — left as a literal.
- `#f1f5f9` (header/input-row/preview-bar top border), `#cbd5e1`
  (empty-state icon), `#334155` (preview label) have no exact token
  match — left as literals.
- No JSX structure, component usage, state, or handler changes. The
  `Skeleton`-based loading block and both `optimizedImageUrl(...)` calls
  are untouched verbatim.

## 2. `JoinRequestsInboxScreen.tsx` — restyle onto token-based list cards

- **Screen background**: `styles.list`'s implicit white background
  becomes `COLORS.fieldBg` via a new `container`-level style (matching
  how every other list screen — Discover, MyTrips, Notifications — sits
  on `COLORS.fieldBg`, not plain white).
- **Request card**: replace the flat `card` style
  (`{ backgroundColor: "#fff", borderRadius: 12, padding: 14,
  marginBottom: 12, borderWidth: 1, borderColor: "#eee" }`) with a
  Notifications-style list-item card:
  `{ backgroundColor: COLORS.white, borderRadius: RADIUS.field,
  borderWidth: 1, borderColor: COLORS.border, padding: 14 }`. Use the
  `FlatList`'s `contentContainerStyle` `gap` (matching Notifications'
  `list: { gap: 12 }`) instead of `marginBottom` on each card.
- **Name / location / bio / message**: keep exact current structure and
  copy (still a `TouchableOpacity` navigating to
  `UserProfile`/`{ userId: item.userId }` on the name, unchanged). Token-ize:
  `name`'s `#0f766e` → `COLORS.primary`; `meta`'s `#64748b` →
  `COLORS.muted`; `message`'s `#334155` has no exact token match — left
  as a literal.
- **Approve / Reject buttons**: keep the exact current side-by-side
  `flex: 1` row structure and `respond.mutate({ requestId, approve })`
  calls. Token-ize: `approve`'s `#0f766e` → `COLORS.primary`; `reject`'s
  `#dc2626` → `COLORS.danger`; `actionText`'s `#fff` → `COLORS.white`.
  `borderRadius: 8` on `actionButton` has no exact `RADIUS` match — left
  as a literal (same reasoning as `GroupChatScreen`'s `borderRadius: 20`).
- **Resolved-status pill** (replaces the plain `STATUS_LABEL` emoji text
  for `APPROVED`/`REJECTED` — `PENDING` never reaches this branch since
  it renders the action buttons instead): a small icon + text row reusing
  `NotificationsScreen`'s exact icon/color choices for these two states:
  ```tsx
  const RESOLVED_STATUS: Record<"APPROVED" | "REJECTED", { icon: IconName; bg: string; color: string; label: string }> = {
    APPROVED: { icon: "check-circle", bg: COLORS.successBg, color: COLORS.primary, label: "Approved" },
    REJECTED: { icon: "close-circle-outline", bg: COLORS.dangerBg, color: COLORS.danger, label: "Rejected" },
  };
  ```
  rendered as a `View` with the icon (`MaterialCommunityIcons`,
  `size={14}`, `color={meta.color}`) + `Text` (`meta.label`,
  `color: meta.color`), on a `backgroundColor: meta.bg` pill
  (`borderRadius: RADIUS.pill`, `paddingHorizontal: 10`,
  `paddingVertical: 5`, self-aligned to the row start via
  `alignSelf: "flex-start"`, replacing the old plain `statusLabel` text).
  The old `STATUS_LABEL` map (with its emoji strings) is deleted —
  `PENDING`'s branch is unaffected since it never read `STATUS_LABEL`.
- **Empty state**: replace the plain centered `Text` with an icon+message
  pattern matching `NotificationsScreen`'s/`GroupChatScreen`'s empty
  states: `MaterialCommunityIcons` (`account-clock-outline`, `size={40}`,
  `color={COLORS.mutedLight}`) above the existing copy "No one has
  requested to join yet." (copy unchanged), centered, with
  `marginTop: 60` (matching the vertical rhythm of a full-screen empty
  state without a hero above it, since this screen has no hero/header of
  its own).
- **Loading state**: replace the bare
  `<ActivityIndicator style={{ marginTop: 40 }} size="large" />` with 3
  repeated skeleton request-cards using the shared `Skeleton` component
  (`components/theme/Skeleton.tsx`, already used by `GroupChatScreen`,
  `NotificationsScreen`, `ProfileScreen`), each a card-shaped block sized
  to roughly the name+meta+action-row layout — this mirrors the
  app-wide skeleton convention rather than leaving the one remaining
  bare spinner in the audited screen set.

No new props, no new navigation params, no change to
`useJoinRequestsForTrip`/`useRespondToJoinRequest` call signatures.

## Testing / verification

Same as every prior phase: no test framework exists in this repo.
Verification is `npx tsc --noEmit` (mobile) plus a manual diff/code-trace
confirming every piece of state, every mutation call, and every
navigation target in both files is unchanged — only render/style code
differs. A temporary `expo start --web` bundle-compile check (free port,
killed after, never touching the live tunnel on 8081) is the fallback
smoke check for the web platform, consistent with every prior phase in
this session.
