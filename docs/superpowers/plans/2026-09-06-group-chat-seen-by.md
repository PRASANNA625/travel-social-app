# Group Chat "Seen By" Read Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a group chat message's sender see, in real time, which
group members have read it and when — via a small tappable indicator on
their own message bubbles that opens a full member roster with
read/unread status.

**Architecture:** A new `MessageRead` model (one row per message per
reader, mirroring the existing `MessageReaction` model exactly) tracks
reads. A new `message:read` Socket.IO event (client → server) records
reads and validates group membership + message ownership the same way
`reaction:toggle` already does; a `message:read:updated` event
(server → sender only, via the already-existing but previously-unused
`emitToUser` helper) delivers live updates — never broadcast to the
whole group, which is what keeps read data sender-only at the transport
level, not just in the UI. The REST chat-history endpoint gets the same
sender-only treatment. Mobile adds a `markRead` call to the existing
`useLiveGroupChat` hook, a new `SeenByModal` component styled like the
already-shipped `GroupMembersModal`, and a small read-status row wired
into `GroupChatScreen` below the sender's own bubbles — deliberately
NOT on the existing long-press gesture, which stays reactions-only for
every message as it already is today.

**Tech Stack:** Same as the rest of this repo — Express + Prisma +
Socket.IO on the backend, Expo/React Native + TypeScript on mobile. No
new dependencies.

**Spec:** docs/superpowers/specs/2026-09-06-group-chat-seen-by-design.md

## Global Constraints

- One `MessageRead` row per `(messageId, userId)` pair, DB-enforced via
  `@@unique([messageId, userId])` — exactly mirroring
  `MessageReaction`'s existing constraint.
- Read data (`readBy`) for a message is visible ONLY to that message's
  sender — enforced server-side in both the socket event and the REST
  endpoint, not just hidden in the UI. `message:read:updated` uses the
  existing `emitToUser(userId, event, payload)` helper (a **targeted**
  emit to `user:${userId}`), never `emitToGroup`.
- The sender never gets a `MessageRead` row for their own message (no
  self-reads are ever created), so they can never appear in their own
  message's seen-by list.
- `message:read`'s handler validates group membership via `assertMember`
  and re-derives each message's real `groupId` from the database (never
  trusts a client-supplied `groupId` on the message itself) before
  recording any read — same defensive pattern `reaction:toggle` already
  uses.
- The existing long-press-on-a-message-bubble gesture continues to open
  `ReactionPickerModal`, unchanged, for every message including the
  sender's own. The new Seen By trigger is a separate, small, explicitly
  tappable row — never the same gesture.
- Zero changes to `message:send`/`message:new`/`reaction:toggle`/
  `reaction:updated`/`presence:*` event names, payloads, or behavior.
- No test framework exists in this repo. Verification throughout is
  `npx tsc --noEmit` (run from `backend/` and from `mobile/` as
  appropriate to the task) plus a manual code-trace confirming existing
  messaging, reactions, photo sharing, presence, and member-list
  behavior is unchanged. A temporary `expo start --web --port <free
  port>` bundle-compile check (never port 8081, the live tunnel dev
  server this project's maintainer actively watches) is the fallback
  smoke test where a task's own instructions call for one.

---

### Task 1: Prisma schema — `MessageRead` model

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the `MessageRead` Prisma model and its generated Prisma
  Client type `prisma.messageRead` (used by Task 2's
  `getReadsForMessages` and Task 3's `message:read` handler). Compound
  unique key name Prisma generates from `@@unique([messageId, userId])`
  is `messageId_userId` — the same naming convention `MessageReaction`
  and `GroupMember` already use, so later tasks can rely on
  `prisma.messageRead.findUnique({ where: { messageId_userId: { messageId, userId } } })`
  working exactly like the existing `MessageReaction` calls do (though
  this feature only ever needs `createMany`, not `findUnique`/`update`/
  `delete`, since a read is never un-read or changed once recorded).

- [ ] **Step 1: Add the `MessageRead` model**

In `backend/prisma/schema.prisma`, find the existing `MessageReaction`
model (it currently ends right before the final `}` of the file — run
`grep -n "^model MessageReaction" -A 15 backend/prisma/schema.prisma` to
locate it exactly if the file has moved since this plan was written).
Add a new `MessageRead` model directly after it:

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

- [ ] **Step 2: Add the inverse relation on `Message`**

Find the `Message` model:

```prisma
model Message {
  id        String      @id @default(cuid())
  groupId   String
  group     Group       @relation(fields: [groupId], references: [id], onDelete: Cascade)
  senderId  String
  sender    User        @relation(fields: [senderId], references: [id], onDelete: Cascade)
  type      MessageType @default(TEXT)
  content   String?
  mediaUrl  String?
  createdAt DateTime    @default(now())

  reactions MessageReaction[]

  @@index([groupId, createdAt])
}
```

Change the `reactions` line to also declare `reads`:

```prisma
  reactions MessageReaction[]
  reads     MessageRead[]
```

- [ ] **Step 3: Add the inverse relation on `User`**

Find the `User` model's relation block (currently ending in
`reactions MessageReaction[]`):

```prisma
  groupMemberships GroupMember[]
  messages        Message[]
  notifications   Notification[]
  reactions       MessageReaction[]
}
```

Add a `reads` line, matching the existing (slightly inconsistent, but
pre-existing — don't fix unrelated formatting) alignment style of this
block:

```prisma
  groupMemberships GroupMember[]
  messages        Message[]
  notifications   Notification[]
  reactions       MessageReaction[]
  reads           MessageRead[]
}
```

- [ ] **Step 4: Run the migration**

From `backend/`:

```bash
npx prisma migrate dev --name add_message_read_receipts
```

This must run against the real local dev PostgreSQL database (the same
one every prior migration in this project has used) — confirm the
command actually applies a migration (creates a new folder under
`backend/prisma/migrations/`) rather than silently no-op'ing. Do not use
`prisma generate` alone as a substitute for this step.

- [ ] **Step 5: Verify**

From `backend/`:

```bash
npx tsc --noEmit
```

Expected: zero errors. Also run `npx prisma migrate status` from
`backend/` and confirm it reports the database schema is up to date.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Add MessageRead model for group chat read receipts"
```

---

### Task 2: `backend/src/modules/messages/messages.service.ts` — read aggregation

**Files:**
- Modify: `backend/src/modules/messages/messages.service.ts`

**Interfaces:**
- Consumes: `prisma.messageRead` (Task 1). The file's existing
  `listMessages(groupId: string, userId: string, query: Record<string,
  unknown>)` signature, existing `groupReactionRows`/
  `getReactionsForMessage`/`ALLOWED_REACTIONS` exports (unchanged by
  this task).
- Produces: `export interface MessageReadEntry { userId: string; readAt:
  string }` and `export async function getReadsForMessages(messageIds:
  string[]): Promise<Map<string, MessageReadEntry[]>>` — both consumed
  directly by Task 3's `socket.ts` (`import { getReadsForMessages } from
  "../modules/messages/messages.service"`) and this task's own
  `listMessages` extension. `listMessages`'s returned items now each
  carry an optional `readBy?: MessageReadEntry[]` field, populated only
  when `item.senderId === userId` (the caller) — consumed by Task 4's
  mobile `ChatMessage.readBy` type and ultimately Task 7's screen
  wiring.

This is a full replacement of `backend/src/modules/messages/messages.service.ts`.
Here is the complete file content to write:

```ts
import { prisma } from "../../config/prisma";
import { assertMember } from "../groups/groups.service";
import { parsePageParams, toSkipTake } from "../../utils/pagination";

// Copy this array verbatim wherever the allowed-reactions list is needed
// elsewhere (e.g. the mobile ReactionPickerModal) - these six emoji include
// invisible variation-selector codepoints, so retyping them risks a
// byte-mismatch that silently breaks equality checks.
export const ALLOWED_REACTIONS = ["❤️", "👍", "😂", "😍", "😮", "🙌"] as const;
export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageReadEntry {
  userId: string;
  readAt: string;
}

function groupReactionRows(
  rows: { messageId: string; userId: string; emoji: string }[]
): Map<string, MessageReactionSummary[]> {
  const byMessage = new Map<string, Map<string, MessageReactionSummary>>();
  for (const row of rows) {
    let byEmoji = byMessage.get(row.messageId);
    if (!byEmoji) {
      byEmoji = new Map();
      byMessage.set(row.messageId, byEmoji);
    }
    const existing = byEmoji.get(row.emoji);
    if (existing) {
      existing.count += 1;
      existing.userIds.push(row.userId);
    } else {
      byEmoji.set(row.emoji, { emoji: row.emoji, count: 1, userIds: [row.userId] });
    }
  }
  const result = new Map<string, MessageReactionSummary[]>();
  for (const [messageId, byEmoji] of byMessage) {
    result.set(messageId, Array.from(byEmoji.values()));
  }
  return result;
}

export async function getReactionsForMessage(messageId: string): Promise<MessageReactionSummary[]> {
  const rows = await prisma.messageReaction.findMany({
    where: { messageId },
    select: { messageId: true, userId: true, emoji: true },
  });
  return groupReactionRows(rows).get(messageId) ?? [];
}

// Batch-fetches MessageRead rows for a set of messages and groups them by
// messageId. Used both by listMessages (a whole page of messages at once)
// and by socket.ts's message:read handler (the set of messages touched by
// one incoming read-event, already grouped by sender before this is called) -
// a single query either way, never one query per message.
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

export async function listMessages(groupId: string, userId: string, query: Record<string, unknown>) {
  await assertMember(groupId, userId);
  const pageParams = parsePageParams(query, 30, 100);

  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where: { groupId },
      include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
    }),
    prisma.message.count({ where: { groupId } }),
  ]);

  const messageIds = items.map((m) => m.id);
  const [reactionRows, readsByMessageId] = await Promise.all([
    prisma.messageReaction.findMany({
      where: { messageId: { in: messageIds } },
      select: { messageId: true, userId: true, emoji: true },
    }),
    getReadsForMessages(messageIds),
  ]);
  const reactionsByMessage = groupReactionRows(reactionRows);

  const itemsWithExtras = items.map((message) => ({
    ...message,
    reactions: reactionsByMessage.get(message.id) ?? [],
    readBy: message.senderId === userId ? readsByMessageId.get(message.id) ?? [] : undefined,
  }));

  return { items: itemsWithExtras.reverse(), total, ...pageParams };
}
```

Note the two behavioral changes from the current file, both intentional
and both required by this task: (1) the reaction-rows query and the new
`getReadsForMessages` call now run in `Promise.all` rather than
sequentially, which is a pure performance improvement with no behavior
change (both queries are independent reads); (2) each returned item
gains a `readBy` field that is `undefined` unless the requesting
`userId` is that message's sender, in which case it's an array
(possibly empty, meaning "no one has read this yet").

- [ ] **Step 1: Apply the file replacement above**

- [ ] **Step 2: Verify**

From `backend/`:

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/messages/messages.service.ts
git commit -m "Add read-receipt aggregation and sender-only readBy to chat history"
```

---

### Task 3: `backend/src/config/socket.ts` — `message:read` event

**Files:**
- Modify: `backend/src/config/socket.ts`

**Interfaces:**
- Consumes: `getReadsForMessages` (Task 2, imported alongside the
  file's existing `ALLOWED_REACTIONS`/`getReactionsForMessage`/
  `AllowedReaction` imports from `../modules/messages/messages.service`).
  The file's own existing `assertMember`, `emitToGroup`, `emitToUser`,
  `onlineSockets`, and the per-connection `userId` local — all
  unchanged, all reused as-is.
- Produces: the `message:read` socket event (client → server, payload
  `{ groupId: string; messageIds: string[] }`) and the
  `message:read:updated` event (server → sender only, payload `{
  updates: { messageId: string; readBy: MessageReadEntry[] }[] }`) —
  consumed by Task 5's mobile `useLiveGroupChat` hook.

This is a full replacement of `backend/src/config/socket.ts`. Here is
the complete file content to write:

```ts
import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./env";
import { prisma } from "./prisma";
import { assertMember } from "../modules/groups/groups.service";
import {
  ALLOWED_REACTIONS,
  getReactionsForMessage,
  getReadsForMessages,
  type AllowedReaction,
} from "../modules/messages/messages.service";

interface AuthedSocket extends Socket {
  userId?: string;
}

let io: SocketIOServer | undefined;

// Tracks which socket ids belong to each online user, so a user with
// multiple tabs/devices only goes "offline" once their last socket
// closes. In-memory only - resets on server restart, which is an
// accepted trade-off at this app's scale (a single backend instance,
// no Redis anywhere in this stack).
const onlineSockets = new Map<string, Set<string>>();

function isAllowedReaction(value: unknown): value is AllowedReaction {
  return typeof value === "string" && (ALLOWED_REACTIONS as readonly string[]).includes(value);
}

async function groupIdsForUser(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  return memberships.map((m) => m.groupId);
}

// Fire-and-forget tail for the "just came online" broadcast. Runs after all
// of this connection's socket.on(...) listeners are registered so a
// disconnect that happens mid-lookup is still caught by the disconnect
// handler (see the race-condition note in the connection handler below).
// Never awaited by its caller, so its own errors are caught here instead of
// becoming an unhandled promise rejection that would crash the process.
async function broadcastOnlinePresence(userId: string): Promise<void> {
  try {
    const groupIds = await groupIdsForUser(userId);
    for (const groupId of groupIds) {
      emitToGroup(groupId, "presence:update", { userId, online: true, lastSeenAt: null });
    }
  } catch (err) {
    console.error("[socket] presence:update (online) broadcast failed", err);
  }
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.use((socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));
    try {
      const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid auth token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    if (!socket.userId) return;
    const userId = socket.userId;
    socket.join(`user:${userId}`);

    let sockets = onlineSockets.get(userId);
    const wasOffline = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      onlineSockets.set(userId, sockets);
    }
    sockets.add(socket.id);

    // All socket.on(...) listeners for this connection (including
    // "disconnect") are registered synchronously below, before any await.
    // This closes a race where an early disconnect (flaky network,
    // immediate tab close) could fire before the disconnect listener
    // existed to catch it, permanently leaving the user marked online.

    socket.on("group:join", async (groupId: string) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (membership) socket.join(`group:${groupId}`);
    });

    socket.on("group:leave", (groupId: string) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on("message:send", async (data: { groupId: string; type?: "TEXT" | "IMAGE"; content?: string; mediaUrl?: string }) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: data.groupId, userId } },
      });
      if (!membership) return;

      const message = await prisma.message.create({
        data: {
          groupId: data.groupId,
          senderId: userId,
          type: data.type ?? "TEXT",
          content: data.content,
          mediaUrl: data.mediaUrl,
        },
        include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      });

      io!.to(`group:${data.groupId}`).emit("message:new", message);
    });

    socket.on("presence:get", async (data: { userIds: string[] }) => {
      try {
        if (!Array.isArray(data?.userIds)) return;
        const requested = data.userIds.slice(0, 200);
        const myGroupIds = await groupIdsForUser(userId);
        const shared = await prisma.groupMember.findMany({
          where: { groupId: { in: myGroupIds }, userId: { in: requested } },
          select: { userId: true },
        });
        const visibleIds = [...new Set(shared.map((m) => m.userId))];
        const users = await prisma.user.findMany({
          where: { id: { in: visibleIds } },
          select: { id: true, lastSeenAt: true },
        });
        const snapshot: Record<string, { online: boolean; lastSeenAt: string | null }> = {};
        for (const user of users) {
          const userSockets = onlineSockets.get(user.id);
          snapshot[user.id] = {
            online: !!userSockets && userSockets.size > 0,
            lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
          };
        }
        socket.emit("presence:snapshot", snapshot);
      } catch (err) {
        console.error("[socket] presence:get handler failed", err);
      }
    });

    socket.on("reaction:toggle", async (data: { messageId: string; emoji: string }) => {
      try {
        if (!isAllowedReaction(data.emoji)) return;

        const message = await prisma.message.findUnique({ where: { id: data.messageId }, select: { groupId: true } });
        if (!message) return;
        try {
          await assertMember(message.groupId, userId);
        } catch {
          return;
        }

        const existing = await prisma.messageReaction.findUnique({
          where: { messageId_userId: { messageId: data.messageId, userId } },
        });

        if (existing && existing.emoji === data.emoji) {
          await prisma.messageReaction.delete({
            where: { messageId_userId: { messageId: data.messageId, userId } },
          });
        } else if (existing) {
          await prisma.messageReaction.update({
            where: { messageId_userId: { messageId: data.messageId, userId } },
            data: { emoji: data.emoji },
          });
        } else {
          await prisma.messageReaction.create({
            data: { messageId: data.messageId, userId, emoji: data.emoji },
          });
        }

        const reactions = await getReactionsForMessage(data.messageId);
        emitToGroup(message.groupId, "reaction:updated", { messageId: data.messageId, reactions });
      } catch (err) {
        console.error("[socket] reaction:toggle handler failed", err);
      }
    });

    socket.on("message:read", async (data: { groupId: string; messageIds: string[] }) => {
      try {
        if (!Array.isArray(data?.messageIds) || data.messageIds.length === 0) return;
        if (typeof data.groupId !== "string") return;
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
        console.error("[socket] message:read handler failed", err);
      }
    });

    socket.on("disconnect", async () => {
      try {
        const userSockets = onlineSockets.get(userId);
        if (!userSockets) return;
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineSockets.delete(userId);
          const lastSeenAt = new Date();
          await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } });
          const groupIds = await groupIdsForUser(userId);
          for (const groupId of groupIds) {
            emitToGroup(groupId, "presence:update", { userId, online: false, lastSeenAt: lastSeenAt.toISOString() });
          }
        }
      } catch (err) {
        console.error("[socket] disconnect handler failed", err);
      }
    });

    // Broadcast "just came online" only after every listener above
    // (including "disconnect") is registered, and without awaiting it here -
    // an immediate disconnect during this lookup is now guaranteed to hit
    // the disconnect listener already in place above.
    if (wasOffline) {
      void broadcastOnlinePresence(userId);
    }
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialized yet");
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToGroup(groupId: string, event: string, payload: unknown) {
  io?.to(`group:${groupId}`).emit(event, payload);
}
```

The only change versus the current file is the new `message:read`
handler (inserted between the existing `reaction:toggle` and
`disconnect` handlers) and the added `getReadsForMessages` import.
Every other line is byte-identical to the file's current state —
confirm this with a diff against the file's pre-task content rather
than assuming.

- [ ] **Step 1: Apply the file replacement above**

- [ ] **Step 2: Verify**

From `backend/`:

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Manually trace these scenarios** (no test framework
  exists in this repo, so this replaces an automated test):
  1. A member who is NOT in the group calls `message:read` with that
     group's id and a real message id from it → `assertMember` throws,
     caught by the try/catch, nothing happens, no crash.
  2. A member sends `messageIds` containing a real message id that
     belongs to a DIFFERENT group than the `groupId` they passed → the
     `prisma.message.findMany({ where: { id: { in }, groupId } })` query
     naturally excludes it (the `AND` on `groupId` filters it out), so
     no read row is created for it — confirming a forged `groupId` on
     an otherwise-real message can't be used to mark it read outside
     its own group's membership check.
  3. A member marks their OWN message as read → filtered out by
     `readable = messages.filter((m) => m.senderId !== userId)`, no row
     created, no self-read ever exists.
  4. Two different senders' messages arrive in one `messageIds` batch →
     `bySender` groups them correctly, and `emitToUser` fires once per
     distinct sender with only that sender's own messages in the
     `updates` array — sender A never receives sender B's read data and
     vice versa.
  5. The existing `reaction:toggle`, `message:send`, `presence:get`, and
     `disconnect` handlers are unchanged in behavior — confirm this
     directly by diffing this task's file against its pre-task content.

- [ ] **Step 4: Commit**

```bash
git add backend/src/config/socket.ts
git commit -m "Add message:read socket event with sender-only targeted delivery"
```

---

### Task 4: Mobile — `types/index.ts`

**Files:**
- Modify: `mobile/src/types/index.ts`

**Interfaces:**
- Consumes: nothing new (this is the mobile mirror of Task 2's backend
  shapes).
- Produces: `export interface MessageReadEntry { userId: string; readAt:
  string }` and an extended `ChatMessage` interface with `readBy?:
  MessageReadEntry[]` — consumed by Task 5 (`useLiveGroupChat`), Task 6
  (`SeenByModal`'s `readBy` prop type), and Task 7 (`GroupChatScreen`).

- [ ] **Step 1: Add the `MessageReadEntry` interface**

In `mobile/src/types/index.ts`, find the existing `PresenceInfo`
interface (currently right before `ChatMessage`):

```ts
export interface PresenceInfo {
  online: boolean;
  lastSeenAt: string | null;
}
```

Add `MessageReadEntry` directly after it:

```ts
export interface PresenceInfo {
  online: boolean;
  lastSeenAt: string | null;
}

export interface MessageReadEntry {
  userId: string;
  readAt: string;
}
```

- [ ] **Step 2: Extend `ChatMessage`**

Find:

```ts
export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  type: MessageType;
  content?: string | null;
  mediaUrl?: string | null;
  createdAt: string;
  sender: TripOwnerSummary;
  reactions?: MessageReactionSummary[];
}
```

Add a `readBy` field:

```ts
export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  type: MessageType;
  content?: string | null;
  mediaUrl?: string | null;
  createdAt: string;
  sender: TripOwnerSummary;
  reactions?: MessageReactionSummary[];
  readBy?: MessageReadEntry[];
}
```

`readBy` is `undefined` for any message that isn't the current user's
own (matching the backend's sender-only attachment from Task 2/3) vs. an
empty array for the sender's own message that nobody has read yet.

- [ ] **Step 3: Verify**

From `mobile/`:

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/types/index.ts
git commit -m "Add MessageReadEntry type and ChatMessage.readBy field"
```

---

### Task 5: Mobile — `useLiveGroupChat` (`api/messages.ts`)

**Files:**
- Modify: `mobile/src/api/messages.ts`

**Interfaces:**
- Consumes: `MessageReadEntry` (Task 4, imported from `../types`
  alongside the file's existing `ChatMessage`/`MessageReactionSummary`/
  `Paginated`/`PresenceInfo` imports). The `message:read`/
  `message:read:updated` event names and payload shapes (Task 3).
- Produces: `useLiveGroupChat`'s return value gains a
  `markRead(messageIds: string[]): void` function alongside the
  existing `{ messages, sendMessage, presence, toggleReaction }` —
  consumed by Task 7's `GroupChatScreen` wiring.

This is a full replacement of `mobile/src/api/messages.ts`. Here is the
complete file content to write:

```ts
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ImagePickerAsset } from "expo-image-picker";
import { apiClient } from "./client";
import { getSocket } from "./socket";
import { appendImageAsset } from "../utils/formDataImage";
import type { ChatMessage, MessageReactionSummary, MessageReadEntry, Paginated, PresenceInfo } from "../types";

export function useMessageHistory(groupId?: string) {
  return useQuery({
    queryKey: ["messages", groupId],
    queryFn: async () => (await apiClient.get<Paginated<ChatMessage>>(`/messages/groups/${groupId}`)).data,
    enabled: !!groupId,
  });
}

export function useUploadChatImage() {
  return useMutation({
    mutationFn: async (asset: ImagePickerAsset) => {
      const form = new FormData();
      appendImageAsset(form, "image", asset, "chat.jpg");
      const { data } = await apiClient.post<{ url: string }>("/messages/images", form);
      return data.url;
    },
  });
}

export function useLiveGroupChat(
  groupId: string | undefined,
  initialMessages: ChatMessage[],
  memberIds: string[] = []
) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  // Joining depends on which members exist, but memberIds is a fresh array
  // reference on every render (the caller derives it from group.members) -
  // joining it into a string gives the effect a stable primitive to depend
  // on instead of re-subscribing to sockets every render.
  const memberIdsKey = memberIds.join(",");

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!groupId) return;
    const socket = getSocket();
    socket.emit("group:join", groupId);
    if (memberIdsKey) {
      socket.emit("presence:get", { userIds: memberIdsKey.split(",") });
    }

    const onNewMessage = (message: ChatMessage) => {
      if (message.groupId !== groupId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    };

    const onReactionUpdated = (data: { messageId: string; reactions: MessageReactionSummary[] }) => {
      setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)));
    };

    const onPresenceSnapshot = (snapshot: Record<string, PresenceInfo>) => {
      setPresence((prev) => ({ ...prev, ...snapshot }));
    };

    const onPresenceUpdate = (update: { userId: string; online: boolean; lastSeenAt: string | null }) => {
      setPresence((prev) => ({
        ...prev,
        [update.userId]: { online: update.online, lastSeenAt: update.lastSeenAt },
      }));
    };

    const onReadUpdated = (payload: { updates: { messageId: string; readBy: MessageReadEntry[] }[] }) => {
      setMessages((prev) =>
        prev.map((m) => {
          const update = payload.updates.find((u) => u.messageId === m.id);
          return update ? { ...m, readBy: update.readBy } : m;
        })
      );
    };

    socket.on("message:new", onNewMessage);
    socket.on("reaction:updated", onReactionUpdated);
    socket.on("presence:snapshot", onPresenceSnapshot);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("message:read:updated", onReadUpdated);
    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("reaction:updated", onReactionUpdated);
      socket.off("presence:snapshot", onPresenceSnapshot);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("message:read:updated", onReadUpdated);
      socket.emit("group:leave", groupId);
    };
  }, [groupId, memberIdsKey]);

  const sendMessage = (input: { content?: string; type?: "TEXT" | "IMAGE"; mediaUrl?: string }) => {
    if (!groupId) return;
    getSocket().emit("message:send", { groupId, ...input });
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    getSocket().emit("reaction:toggle", { messageId, emoji });
  };

  const markRead = (messageIds: string[]) => {
    if (!groupId || messageIds.length === 0) return;
    getSocket().emit("message:read", { groupId, messageIds });
  };

  return { messages, sendMessage, presence, toggleReaction, markRead };
}
```

The only changes versus the current file: the `MessageReadEntry` import,
the new `onReadUpdated` handler registered/cleaned up alongside the
other four listeners, and the new `markRead` function added to the
return value. Everything else — `useMessageHistory`,
`useUploadChatImage`, the existing four listeners, `sendMessage`,
`toggleReaction`, the join/leave lifecycle — is byte-identical to the
current file.

- [ ] **Step 1: Apply the file replacement above**

- [ ] **Step 2: Verify**

From `mobile/`:

```bash
npx tsc --noEmit
```

Expected: zero errors. Note: `mobile/src/screens/GroupChatScreen.tsx`
currently destructures `{ messages, sendMessage, presence,
toggleReaction }` from this hook's return value — adding a fifth
property (`markRead`) to the object doesn't break that existing
destructure, so no other file needs to change for this task's `tsc` to
stay clean. Do not modify `GroupChatScreen.tsx` in this task — that's
Task 7's job.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/messages.ts
git commit -m "Add markRead and message:read:updated handling to useLiveGroupChat"
```

---

### Task 6: Mobile — `SeenByModal.tsx` (new component)

**Files:**
- Create: `mobile/src/components/SeenByModal.tsx`

**Interfaces:**
- Consumes: `GroupMember`, `PresenceInfo`, `MessageReadEntry` (all from
  `../types`, the last one from Task 4).
- Produces: `SeenByModal` component with props `{ visible: boolean;
  onClose: () => void; members: GroupMember[]; presence: Record<string,
  PresenceInfo>; readBy: MessageReadEntry[] }` — consumed by Task 7's
  `GroupChatScreen` wiring. The caller is responsible for pre-filtering
  the sender out of `members` before passing it in (this component does
  not know or care who the sender was).

This component is presentational and structurally mirrors
`mobile/src/components/GroupMembersModal.tsx` (same bottom-sheet
`Modal`, same avatar/name row layout, same design tokens) — read it
first for the exact visual pattern to match. The difference: instead of
an Owner badge and an online/last-seen-only status line, each row shows
online/offline (same as `GroupMembersModal`) plus a **read/unread**
status derived from whether that member's `userId` appears in the
`readBy` prop.

Here is the complete file content to write:

```ts
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { GroupMember, MessageReadEntry, PresenceInfo } from "../types";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

function formatReadTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function SeenByModal({
  visible,
  onClose,
  members,
  presence,
  readBy,
}: {
  visible: boolean;
  onClose: () => void;
  members: GroupMember[];
  presence: Record<string, PresenceInfo>;
  readBy: MessageReadEntry[];
}) {
  const readByUserId = new Map(readBy.map((r) => [r.userId, r.readAt]));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Seen by</Text>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {members.map((member) => {
              const info = presence[member.userId];
              const online = info?.online ?? false;
              const readAt = readByUserId.get(member.userId);
              return (
                <View key={member.userId} style={styles.row}>
                  <View style={styles.avatarWrap}>
                    {member.user.photoUrl ? (
                      <Image source={{ uri: optimizedImageUrl(member.user.photoUrl, 84) }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarInitial}>{member.user.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    {online && <View style={styles.onlineDot} />}
                  </View>
                  <View style={styles.textWrap}>
                    <Text style={styles.name} numberOfLines={1}>
                      {member.user.name}
                    </Text>
                    <Text style={readAt ? styles.statusSeen : styles.statusUnseen}>
                      {readAt ? `Seen · ${formatReadTime(readAt)}` : "Not yet seen"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "75%",
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 14 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { ...TYPE.heading, fontSize: 17 },
  list: { marginTop: 4 },
  listContent: { paddingBottom: 24, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  avatarWrap: { position: "relative" },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  textWrap: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: "700", color: COLORS.ink },
  statusSeen: { fontSize: 12, color: COLORS.primary, fontWeight: "600", marginTop: 2 },
  statusUnseen: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
});
```

If a group has no other members besides the sender, `members` will be
an empty array (the caller filters the sender out before passing it in)
and the sheet shows an empty scroll area below the "Seen by" header —
this is an acceptable clean empty state and needs no special-case
messaging, since a group chat with only one member is already an edge
case the rest of this feature (and the app) doesn't otherwise handle
specially.

- [ ] **Step 1: Create the file with the exact content above**

- [ ] **Step 2: Verify**

From `mobile/`:

```bash
npx tsc --noEmit
```

Expected: zero errors. Since nothing imports `SeenByModal` yet (Task 7
does that), there should be no "unused" warnings from this file itself,
only confirm there are no type errors within it.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/SeenByModal.tsx
git commit -m "Add SeenByModal component showing per-member read status"
```

---

### Task 7: Mobile — `GroupChatScreen.tsx` wiring

**Files:**
- Modify: `mobile/src/screens/GroupChatScreen.tsx`

**Interfaces:**
- Consumes: `markRead` (Task 5, destructured from `useLiveGroupChat`'s
  return value), `SeenByModal` (Task 6), `ChatMessage.readBy` (Task 4).
- Produces: nothing further consumed by another task — this is the last
  task in the plan.

This task adds: (1) a `useEffect` that calls `markRead` for the
initially-loaded history and for each new incoming message while the
screen stays mounted; (2) a small tappable "Seen by N" / "Sent" row
below the sender's own message bubbles; (3) a `SeenByModal` instance
wired to that row's tap.

Below are the exact edits to `mobile/src/screens/GroupChatScreen.tsx`,
described as find-and-replace blocks against its current content (do
not rewrite the whole file — this is a set of targeted edits into an
already-large screen file).

- [ ] **Step 1: Import `SeenByModal`**

Find:

```ts
import { AttachmentSheet } from "../components/AttachmentSheet";
import { GroupMembersModal } from "../components/GroupMembersModal";
import { ReactionPickerModal } from "../components/ReactionPickerModal";
```

Replace with:

```ts
import { AttachmentSheet } from "../components/AttachmentSheet";
import { GroupMembersModal } from "../components/GroupMembersModal";
import { ReactionPickerModal } from "../components/ReactionPickerModal";
import { SeenByModal } from "../components/SeenByModal";
```

- [ ] **Step 2: Destructure `markRead` and add `seenByTargetId` state**

Find:

```ts
  const { messages, sendMessage, presence, toggleReaction } = useLiveGroupChat(
    groupId,
    history?.items ?? [],
    memberIds
  );
```

Replace with:

```ts
  const { messages, sendMessage, presence, toggleReaction, markRead } = useLiveGroupChat(
    groupId,
    history?.items ?? [],
    memberIds
  );
```

Find:

```ts
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
```

Replace with:

```ts
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [seenByTargetId, setSeenByTargetId] = useState<string | null>(null);
```

- [ ] **Step 3: Mark messages as read as they load/arrive**

Find:

```ts
  const reactionTargetMessage = messages.find((m) => m.id === reactionTargetId) ?? null;
```

Insert directly before it:

```ts
  useEffect(() => {
    if (!me) return;
    const alreadyMarked = markedReadIds.current;
    const unread = messages
      .filter((m) => m.senderId !== me.id && !alreadyMarked.has(m.id))
      .map((m) => m.id);
    if (unread.length === 0) return;
    for (const id of unread) alreadyMarked.add(id);
    markRead(unread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, me?.id]);

```

This effect fires whenever the number of loaded messages changes —
covering both the initial history load (messages.length goes from 0 to
N) and each subsequent `message:new` arrival (messages.length
increments by 1) — while the screen stays mounted. `markedReadIds` (a
`useRef<Set<string>>`, added below) tracks which message ids this
screen instance has already sent a `message:read` for, so each new
message triggers a `markRead` call containing only the newly-unread
ids, not the whole growing history every time — the server-side handler
is idempotent (`skipDuplicates: true`) regardless, but avoiding the
resend keeps socket traffic proportional to new messages rather than to
total history length. Add the `useRef` import and the ref itself: find
the top of the file's React import line —

```ts
import { useState } from "react";
```

— and replace it with:

```ts
import { useEffect, useRef, useState } from "react";
```

Then find:

```ts
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [seenByTargetId, setSeenByTargetId] = useState<string | null>(null);
```

(added in Step 2) and add the ref directly after it:

```ts
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [seenByTargetId, setSeenByTargetId] = useState<string | null>(null);
  const markedReadIds = useRef<Set<string>>(new Set());
```

- [ ] **Step 4: Add the read-status row below the sender's own bubbles**

Find:

```ts
          {reactions.length > 0 && (
            <View style={[styles.reactionsRow, isMine && styles.reactionsRowMine]}>
              {reactions.map((r) => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[styles.reactionPill, r.userIds.includes(me?.id ?? "") && styles.reactionPillMine]}
                  onPress={() => toggleReaction(item.id, r.emoji)}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  <Text style={styles.reactionCount}>{r.count}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={[styles.timeText, isMine && styles.timeTextMine]}>{formatTime(item.createdAt)}</Text>
```

Replace with:

```ts
          {reactions.length > 0 && (
            <View style={[styles.reactionsRow, isMine && styles.reactionsRowMine]}>
              {reactions.map((r) => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[styles.reactionPill, r.userIds.includes(me?.id ?? "") && styles.reactionPillMine]}
                  onPress={() => toggleReaction(item.id, r.emoji)}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  <Text style={styles.reactionCount}>{r.count}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={[styles.timeText, isMine && styles.timeTextMine]}>{formatTime(item.createdAt)}</Text>
          {isMine && (
            <TouchableOpacity style={styles.seenByRow} onPress={() => setSeenByTargetId(item.id)}>
              <MaterialCommunityIcons
                name={(item.readBy?.length ?? 0) > 0 ? "check-all" : "check"}
                size={13}
                color={(item.readBy?.length ?? 0) > 0 ? COLORS.primary : COLORS.mutedLight}
              />
              <Text style={(item.readBy?.length ?? 0) > 0 ? styles.seenByTextSeen : styles.seenByText}>
                {(item.readBy?.length ?? 0) > 0 ? `Seen by ${item.readBy!.length}` : "Sent"}
              </Text>
            </TouchableOpacity>
          )}
```

- [ ] **Step 5: Compute the Seen By sheet's props and render it**

Find:

```ts
  const onSelectReaction = (emoji: string) => {
    if (reactionTargetId) toggleReaction(reactionTargetId, emoji);
    setReactionTargetId(null);
  };
```

Insert directly after it:

```ts

  const seenByTargetMessage = messages.find((m) => m.id === seenByTargetId) ?? null;
  const seenByOtherMembers = (group?.members ?? []).filter((m) => m.userId !== me?.id);
```

Find:

```ts
      <ReactionPickerModal
        visible={!!reactionTargetId}
        onClose={() => setReactionTargetId(null)}
        onSelect={onSelectReaction}
        currentReaction={reactionTargetCurrentEmoji}
      />
    </KeyboardAvoidingView>
  );
```

Replace with:

```ts
      <ReactionPickerModal
        visible={!!reactionTargetId}
        onClose={() => setReactionTargetId(null)}
        onSelect={onSelectReaction}
        currentReaction={reactionTargetCurrentEmoji}
      />

      <SeenByModal
        visible={!!seenByTargetId}
        onClose={() => setSeenByTargetId(null)}
        members={seenByOtherMembers}
        presence={presence}
        readBy={seenByTargetMessage?.readBy ?? []}
      />
    </KeyboardAvoidingView>
  );
```

- [ ] **Step 6: Add the new styles**

Find the `reactionCount` style line:

```ts
  reactionCount: { fontSize: 11, color: COLORS.muted, fontWeight: "700" },
```

Insert directly after it:

```ts
  reactionCount: { fontSize: 11, color: COLORS.muted, fontWeight: "700" },
  seenByRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3, alignSelf: "flex-end" },
  seenByText: { fontSize: 10.5, color: COLORS.mutedLight },
  seenByTextSeen: { fontSize: 10.5, color: COLORS.primary, fontWeight: "600" },
```

(Adjust `alignSelf` if needed so the row sits correctly for both mine
and theirs bubble alignment — since this row only ever renders for
`isMine` bubbles, which are right-aligned via `bubbleColMine`, keep it
consistent with how `timeTextMine` already right-aligns for mine
bubbles.)

- [ ] **Step 7: Verify**

From `mobile/`:

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8: Manually trace these scenarios**

  1. Opening the chat screen calls `markRead` once for all initially
     loaded messages not sent by the current user (confirm via the
     `useEffect` added in Step 3 — messages sent by "me" are correctly
     excluded before calling `markRead`).
  2. A new incoming message (from someone else) while the screen is
     open triggers another `markRead` call including that new message's
     id.
  3. The read-status row (`check`/`check-all` + "Sent"/"Seen by N")
     renders ONLY below the current user's own messages — never below
     messages from other members.
  4. Tapping the read-status row opens `SeenByModal` listing every OTHER
     group member (sender/self excluded via `seenByOtherMembers`), each
     annotated with online/offline and seen/not-seen status.
  5. Long-pressing ANY message bubble (yours or someone else's) still
     opens `ReactionPickerModal` exactly as before — this task must not
     have touched the `onLongPress` handler at all.
  6. The attachment sheet, members-list header button, existing text
     send, and existing camera/gallery/files photo flow are all
     unaffected — confirm by diffing this task's changes against the
     file's pre-task content and verifying no other region of the file
     changed.

- [ ] **Step 9: (Recommended) Web smoke test**

From `mobile/`, start a temporary web dev server on a free port —
**never port 8081**, which is this project's live tunnel dev server
actively watched via Expo Go:

```bash
npx expo start --web --port 8099
```

Confirm the bundle compiles with no errors (fetch the root page, find
its bundle script `src`, fetch that URL, confirm HTTP 200 and that it
contains `SeenByModal` and `GroupChatScreen`), then kill the server and
confirm port 8099 is free again. Do not touch port 8081 at any point.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/screens/GroupChatScreen.tsx
git commit -m "Wire Seen By read-status row and sheet into Group Chat"
```
