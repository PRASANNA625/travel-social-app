# Triply — Step 6: Report & Block — Design Spec

## Goal

Give users a way to report or block another user, addressing the roadmap's explicitly-deferred safety gap ("report/block flows") in a social app where strangers meet up in person.

## Scope

User-to-user report and block only — not trip-level or message-level reporting. Block enforcement is confined to the existing Buddy matching/connection system; it does not touch trip join requests. No admin/moderation UI in this pass (reports are stored for a future moderation tool to query); the reporter gets a confirmation notification.

## Current State (for reference)

- `BuddyConnection` (`backend/prisma/schema.prisma`) already models buddy requests with `PENDING`/`ACCEPTED`/`REJECTED` status. `buddies.service.ts`'s `excludedUserIds(viewerId)` already excludes REJECTED-connection users from the candidate pool; `connectionStateMap` surfaces PENDING/ACCEPTED state on `BuddyCard`.
- `notify(userId, type, payload)` (`backend/src/modules/notifications/notify.ts`) is the generic notification helper already used for `BUDDY_REQUEST`/`BUDDY_REQUEST_ACCEPTED`; `NotificationsScreen` has a type-to-copy/icon map for rendering each type.
- `GET /users/:id` (`users.routes.ts`, requireAuth applied to the whole router) returns `publicUserSelect` fields via `getUserById(id)` — currently viewer-agnostic.
- `ProfileMenu.tsx` establishes the app's anchored-dropdown-menu pattern (Animated `Modal` + backdrop + menu-item rows) and its own confirm-sheet pattern (used today for the logout confirmation) — both are reused directly by this feature rather than inventing new UI patterns.
- `SettingsScreen.tsx` uses a "section title + card of rows" layout (currently just an Appearance section) — the new "Blocked Users" entry follows this exact pattern.

## Design

### Data model

```prisma
enum ReportReason {
  SPAM
  HARASSMENT
  FAKE_PROFILE
  INAPPROPRIATE_CONTENT
  SAFETY_CONCERN
  OTHER
}

model UserBlock {
  id        String   @id @default(cuid())
  blockerId String
  blocker   User     @relation("BlocksMade", fields: [blockerId], references: [id], onDelete: Cascade)
  blockedId String
  blocked   User     @relation("BlocksReceived", fields: [blockedId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([blockerId, blockedId])
  @@index([blockedId])
}

model UserReport {
  id         String       @id @default(cuid())
  reporterId String
  reporter   User         @relation("ReportsMade", fields: [reporterId], references: [id], onDelete: Cascade)
  reportedId String
  reported   User         @relation("ReportsReceived", fields: [reportedId], references: [id], onDelete: Cascade)
  reason     ReportReason
  details    String?
  createdAt  DateTime     @default(now())

  @@index([reportedId])
}
```

### Enforcement — reusing the existing Buddy machinery

Rather than inventing new connection state, blocking plugs directly into `buddies.service.ts`'s existing functions:

- **`excludedUserIds(viewerId)`** is extended to also exclude any user with a `UserBlock` relationship to the viewer in either direction. This alone makes a blocked user vanish from both parties' Discover/matches sections, even if they were previously "connected" — overriding the existing rule that keeps ACCEPTED connections visible, which is exactly the desired override for a block.
- **`sendBuddyRequest(fromUserId, toUserId)`** gets a block check at the top: if a `UserBlock` exists between the pair in either direction, throw `HttpError(403, "You can't connect with this user")`. This covers direct/stale-UI attempts that bypass the candidate pool.
- **`blockUser`** additionally auto-rejects (`status: "REJECTED"`) any `PENDING` `BuddyConnection` between the pair, so a pending request doesn't linger in the recipient's pending-requests inbox after a block.
- **Unblocking** only deletes the `UserBlock` row. It does not restore an auto-rejected connection — matching this repo's existing behavior where a REJECTED `BuddyConnection` is already permanent with no re-request path (`sendBuddyRequest` throws 409 for any existing row regardless of status). This is a pre-existing repo limitation, not something this feature introduces or needs to fix.
- **Profile viewing is unaffected**: `GET /users/:id` and `UserProfileScreen` remain viewable in both directions regardless of any block — a block only changes Buddy matching/connection behavior, per the chosen scope.
- **Trip join requests are unaffected** — blocking does not touch the `JoinRequest` module.

### API

New `backend/src/modules/safety/` module (types/service/controller/routes), registered at `/safety` in `app.ts`. Mirrors `buddiesRouter`'s exact shape — `router.use(requireAuth)` once, since every route needs it:

```
POST   /safety/users/:id/report   body: { reason: ReportReason, details?: string }
POST   /safety/users/:id/block
DELETE /safety/users/:id/block
GET    /safety/blocked
```

- **`reportUser(reporterId, reportedId, reason, details?)`**: 400 if `reporterId === reportedId`; 404 if the reported user doesn't exist; creates the `UserReport` row; then `notify(reporterId, "REPORT_RECEIVED", { reportedUserId: reportedId, reason })` — confirms receipt to the reporter only, the reported user is never notified.
- **`blockUser(blockerId, blockedId)`**: 400 if self-block; 404 if the target doesn't exist; upserts `UserBlock` on the `[blockerId, blockedId]` unique constraint (idempotent — blocking twice is a no-op); then `updateMany` on `BuddyConnection` to flip any `PENDING` row between the pair (either direction) to `REJECTED`.
- **`unblockUser(blockerId, blockedId)`**: deletes the `UserBlock` row (no-op if it doesn't exist).
- **`listBlockedUsers(blockerId)`**: `UserBlock` rows for this blocker, including the blocked user via `publicUserSelect`, ordered by `createdAt desc`, no pagination (small per-user list, same rationale as unpaginated comments/reviews).

`reportSchema` (zod, mirrors `commentSchema`'s style): `reason` validated against the `ReportReason` enum; `details` optional, max 1000 chars, but required (non-empty) when `reason === "OTHER"` via `.refine()`.

`GET /users/:id` (`getUserById`) gains an `isBlocked: boolean` field: whether the viewer (`req.userId`, always present since `usersRouter` requires auth) has blocked this profile's owner — computed from a single `UserBlock` lookup where `blockerId = viewerId`. This drives the profile menu's Block/Unblock label.

### Mobile UI

**Entry point — `UserProfileScreen`**: this screen currently has no header at all; add a minimal one (back button + title + a new "..." action button, styled consistently with `SettingsScreen`'s header) whose action opens a new `UserSafetyMenu` component.

**`UserSafetyMenu.tsx`** (new): an anchored dropdown built directly on `ProfileMenu`'s existing pattern (Animated `Modal`, backdrop, menu-item rows) with two items — "Report User" and "Block User" / "Unblock User" (label driven by `user.isBlocked`).

**`ReportUserModal.tsx`** (new): opened from "Report User" — the 6 `ReportReason` values as a radio-style list, an optional (required-when-OTHER) details `TextInput`, and a Submit button, built on `ProfileMenu`'s existing confirm-sheet visual pattern.

**Block confirmation**: reuses `ProfileMenu`'s confirm-sheet pattern directly (title "Block this user?", explanatory subtitle, Cancel/Block buttons) — no new visual pattern, mirrors the logout flow exactly.

**`BlockedUsersScreen.tsx`** (new): a list (avatar, name, "Unblock" button per row) structurally mirroring `ConnectionRequestsScreen`'s list pattern. Reached from a new "Privacy & Safety" section in `SettingsScreen` (one row: "Blocked Users"), following the Appearance section's exact card/row pattern.

**New API hooks** in `mobile/src/api/safety.ts`: `useReportUser(userId)`, `useBlockUser(userId)`, `useUnblockUser(userId)`, `useBlockedUsers()` — same shape as this codebase's other mutation/query hooks (e.g. `useAddComment`, `useTripReviews`).

**Navigation**: `BlockedUsers` added to `AppStackParamList` and `AppNavigator.tsx`, same registration pattern as every other stack screen.

**Notifications integration**: one new `REPORT_RECEIVED` entry in `NotificationsScreen`'s existing type-to-copy/icon map (e.g. "Report received — Our team will review your report."), the same mechanism already used for `BUDDY_REQUEST`/`BUDDY_REQUEST_ACCEPTED`.

## Global Constraints

- No new npm dependencies (backend or mobile).
- Block enforcement lives entirely inside `buddies.service.ts` (`excludedUserIds`, `sendBuddyRequest`) — no changes to `JoinRequest`/trip-join flows.
- A block is idempotent (blocking twice is a no-op); unblocking never restores an auto-rejected `BuddyConnection`.
- Reports never notify the reported user — only the reporter receives a confirmation notification.
- `GET /users/:id` / `UserProfileScreen` remain fully viewable regardless of any block in either direction.
- `reason === "OTHER"` requires non-empty `details`; every other reason leaves `details` optional (max 1000 chars).
- No pagination on `GET /safety/blocked`.
- Follow the existing black-box smoke-test convention for backend verification.

## Testing Plan

Backend smoke test (new `backend/scripts/smoke-test-safety.mjs`) covering: (1) self-report and self-block both 400; (2) reporting/blocking a nonexistent user 404; (3) a report is created and the reporter receives a `REPORT_RECEIVED` notification, the reported user does not; (4) `OTHER` reason without `details` is rejected, with `details` succeeds; (5) blocking hides the blocked user from the blocker's `GET /buddies/matches` and vice versa, even when they were previously an ACCEPTED connection; (6) blocking auto-rejects a PENDING connection between the pair, and it no longer appears in the recipient's `GET /buddies/requests/pending`; (7) `sendBuddyRequest` (`POST /buddies/:userId/connect`) is rejected 403 between blocked users; (8) double-block is idempotent (no error, still exactly one `UserBlock` row); (9) unblock removes the user from `GET /safety/blocked` and clears `isBlocked` on `GET /users/:id`; (10) `GET /users/:id`'s `isBlocked` flag is correct in both directions (true only when the viewer is the blocker, not when the viewer is blocked by the other party).

Typecheck (`tsc --noEmit`) on both `backend` and `mobile`.
