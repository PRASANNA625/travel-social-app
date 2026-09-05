# Group Chat Enhancements — Design Spec

## Goal

Add photo-attachment sources (Gallery, Files, alongside the existing
Camera), a Group Members view, live online/offline presence, and message
reactions to the existing Group Chat feature, without changing any
existing chat behavior (text/photo sending, message history, the
Skeleton loading state, or the app's just-completed design-system
styling of `GroupChatScreen.tsx`).

## Existing architecture (confirmed by inspection)

- **Transport**: Socket.IO. `backend/src/config/socket.ts` authenticates
  each connection via `socket.handshake.auth.token` (a JWT, same one used
  for REST `Authorization: Bearer` headers), sets `socket.userId`, and
  joins the socket to a `user:${userId}` room. Group chat uses per-group
  rooms (`group:${groupId}`), joined via a `group:join` event (which
  checks `GroupMember` membership first) and left via `group:leave`.
  Sending a message is a single `message:send` event; the server persists
  it and re-broadcasts `message:new` to the group's room.
- **Client hook**: `mobile/src/api/messages.ts`'s `useLiveGroupChat`
  manages the socket lifecycle (join/leave on mount/unmount) and exposes
  `{ messages, sendMessage }`. `mobile/src/api/socket.ts` is a lazy
  singleton (`getSocket()`) shared across the app.
- **Data model** (`backend/prisma/schema.prisma`): `Group` (1:1 with
  `Trip`) has many `GroupMember` (`role: OWNER | MEMBER`, one `OWNER` per
  group — the trip's owner, assigned by `createGroupWithOwner` at trip
  creation) and many `Message` (`type: TEXT | IMAGE`, `content`,
  `mediaUrl`). `getGroupById`/`getGroupForTrip`
  (`backend/src/modules/groups/groups.service.ts`) already `include` all
  members with `user: { select: { id, name, photoUrl } }` — this is
  already the exact data `useGroup(groupId)` fetches and
  `GroupChatScreen` already reads for its header subtitle.
- **Nothing for reactions or presence exists today** — confirmed via
  repo-wide search. Both are new subsystems.
- **Image picking**: `expo-image-picker` is already a dependency, already
  used for camera capture in `GroupChatScreen` and for gallery picks
  elsewhere (Profile/Edit Profile cover and avatar uploads). There is no
  file-browser picker (`expo-document-picker`) anywhere in the app yet.
- **Modals**: `mobile/src/components/LocationPickerModal.tsx` is the
  app's one existing modal, built on RN's plain `Modal` component
  (`animationType="slide"`), not any bottom-sheet library. No bottom-sheet
  library is installed.

## Decisions from clarification

- **Reactions are one-per-user-per-message.** A user has at most one
  reaction on a given message; re-tapping the same emoji removes it,
  tapping a different one replaces it. Enforced by a DB unique
  constraint, not just client discipline.
- **"Choose from Files" is images-only.** It's a different picker UI
  reaching the same outcome as Gallery — an image attached via the
  existing `IMAGE` message type. No new message type, no new
  message-bubble rendering for non-image files.
- **Presence persists `lastSeenAt`** on `User`, updated when a user's
  last open socket disconnects, so "last seen" text survives server
  restarts. Live online/offline state itself stays in-memory (see
  below) — acceptable at this app's scale (a single Render web-service
  instance, no Redis anywhere in this stack).

## Non-goals

- No general file-sharing (PDFs, docs, etc.) — out of scope per the
  clarified Files-picker scope above.
- No reaction-picker customization/emoji search — exactly the 6 named
  emoji (❤️ 👍 😂 😍 😮 🙌), fixed.
- No presence system beyond per-user online/offline + last-seen — no
  "typing..." indicators, no read receipts. Not requested.
- No change to `message:send`/`message:new`'s existing payload shape or
  behavior, no change to the REST `GET /messages/groups/:groupId`
  pagination behavior — only an additive field on each returned message.
- No multi-instance/horizontal-scaling presence design (e.g. Redis pub/sub
  for cross-instance socket rooms) — this app runs one backend instance;
  building for a scale it doesn't operate at would be premature.

## 1. Data model changes

Add to `backend/prisma/schema.prisma`:

```prisma
model User {
  // ...existing fields...
  lastSeenAt DateTime?
  // ...existing relations...
  reactions  MessageReaction[]
}

model Message {
  // ...existing fields...
  reactions MessageReaction[]
}

model MessageReaction {
  id        String   @id @default(cuid())
  messageId String
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  emoji     String
  createdAt DateTime @default(now())

  @@unique([messageId, userId])
  @@index([messageId])
}
```

A migration (`npx prisma migrate dev --name add_message_reactions_and_presence`,
following this repo's existing migration convention — see
`backend/prisma/migrations/`) adds `User.lastSeenAt` and the new
`MessageReaction` table. No other model changes: `GroupMember.role`
already flags the Owner, so Group Members needs zero schema change.

## 2. Presence architecture

**Server-side state** (`backend/src/config/socket.ts`): an in-memory
`Map<string, Set<string>>` (`userId → socket ids`) tracks live
connections. A user is "online" iff their set is non-empty (handles
multiple tabs/devices without flickering offline when one tab closes).

- **On connect**: add the socket id to the user's set. If this was the
  first socket for that user, look up every group they belong to
  (`prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } })`)
  and `emitToGroup(groupId, "presence:update", { userId, online: true, lastSeenAt: null })`
  for each.
- **On disconnect**: remove the socket id. If the set is now empty,
  `prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } })`,
  then broadcast `presence:update` with `{ userId, online: false, lastSeenAt: <iso> }`
  to the same groups.
- **Snapshot on demand**: a client emits `presence:get` with
  `{ userIds: string[] }` (the group's current member ids, from the
  already-fetched `Group`); the server replies (via `socket.emit`, not a
  room broadcast — this is a direct reply) with `presence:snapshot`,
  `{ [userId]: { online: boolean; lastSeenAt: string | null } }`,
  computed from the in-memory map (`online`) and a
  `prisma.user.findMany({ where: { id: { in: userIds } }, select: { id, lastSeenAt } })`
  lookup (`lastSeenAt`). This is how a client gets its *initial* state —
  `presence:update` only covers changes after that point.
- Presence broadcasts reuse `emitToGroup` exactly as `message:new`
  already does — no new room/broadcast infrastructure. Like messages, a
  member who hasn't opened that group's chat screen (hasn't emitted
  `group:join` for it) won't receive live updates for it, which is
  consistent with how the app already behaves for messages.

## 3. Reactions architecture

Fully socket-driven — no dedicated REST write endpoint, matching how
messages themselves work.

- **Client → server**: `reaction:toggle` with
  `{ messageId: string; emoji: string }`.
- **Server logic** (new handler in `initSocket`, `backend/src/config/socket.ts`,
  alongside `message:send`):
  1. Validate `emoji` is one of the 6 allowed values (reject silently —
     `return` — on anything else, same defensive style as the existing
     membership check).
  2. Look up the message's `groupId` (`prisma.message.findUnique`), then
     verify the sender is a member of that group (reuse
     `groups.service.ts`'s `assertMember`, exported alongside
     `getGroupById`) — mirrors `message:send`'s own membership check.
  3. Find the sender's existing `MessageReaction` for this
     `(messageId, userId)` pair.
     - None exists → `create` with the given emoji (**add**).
     - Exists with the same emoji → `delete` it (**remove**).
     - Exists with a different emoji → `update` it to the new emoji
       (**change**).
  4. Recompute the aggregate for that message: group all
     `MessageReaction` rows for `messageId` by `emoji`, producing
     `{ emoji: string; count: number; userIds: string[] }[]`.
  5. `emitToGroup(groupId, "reaction:updated", { messageId, reactions })`.
- **Why broadcast `userIds` per emoji, not just counts**: a per-client
  "is this my reaction" boolean can't be computed server-side once
  before broadcasting the same payload to everyone — each recipient
  needs to know if *they* are in the list. Sending `userIds` lets every
  client derive `reactedByMe = userIds.includes(myId)` identically,
  keeps the payload uniform for everyone, and costs nothing extra at
  this app's group sizes (a handful of trip members per chat).
- **History endpoint**: `listMessages` (`backend/src/modules/messages/messages.service.ts`)
  is extended to also fetch each returned message's reactions
  (`include: { reactions: { select: { emoji: true, userId: true } } }`)
  and group them into the same `{ emoji, count, userIds }[]` shape before
  returning — so reactions are visible immediately on chat open, not
  only for messages received live afterward. Existing pagination
  (`parsePageParams`/`toSkipTake`) and the `items.reverse()` ordering are
  unchanged.
- **Shared allowed-emoji list**: `["❤️", "👍", "😂", "😍", "😮", "🙌"]`
  is defined once in the backend socket handler (source of truth for
  validation) and once in the mobile UI (source of truth for what
  renders in the reaction strip) — duplicated the same way `TravelMode`
  is already duplicated between `schema.prisma` and
  `mobile/src/types/index.ts` in this codebase; not a new pattern.

## 4. Mobile types

`mobile/src/types/index.ts`'s `ChatMessage` gains:

```ts
export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ChatMessage {
  // ...existing fields...
  reactions?: MessageReactionSummary[];
}
```

`Group`/`GroupMember` types are unchanged (no new fields needed).

## 5. Mobile: Attachment action sheet

Today, tapping the single camera-icon `attachButton` calls
`onOpenCamera()` directly. This becomes:

- Tapping `attachButton` opens a new bottom-sheet component
  (`AttachmentSheet`, new file
  `mobile/src/components/AttachmentSheet.tsx`) built the same way
  `LocationPickerModal` is built (RN `Modal`), but as a bottom sheet:
  `Modal` with `transparent` + `animationType="slide"`, a semi-transparent
  backdrop `TouchableOpacity` (tap to dismiss) behind a `COLORS.white`
  sheet anchored to the bottom with `RADIUS.card` top corners and
  `SHADOW.card`, listing three rows: 📷 Take Photo, 🖼️ Choose from
  Gallery, 📁 Choose from Files (icons: `camera-outline`,
  `image-multiple-outline`, `folder-outline`).
- **Take Photo** → calls the existing `onOpenCamera` unchanged.
- **Choose from Gallery** → new handler calling
  `ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })`
  (same options already used for cover/profile photo picks elsewhere),
  setting `pendingPhoto` from the result exactly like `onOpenCamera` does
  today — reusing the existing preview-bar/send flow with zero
  duplicated logic.
- **Choose from Files** → new dependency `expo-document-picker` (not
  currently installed; will be added to `mobile/package.json`, flagged
  to the user the same way `@expo/ngrok` was flagged earlier this
  session), called as
  `DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true })`.
  Its modern result shape is `{ canceled: boolean; assets: { uri, name,
  mimeType, size }[] | null }` (matching `ImagePicker`'s own
  `canceled`/`assets` convention) — on `canceled: false`, `assets[0]` is
  mapped into the same `ImagePickerAsset`-shaped `pendingPhoto` state
  (constructing a minimal compatible object — `{ uri: assets[0].uri,
  fileName: assets[0].name }`), since `appendImageAsset` and the preview
  `<Image source={{ uri }}>` only need `uri` and an optional filename,
  not every `ImagePickerAsset` field.
- All three sources converge on the exact same `pendingPhoto` state and
  the exact same preview bar / `onConfirmSendPhoto` / `onRetake` flow
  that exists today — none of that logic changes.

## 6. Mobile: Group Members modal

- The header's current right-side spacer (`<View style={styles.headerButton} />`,
  present only to balance the back button for centered title text) is
  replaced with a real button: a people icon plus the member count
  (`group.members.length`), opening a new `GroupMembersModal` component
  (`mobile/src/components/GroupMembersModal.tsx`).
- The modal (RN `Modal`, same slide-up sheet treatment as the attachment
  sheet for visual consistency) lists every member from the
  already-fetched `group.members` (no new API call for the member list
  itself): avatar (`optimizedImageUrl(member.user.photoUrl, 84)`, with
  the existing initial-letter placeholder pattern used elsewhere), name,
  an "Owner" chip (`COLORS.primary` filled, matching `StaticChip`'s
  existing look) when `member.role === "OWNER"`, and an online dot /
  "Last seen..." text sourced from the presence state described below.
- Presence for the modal's member list comes from the same
  group-scoped presence state `GroupChatScreen` already holds (see
  Section 7) — the modal is a pure display component fed by props, no
  independent data-fetching of its own.

## 7. Mobile: Presence state

`useLiveGroupChat` (`mobile/src/api/messages.ts`) gains a second
responsibility alongside messages — presence — since both are the same
socket, the same lifecycle, and the same group-scoped subscription
window:

- On the same `group:join` effect, once `group.members` is known
  (passed in as a new parameter), emit
  `presence:get({ userIds: group.members.map(m => m.userId) })`.
- Listen for `presence:snapshot` (sets initial state) and `presence:update`
  (merges one user's change into state) into a new
  `Record<string, { online: boolean; lastSeenAt: string | null }>`,
  returned alongside `messages`/`sendMessage` as `presence`.
- `GroupChatScreen` renders a small `size: 8` green dot
  (`backgroundColor: "#22c55e"` — no existing token matches this
  specific green; `COLORS.primary` is teal, not the universal
  online-green users expect, so this is an intentional new literal, not
  a missed substitution) on member avatars in the header/members modal
  when `presence[userId]?.online` is true, and "Last seen X ago" /
  "Offline" text otherwise (formatted with the same kind of relative-time
  helper already used elsewhere in the app, e.g.
  `NotificationsScreen.tsx`'s `formatRelativeTime`).

## 8. Mobile: Message reactions UI

- Each message bubble becomes long-pressable (`TouchableOpacity`'s
  `onLongPress`, native) or gets a small tap-to-react affordance on
  web (a subtle icon that appears on hover, since a right-click would
  conflict with the browser's own context menu on web — right-click is
  explicitly not implemented, only tap/long-press are, satisfying the
  spirit of "long-press/right-click" via the platform-appropriate
  equivalent for each).
- Long-press opens a small floating emoji strip (the 6 fixed emoji) 
  anchored near the bubble; tapping one emits `reaction:toggle`.
- Each message's `reactions` array (from history or from
  `reaction:updated`) renders as small pills below the bubble — emoji +
  count — with the current user's own reaction pill visually
  highlighted (tinted `COLORS.successBg`-style background, matching how
  the app already tints "mine"/active states elsewhere) so they can tell
  what they reacted with at a glance. Tapping a pill re-runs the same
  toggle logic (removes if it's already theirs, otherwise switches to
  it) rather than requiring the long-press strip for changes.

## Testing / verification

No test framework exists in this repo (confirmed, consistent with every
prior phase). Verification is `npx tsc --noEmit` for both `backend/` and
`mobile/`, plus a manual trace confirming: existing text/photo sending
still works untouched, existing message history/pagination is untouched
beyond the additive `reactions` field, and a `prisma migrate dev` dry run
succeeds against the schema changes. A temporary `expo start --web`
bundle-compile check (free port, killed after, never touching the live
tunnel on 8081) is the fallback smoke check for the web platform. Given
this feature touches live sockets and a real Postgres migration, manual
end-to-end testing (two logged-in sessions in the same group) is the
practical verification for presence/reactions behavior, since there's no
automated test harness to exercise Socket.IO round-trips in this repo.
