# Group Chat Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add photo-attachment sources (Gallery, Files), a Group Members view, live online/offline presence, and message reactions to the existing Group Chat feature, with zero changes to existing chat send/receive/history behavior beyond one additive field.

**Architecture:** A backend chain (Prisma schema → `messages.service.ts` reaction aggregation → `socket.ts` presence/reaction events) followed by an independent set of small mobile UI components (`AttachmentSheet`, `GroupMembersModal`, `ReactionPickerModal`), then a hook extension (`useLiveGroupChat`) that wires the new socket events into state, and finally one screen-wiring task that assembles everything into `GroupChatScreen.tsx`. Reactions and presence are both fully socket-driven (no new REST write endpoints), matching how messages themselves already work.

**Tech Stack:** Prisma/PostgreSQL, Socket.IO (`socket.io` server, `socket.io-client` mobile), Express, React Native/Expo, `expo-document-picker` (new dependency), React Query (unchanged elsewhere).

**Spec:** docs/superpowers/specs/2026-09-06-group-chat-enhancements-design.md

## Global Constraints

- Zero behavior change to existing chat: `message:send`/`message:new`'s payload shape is unchanged (no `reactions` field added to the live socket emit — only the REST history endpoint gains it), `onSend`/`onOpenCamera`/`onRetake`/`onConfirmSendPhoto` and the existing preview-bar flow are unchanged.
- Reactions are one-per-user-per-message, enforced by a DB unique constraint (`@@unique([messageId, userId])` on `MessageReaction`) — re-selecting the same emoji removes it, selecting a different one replaces it.
- "Choose from Files" is images-only (`type: "image/*"` filter) — no new `MessageType`, no new message-bubble rendering.
- Presence online/offline state is in-memory only (a `Map<string, Set<string>>` in `backend/src/config/socket.ts`); `User.lastSeenAt` is the only piece of presence data persisted to the DB, updated on last-socket disconnect.
- The 6 allowed reaction emoji — `❤️ 👍 😂 😍 😮 🙌` — must be byte-identical (copied verbatim, not retyped) between the backend's `ALLOWED_REACTIONS` (Task 2) and the mobile `ReactionPickerModal`'s `REACTION_EMOJI` (Task 7), since equality checks depend on exact codepoint matches (these emoji include invisible variation-selector codepoints).
- No test framework exists in this repo. Verification is `npx tsc --noEmit` (both `backend/` and `mobile/`) for every task, plus a manual code-trace confirming unchanged behavior where the constraints above require it.

---

### Task 1: Prisma schema — MessageReaction model and User.lastSeenAt

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create (generated): a new migration folder under `backend/prisma/migrations/`

**Interfaces:**
- Produces: Prisma model `MessageReaction` (`id`, `messageId`, `message`, `userId`, `user`, `emoji: String`, `createdAt`, compound unique `messageId_userId`), `User.lastSeenAt: DateTime?`, `User.reactions` relation, `Message.reactions` relation. Regenerated `@prisma/client` types available to every later backend task.

- [ ] **Step 1: Edit `backend/prisma/schema.prisma`**

Add `lastSeenAt` and the `reactions` relation to the `User` model. The full `User` model becomes:

```prisma
model User {
  id             String   @id @default(cuid())
  email          String?  @unique
  passwordHash   String?
  googleId       String?  @unique
  phone          String?  @unique
  phoneVerified  Boolean  @default(false)
  name           String
  photoUrl       String?
  coverPhotoUrl  String?
  age            Int?
  location       String?
  bio            String?
  interests      String[] @default([])
  preferredModes TravelMode[] @default([])
  lastSeenAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  trips           Trip[]           @relation("TripOwner")
  joinRequests    JoinRequest[]
  tripLikes       TripLike[]
  tripBookmarks   TripBookmark[]
  tripComments    TripComment[]
  groupMemberships GroupMember[]
  messages        Message[]
  notifications   Notification[]
  reactions       MessageReaction[]
}
```

Add the `reactions` relation to the `Message` model. The full `Message` model becomes:

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

Add a new `MessageReaction` model directly after the `Message` model:

```prisma
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

- [ ] **Step 2: Generate and apply the migration**

Run (from `backend/`):
```bash
npx prisma migrate dev --name add_message_reactions_and_presence
```
Expected: a new folder appears under `backend/prisma/migrations/` (following the naming convention of the existing `20260903142310_init`, `20260904150142_add_user_cover_photo`, etc.), the migration applies successfully against the dev database, and `@prisma/client` regenerates. If this environment has no reachable `DATABASE_URL` for `migrate dev`, run `npx prisma generate` instead so `@prisma/client`'s TypeScript types stay in sync for the type-check in Step 3 — but note in your report that the actual migration still needs to be applied against the real database before this feature works end-to-end.

- [ ] **Step 3: Type-check**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Add MessageReaction model and User.lastSeenAt for chat reactions and presence"
```

---

### Task 2: messages.service.ts — reaction aggregation and history extension

**Files:**
- Modify: `backend/src/modules/messages/messages.service.ts`

**Interfaces:**
- Consumes: `prisma.messageReaction`, `prisma.message` (Task 1's schema), existing `assertMember` (from `../groups/groups.service`), existing `parsePageParams`/`toSkipTake` (from `../../utils/pagination`).
- Produces: `ALLOWED_REACTIONS: readonly ["❤️","👍","😂","😍","😮","🙌"]`, `type AllowedReaction = (typeof ALLOWED_REACTIONS)[number]`, `interface MessageReactionSummary { emoji: string; count: number; userIds: string[] }`, `getReactionsForMessage(messageId: string): Promise<MessageReactionSummary[]>` (used by Task 3's socket handler), and `listMessages`'s return shape now has `items[].reactions: MessageReactionSummary[]`.

- [ ] **Step 1: Replace the full contents of `backend/src/modules/messages/messages.service.ts`**

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

  const reactionRows = await prisma.messageReaction.findMany({
    where: { messageId: { in: items.map((m) => m.id) } },
    select: { messageId: true, userId: true, emoji: true },
  });
  const reactionsByMessage = groupReactionRows(reactionRows);

  const itemsWithReactions = items.map((message) => ({
    ...message,
    reactions: reactionsByMessage.get(message.id) ?? [],
  }));

  return { items: itemsWithReactions.reverse(), total, ...pageParams };
}
```

Notes for the implementer:
- `getReactionsForMessage` does one query per call (fine — it's only ever called for a single message right after a reaction toggle, in Task 3). `listMessages` instead does one *batched* query for the whole page (`messageId: { in: [...] }`) rather than calling `getReactionsForMessage` per message, to avoid an N+1 query pattern on a page of up to 100 messages.
- `items.reverse()` in the original code is preserved — it's now called on `itemsWithReactions` (the mapped array) instead of `items`, producing the identical chronological ordering as before, just with the `reactions` field attached to each item.

- [ ] **Step 2: Type-check**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/messages/messages.service.ts
git commit -m "Add reaction aggregation and attach reaction summaries to chat history"
```

---

### Task 3: socket.ts — presence tracking and reaction:toggle

**Files:**
- Modify: `backend/src/config/socket.ts`

**Interfaces:**
- Consumes: existing `assertMember` (exported from `../modules/groups/groups.service`), `ALLOWED_REACTIONS`/`AllowedReaction`/`getReactionsForMessage` (from `../modules/messages/messages.service`, Task 2), `prisma.groupMember`/`prisma.message`/`prisma.messageReaction`/`prisma.user` (Task 1's schema).
- Produces: new socket events — `presence:get` (client→server, `{ userIds: string[] }`), `presence:snapshot` (server→requesting client only, `Record<string, { online: boolean; lastSeenAt: string | null }>`), `presence:update` (server→group room, `{ userId: string; online: boolean; lastSeenAt: string | null }`), `reaction:toggle` (client→server, `{ messageId: string; emoji: string }`), `reaction:updated` (server→group room, `{ messageId: string; reactions: MessageReactionSummary[] }`). `message:send`/`message:new`'s existing behavior and payload shape are untouched.

- [ ] **Step 1: Replace the full contents of `backend/src/config/socket.ts`**

```ts
import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./env";
import { prisma } from "./prisma";
import { assertMember } from "../modules/groups/groups.service";
import { ALLOWED_REACTIONS, getReactionsForMessage, type AllowedReaction } from "../modules/messages/messages.service";

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

  io.on("connection", async (socket: AuthedSocket) => {
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

    if (wasOffline) {
      const groupIds = await groupIdsForUser(userId);
      for (const groupId of groupIds) {
        emitToGroup(groupId, "presence:update", { userId, online: true, lastSeenAt: null });
      }
    }

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
      const users = await prisma.user.findMany({
        where: { id: { in: data.userIds } },
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
    });

    socket.on("reaction:toggle", async (data: { messageId: string; emoji: string }) => {
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
    });

    socket.on("disconnect", async () => {
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
    });
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

Notes for the implementer:
- `message:send`'s handler body and its `message:new` emit are **byte-for-byte identical** to the pre-existing code — only `socket.userId!` was replaced with the already-narrowed `userId` local (assigned once at the top of the connection handler, after the `if (!socket.userId) return;` guard) for consistency with the new code added around it. This is not a behavior change: `userId` and `socket.userId!` are the same value.
- `presence:snapshot` is sent via `socket.emit(...)` (a direct reply to the requesting socket only), not `emitToGroup`/`io.to(...)` — it must not be broadcast to the whole group.
- `reaction:toggle`'s membership check reuses `assertMember`, which *throws* `HttpError` on failure (it's designed for HTTP controllers) — the `try/catch` around it here converts that throw into a silent `return`, which is the correct behavior for a socket handler (there's no HTTP response to send an error on).
- The `wasOffline`/socket-set bookkeeping at the top of the connection handler runs for every single connection, not just group-chat ones (a user connects once per app session, not once per group) — this is intentional: presence is a per-user, not per-group, concept, and `groupIdsForUser` fans the update out to every group that user belongs to.

- [ ] **Step 2: Type-check**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/socket.ts
git commit -m "Add presence tracking and reaction:toggle socket events"
```

---

### Task 4: Mobile types — MessageReactionSummary, PresenceInfo, ChatMessage.reactions

**Files:**
- Modify: `mobile/src/types/index.ts`

**Interfaces:**
- Produces: `interface MessageReactionSummary { emoji: string; count: number; userIds: string[] }` (must exactly mirror Task 2's backend shape), `interface PresenceInfo { online: boolean; lastSeenAt: string | null }`, `ChatMessage.reactions?: MessageReactionSummary[]`.

- [ ] **Step 1: Add `MessageReactionSummary` and `PresenceInfo`, and extend `ChatMessage`**

In `mobile/src/types/index.ts`, add these two new interfaces immediately before the existing `ChatMessage` interface:

```ts
export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface PresenceInfo {
  online: boolean;
  lastSeenAt: string | null;
}
```

Then change the existing `ChatMessage` interface from:

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
}
```

to:

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

`reactions` is optional because the live `message:new` socket event does not include it (a brand-new message has no reactions yet) — only the REST history payload populates it; UI code must treat a `reactions` of `undefined` the same as an empty array (`message.reactions ?? []`).

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors (this is an additive, backward-compatible type change).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/types/index.ts
git commit -m "Add MessageReactionSummary and PresenceInfo types"
```

---

### Task 5: AttachmentSheet component

**Files:**
- Create: `mobile/src/components/AttachmentSheet.tsx`

**Interfaces:**
- Consumes: `COLORS`, `RADIUS`, `SHADOW` from `../theme/tokens`.
- Produces: `AttachmentSheet` component, props `{ visible: boolean; onClose: () => void; onTakePhoto: () => void; onChooseFromGallery: () => void; onChooseFromFiles: () => void }`. Purely presentational — it does not call any picker API itself; the three `onTakePhoto`/`onChooseFromGallery`/`onChooseFromFiles` callbacks are provided by its caller (Task 9).

- [ ] **Step 1: Create `mobile/src/components/AttachmentSheet.tsx`**

```tsx
import type { ComponentProps } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS, SHADOW } from "../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface AttachmentOption {
  key: "camera" | "gallery" | "files";
  icon: IconName;
  label: string;
}

const OPTIONS: AttachmentOption[] = [
  { key: "camera", icon: "camera-outline", label: "Take Photo" },
  { key: "gallery", icon: "image-multiple-outline", label: "Choose from Gallery" },
  { key: "files", icon: "folder-outline", label: "Choose from Files" },
];

export function AttachmentSheet({
  visible,
  onClose,
  onTakePhoto,
  onChooseFromGallery,
  onChooseFromFiles,
}: {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChooseFromGallery: () => void;
  onChooseFromFiles: () => void;
}) {
  const select = (key: AttachmentOption["key"]) => {
    onClose();
    if (key === "camera") onTakePhoto();
    else if (key === "gallery") onChooseFromGallery();
    else onChooseFromFiles();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={styles.handle} />
          {OPTIONS.map((option) => (
            <TouchableOpacity key={option.key} style={styles.row} onPress={() => select(option.key)}>
              <View style={styles.iconBadge}>
                <MaterialCommunityIcons name={option.icon} size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.label}>{option.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
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
    paddingBottom: 28,
    ...SHADOW.card,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.fieldBg,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 15, fontWeight: "600", color: COLORS.ink },
  cancelButton: { marginTop: 8, paddingVertical: 13, alignItems: "center", borderTopWidth: 1, borderTopColor: COLORS.border },
  cancelText: { fontSize: 15, fontWeight: "700", color: COLORS.danger },
});
```

Notes for the implementer:
- The inner `TouchableOpacity` wrapping the sheet content (`onPress={() => {}}`) exists purely to swallow taps so they don't bubble to the backdrop's `onPress={onClose}` — this is the standard RN pattern for "tap outside to dismiss, tap inside does nothing by default."
- `SHADOW.card` from `theme/tokens.ts` already includes `shadowColor`/`shadowOpacity`/`shadowRadius`/`shadowOffset`/`elevation` — do not add any of those properties manually alongside it.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/AttachmentSheet.tsx
git commit -m "Add AttachmentSheet component for Camera/Gallery/Files photo picking"
```

---

### Task 6: GroupMembersModal component

**Files:**
- Create: `mobile/src/components/GroupMembersModal.tsx`

**Interfaces:**
- Consumes: `GroupMember` type (existing, from `../types` — unchanged shape: `{ userId, role, joinedAt, user: { id, name, photoUrl } }`), `PresenceInfo` (Task 4, from `../types`), `COLORS`/`RADIUS`/`TYPE` from `../theme/tokens`, `optimizedImageUrl` from `../utils/optimizedImage`.
- Produces: `GroupMembersModal` component, props `{ visible: boolean; onClose: () => void; members: GroupMember[]; presence: Record<string, PresenceInfo> }`. Purely presentational — does no data fetching of its own.

- [ ] **Step 1: Create `mobile/src/components/GroupMembersModal.tsx`**

```tsx
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { GroupMember, PresenceInfo } from "../types";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Offline";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days}d ago`;
}

export function GroupMembersModal({
  visible,
  onClose,
  members,
  presence,
}: {
  visible: boolean;
  onClose: () => void;
  members: GroupMember[];
  presence: Record<string, PresenceInfo>;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Group Members</Text>
            <Text style={styles.count}>{members.length}</Text>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {members.map((member) => {
              const info = presence[member.userId];
              const online = info?.online ?? false;
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
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {member.user.name}
                      </Text>
                      {member.role === "OWNER" && (
                        <View style={styles.ownerChip}>
                          <Text style={styles.ownerChipText}>Owner</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.status}>{online ? "Online" : formatLastSeen(info?.lastSeenAt ?? null)}</Text>
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
  count: { fontSize: 14, color: COLORS.muted, fontWeight: "600" },
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
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 14.5, fontWeight: "700", color: COLORS.ink, flexShrink: 1 },
  ownerChip: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
  ownerChipText: { fontSize: 10.5, fontWeight: "700", color: COLORS.white },
  status: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
});
```

Notes for the implementer:
- `"#22c55e"` (the online-dot green) is an intentional new literal, not a missed token substitution — no color in `theme/tokens.ts` is this specific universally-recognized "online" green (`COLORS.primary` is teal). Do not substitute a token here.
- `presence[member.userId]` can be `undefined` (e.g. before the first `presence:snapshot` arrives) — the `info?.online ?? false` / `info?.lastSeenAt ?? null` optional-chaining handles this by defaulting to "offline, no last-seen data" rather than crashing.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/GroupMembersModal.tsx
git commit -m "Add GroupMembersModal component showing members, owner badge, and presence"
```

---

### Task 7: ReactionPickerModal component

**Files:**
- Create: `mobile/src/components/ReactionPickerModal.tsx`

**Interfaces:**
- Consumes: `COLORS`, `RADIUS`, `SHADOW` from `../theme/tokens`.
- Produces: `ReactionPickerModal` component, props `{ visible: boolean; onClose: () => void; onSelect: (emoji: string) => void; currentReaction: string | null }`, and the mobile-side `REACTION_EMOJI` literal array (must be byte-identical to Task 2's backend `ALLOWED_REACTIONS` — copy the six emoji verbatim from this task's own code block below, do not retype them).

- [ ] **Step 1: Create `mobile/src/components/ReactionPickerModal.tsx`**

```tsx
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, RADIUS, SHADOW } from "../theme/tokens";

// Must stay byte-identical to backend/src/modules/messages/messages.service.ts's
// ALLOWED_REACTIONS - these emoji include invisible variation-selector
// codepoints, so copy this array verbatim rather than retyping it if you
// ever need to touch it again.
export const REACTION_EMOJI = ["❤️", "👍", "😂", "😍", "😮", "🙌"] as const;

export function ReactionPickerModal({
  visible,
  onClose,
  onSelect,
  currentReaction,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  currentReaction: string | null;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          {REACTION_EMOJI.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[styles.emojiButton, currentReaction === emoji && styles.emojiButtonActive]}
              onPress={() => onSelect(emoji)}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)", alignItems: "center", justifyContent: "center" },
  sheet: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...SHADOW.card,
  },
  emojiButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emojiButtonActive: { backgroundColor: COLORS.fieldBg },
  emoji: { fontSize: 22 },
});
```

Notes for the implementer:
- This modal is deliberately centered on screen (`animationType="fade"`, backdrop `alignItems: "center", justifyContent: "center"`) rather than anchored precisely next to the long-pressed message bubble — measuring exact bubble position for pixel-accurate anchoring would need `onLayout` plumbing for uncertain visual benefit; a centered picker is simpler, robust on every screen size, and works identically on web. Do not add bubble-anchoring logic — it's out of scope.
- Selecting the emoji that's already `currentReaction` is still just a normal `onSelect(emoji)` call — the toggle-off logic (same emoji again → remove) lives in the caller (Task 9), not here. This component only reports which emoji was tapped and highlights which one is currently active.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ReactionPickerModal.tsx
git commit -m "Add ReactionPickerModal component for the 6-emoji reaction strip"
```

---

### Task 8: useLiveGroupChat — presence and reactions

**Files:**
- Modify: `mobile/src/api/messages.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `MessageReactionSummary`, `PresenceInfo` (Task 4, from `../types`); socket events `presence:snapshot`/`presence:update`/`reaction:updated` (Task 3).
- Produces: `useLiveGroupChat(groupId: string | undefined, initialMessages: ChatMessage[], memberIds?: string[])` returning `{ messages: ChatMessage[]; sendMessage: (input) => void; presence: Record<string, PresenceInfo>; toggleReaction: (messageId: string, emoji: string) => void }`. `useMessageHistory` and `useUploadChatImage` are unchanged.

- [ ] **Step 1: Replace the full contents of `mobile/src/api/messages.ts`**

```ts
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ImagePickerAsset } from "expo-image-picker";
import { apiClient } from "./client";
import { getSocket } from "./socket";
import { appendImageAsset } from "../utils/formDataImage";
import type { ChatMessage, MessageReactionSummary, Paginated, PresenceInfo } from "../types";

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

    socket.on("message:new", onNewMessage);
    socket.on("reaction:updated", onReactionUpdated);
    socket.on("presence:snapshot", onPresenceSnapshot);
    socket.on("presence:update", onPresenceUpdate);
    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("reaction:updated", onReactionUpdated);
      socket.off("presence:snapshot", onPresenceSnapshot);
      socket.off("presence:update", onPresenceUpdate);
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

  return { messages, sendMessage, presence, toggleReaction };
}
```

Notes for the implementer:
- `initialMessages`/`sendMessage`/the `message:new` listener/the join-on-mount-leave-on-unmount lifecycle are **unchanged in behavior** from the pre-existing code — only presence and reactions were added alongside them.
- `memberIds` defaults to `[]` so existing call sites that don't pass a third argument (none exist yet in this codebase, but the parameter is optional for safety) keep working; Task 9 will pass the real member id list.
- `toggleReaction` is fire-and-forget over the socket, exactly like `sendMessage` — the UI updates when the resulting `reaction:updated` broadcast arrives (including back to the sender), not optimistically. This matches how sending a message already works (the sender doesn't add their own message to `messages` until `message:new` comes back).

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api/messages.ts
git commit -m "Add presence tracking and reaction toggling to useLiveGroupChat"
```

---

### Task 9: GroupChatScreen — wire up attachments, members, presence, reactions

**Files:**
- Modify: `mobile/src/screens/GroupChatScreen.tsx`
- Modify: `mobile/package.json`, `mobile/package-lock.json` (new dependency)

**Interfaces:**
- Consumes: `AttachmentSheet` (Task 5), `GroupMembersModal` (Task 6), `ReactionPickerModal`/`REACTION_EMOJI` (Task 7 — not directly used here, but its emoji list must match what's byte-identical), `useLiveGroupChat`'s extended return `{ messages, sendMessage, presence, toggleReaction }` (Task 8), the new `expo-document-picker` dependency.
- Produces: nothing new — `GroupChatScreen` is a leaf screen with no other file depending on its internals.

- [ ] **Step 1: Add the `expo-document-picker` dependency**

Run (from `mobile/`):
```bash
npx expo install expo-document-picker
```
This is Expo's dependency installer — it automatically resolves the exact version compatible with this project's Expo SDK (57) and writes it into `mobile/package.json`/`mobile/package-lock.json`, the same way every other `expo-*` package in this project was added. Do not hand-type a version number.

- [ ] **Step 2: Replace the full contents of `mobile/src/screens/GroupChatScreen.tsx`**

```tsx
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useGroup } from "../api/groups";
import { useLiveGroupChat, useMessageHistory, useUploadChatImage } from "../api/messages";
import type { ChatMessage } from "../types";
import { Alert } from "../utils/alert";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { Skeleton } from "../components/theme/Skeleton";
import { AttachmentSheet } from "../components/AttachmentSheet";
import { GroupMembersModal } from "../components/GroupMembersModal";
import { ReactionPickerModal } from "../components/ReactionPickerModal";
import { COLORS } from "../theme/tokens";

type Props = NativeStackScreenProps<AppStackParamList, "GroupChat">;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function GroupChatScreen({ route, navigation }: Props) {
  const { groupId, tripTitle } = route.params;
  const me = useAuthStore((s) => s.user);
  const { data: group } = useGroup(groupId);
  const { data: history, isLoading } = useMessageHistory(groupId);
  const memberIds = group?.members.map((m) => m.userId) ?? [];
  const { messages, sendMessage, presence, toggleReaction } = useLiveGroupChat(
    groupId,
    history?.items ?? [],
    memberIds
  );
  const uploadImage = useUploadChatImage();
  const [text, setText] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const onSend = () => {
    if (!text.trim()) return;
    sendMessage({ type: "TEXT", content: text.trim() });
    setText("");
  };

  const onOpenCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera permission needed", "Please allow camera access to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;
    setPendingPhoto(result.assets[0]);
  };

  const onChooseFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access to choose a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;
    setPendingPhoto(result.assets[0]);
  };

  const onChooseFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets || result.assets.length === 0) return;
    const asset = result.assets[0];
    // expo-document-picker's web build returns a real `file: File` blob
    // (same shape ImagePicker's web build already returns) - carry it
    // through when present so appendImageAsset's web branch works
    // identically for files picked this way, matching how it already
    // handles ImagePicker's web assets.
    const webFile = (asset as unknown as { file?: File }).file;
    setPendingPhoto({ uri: asset.uri, fileName: asset.name, file: webFile } as ImagePicker.ImagePickerAsset);
  };

  const onRetake = () => {
    setPendingPhoto(null);
    onOpenCamera();
  };

  const onConfirmSendPhoto = async () => {
    if (!pendingPhoto) return;
    setSendingPhoto(true);
    try {
      const url = await uploadImage.mutateAsync(pendingPhoto);
      sendMessage({ type: "IMAGE", mediaUrl: url });
      setPendingPhoto(null);
    } catch {
      Alert.alert("Couldn't send photo", "Please try again");
    } finally {
      setSendingPhoto(false);
    }
  };

  const reactionTargetMessage = messages.find((m) => m.id === reactionTargetId) ?? null;
  const reactionTargetCurrentEmoji =
    reactionTargetMessage?.reactions?.find((r) => r.userIds.includes(me?.id ?? ""))?.emoji ?? null;

  const onSelectReaction = (emoji: string) => {
    if (reactionTargetId) toggleReaction(reactionTargetId, emoji);
    setReactionTargetId(null);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderId === me?.id;
    const reactions = item.reactions ?? [];
    return (
      <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
        {!isMine &&
          (item.sender.photoUrl ? (
            <Image source={{ uri: optimizedImageUrl(item.sender.photoUrl, 28) }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{item.sender.name.charAt(0).toUpperCase()}</Text>
            </View>
          ))}
        <View style={[styles.bubbleCol, isMine && styles.bubbleColMine]}>
          <TouchableOpacity
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              item.type === "IMAGE" && styles.bubbleImageWrap,
            ]}
            activeOpacity={0.85}
            onLongPress={() => setReactionTargetId(item.id)}
          >
            {!isMine && <Text style={styles.senderName}>{item.sender.name}</Text>}
            {item.type === "IMAGE" && item.mediaUrl ? (
              <Image source={{ uri: optimizedImageUrl(item.mediaUrl, 190) }} style={styles.messageImage} />
            ) : (
              <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.content}</Text>
            )}
          </TouchableOpacity>
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
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tripTitle}
          </Text>
          {group && (
            <View style={styles.headerSubRow}>
              <MaterialCommunityIcons name="account-group-outline" size={12} color={COLORS.muted} />
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {group.members.length} member{group.members.length === 1 ? "" : "s"} ·{" "}
                {group.members.map((m) => m.user.name).join(", ")}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={() => setMembersModalVisible(true)}>
          <MaterialCommunityIcons name="account-group" size={18} color={COLORS.ink} />
        </TouchableOpacity>
      </View>

      <View style={[styles.body, isWeb && styles.bodyWeb]}>
        {isLoading ? (
          <View style={styles.listContent}>
            <View style={[styles.bubbleRow]}>
              <Skeleton style={styles.skeletonAvatar} />
              <Skeleton style={styles.skeletonBubble} />
            </View>
            <View style={[styles.bubbleRow, styles.bubbleRowMine]}>
              <Skeleton style={[styles.skeletonBubble, styles.skeletonBubbleMine]} />
            </View>
            <View style={[styles.bubbleRow]}>
              <Skeleton style={styles.skeletonAvatar} />
              <Skeleton style={styles.skeletonBubble} />
            </View>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="chat-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyText}>No messages yet. Say hello to the group!</Text>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
          />
        )}

        {pendingPhoto ? (
          <View style={[styles.previewBar, { paddingBottom: insets.bottom + 12 }]}>
            <Image source={{ uri: pendingPhoto.uri }} style={styles.previewThumb} />
            <Text style={styles.previewLabel} numberOfLines={1}>
              Send this photo?
            </Text>
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.previewIconButton}
                onPress={() => setPendingPhoto(null)}
                disabled={sendingPhoto}
              >
                <MaterialCommunityIcons name="close" size={18} color={COLORS.danger} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewIconButton} onPress={onRetake} disabled={sendingPhoto}>
                <MaterialCommunityIcons name="camera-retake-outline" size={18} color="#334155" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewSendButton} onPress={onConfirmSendPhoto} disabled={sendingPhoto}>
                {sendingPhoto ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={16} color={COLORS.white} />
                    <Text style={styles.previewSendText}>Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
            <TouchableOpacity onPress={() => setAttachmentSheetVisible(true)} style={styles.attachButton}>
              <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message the group..."
              placeholderTextColor={COLORS.mutedLight}
              value={text}
              onChangeText={setText}
              onSubmitEditing={onSend}
              multiline
            />
            <TouchableOpacity onPress={onSend} style={styles.sendButton} disabled={!text.trim()}>
              <MaterialCommunityIcons name="send" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <AttachmentSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onTakePhoto={onOpenCamera}
        onChooseFromGallery={onChooseFromGallery}
        onChooseFromFiles={onChooseFromFiles}
      />

      <GroupMembersModal
        visible={membersModalVisible}
        onClose={() => setMembersModalVisible(false)}
        members={group?.members ?? []}
        presence={presence}
      />

      <ReactionPickerModal
        visible={!!reactionTargetId}
        onClose={() => setReactionTargetId(null)}
        onSelect={onSelectReaction}
        currentReaction={reactionTargetCurrentEmoji}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexScreen: { flex: 1, backgroundColor: COLORS.fieldBg },
  header: {
    flexDirection: "row",
    alignItems: "center",
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
  headerTextWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.ink },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, maxWidth: "100%" },
  headerSubtitle: { fontSize: 11.5, color: COLORS.muted, flexShrink: 1 },
  body: { flex: 1 },
  bodyWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  list: { flex: 1 },
  listContent: { padding: 14, gap: 10 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  emptyText: { fontSize: 13.5, color: COLORS.mutedLight, textAlign: "center" },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowMine: { justifyContent: "flex-end" },
  skeletonAvatar: { width: 28, height: 28, borderRadius: 14 },
  skeletonBubble: { width: "55%", height: 40, borderRadius: 16 },
  skeletonBubbleMine: { width: "40%" },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  bubbleCol: { maxWidth: "75%", alignItems: "flex-start" },
  bubbleColMine: { alignItems: "flex-end" },
  bubble: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleTheirs: {},
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleImageWrap: { padding: 4, overflow: "hidden" },
  senderName: { fontSize: 11, fontWeight: "700", color: COLORS.primary, marginBottom: 3 },
  messageText: { fontSize: 14, color: "#1e293b", lineHeight: 20 },
  messageTextMine: { color: COLORS.white },
  messageImage: { width: 190, height: 190, borderRadius: 12 },
  timeText: { fontSize: 10.5, color: COLORS.mutedLight, marginTop: 3, marginLeft: 4 },
  timeTextMine: { marginLeft: 0, marginRight: 4 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  reactionsRowMine: { justifyContent: "flex-end" },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionPillMine: { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorderLight },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: COLORS.muted, fontWeight: "700" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBar: {
    padding: 14,
    gap: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  previewThumb: { width: "100%", height: 160, borderRadius: 14, backgroundColor: "#f1f5f9" },
  previewLabel: { fontSize: 13, color: "#334155", fontWeight: "600" },
  previewActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  previewIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  previewSendButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
  },
  previewSendText: { color: COLORS.white, fontWeight: "700", fontSize: 14.5 },
});
```

Notes for the implementer:
- The header's right-side button changed from an empty spacer `<View style={styles.headerButton} />` (present only to balance the back button so the title stays centered) to a real `TouchableOpacity` opening the Members modal. The existing subtitle line (`"{count} members · {names}"`) already satisfies "show the total member count in the header" — no separate numeric badge was added on the new button, to avoid absolute-positioning complexity for information that's already visible one line below.
- The attach button's `onPress` changed from calling `onOpenCamera` directly to opening `AttachmentSheet` (`setAttachmentSheetVisible(true)`) — `onOpenCamera` itself is completely unchanged and is now one of three callbacks the sheet can trigger.
- `onLongPress` on the message bubble is used for both native and web — React Native Web's `TouchableOpacity` already implements long-press via a press-and-hold timer that responds to mouse-down-and-hold, so this single handler satisfies "long-press/right-click a message" on both platforms without a separate web-only code path. Do not add a distinct right-click (`onContextMenu`) handler — it would fight the browser's native context menu and wasn't necessary.
- `reactionTargetCurrentEmoji` and `onSelectReaction` together implement the toggle semantics from the mobile side: tapping the same emoji you already reacted with in the picker sends the same `reaction:toggle` event as tapping a *different* one — the removal-vs-change logic all lives in the backend handler (Task 3), so the client doesn't need its own branching here beyond "which emoji did they tap."
- Tapping any reaction pill directly (`onPress={() => toggleReaction(item.id, r.emoji)}`) is a shortcut that skips opening the picker. `reaction:toggle` always acts on the tapping user's own reaction record on the backend (Task 3), never anyone else's — so tapping a pill that reflects someone else's reaction (an emoji you haven't used yourself) is equivalent to picking that same emoji from the picker: it adds or changes *your own* reaction to that emoji. Tapping a pill that already reflects your own reaction removes it. This is an intentional quick-react shortcut, not a bug.
- `COLORS.successBg`/`COLORS.successBorderLight` (already-existing tokens) are reused for `reactionPillMine` — the same "this is mine / active" tint already used elsewhere in the app (e.g. `NotificationsScreen`'s unread-item tint), not a new color choice.
- Every other line of this file — imports of existing hooks, `onSend`/`onRetake`/`onConfirmSendPhoto`, the skeleton loading block, the empty state, the preview bar, and every existing style — is unchanged from before this task.

- [ ] **Step 3: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/screens/GroupChatScreen.tsx
git commit -m "Wire attachment sheet, members modal, presence, and reactions into Group Chat"
```
