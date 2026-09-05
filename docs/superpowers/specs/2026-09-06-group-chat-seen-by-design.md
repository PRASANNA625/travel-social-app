# Group Chat "Seen By" Read Receipts — Design Spec

## Goal

Let the sender of a group chat message see which group members have read
it, and when. Builds directly on the Group Chat Enhancements feature
(presence, reactions, member list) shipped earlier — reuses its data
model conventions, its Socket.IO room/event architecture, and its
`GroupMembersModal`-style UI pattern.

## Existing architecture this builds on

- `backend/prisma/schema.prisma`'s `Message` model already has a
  `reactions MessageReaction[]` relation added for the reactions feature.
  `MessageReaction` is `{ id, messageId, message, userId, user, emoji,
  createdAt, @@unique([messageId, userId]), @@index([messageId]) }` — the
  new `MessageRead` model mirrors this shape exactly, swapping `emoji`
  for `readAt`.
- `backend/src/config/socket.ts` already has: JWT-authed sockets with
  `socket.userId`, rooms `user:${userId}` and `group:${groupId}`,
  `emitToGroup(groupId, event, payload)` and `emitToUser(userId, event,
  payload)` helpers (the latter is exactly the targeted-emit primitive
  this feature needs and already exists, unused by any handler so far),
  `assertMember(groupId, userId)` (imported from `groups.service.ts`,
  throws `HttpError(403, ...)`), an in-memory `onlineSockets:
  Map<userId, Set<socketId>>` for presence, and the `reaction:toggle`/
  `reaction:updated` event pair this feature's `message:read`/
  `message:read:updated` pair mirrors structurally (batched membership
  validation, then an emit).
- `backend/src/modules/messages/messages.service.ts` already exports
  `ALLOWED_REACTIONS`, `MessageReactionSummary`, `getReactionsForMessage`,
  and an extended `listMessages` that batch-fetches reactions for a page
  of messages in one query (`messageId: { in: [...] }`) rather than N+1.
  This spec's `getReadsForMessages` helper and `listMessages` extension
  follow the identical batching pattern.
- `mobile/src/api/messages.ts`'s `useLiveGroupChat(groupId, initialMessages,
  memberIds)` already manages the socket lifecycle (join/leave, message
  send/receive, presence tracking, reaction toggling) and returns
  `{ messages, sendMessage, presence, toggleReaction }`. This spec adds a
  `markRead` function to its return value and a new set of internal
  listeners — no change to its existing responsibilities.
- `mobile/src/components/GroupMembersModal.tsx` already renders a
  bottom-sheet list of members with avatar, name, Owner badge, and a
  presence dot/last-seen text, fed by props (`members`, `presence`) with
  zero data-fetching of its own. The new `SeenByModal` component is
  visually and structurally the same shape, with a Owner-badge column
  replaced by a read-status column.
- `mobile/src/screens/GroupChatScreen.tsx` already renders message
  bubbles with `onLongPress` opening `ReactionPickerModal`, and reaction
  pills below the bubble for messages that have any. This spec adds a
  small read-status row below the sender's own bubbles, in the same
  visual slot reaction pills already occupy, without altering the
  `onLongPress` reaction-picker behavior at all.

## Decisions from clarifying questions

- **Trigger for the sender**: NOT long-press (that stays reactions-only,
  unchanged, for every message including your own). Instead, a small
  tappable "Seen by N" / "Sent" row appears below the sender's own
  message bubbles; tapping it opens the Seen By sheet. This avoids any
  gesture conflict with the existing reaction picker.
- **When a message counts as "read"**: when a member has the chat screen
  open and that message is loaded into their message list — not
  fine-grained scroll-viewport visibility tracking. Concretely: every
  message in the initially-loaded history is marked read as soon as the
  screen mounts, and each new incoming message is marked read as it
  arrives while the screen stays mounted (mirroring how `group:join`
  already treats "screen mounted" as "actively viewing this chat").
- **Visibility scope**: read data for a message is visible only to that
  message's sender — enforced server-side (not just hidden in the UI).
  The `message:read:updated` event is emitted to the sender's
  `user:${senderId}` room only, never broadcast to the whole group room
  the way `reaction:updated` is. The REST chat-history endpoint likewise
  only attaches `readBy` to messages where `senderId` matches the
  requesting user.
- **Sheet content model**: the sheet is a full member roster (every
  group member except the sender), each row annotated with read/unread
  status — not merely a list of "people who have read it." A member who
  hasn't read the message yet still appears, showing "Not yet seen."
  This reuses data the client already holds (`group.members`, the
  `presence` map from `useLiveGroupChat`) plus one small new piece of
  data from the backend (`readBy: { userId, readAt }[]` for that
  message) — no new member-roster endpoint needed.

## Non-goals

- No read receipts for any chat other than group chat (this app has no
  1:1/DM chat).
- No "delivered" state distinct from "read" — no delivery ticks, only
  read/not-read.
- No push notifications triggered by read events.
- No change to `message:send`/`message:new`/`reaction:toggle`/
  `reaction:updated`/`presence:*` payloads, event names, or behavior.
- No change to the existing reaction picker's long-press trigger, on any
  message, including the sender's own.
- No backfill of read status for messages sent before this feature
  ships beyond the natural effect of marking-as-read on next screen
  open (a member who opens the chat after this ships will have all
  currently-loaded history — old and new — marked read for them at that
  point; there is no attempt to reconstruct historical "already read
  before this feature existed" state).

## 1. Prisma schema

Add to `backend/prisma/schema.prisma`:

```prisma
model MessageRead {
  id        String   @id @default(cuid())
  messageId String
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  readAt    DateTime @default(now())

  @@unique([messageId, userId])
  @@index([messageId])
}
```

And add the inverse relations, matching the existing `reactions` naming
pattern on both models:
- `Message.reads MessageRead[]` (alongside the existing `reactions
  MessageReaction[]`).
- `User.reads MessageRead[]` (alongside the existing `reactions
  MessageReaction[]`, `messages Message[]`, and `groupMemberships
  GroupMember[]`).

No change to any existing field on `Message`, `User`, or `GroupMember`.
Migration: `npx prisma migrate dev --name add_message_read_receipts` from
`backend/`, run against the real local dev database (same convention as
every prior migration this session).

## 2. Backend — `messages.service.ts`

Add:

```ts
export interface MessageReadEntry {
  userId: string;
  readAt: string;
}

export async function getReadsForMessages(messageIds: string[]): Promise<Map<string, MessageReadEntry[]>> {
  const rows = await prisma.messageRead.findMany({
    where: { messageId: { in: messageIds } },
    select: { messageId: true, userId: true, readAt: true },
  });
  const map = new Map<string, MessageReadEntry[]>();
  for (const row of rows) {
    const list = map.get(row.messageId) ?? [];
    list.push({ userId: row.userId, readAt: row.readAt.toISOString() });
    map.set(row.messageId, list);
  }
  return map;
}
```

This single exported helper serves both `listMessages` (batch-fetch for
a whole page, keyed by message id) and `socket.ts`'s `message:read`
handler (batch-fetch for just the messages touched by one incoming
read-event) — no separate single-message variant is needed, since
`listMessages` already has a page of message ids to pass in bulk and
`socket.ts` already groups affected messages by sender before needing
their read summaries.

Extend `listMessages` (the same function already extended once for
reactions) to also batch-fetch reads for the page and attach `readBy` —
**only for messages the requesting user sent**:

```ts
// alongside the existing reactions batch-fetch in listMessages:
const readsByMessageId = await getReadsForMessages(items.map((m) => m.id));
const itemsWithExtras = itemsWithReactions.map((item) => ({
  ...item,
  readBy: item.senderId === userId ? (readsByMessageId.get(item.id) ?? []) : undefined,
}));
// itemsWithExtras.reverse() replaces the existing itemsWithReactions.reverse()
```

(`listMessages` already receives the requesting `userId` — it's used for
the existing `assertMember` call at the top of the function.)

## 3. Backend — `socket.ts`

Add, alongside the existing `reaction:toggle` handler:

```ts
socket.on("message:read", async (data: { groupId: string; messageIds: string[] }) => {
  try {
    if (!Array.isArray(data?.messageIds) || data.messageIds.length === 0) return;
    await assertMember(data.groupId, userId);
    const messageIds = data.messageIds.slice(0, 200);

    const messages = await prisma.message.findMany({
      where: { id: { in: messageIds }, groupId: data.groupId },
      select: { id: true, senderId: true },
    });
    const readable = messages.filter((m) => m.senderId !== userId);
    if (readable.length === 0) return;

    await prisma.messageRead.createMany({
      data: readable.map((m) => ({ messageId: m.id, userId })),
      skipDuplicates: true,
    });

    const bySender = new Map<string, string[]>();
    for (const m of readable) {
      const list = bySender.get(m.senderId) ?? [];
      list.push(m.id);
      bySender.set(m.senderId, list);
    }

    for (const [senderId, ids] of bySender) {
      const readsByMessageId = await getReadsForMessages(ids);
      const updates = ids.map((messageId) => ({
        messageId,
        readBy: readsByMessageId.get(messageId) ?? [],
      }));
      emitToUser(senderId, "message:read:updated", { updates });
    }
  } catch (err) {
    console.error("message:read failed", err);
  }
});
```

`getReadsForMessages` is the same function exported from
`messages.service.ts` in section 2 — `socket.ts` imports it directly
(alongside its existing imports of `ALLOWED_REACTIONS`,
`getReactionsForMessage`, etc. from that module), rather than
duplicating the read-aggregation query. This runs one query per
distinct sender in the batch (typically one, since a client marks a
contiguous run of newly-loaded messages read at once) — not one query
per message.

This mirrors `reaction:toggle`'s existing shape: try/catch (consistent
with the fix already applied to every handler in this file),
`assertMember` for group-membership validation, a per-message groupId
check against the DB (not the client's claim) to prevent forging reads
for messages in a different group, and a size cap (`.slice(0, 200)`,
matching `presence:get`'s existing cap) on the client-supplied array.

**Key difference from `reaction:updated`**: this uses `emitToUser`,
a **targeted** emit to the sender's own room, not `emitToGroup` (which
broadcasts to the whole `group:${groupId}` room). This is the mechanism
enforcing sender-only visibility at the transport level, not just in the
UI.

## 4. Mobile — `types/index.ts`

Add:

```ts
export interface MessageReadEntry {
  userId: string;
  readAt: string;
}
```

Extend `ChatMessage` with an optional field:

```ts
readBy?: MessageReadEntry[];
```

(`undefined` for any message that isn't the current user's own —
matching the backend's sender-only attachment — vs. an empty array for
the sender's own message that nobody has read yet. The UI treats both
"undefined" and "empty array" as "show nothing/Sent", but only ever
renders the tappable row at all when `item.senderId === me.id`.)

## 5. Mobile — `useLiveGroupChat` (`api/messages.ts`)

Add a `markRead(messageIds: string[])` function to the hook's return
value, alongside the existing `sendMessage`/`toggleReaction`:

```ts
const markRead = (messageIds: string[]) => {
  if (messageIds.length === 0) return;
  getSocket().emit("message:read", { groupId, messageIds });
};
```

Add a `message:read:updated` listener (registered/cleaned up alongside
the hook's other four listeners) that merges each update's `readBy` into
the matching message in local state, the same immutable-merge pattern
`reaction:updated` already uses:

```ts
const onReadUpdated = (payload: { updates: { messageId: string; readBy: MessageReadEntry[] }[] }) => {
  setMessages((prev) =>
    prev.map((m) => {
      const update = payload.updates.find((u) => u.messageId === m.id);
      return update ? { ...m, readBy: update.readBy } : m;
    })
  );
};
```

No change to the hook's existing `message:new`/`presence:*`/
`reaction:updated` handling, join/leave lifecycle, or return shape
beyond this one addition.

## 6. Mobile — `SeenByModal.tsx` (new component)

Presentational, styled like `GroupMembersModal.tsx` (same bottom-sheet
`Modal`, same row layout):

```ts
{
  visible: boolean;
  onClose: () => void;
  members: GroupMember[];     // full roster; sender is filtered out by the caller
  presence: Record<string, PresenceInfo>;
  readBy: MessageReadEntry[]; // who has read it and when
}
```

Each row: avatar, name, online dot (from `presence`, same as
`GroupMembersModal`), and a trailing status — "Seen · 2:14 PM" (formatted
from that member's `readAt` if present in `readBy`) or "Not yet seen"
(muted text) if absent. No Owner badge in this sheet (not relevant to
read status; keeps the row focused).

## 7. Mobile — `GroupChatScreen.tsx` wiring

- Call `markRead` with all currently-loaded message ids (excluding ones
  the current user sent) once when `messages` first populates from
  history, and again for each new message id that arrives via
  `message:new` while the screen stays mounted.
- Below the sender's own bubbles (in the same conditional slot reaction
  pills already occupy — both can be present at once, reaction pills
  above, read-status row below, or vice versa; exact stacking order left
  to the implementer to match this screen's existing visual rhythm), add
  a small tappable row: an icon (e.g. `check-all` for "seen", `check`
  for "sent but unseen") + text ("Seen by N" / "Sent"). Tapping opens
  `SeenByModal` for that message, passing `group.members.filter(m =>
  m.userId !== me.id)`, the hook's `presence`, and that message's
  `readBy ?? []`.
- This row only ever renders when `item.senderId === me.id` — never on
  messages from other members (matching how `readBy` is only ever
  populated for the sender's own messages in the first place).
- No change to the existing `onLongPress` reaction-picker trigger, the
  attachment sheet, the members-list header button, or any other
  existing interaction on this screen.

## Testing / verification

Same as every prior phase in this session: no test framework exists in
this repo. Verification is `npx tsc --noEmit` (both `backend/` and
`mobile/`) plus manual code-trace confirming existing messaging,
reactions, photo sharing, presence, and member-list behavior is
unchanged. A temporary `expo start --web --port` on a free port (never
8081, the live tunnel dev server) is the fallback smoke test, killed
after use.
