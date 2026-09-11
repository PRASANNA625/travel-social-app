# Voice Notes for Group Chat — Design Spec

## Goal

Add voice-note (audio message) support to the existing Triply Group Chat,
reusing the existing chat, media/storage, and notification systems rather
than building a parallel messaging path. Works on Android, iOS, and Web.

## Non-Goals (V1)

- Transcription of voice notes.
- Voice effects / filters.
- Playback speed controls.
- Real (amplitude-derived) waveform data — V1 uses a simulated waveform
  (see below).
- Slide-to-cancel drag gesture — cancellation happens via an explicit
  button in a post-recording preview state instead (see Recording UX).

## Existing Architecture (context this design builds on)

- **Message model** (`backend/prisma/schema.prisma`): `Message` has
  `type: MessageType` (currently `TEXT | IMAGE`), nullable `content` and
  `mediaUrl` columns, no separate attachment table.
- **Sending is Socket.IO-only.** There is no REST endpoint to create a
  message — `backend/src/config/socket.ts`'s `message:send` handler does
  membership check → closed-trip check (`trip.status === "COMPLETED"`) →
  `prisma.message.create` → broadcast `message:new` → fire-and-forget
  notification fan-out.
- **Image upload** is a two-step flow: REST `POST /messages/images`
  (multer → `uploadToCloudinary`, hardcoded `resource_type: "image"`)
  returns a URL, then the client sends `{ type: "IMAGE", mediaUrl: url }`
  over the socket. This exact two-step pattern is reused for audio.
- **Shared storage utility**: `backend/src/middleware/upload.ts` is used
  by chat images, profile/cover photos, and trip images alike — Cloudinary
  is the only storage backend, no local disk, no S3.
- **Notifications**: `notify.ts`'s `notifyGroupMessage` stores a
  `GROUP_MESSAGE` notification collapsed per-group-while-unread; preview
  text is computed client-side in `NotificationsScreen.tsx`'s
  `messagePreview()`, which already special-cases `IMAGE` as `"📷 Photo"`.
- **Closed-trip rule**: `trip.status === "COMPLETED"` is checked both in
  the mobile composer (`GroupChatScreen.tsx`) and the socket handler —
  the only two enforcement points, and both are type-agnostic already.
- No microphone/audio library exists in the project yet
  (`expo-image-picker` and `expo-document-picker` are the only
  media-related Expo packages installed).

## Architecture Overview

Voice notes are a third `MessageType`, following the exact same
"REST-upload-then-socket-send" shape as images, with one added field
(`durationMs`) so the bubble can render total duration without loading
the audio file. Recording and playback both use `expo-audio` (the
SDK-57-era successor to the deprecated `expo-av`), which has a uniform
API across iOS, Android, and web.

## Data Model

```prisma
enum MessageType {
  TEXT
  IMAGE
  AUDIO
}

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

`durationMs` is set only for `AUDIO` messages (client supplies it — it's
known exactly from the recording session, no server-side audio
inspection needed). `mediaUrl` holds the Cloudinary URL, same as `IMAGE`.
`content` stays `null` for `AUDIO`.

## Backend

### Storage (`backend/src/middleware/upload.ts`)

- `uploadToCloudinary(file, resourceType: "image" | "video" = "image")` —
  generalized with a second, defaulted parameter so every existing
  caller (profile photo, cover photo, trip images, chat images) is
  unaffected. Audio uploads pass `"video"` (Cloudinary's resource type
  for all non-image media, including audio).
- New multer instance `uploadAudio`: `fileFilter` allows
  `audio/m4a`, `audio/mp4`, `audio/aac`, `audio/webm`, `audio/ogg`,
  `audio/mpeg`; `limits.fileSize: 15 * 1024 * 1024` (15MB — separate
  from the existing 10MB image cap, sized to comfortably cover a
  5-minute compressed recording).

### Chat module (`backend/src/modules/messages/`)

- New route `POST /messages/audio` mirroring `POST /messages/images`
  exactly: `uploadAudio.single("audio")` → `uploadToCloudinary(file,
  "video")` → `{ url }`.
- `message:send` socket handler (`backend/src/config/socket.ts`):
  accept and persist `durationMs` alongside the existing
  `type`/`content`/`mediaUrl` fields. The existing membership and
  `trip.status === "COMPLETED"` checks already run before any
  type-specific logic, so no separate closed-trip handling is needed
  for `AUDIO`.

## Mobile: Recording UX

**New dependency**: `expo-audio`.

**Composer** (`mobile/src/screens/GroupChatScreen.tsx`): when the text
input is empty, a mic button occupies the send-button slot (mirrors the
existing empty-text → disabled-send-icon pattern); typing flips it back
to the normal send button.

**Interaction model — press and hold**:
1. `onPressIn` on the mic button: request mic permission if not already
   granted (`AudioModule.requestRecordingPermissionsAsync()`); on grant,
   start recording immediately and replace the composer row with a
   recording bar: pulsing red dot + animated "Recording…" indicator,
   live `mm:ss` duration. Auto-stops at 5:00.
2. `onPressOut`: stop recording, transition to a **preview bar** in the
   same row slot (this is the explicit "Preview" step called out in the
   testing plan) — Play/Pause (reusing the same playback plumbing as
   sent bubbles), total duration, a Cancel/trash button (discards the
   temp file, returns to the normal composer), and a Send button.
   Using an explicit post-release preview state (rather than a
   slide-to-cancel drag gesture during the hold) keeps "cancel before
   sending" reliable on both touch and mouse/web input.
3. Send: `POST /messages/audio` with the recorded file → on success,
   `message:send` over the socket with `{ type: "AUDIO", mediaUrl,
   durationMs }`, then return to the normal composer. Same
   spinner-while-uploading / `Alert.alert`-and-retry-in-place pattern
   already used for photo sends (`sendingPhoto` in `GroupChatScreen.tsx`).

**Permission denial**: `Alert.alert("Microphone access needed", ...)`,
abort before any recording bar appears — matches every other permission
prompt's denial handling in the app (no Settings deep-link).

**Native config** (`mobile/app.json`): add
`NSMicrophoneUsageDescription`; add `RECORD_AUDIO` to the Android
`permissions` array.

**Web**: `expo-audio` resolves microphone access through the browser's
`getUserMedia` prompt; denial surfaces through the same permission-check
→ `Alert.alert` path (the app's cross-platform `alert.ts` shim already
handles this on web).

## Mobile: Voice Message Bubble & Playback

New component `mobile/src/components/VoiceMessageBubble.tsx`, rendered
by `renderMessage` when `item.type === "AUDIO"`, reusing the existing
bubble shell (avatar, sender name, `bubbleMine`/`bubbleTheirs` styling,
timestamp, reactions row, seen-by row) — only the inner content differs
from the TEXT/IMAGE branches:

- Play/Pause circular button.
- **Simulated waveform**: ~28 bars with heights deterministically
  derived from the message `id` (so a given message always renders the
  same pattern; no amplitude sampling, no extra stored data). Bars
  before the current playback position render highlighted, bars after
  render muted.
- Duration: `durationMs` formatted `mm:ss` at rest; live
  `elapsed / total` while playing.
- Loading state: spinner in the play button while the audio resource is
  still resolving (e.g. scrolling to an old message on a slow
  connection); failed load swaps the icon to a retry glyph.

**Playback coordination**: `mobile/src/contexts/VoicePlaybackContext.tsx`
tracks "currently playing message id" so starting playback on one voice
note pauses any other — standard single-playback chat behavior. The
composer's preview-bar playback (recording UX step 2) shares this same
`expo-audio` playback plumbing.

## Notifications

- `GroupMessagePayload.messageType` (`backend/src/modules/notifications/notify.ts`)
  extended to include `"AUDIO"`.
- `messagePreview()` (`mobile/src/screens/NotificationsScreen.tsx`) gets
  a third case: `"🎙️ Voice message"` for `messageType === "AUDIO"` —
  mirrors the existing `"📷 Photo"` case, never exposes audio content.
- Tap-to-navigate needs no change: it already routes generically off
  `{ groupId, tripTitle, messageId }` regardless of message type.

## Closed-Trip Rules

- Mobile: mic button gets the same `disabled={isClosed}` / muted
  treatment as the existing attach button, hidden in the same
  read-only composer state.
- Backend: no change needed — `message:send`'s existing
  `trip.status === "COMPLETED"` check runs before any type-specific
  logic.
- Playback of existing voice messages is unaffected regardless of trip
  status, since history (`GET /messages/groups/:groupId`) has no
  closed-trip gating today.

## Preserved Existing Features

Text messages, images (camera/gallery/file picker), reactions, Seen By,
member profiles/online presence, and read-only closed-trip behavior are
all unchanged — every new code path is additive (`AUDIO` as a new
branch alongside `TEXT`/`IMAGE`), no shared logic is restructured.

## Testing Plan

- Full happy path: Record → Preview → Send → Upload → Receive (another
  member sees it in real time via `message:new`) → Play → Notification
  received → Tapping notification opens the correct group chat.
- Short recording (~1s) and long recording (near the 5:00 cap,
  including hitting the cap while still held).
- Cancel from the preview bar (recording discarded, composer returns to
  normal, no message sent).
- Microphone permission denied (mobile and web) — no recording bar
  appears, alert shown.
- Upload failure (e.g. Cloudinary error) — preview bar stays, error
  alert shown, retry works.
- Slow network — upload spinner state holds correctly; playback loading
  spinner on a not-yet-loaded old voice message.
- App refresh / re-login — previously sent voice messages still load
  and play correctly (durationMs persisted, mediaUrl persisted).
- Closed trip — mic button disabled/hidden, existing voice messages in
  that chat remain playable.
- Regression pass on preserved features: text send, image send
  (camera/gallery/file), reactions, Seen By, member profile/presence,
  read-only banner — all still function per the "Preserved Existing
  Features" section above.
