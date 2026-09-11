# Voice Notes for Group Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voice-note (audio message) support to the existing Triply Group Chat on Android, iOS, and Web, reusing the existing chat, storage, and notification systems.

**Architecture:** A new `AUDIO` `MessageType` (plus a `durationMs` field) travels through the exact same two-step "REST upload → socket send" path images already use. Recording and playback both use `expo-audio`, the only new dependency. The composer gets a press-and-hold mic button that produces a local recording, previewed (with play/pause reusing the same playback hook as sent bubbles) before an explicit Send.

**Tech Stack:** Express + Prisma + Socket.IO (backend), Expo/React Native + React Native Web + React Query (mobile), Cloudinary (storage), `expo-audio` (new).

**Spec:** `docs/superpowers/specs/2026-09-11-voice-notes-design.md`

## Global Constraints

- Max recording length: 5 minutes (300000ms) — auto-stops and moves to preview when hit.
- New dependency: `expo-audio`, installed via `npx expo install expo-audio` (resolves the version pinned to this project's Expo SDK 57, not a hand-typed version number).
- Audio upload endpoint: `POST /messages/audio`, multer field name `"audio"`. Allowed mimetypes: `audio/m4a`, `audio/mp4`, `audio/aac`, `audio/webm`, `audio/ogg`, `audio/mpeg`. File size limit: 15MB (separate from the existing 10MB image limit).
- Cloudinary `resource_type` for audio uploads: `"video"` (Cloudinary's resource type for all non-image media, audio included).
- Waveform is simulated only for V1: a deterministic bar-height pattern derived from a string seed (message id, or the local recording's uri before it has a message id) — never real amplitude data, never persisted separately.
- This repo has no component/UI test framework for the mobile app (confirmed: only backend has black-box smoke-test `.mjs` scripts). Every mobile task's verification step is `npm run typecheck` (`tsc --noEmit`) plus reading the diff — the same standard this project's prior UI-heavy plans (Travel Buddies, Report & Block) used.
- Backend verification is `npm run build` (`tsc -p tsconfig.json`) plus running the relevant smoke-test script against a running `npm run dev` backend.
- Every change is additive — the existing `TEXT`/`IMAGE` code paths, reactions, Seen By, member presence, and closed-trip read-only behavior must not be restructured, only extended with a third `AUDIO` branch alongside them.

---

### Task 1: Prisma schema — `AUDIO` message type + `durationMs`

**Files:**
- Modify: `backend/prisma/schema.prisma:56-59` (enum), `backend/prisma/schema.prisma:238-253` (model)

**Interfaces:**
- Produces: Prisma's generated `MessageType` enum gains a third member `"AUDIO"`. The generated `Message` type gains `durationMs: number | null`. Every later backend task that imports `@prisma/client` types relies on both.

- [ ] **Step 1: Edit the `MessageType` enum**

In `backend/prisma/schema.prisma`, change:

```prisma
enum MessageType {
  TEXT
  IMAGE
}
```

to:

```prisma
enum MessageType {
  TEXT
  IMAGE
  AUDIO
}
```

- [ ] **Step 2: Add `durationMs` to the `Message` model**

Change:

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
  reads     MessageRead[]

  @@index([groupId, createdAt])
}
```

to:

```prisma
model Message {
  id         String      @id @default(cuid())
  groupId    String
  group      Group       @relation(fields: [groupId], references: [id], onDelete: Cascade)
  senderId   String
  sender     User        @relation(fields: [senderId], references: [id], onDelete: Cascade)
  type       MessageType @default(TEXT)
  content    String?
  mediaUrl   String?
  durationMs Int?
  createdAt  DateTime    @default(now())

  reactions MessageReaction[]
  reads     MessageRead[]

  @@index([groupId, createdAt])
}
```

`durationMs` is only ever set for `AUDIO` messages — `TEXT`/`IMAGE` leave it `null`, no behavior change for them.

- [ ] **Step 3: Run the migration**

Run (from `backend/`): `npx prisma migrate dev --name add_audio_message_type`

Expected: migration applies cleanly against the local dev database, prints the new migration file name under `backend/prisma/migrations/`.

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`

(Fresh worktrees have been seen shipping a stale/default Prisma client until this is run explicitly — run it even though `migrate dev` normally does this automatically, to be certain.)

- [ ] **Step 5: Verify the backend still compiles**

Run (from `backend/`): `npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Add AUDIO message type and durationMs to Message schema"
```

---

### Task 2: Backend — audio upload endpoint, socket handling, notifications, smoke test

**Files:**
- Modify: `backend/src/middleware/upload.ts`
- Modify: `backend/src/modules/messages/messages.routes.ts`
- Modify: `backend/src/modules/messages/messages.controller.ts`
- Modify: `backend/src/config/socket.ts:101-145`
- Modify: `backend/src/modules/notifications/notify.ts:13-22,51-62`
- Create: `backend/scripts/smoke-test-voice-notes.mjs`

**Interfaces:**
- Consumes: Task 1's `MessageType` (`"TEXT" | "IMAGE" | "AUDIO"`) and `Message.durationMs: number | null`.
- Produces: `POST /messages/audio` (multipart field `"audio"`) → `{ url: string }`. Socket `message:send` accepts and persists an optional `durationMs: number`. `uploadToCloudinary(file, resourceType?: "image" | "video")` — the new second parameter later mobile tasks do not call directly (mobile only calls the REST endpoints), but backend code elsewhere continues calling the one-argument form unchanged.

- [ ] **Step 1: Generalize `uploadToCloudinary` and add the `uploadAudio` multer instance**

Replace the full contents of `backend/src/middleware/upload.ts` with:

```ts
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";
import { HttpError } from "./error";

const cloudinaryConfigured = !!(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
  });
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed"));
    }
    cb(null, true);
  },
});

const ALLOWED_AUDIO_MIME_TYPES = ["audio/m4a", "audio/mp4", "audio/aac", "audio/webm", "audio/ogg", "audio/mpeg"];

export const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("Only audio uploads are allowed"));
    }
    cb(null, true);
  },
});

export function uploadToCloudinary(
  file: Express.Multer.File,
  resourceType: "image" | "video" = "image"
): Promise<string> {
  if (!cloudinaryConfigured) {
    return Promise.reject(
      new HttpError(500, "Uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.")
    );
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "travel-social", resource_type: resourceType },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
        resolve(result.secure_url);
      }
    );
    stream.end(file.buffer);
  });
}
```

Every existing caller of `uploadToCloudinary(file)` (profile photo, cover photo, trip images, chat images) keeps compiling and behaving identically — the new parameter is defaulted to `"image"`, its prior implicit behavior.

- [ ] **Step 2: Add the `uploadAudioMessage` controller**

In `backend/src/modules/messages/messages.controller.ts`, add this function after `uploadImage`:

```ts
export async function uploadAudioMessage(req: AuthedRequest, res: Response) {
  if (!req.file) throw new HttpError(400, "No file uploaded");
  const url = await uploadToCloudinary(req.file, "video");
  res.json({ url });
}
```

The full file should now read:

```ts
import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import { uploadToCloudinary } from "../../middleware/upload";
import { HttpError } from "../../middleware/error";
import * as service from "./messages.service";

export async function list(req: AuthedRequest, res: Response) {
  const result = await service.listMessages(req.params.groupId, req.userId!, req.query as Record<string, unknown>);
  res.json(result);
}

export async function uploadImage(req: AuthedRequest, res: Response) {
  if (!req.file) throw new HttpError(400, "No file uploaded");
  const url = await uploadToCloudinary(req.file);
  res.json({ url });
}

export async function uploadAudioMessage(req: AuthedRequest, res: Response) {
  if (!req.file) throw new HttpError(400, "No file uploaded");
  const url = await uploadToCloudinary(req.file, "video");
  res.json({ url });
}
```

- [ ] **Step 3: Register the route**

Replace the full contents of `backend/src/modules/messages/messages.routes.ts` with:

```ts
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { upload, uploadAudio } from "../../middleware/upload";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./messages.controller";

export const messagesRouter = Router();

messagesRouter.use(requireAuth);
messagesRouter.get("/groups/:groupId", asyncHandler(controller.list));
messagesRouter.post("/images", upload.single("image"), asyncHandler(controller.uploadImage));
messagesRouter.post("/audio", uploadAudio.single("audio"), asyncHandler(controller.uploadAudioMessage));
```

- [ ] **Step 4: Extend the `message:send` socket handler to accept and persist `durationMs`**

In `backend/src/config/socket.ts`, change (lines 101-118):

```ts
    socket.on("message:send", async (data: { groupId: string; type?: "TEXT" | "IMAGE"; content?: string; mediaUrl?: string }) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: data.groupId, userId } },
        include: { group: { select: { trip: { select: { id: true, title: true, status: true } } } } },
      });
      if (!membership) return;
      if (membership.group.trip.status === "COMPLETED") return;

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
```

to:

```ts
    socket.on("message:send", async (data: { groupId: string; type?: "TEXT" | "IMAGE" | "AUDIO"; content?: string; mediaUrl?: string; durationMs?: number }) => {
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: data.groupId, userId } },
        include: { group: { select: { trip: { select: { id: true, title: true, status: true } } } } },
      });
      if (!membership) return;
      if (membership.group.trip.status === "COMPLETED") return;

      const message = await prisma.message.create({
        data: {
          groupId: data.groupId,
          senderId: userId,
          type: data.type ?? "TEXT",
          content: data.content,
          mediaUrl: data.mediaUrl,
          durationMs: data.durationMs,
        },
        include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      });
```

The rest of the handler (broadcast + notification fan-out) is unchanged — it already reads `message.type`/`message.content` generically. The existing `trip.status === "COMPLETED"` check above this, unchanged, already blocks `AUDIO` sends on closed trips exactly like it blocks `TEXT`/`IMAGE`.

- [ ] **Step 5: Extend notification payload types for `AUDIO`**

In `backend/src/modules/notifications/notify.ts`, change:

```ts
export interface GroupMessagePayload {
  groupId: string;
  tripId: string;
  tripTitle: string;
  messageId: string;
  senderId: string;
  senderName: string;
  messageType: "TEXT" | "IMAGE";
  content: string | null;
}
```

to:

```ts
export interface GroupMessagePayload {
  groupId: string;
  tripId: string;
  tripTitle: string;
  messageId: string;
  senderId: string;
  senderName: string;
  messageType: "TEXT" | "IMAGE" | "AUDIO";
  content: string | null;
}
```

and change:

```ts
export interface MessageReactionPayload {
  groupId: string;
  tripId: string;
  tripTitle: string;
  messageId: string;
  messageType: "TEXT" | "IMAGE";
  content: string | null;
  reactorId: string;
  reactorName: string;
  reactorPhotoUrl: string | null;
  emoji: string;
}
```

to:

```ts
export interface MessageReactionPayload {
  groupId: string;
  tripId: string;
  tripTitle: string;
  messageId: string;
  messageType: "TEXT" | "IMAGE" | "AUDIO";
  content: string | null;
  reactorId: string;
  reactorName: string;
  reactorPhotoUrl: string | null;
  emoji: string;
}
```

(`MessageReactionPayload` needs the same widened union as `GroupMessagePayload` — `socket.ts`'s `reaction:toggle` handler passes `message.type`, now `"TEXT" | "IMAGE" | "AUDIO"`, into `notifyMessageReaction`, so both call sites must accept the same union or this won't compile.)

- [ ] **Step 6: Verify the backend compiles**

Run (from `backend/`): `npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 7: Write the smoke test**

Create `backend/scripts/smoke-test-voice-notes.mjs`:

```js
// Black-box smoke test for Voice Notes: audio upload endpoint, real-time
// AUDIO message delivery + duration persistence, REST history round-trip,
// wrong-mimetype rejection, and closed-trip send blocking.
// Follows the same conventions as scripts/smoke-test.mjs (plain fetch +
// socket.io-client, no framework).
import { io } from "socket.io-client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const rand = () => Math.random().toString(36).slice(2, 8);

async function request(method, path, { token, body, isForm } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  return { status: res.status, data };
}

async function requestOk(method, path, opts) {
  const { status, data } = await request(method, path, opts);
  if (status < 200 || status >= 300) throw new Error(`${method} ${path} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function registerUser(label, extra = {}) {
  const email = `${label}-${rand()}@example.com`;
  const user = await requestOk("POST", "/auth/register", { body: { email, password: "password123", name: label, ...extra } });
  return user;
}

async function main() {
  console.log(`Smoke testing Voice Notes against ${BASE}`);

  // --- Setup: trip + approved joiner -> group with 2 members ---
  const owner = await registerUser("owner-voice");
  const joiner = await registerUser("joiner-voice");

  const trip = await requestOk("POST", "/trips", {
    token: owner.token,
    body: {
      title: "Voice Notes Test Trip",
      destination: "Goa",
      startLocation: "Pune",
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 9 * 86400000).toISOString(),
      travelMode: "CAR",
      seats: 4,
      description: "Trip for the voice notes smoke test.",
      placesToVisit: [],
      joinType: "APPROVAL",
    },
  });

  await requestOk("POST", `/join-requests/trips/${trip.id}`, {
    token: joiner.token,
    body: { message: "count me in" },
  });
  const requests = await requestOk("GET", `/join-requests/trips/${trip.id}`, { token: owner.token });
  await requestOk("POST", `/join-requests/${requests[0].id}/approve`, { token: owner.token });
  const group = await requestOk("GET", `/groups/by-trip/${trip.id}`, { token: owner.token });
  assert(group.members.length === 2, "group should have owner + approved joiner");
  console.log("✓ trip + group set up with 2 members");

  // --- Wrong mimetype is rejected by the audio upload endpoint ---
  const badForm = new FormData();
  badForm.append("audio", new Blob(["not audio"], { type: "text/plain" }), "note.txt");
  const badUpload = await request("POST", "/messages/audio", { token: joiner.token, body: badForm, isForm: true });
  assert(badUpload.status >= 400, "uploading a non-audio mimetype to /messages/audio should be rejected");
  console.log("✓ /messages/audio rejects non-audio mimetypes");

  // --- Happy path: upload a small audio file, send AUDIO message, receive in real time ---
  const audioBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  const form = new FormData();
  form.append("audio", new Blob([audioBytes], { type: "audio/m4a" }), "note.m4a");
  const upload = await requestOk("POST", "/messages/audio", { token: joiner.token, body: form, isForm: true });
  assert(typeof upload.url === "string" && upload.url.length > 0, "audio upload should return a url");
  console.log("✓ audio file uploaded, url returned:", upload.url);

  const DURATION_MS = 4200;
  const message = await new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token: joiner.token } });
    socket.on("connect", () => socket.emit("group:join", group.id));
    socket.on("message:new", (msg) => {
      socket.disconnect();
      resolve(msg);
    });
    socket.on("connect_error", reject);
    setTimeout(() => {
      if (socket.connected) {
        socket.emit("message:send", { groupId: group.id, type: "AUDIO", mediaUrl: upload.url, durationMs: DURATION_MS });
      }
    }, 300);
    setTimeout(() => reject(new Error("Timed out waiting for AUDIO message:new")), 5000);
  });
  assert(message.type === "AUDIO", "delivered message should have type AUDIO");
  assert(message.mediaUrl === upload.url, "delivered message should carry the uploaded url");
  assert(message.durationMs === DURATION_MS, "delivered message should carry the exact durationMs sent");
  console.log("✓ AUDIO message delivered in real time with url + durationMs intact");

  // --- Persistence: durationMs and mediaUrl survive a REST history fetch (refresh/re-login) ---
  const history = await requestOk("GET", `/messages/groups/${group.id}`, { token: owner.token });
  const persisted = history.items.find((m) => m.id === message.id);
  assert(!!persisted, "AUDIO message should be present in REST history");
  assert(
    persisted.type === "AUDIO" && persisted.mediaUrl === upload.url && persisted.durationMs === DURATION_MS,
    "AUDIO message's type/mediaUrl/durationMs should survive a REST history fetch"
  );
  console.log("✓ AUDIO message metadata persists across a REST history fetch (refresh/re-login)");

  // --- Closed trip: message:send is silently dropped once the trip is COMPLETED ---
  await requestOk("PATCH", `/trips/${trip.id}`, { token: owner.token, body: { status: "COMPLETED" } });
  const gotMessageAfterClose = await new Promise((resolve) => {
    const socket = io(BASE, { auth: { token: joiner.token } });
    let gotMessage = false;
    socket.on("connect", () => socket.emit("group:join", group.id));
    socket.on("message:new", () => {
      gotMessage = true;
    });
    setTimeout(() => {
      if (socket.connected) {
        socket.emit("message:send", { groupId: group.id, type: "AUDIO", mediaUrl: upload.url, durationMs: DURATION_MS });
      }
    }, 300);
    setTimeout(() => {
      socket.disconnect();
      resolve(gotMessage);
    }, 1500);
  });
  assert(gotMessageAfterClose === false, "message:send on a COMPLETED trip should not deliver a new message");
  console.log("✓ voice notes cannot be sent once the trip is closed (COMPLETED)");

  // --- Existing voice messages remain readable after the trip closes ---
  const historyAfterClose = await requestOk("GET", `/messages/groups/${group.id}`, { token: owner.token });
  assert(
    historyAfterClose.items.some((m) => m.id === message.id),
    "previously sent voice message should remain readable after the trip closes"
  );
  console.log("✓ previously sent voice messages remain readable after the trip closes");

  console.log("\nAll voice notes smoke checks passed.");
}

main().catch((err) => {
  console.error("\nSmoke test failed:", err.message);
  process.exit(1);
});
```

- [ ] **Step 8: Run the smoke test**

With the backend dev server running (`npm run dev` in `backend/`, in a separate terminal), run: `node scripts/smoke-test-voice-notes.mjs`
Expected: all `✓` lines print, ending with "All voice notes smoke checks passed.", exit code 0.

- [ ] **Step 9: Commit**

```bash
git add backend/src/middleware/upload.ts backend/src/modules/messages/messages.routes.ts backend/src/modules/messages/messages.controller.ts backend/src/config/socket.ts backend/src/modules/notifications/notify.ts backend/scripts/smoke-test-voice-notes.mjs
git commit -m "Add backend support for voice note messages"
```

---

### Task 3: Mobile — `expo-audio` dependency, types, API hooks

**Files:**
- Modify: `mobile/package.json` (via `expo install`)
- Modify: `mobile/src/types/index.ts:45,189-200`
- Modify: `mobile/src/api/messages.ts`
- Create: `mobile/src/utils/formDataAudio.ts`

**Interfaces:**
- Consumes: Task 2's `POST /messages/audio` endpoint.
- Produces: `MessageType` including `"AUDIO"`; `ChatMessage.durationMs: number | null | undefined`; `useUploadChatAudio(): UseMutationResult<string, unknown, { uri: string; durationMs: number }>`; `useLiveGroupChat(...).sendMessage` accepting `{ content?: string; type?: "TEXT" | "IMAGE" | "AUDIO"; mediaUrl?: string; durationMs?: number }`; `appendAudioAsset(form: FormData, field: string, uri: string, fallbackName: string): Promise<void>`. Task 6 calls `useUploadChatAudio` and the widened `sendMessage`.

- [ ] **Step 1: Install `expo-audio`**

Run (from `mobile/`): `npx expo install expo-audio`
Expected: adds `expo-audio` to `mobile/package.json` at the version matching this project's Expo SDK, installs it.

- [ ] **Step 2: Widen `MessageType` and add `durationMs` to `ChatMessage`**

In `mobile/src/types/index.ts`, change:

```ts
export type MessageType = "TEXT" | "IMAGE";
```

to:

```ts
export type MessageType = "TEXT" | "IMAGE" | "AUDIO";
```

Change:

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

to:

```ts
export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  type: MessageType;
  content?: string | null;
  mediaUrl?: string | null;
  durationMs?: number | null;
  createdAt: string;
  sender: TripOwnerSummary;
  reactions?: MessageReactionSummary[];
  readBy?: MessageReadEntry[];
}
```

- [ ] **Step 3: Create the audio `FormData` helper**

Create `mobile/src/utils/formDataAudio.ts`:

```ts
import { Platform } from "react-native";

// expo-audio's recorder only ever exposes a file uri (unlike ImagePicker's
// web build, which hands back a real File object directly) - on web that uri
// is a blob: URL that must be re-fetched into a real Blob (which carries its
// own correct mimetype, e.g. audio/webm) before FormData can send it; on
// native it's a file:// uri that React Native's networking layer streams
// directly from a { uri, name, type } descriptor, mirroring
// appendImageAsset's native branch and hardcoding the type the
// RecordingPresets.HIGH_QUALITY preset actually produces on native.
export async function appendAudioAsset(form: FormData, field: string, uri: string, fallbackName: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append(field, blob, fallbackName);
  } else {
    form.append(field, { uri, name: fallbackName, type: "audio/m4a" } as unknown as Blob);
  }
}
```

- [ ] **Step 4: Add `useUploadChatAudio` and widen `sendMessage`**

In `mobile/src/api/messages.ts`, add this import alongside the existing ones:

```ts
import { appendAudioAsset } from "../utils/formDataAudio";
```

Add this function after `useUploadChatImage`:

```ts
export function useUploadChatAudio() {
  return useMutation({
    mutationFn: async (recording: { uri: string; durationMs: number }) => {
      const form = new FormData();
      await appendAudioAsset(form, "audio", recording.uri, "voice-note.m4a");
      const { data } = await apiClient.post<{ url: string }>("/messages/audio", form);
      return data.url;
    },
  });
}
```

Change the `sendMessage` function inside `useLiveGroupChat`:

```ts
  const sendMessage = (input: { content?: string; type?: "TEXT" | "IMAGE"; mediaUrl?: string }) => {
    if (!groupId) return;
    getSocket().emit("message:send", { groupId, ...input });
  };
```

to:

```ts
  const sendMessage = (input: { content?: string; type?: "TEXT" | "IMAGE" | "AUDIO"; mediaUrl?: string; durationMs?: number }) => {
    if (!groupId) return;
    getSocket().emit("message:send", { groupId, ...input });
  };
```

- [ ] **Step 5: Verify**

Run (from `mobile/`): `npm run typecheck`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/types/index.ts mobile/src/api/messages.ts mobile/src/utils/formDataAudio.ts
git commit -m "Add expo-audio dependency and mobile types/hooks for voice notes"
```

(Adjust the lockfile path/name in the `git add` if this project uses a different package manager's lockfile — check `ls mobile/*.lock* mobile/package-lock.json` if unsure before committing.)

---

### Task 4: Mobile — voice playback plumbing

**Files:**
- Create: `mobile/src/contexts/VoicePlaybackContext.tsx`
- Create: `mobile/src/hooks/useVoicePlayback.ts`
- Create: `mobile/src/utils/waveform.ts`
- Create: `mobile/src/utils/duration.ts`

**Interfaces:**
- Consumes: `expo-audio`'s `useAudioPlayer`/`useAudioPlayerStatus` (installed in Task 3).
- Produces: `<VoicePlaybackProvider>` (wraps a subtree so only one voice note plays at a time within it); `useVoicePlayback(key: string, uri: string | null): { isPlaying: boolean; isLoading: boolean; hasError: boolean; currentTimeMs: number; durationMs: number; toggle: () => void }`; `waveformBarHeights(seedKey: string): number[]` (28 values in `[0.3, 1.0]`, deterministic per `seedKey`); `formatDuration(ms: number): string` (`"m:ss"`). Task 5's `VoiceMessageBubble` and Task 6's `VoiceRecordingPreview`/recording bar all consume these.

- [ ] **Step 1: Create the duration formatter**

Create `mobile/src/utils/duration.ts`:

```ts
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 2: Create the simulated waveform generator**

Create `mobile/src/utils/waveform.ts`:

```ts
// V1 uses a simulated waveform, not real amplitude data: a deterministic
// bar-height pattern derived from a string seed (a message id once sent, or
// the local recording's uri while still in the pre-send preview - either
// way a stable per-item key), so a given voice note always renders the same
// pattern without decoding any audio or storing sample data.
const BAR_COUNT = 28;

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function waveformBarHeights(seedKey: string): number[] {
  const random = mulberry32(hashSeed(seedKey));
  return Array.from({ length: BAR_COUNT }, () => 0.3 + random() * 0.7);
}
```

- [ ] **Step 3: Create the playback coordinator context**

Create `mobile/src/contexts/VoicePlaybackContext.tsx`:

```tsx
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

interface VoicePlaybackContextValue {
  activeKey: string | null;
  requestPlay: (key: string, onForceStop: () => void) => void;
  notifyStopped: (key: string) => void;
}

const VoicePlaybackContext = createContext<VoicePlaybackContextValue | null>(null);

// Ensures only one voice note plays at a time within the wrapped subtree -
// starting playback on one pauses whatever else was playing, standard chat
// behavior. Each player registers its own stop callback when it starts, so
// the coordinator never needs to know how any individual player works.
export function VoicePlaybackProvider({ children }: { children: ReactNode }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const stopHandlers = useRef<Map<string, () => void>>(new Map());

  const requestPlay = (key: string, onForceStop: () => void) => {
    if (activeKey && activeKey !== key) {
      stopHandlers.current.get(activeKey)?.();
    }
    stopHandlers.current.set(key, onForceStop);
    setActiveKey(key);
  };

  const notifyStopped = (key: string) => {
    stopHandlers.current.delete(key);
    setActiveKey((current) => (current === key ? null : current));
  };

  return (
    <VoicePlaybackContext.Provider value={{ activeKey, requestPlay, notifyStopped }}>
      {children}
    </VoicePlaybackContext.Provider>
  );
}

export function useVoicePlaybackCoordinator(): VoicePlaybackContextValue {
  const ctx = useContext(VoicePlaybackContext);
  if (!ctx) throw new Error("useVoicePlaybackCoordinator must be used within a VoicePlaybackProvider");
  return ctx;
}
```

- [ ] **Step 4: Create the playback hook**

Create `mobile/src/hooks/useVoicePlayback.ts`:

```ts
import { useEffect } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVoicePlaybackCoordinator } from "../contexts/VoicePlaybackContext";

export interface VoicePlaybackState {
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  currentTimeMs: number;
  durationMs: number;
  toggle: () => void;
}

// `key` must be stable and unique per voice note within one
// VoicePlaybackProvider subtree (a message id for sent bubbles, a
// "preview:<uri>" string for the composer's pre-send preview).
export function useVoicePlayback(key: string, uri: string | null): VoicePlaybackState {
  const player = useAudioPlayer(uri ?? null);
  const status = useAudioPlayerStatus(player);
  const { activeKey, requestPlay, notifyStopped } = useVoicePlaybackCoordinator();

  useEffect(() => {
    if (activeKey !== key && status.playing) {
      player.pause();
    }
  }, [activeKey, key, status.playing, player]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0);
      notifyStopped(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      notifyStopped(key);
    } else {
      requestPlay(key, () => player.pause());
      player.play();
    }
  };

  return {
    isPlaying: status.playing,
    isLoading: !status.isLoaded && !status.error,
    hasError: !!status.error,
    currentTimeMs: Math.round((status.currentTime ?? 0) * 1000),
    durationMs: Math.round((status.duration ?? 0) * 1000),
    toggle,
  };
}
```

- [ ] **Step 5: Verify**

Run (from `mobile/`): `npm run typecheck`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/contexts/VoicePlaybackContext.tsx mobile/src/hooks/useVoicePlayback.ts mobile/src/utils/waveform.ts mobile/src/utils/duration.ts
git commit -m "Add voice note playback plumbing (context, hook, waveform, duration utils)"
```

---

### Task 5: Mobile — `VoiceMessageBubble`, wired into the chat

**Files:**
- Create: `mobile/src/components/VoiceMessageBubble.tsx`
- Modify: `mobile/src/screens/GroupChatScreen.tsx:1-36` (imports), `:200-231` (renderMessage content branch), `:268-269,432` (screen wrapper)

**Interfaces:**
- Consumes: Task 4's `useVoicePlayback`, `waveformBarHeights`, `formatDuration`, `VoicePlaybackProvider`. Task 3's `ChatMessage.durationMs`.
- Produces: `<VoiceMessageBubble messageId={string} mediaUrl={string} durationMs={number} isMine={boolean} />`. No later task consumes this directly — Task 6 does not touch the message list, only the composer.

- [ ] **Step 1: Create `VoiceMessageBubble`**

Create `mobile/src/components/VoiceMessageBubble.tsx`:

```tsx
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useVoicePlayback } from "../hooks/useVoicePlayback";
import { waveformBarHeights } from "../utils/waveform";
import { formatDuration } from "../utils/duration";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

const BAR_COUNT = 28;
const BAR_MAX_HEIGHT = 22;

export function VoiceMessageBubble({
  messageId,
  mediaUrl,
  durationMs,
  isMine,
}: {
  messageId: string;
  mediaUrl: string;
  durationMs: number;
  isMine: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const playback = useVoicePlayback(messageId, mediaUrl);
  const bars = useMemo(() => waveformBarHeights(messageId), [messageId]);

  const totalMs = playback.durationMs > 0 ? playback.durationMs : durationMs;
  const progress = totalMs > 0 ? Math.min(1, playback.currentTimeMs / totalMs) : 0;
  const filledBars = Math.round(progress * BAR_COUNT);
  const iconColor = isMine ? colors.white : colors.primary;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: isMine ? "rgba(255,255,255,0.22)" : colors.successBg }]}
        onPress={playback.toggle}
        disabled={playback.isLoading}
      >
        {playback.isLoading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : playback.hasError ? (
          <MaterialCommunityIcons name="refresh" size={18} color={iconColor} />
        ) : (
          <MaterialCommunityIcons name={playback.isPlaying ? "pause" : "play"} size={18} color={iconColor} />
        )}
      </TouchableOpacity>
      <View style={styles.waveformCol}>
        <View style={styles.waveformRow}>
          {bars.map((height, index) => (
            <View
              key={index}
              style={[
                styles.waveformBar,
                {
                  height: Math.max(3, height * BAR_MAX_HEIGHT),
                  backgroundColor:
                    index < filledBars
                      ? isMine
                        ? colors.white
                        : colors.primary
                      : isMine
                        ? "rgba(255,255,255,0.4)"
                        : colors.border,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.durationText, isMine && styles.durationTextMine]}>
          {playback.isPlaying ? `${formatDuration(playback.currentTimeMs)} / ${formatDuration(totalMs)}` : formatDuration(totalMs)}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 190, paddingVertical: 2 },
    playButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    waveformCol: { flex: 1 },
    waveformRow: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 22 },
    waveformBar: { width: 3, borderRadius: 1.5 },
    durationText: { fontSize: 10.5, color: colors.muted, marginTop: 4 },
    durationTextMine: { color: "rgba(255,255,255,0.85)" },
  });
}
```

- [ ] **Step 2: Import it into `GroupChatScreen.tsx`**

Add these two imports to `mobile/src/screens/GroupChatScreen.tsx`, alongside the existing component imports (after the `SeenByModal` import):

```ts
import { VoiceMessageBubble } from "../components/VoiceMessageBubble";
import { VoicePlaybackProvider } from "../contexts/VoicePlaybackContext";
```

- [ ] **Step 3: Render `VoiceMessageBubble` for `AUDIO` messages**

In `renderMessage`, change:

```tsx
            {!isMine && <Text style={styles.senderName}>{item.sender.name}</Text>}
            {item.type === "IMAGE" && item.mediaUrl ? (
              <Image source={{ uri: optimizedImageUrl(item.mediaUrl, 190) }} style={styles.messageImage} />
            ) : (
              <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.content}</Text>
            )}
```

to:

```tsx
            {!isMine && <Text style={styles.senderName}>{item.sender.name}</Text>}
            {item.type === "IMAGE" && item.mediaUrl ? (
              <Image source={{ uri: optimizedImageUrl(item.mediaUrl, 190) }} style={styles.messageImage} />
            ) : item.type === "AUDIO" && item.mediaUrl ? (
              <VoiceMessageBubble messageId={item.id} mediaUrl={item.mediaUrl} durationMs={item.durationMs ?? 0} isMine={isMine} />
            ) : (
              <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.content}</Text>
            )}
```

- [ ] **Step 4: Wrap the screen in `VoicePlaybackProvider`**

Change the component's outer `return` (currently):

```tsx
  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
```

to:

```tsx
  return (
    <VoicePlaybackProvider>
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
```

And change the matching closing tags at the end of the same `return` (currently):

```tsx
      <SeenByModal
        visible={!!seenByTargetId}
        onClose={() => setSeenByTargetId(null)}
        members={seenByOtherMembers}
        presence={presence}
        readBy={seenByTargetMessage?.readBy ?? []}
      />
    </KeyboardAvoidingView>
  );
}
```

to:

```tsx
      <SeenByModal
        visible={!!seenByTargetId}
        onClose={() => setSeenByTargetId(null)}
        members={seenByOtherMembers}
        presence={presence}
        readBy={seenByTargetMessage?.readBy ?? []}
      />
    </KeyboardAvoidingView>
    </VoicePlaybackProvider>
  );
}
```

(Indentation of the lines between the two changed tags is intentionally left as-is — fixing the whole block's indentation is unrelated cosmetic churn.)

- [ ] **Step 5: Verify**

Run (from `mobile/`): `npm run typecheck`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/VoiceMessageBubble.tsx mobile/src/screens/GroupChatScreen.tsx
git commit -m "Render voice note bubbles in Group Chat"
```

---

### Task 6: Mobile — recording, preview, and send in the composer

**Files:**
- Modify: `mobile/app.json` (permissions)
- Create: `mobile/src/components/VoiceRecordingPreview.tsx`
- Modify: `mobile/src/screens/GroupChatScreen.tsx` (imports, state, handlers, composer JSX, styles)

**Interfaces:**
- Consumes: Task 3's `useUploadChatAudio`, widened `sendMessage`. Task 4's `useVoicePlayback`, `waveformBarHeights`, `formatDuration`. `expo-audio`'s `useAudioRecorder`, `useAudioRecorderState`, `RecordingPresets`, `AudioModule`, `setAudioModeAsync`.
- Produces: the complete end-to-end recording UX. Nothing later depends on this task.

- [ ] **Step 1: Add microphone permission config**

In `mobile/app.json`, change:

```json
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Used to show trips and distances near you.",
        "NSPhotoLibraryUsageDescription": "Used to attach photos to your profile, trips, and chat.",
        "NSCameraUsageDescription": "Used to take photos to share in trip group chats."
      }
    },
    "android": {
      "package": "com.triply.app",
      "permissions": [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "CAMERA"
      ]
    },
```

to:

```json
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Used to show trips and distances near you.",
        "NSPhotoLibraryUsageDescription": "Used to attach photos to your profile, trips, and chat.",
        "NSCameraUsageDescription": "Used to take photos to share in trip group chats.",
        "NSMicrophoneUsageDescription": "Used to record voice notes to share in trip group chats."
      }
    },
    "android": {
      "package": "com.triply.app",
      "permissions": [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "CAMERA",
        "RECORD_AUDIO"
      ]
    },
```

- [ ] **Step 2: Create `VoiceRecordingPreview`**

Create `mobile/src/components/VoiceRecordingPreview.tsx`:

```tsx
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useVoicePlayback } from "../hooks/useVoicePlayback";
import { waveformBarHeights } from "../utils/waveform";
import { formatDuration } from "../utils/duration";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

const BAR_COUNT = 28;
const BAR_MAX_HEIGHT = 22;

// Lets the user review a just-recorded voice note before sending, reusing
// the exact same playback hook (and single-playback coordination) as sent
// voice bubbles - this is the "Preview" step between Record and Send.
export function VoiceRecordingPreview({ uri, durationMs }: { uri: string; durationMs: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const playback = useVoicePlayback(`preview:${uri}`, uri);
  const bars = useMemo(() => waveformBarHeights(uri), [uri]);

  const totalMs = playback.durationMs > 0 ? playback.durationMs : durationMs;
  const progress = totalMs > 0 ? Math.min(1, playback.currentTimeMs / totalMs) : 0;
  const filledBars = Math.round(progress * BAR_COUNT);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.playButton} onPress={playback.toggle} disabled={playback.isLoading}>
        {playback.isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialCommunityIcons name={playback.isPlaying ? "pause" : "play"} size={18} color={colors.primary} />
        )}
      </TouchableOpacity>
      <View style={styles.waveformCol}>
        <View style={styles.waveformRow}>
          {bars.map((height, index) => (
            <View
              key={index}
              style={[
                styles.waveformBar,
                { height: Math.max(3, height * BAR_MAX_HEIGHT), backgroundColor: index < filledBars ? colors.primary : colors.border },
              ]}
            />
          ))}
        </View>
        <Text style={styles.durationText}>
          {playback.isPlaying ? `${formatDuration(playback.currentTimeMs)} / ${formatDuration(totalMs)}` : formatDuration(totalMs)}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    playButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.successBg,
      alignItems: "center",
      justifyContent: "center",
    },
    waveformCol: { flex: 1 },
    waveformRow: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 22 },
    waveformBar: { width: 3, borderRadius: 1.5 },
    durationText: { fontSize: 10.5, color: colors.muted, marginTop: 4 },
  });
}
```

- [ ] **Step 3: Add imports to `GroupChatScreen.tsx`**

Add, alongside the existing top-of-file imports:

```ts
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
```

```ts
import { useUploadChatAudio } from "../api/messages";
```

(this becomes part of the existing `import { useLiveGroupChat, useMessageHistory, useUploadChatImage } from "../api/messages";` line — change it to `import { useLiveGroupChat, useMessageHistory, useUploadChatAudio, useUploadChatImage } from "../api/messages";` instead of adding a second import line)

```ts
import { VoiceRecordingPreview } from "../components/VoiceRecordingPreview";
```

```ts
import { formatDuration } from "../utils/duration";
```

- [ ] **Step 4: Add recorder + preview/send state**

Change:

```ts
  const uploadImage = useUploadChatImage();
  const [text, setText] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
```

to:

```ts
  const uploadImage = useUploadChatImage();
  const uploadAudio = useUploadChatAudio();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 100);
  const [text, setText] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [pendingRecording, setPendingRecording] = useState<{ uri: string; durationMs: number } | null>(null);
  const [sendingVoiceNote, setSendingVoiceNote] = useState(false);
```

- [ ] **Step 5: Add the recording handlers and the 5-minute auto-stop**

Add, after the existing `onSend` function:

```ts
  const MAX_RECORDING_MS = 5 * 60 * 1000;

  const onStartRecording = async () => {
    if (isClosed) return;
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone access needed", "Please allow microphone access to record a voice note.");
      return;
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      Alert.alert("Couldn't start recording", "Please try again");
    }
  };

  const onStopRecording = async () => {
    if (!recorderState.isRecording) return;
    const finishedDurationMs = recorderState.durationMillis;
    await audioRecorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = audioRecorder.uri;
    if (uri) {
      setPendingRecording({ uri, durationMs: finishedDurationMs });
    }
  };

  const onCancelRecording = () => {
    setPendingRecording(null);
  };

  const onConfirmSendVoiceNote = async () => {
    if (!pendingRecording) return;
    setSendingVoiceNote(true);
    try {
      const url = await uploadAudio.mutateAsync(pendingRecording);
      sendMessage({ type: "AUDIO", mediaUrl: url, durationMs: pendingRecording.durationMs });
      setPendingRecording(null);
    } catch {
      Alert.alert("Couldn't send voice note", "Please try again");
    } finally {
      setSendingVoiceNote(false);
    }
  };
```

Add this effect near the other `useEffect` calls (after the `Keyboard.addListener` effect):

```ts
  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= MAX_RECORDING_MS) {
      onStopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.isRecording, recorderState.durationMillis]);
```

- [ ] **Step 6: Replace the composer's bottom bar to add the recording bar, preview bar, and mic button**

Change the whole block from the `{pendingPhoto ? (` line through its matching `)}` (currently lines 336-396 of `mobile/src/screens/GroupChatScreen.tsx`):

```tsx
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
                <MaterialCommunityIcons name="close" size={18} color={colors.danger} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewIconButton} onPress={onRetake} disabled={sendingPhoto}>
                <MaterialCommunityIcons name="camera-retake-outline" size={18} color={colors.ink} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewSendButton} onPress={onConfirmSendPhoto} disabled={sendingPhoto}>
                {sendingPhoto ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={16} color={colors.white} />
                    <Text style={styles.previewSendText}>Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {isClosed && (
              <View style={styles.closedBanner}>
                <MaterialCommunityIcons name="lock-outline" size={14} color={colors.mutedLight} />
                <Text style={styles.closedBannerText}>This trip is closed. Chat is read-only.</Text>
              </View>
            )}
            <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
              <TouchableOpacity
                onPress={() => setAttachmentSheetVisible(true)}
                style={[styles.attachButton, isClosed && styles.attachButtonDisabled]}
                disabled={isClosed}
              >
                <MaterialCommunityIcons name="paperclip" size={22} color={isClosed ? colors.mutedLight : colors.primary} />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, isClosed && styles.inputDisabled]}
                placeholder={isClosed ? "Chat is read-only" : "Message the group..."}
                placeholderTextColor={colors.mutedLight}
                value={text}
                onChangeText={setText}
                onSubmitEditing={onSend}
                editable={!isClosed}
                multiline
              />
              <TouchableOpacity onPress={onSend} style={styles.sendButton} disabled={!text.trim() || isClosed}>
                <MaterialCommunityIcons name="send" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </>
        )}
```

to:

```tsx
        {recorderState.isRecording ? (
          <View style={[styles.recordingBar, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.recordingIndicatorWrap}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingLabel}>Recording…</Text>
            </View>
            <Text style={styles.recordingDuration}>{formatDuration(recorderState.durationMillis)}</Text>
          </View>
        ) : pendingRecording ? (
          <View style={[styles.previewBar, { paddingBottom: insets.bottom + 12 }]}>
            <VoiceRecordingPreview uri={pendingRecording.uri} durationMs={pendingRecording.durationMs} />
            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.previewIconButton} onPress={onCancelRecording} disabled={sendingVoiceNote}>
                <MaterialCommunityIcons name="delete-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewSendButton} onPress={onConfirmSendVoiceNote} disabled={sendingVoiceNote}>
                {sendingVoiceNote ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={16} color={colors.white} />
                    <Text style={styles.previewSendText}>Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : pendingPhoto ? (
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
                <MaterialCommunityIcons name="close" size={18} color={colors.danger} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewIconButton} onPress={onRetake} disabled={sendingPhoto}>
                <MaterialCommunityIcons name="camera-retake-outline" size={18} color={colors.ink} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewSendButton} onPress={onConfirmSendPhoto} disabled={sendingPhoto}>
                {sendingPhoto ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={16} color={colors.white} />
                    <Text style={styles.previewSendText}>Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {isClosed && (
              <View style={styles.closedBanner}>
                <MaterialCommunityIcons name="lock-outline" size={14} color={colors.mutedLight} />
                <Text style={styles.closedBannerText}>This trip is closed. Chat is read-only.</Text>
              </View>
            )}
            <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
              <TouchableOpacity
                onPress={() => setAttachmentSheetVisible(true)}
                style={[styles.attachButton, isClosed && styles.attachButtonDisabled]}
                disabled={isClosed}
              >
                <MaterialCommunityIcons name="paperclip" size={22} color={isClosed ? colors.mutedLight : colors.primary} />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, isClosed && styles.inputDisabled]}
                placeholder={isClosed ? "Chat is read-only" : "Message the group..."}
                placeholderTextColor={colors.mutedLight}
                value={text}
                onChangeText={setText}
                onSubmitEditing={onSend}
                editable={!isClosed}
                multiline
              />
              {text.trim() ? (
                <TouchableOpacity onPress={onSend} style={styles.sendButton} disabled={isClosed}>
                  <MaterialCommunityIcons name="send" size={18} color={colors.white} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.sendButton, isClosed && styles.micButtonDisabled]}
                  onPressIn={onStartRecording}
                  onPressOut={onStopRecording}
                  disabled={isClosed}
                >
                  <MaterialCommunityIcons name="microphone" size={18} color={isClosed ? colors.mutedLight : colors.white} />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
```

- [ ] **Step 7: Add the recording bar and mic-disabled styles**

Add these entries to the `createStyles` function's returned object, after the existing `sendButton` entry:

```ts
  micButtonDisabled: { backgroundColor: colors.fieldBg },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  recordingIndicatorWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recordingLabel: { fontSize: 13.5, fontWeight: "600", color: colors.ink },
  recordingDuration: { fontSize: 13.5, fontWeight: "700", color: colors.ink, fontVariant: ["tabular-nums"] },
```

- [ ] **Step 8: Verify**

Run (from `mobile/`): `npm run typecheck`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add mobile/app.json mobile/src/components/VoiceRecordingPreview.tsx mobile/src/screens/GroupChatScreen.tsx
git commit -m "Add press-and-hold voice note recording, preview, and send"
```

---

### Task 7: Mobile — notification preview text for voice notes

**Files:**
- Modify: `mobile/src/screens/NotificationsScreen.tsx:26-30`

**Interfaces:**
- Consumes: nothing new (payload's `messageType` already carries `"AUDIO"` once Task 2 is deployed).
- Produces: nothing later depends on.

- [ ] **Step 1: Add the `AUDIO` case to `messagePreview`**

Change:

```ts
function messagePreview(payload: Record<string, unknown>): string {
  if (payload.messageType === "IMAGE") return "📷 Photo";
  const content = typeof payload.content === "string" ? payload.content : "";
  return content.length > 60 ? `${content.slice(0, 60)}…` : content;
}
```

to:

```ts
function messagePreview(payload: Record<string, unknown>): string {
  if (payload.messageType === "IMAGE") return "📷 Photo";
  if (payload.messageType === "AUDIO") return "🎙️ Voice message";
  const content = typeof payload.content === "string" ? payload.content : "";
  return content.length > 60 ? `${content.slice(0, 60)}…` : content;
}
```

Tap-to-navigate needs no change — the `GROUP_MESSAGE`/`MESSAGE_REACTION` case in `onPressNotification` already routes generically off `{ groupId, tripTitle, messageId }`, regardless of `messageType`.

- [ ] **Step 2: Verify**

Run (from `mobile/`): `npm run typecheck`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/NotificationsScreen.tsx
git commit -m "Add voice message notification preview text"
```

---

## Manual Testing Checklist (after all tasks land)

Run against `npm run dev` (backend) + `npx expo start` (mobile), on at least one native platform and web:

- Record → Preview (play/pause the just-recorded note) → Send → appears in the sender's own chat as a bubble.
- A second group member receives it in real time and can play it; a third member's notification shows "🎙️ Voice message" and tapping it opens the correct chat.
- Short recording (~1s) and a long recording that hits the 5:00 auto-stop.
- Cancel from the preview bar — composer returns to normal, nothing sent.
- Deny microphone permission (mobile and web) — no recording bar appears, an alert is shown.
- Kill the network mid-upload — preview bar stays, error alert shown, retry works once the network returns.
- Refresh the page (web) / re-open the app (native) — previously sent voice notes still load and play.
- Mark a trip `COMPLETED` — mic button is disabled/hidden, previously sent voice notes in that chat remain playable.
- Regression pass: text send, image send (camera/gallery/file), reactions, Seen By, member profile/presence, and the read-only banner all still work exactly as before.
- Note for local web testing: browser microphone access requires a secure context — `http://localhost` works, but testing over a plain-HTTP LAN IP (e.g. `http://192.168.x.x:8081`) will have the browser block the mic prompt. This is a browser platform constraint, not a bug in this feature.
