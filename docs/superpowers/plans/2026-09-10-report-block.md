# Report & Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users report or block another user — a safety feature for a social app where strangers meet up in person.

**Architecture:** Two new Prisma models (`UserBlock`, `UserReport`) and a new backend `safety` module (mirroring `buddies`'s module shape). Block enforcement plugs directly into the existing `buddies.service.ts` machinery (`excludedUserIds`, `sendBuddyRequest`) rather than inventing new connection state. Mobile UI adds a profile-menu entry point built on `ProfileMenu.tsx`'s existing dropdown/confirm-sheet visual pattern, plus a "Blocked Users" management screen.

**Tech Stack:** Express + Prisma (backend), Expo/React Native + TanStack Query (mobile). Backend testing follows this repo's only convention: a plain-Node black-box smoke-test script — no test framework.

**Spec:** [docs/superpowers/specs/2026-09-10-report-block-design.md](../specs/2026-09-10-report-block-design.md)

## Global Constraints

- No new npm dependencies (backend or mobile).
- Block enforcement lives entirely inside `buddies.service.ts` (`excludedUserIds`, `sendBuddyRequest`) — no changes to `JoinRequest`/trip-join flows.
- A block is idempotent (blocking twice is a no-op); unblocking never restores an auto-rejected `BuddyConnection`.
- Reports never notify the reported user — only the reporter receives a confirmation notification.
- `GET /users/:id` / `UserProfileScreen` remain fully viewable regardless of any block in either direction.
- `reason === "OTHER"` requires non-empty `details`; every other reason leaves `details` optional (max 1000 chars).
- No pagination on `GET /safety/blocked`.

---

### Task 1: Backend — schema, safety module, buddies block-enforcement, isBlocked flag, smoke test

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/safety/safety.types.ts`
- Create: `backend/src/modules/safety/safety.service.ts`
- Create: `backend/src/modules/safety/safety.controller.ts`
- Create: `backend/src/modules/safety/safety.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/modules/buddies/buddies.service.ts`
- Modify: `backend/src/modules/users/users.service.ts`
- Modify: `backend/src/modules/users/users.controller.ts`
- Create: `backend/scripts/smoke-test-safety.mjs`

**Interfaces:**
- Consumes: `prisma` (`../../config/prisma`), `HttpError` (`../../middleware/error`), `notify` (`../notifications/notify`), `publicUserSelect` (`../users/users.service`, already exported) — all existing.
- Produces (for mobile tasks — response shapes only):
  - `POST /safety/users/:id/report` → the created report row, HTTP 201.
  - `POST /safety/users/:id/block` / `DELETE /safety/users/:id/block` → `{ ok: true }`.
  - `GET /safety/blocked` → `Array<PublicUser>` (each with all `publicUserSelect` fields).
  - `GET /users/:id` gains a new `isBlocked: boolean` field on its existing response.

- [ ] **Step 1: Add the schema changes**

Open `backend/prisma/schema.prisma`. Add this enum directly after the existing `enum MessageType { ... }` block:

```prisma
enum ReportReason {
  SPAM
  HARASSMENT
  FAKE_PROFILE
  INAPPROPRIATE_CONTENT
  SAFETY_CONCERN
  OTHER
}
```

In the `User` model, add these four relation lines directly after the existing `reads MessageRead[]` line:

```prisma
  blocksMade      UserBlock[]  @relation("BlocksMade")
  blocksReceived  UserBlock[]  @relation("BlocksReceived")
  reportsMade     UserReport[] @relation("ReportsMade")
  reportsReceived UserReport[] @relation("ReportsReceived")
```

Add these two new models directly after the existing `model Notification { ... }` block (at the end of the file):

```prisma
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

- [ ] **Step 2: Generate and run the migration**

```bash
cd backend
npx prisma migrate dev --name add_user_blocks_and_reports
```

Expected: a new folder under `backend/prisma/migrations/` and a regenerated Prisma Client, no errors. If the CLI prompts anything unexpected, stop and report — don't force it through.

- [ ] **Step 3: Create `safety.types.ts`**

Create `backend/src/modules/safety/safety.types.ts`:

```ts
import { z } from "zod";

export const reportReasons = [
  "SPAM",
  "HARASSMENT",
  "FAKE_PROFILE",
  "INAPPROPRIATE_CONTENT",
  "SAFETY_CONCERN",
  "OTHER",
] as const;

export const reportSchema = z
  .object({
    reason: z.enum(reportReasons),
    details: z.string().max(1000).optional(),
  })
  .refine((data) => data.reason !== "OTHER" || !!data.details?.trim(), {
    message: "Please provide details when selecting 'Other'",
    path: ["details"],
  });

export type ReportInput = z.infer<typeof reportSchema>;
export type ReportReason = (typeof reportReasons)[number];
```

- [ ] **Step 4: Create `safety.service.ts`**

Create `backend/src/modules/safety/safety.service.ts`:

```ts
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { notify } from "../notifications/notify";
import { publicUserSelect } from "../users/users.service";
import type { ReportReason } from "./safety.types";

async function assertUserExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "User not found");
}

export async function reportUser(reporterId: string, reportedId: string, reason: ReportReason, details?: string) {
  if (reporterId === reportedId) throw new HttpError(400, "You can't report yourself");
  await assertUserExists(reportedId);

  const report = await prisma.userReport.create({
    data: { reporterId, reportedId, reason, details: details ?? null },
  });
  await notify(reporterId, "REPORT_RECEIVED", { reportedUserId: reportedId, reason });
  return report;
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new HttpError(400, "You can't block yourself");
  await assertUserExists(blockedId);

  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  });

  await prisma.buddyConnection.updateMany({
    where: {
      status: "PENDING",
      OR: [
        { fromUserId: blockerId, toUserId: blockedId },
        { fromUserId: blockedId, toUserId: blockerId },
      ],
    },
    data: { status: "REJECTED" },
  });
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
}

export async function listBlockedUsers(blockerId: string) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId },
    include: { blocked: { select: publicUserSelect } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => r.blocked);
}
```

- [ ] **Step 5: Create `safety.controller.ts`**

Create `backend/src/modules/safety/safety.controller.ts`:

```ts
import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import * as service from "./safety.service";
import { reportSchema } from "./safety.types";

export async function report(req: AuthedRequest, res: Response) {
  const { reason, details } = reportSchema.parse(req.body);
  const result = await service.reportUser(req.userId!, req.params.id, reason, details);
  res.status(201).json(result);
}

export async function block(req: AuthedRequest, res: Response) {
  await service.blockUser(req.userId!, req.params.id);
  res.json({ ok: true });
}

export async function unblock(req: AuthedRequest, res: Response) {
  await service.unblockUser(req.userId!, req.params.id);
  res.json({ ok: true });
}

export async function blockedList(req: AuthedRequest, res: Response) {
  const users = await service.listBlockedUsers(req.userId!);
  res.json(users);
}
```

- [ ] **Step 6: Create `safety.routes.ts`**

Create `backend/src/modules/safety/safety.routes.ts`:

```ts
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./safety.controller";

export const safetyRouter = Router();
safetyRouter.use(requireAuth);

safetyRouter.get("/blocked", asyncHandler(controller.blockedList));
safetyRouter.post("/users/:id/report", asyncHandler(controller.report));
safetyRouter.post("/users/:id/block", asyncHandler(controller.block));
safetyRouter.delete("/users/:id/block", asyncHandler(controller.unblock));
```

- [ ] **Step 7: Register the router in `app.ts`**

Open `backend/src/app.ts`. Add this import directly after the existing `import { assistantRouter } from "./modules/assistant/assistant.routes";` line:

```ts
import { safetyRouter } from "./modules/safety/safety.routes";
```

Add this route registration directly after the existing `app.use("/assistant", assistantRouter);` line:

```ts
app.use("/safety", safetyRouter);
```

- [ ] **Step 8: Extend `excludedUserIds` in `buddies.service.ts` to exclude blocked users**

Open `backend/src/modules/buddies/buddies.service.ts`. Find this function:

```ts
async function excludedUserIds(viewerId: string): Promise<Set<string>> {
  const rows = await prisma.buddyConnection.findMany({
    where: { OR: [{ fromUserId: viewerId }, { toUserId: viewerId }] },
    select: { fromUserId: true, toUserId: true, status: true },
  });
  const excluded = new Set<string>([viewerId]);
  for (const row of rows) {
    // Only rejected connections are removed from the candidate pool - pending
    // and accepted connections must stay so connectionStateMap can surface
    // their real state (pending_sent/pending_received/connected) on the card.
    if (row.status !== "REJECTED") continue;
    excluded.add(row.fromUserId === viewerId ? row.toUserId : row.fromUserId);
  }
  return excluded;
}
```

Change it to:

```ts
async function excludedUserIds(viewerId: string): Promise<Set<string>> {
  const [rows, blocks] = await Promise.all([
    prisma.buddyConnection.findMany({
      where: { OR: [{ fromUserId: viewerId }, { toUserId: viewerId }] },
      select: { fromUserId: true, toUserId: true, status: true },
    }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  const excluded = new Set<string>([viewerId]);
  for (const row of rows) {
    // Only rejected connections are removed from the candidate pool - pending
    // and accepted connections must stay so connectionStateMap can surface
    // their real state (pending_sent/pending_received/connected) on the card.
    if (row.status !== "REJECTED") continue;
    excluded.add(row.fromUserId === viewerId ? row.toUserId : row.fromUserId);
  }
  for (const block of blocks) {
    // A block always excludes, regardless of connection state - this is the
    // one case that overrides "accepted connections stay visible" above,
    // since a blocked user must vanish even if you were already connected.
    excluded.add(block.blockerId === viewerId ? block.blockedId : block.blockerId);
  }
  return excluded;
}
```

- [ ] **Step 9: Add a block check to `sendBuddyRequest`**

In the same file, find this line at the top of `sendBuddyRequest`:

```ts
export async function sendBuddyRequest(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) throw new HttpError(400, "You can't connect with yourself");

  const existing = await prisma.buddyConnection.findFirst({
```

Change it to:

```ts
export async function sendBuddyRequest(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) throw new HttpError(400, "You can't connect with yourself");

  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: fromUserId, blockedId: toUserId },
        { blockerId: toUserId, blockedId: fromUserId },
      ],
    },
  });
  if (blocked) throw new HttpError(403, "You can't connect with this user");

  const existing = await prisma.buddyConnection.findFirst({
```

- [ ] **Step 10: Add `isBlocked` to `getUserById` in `users.service.ts`**

Open `backend/src/modules/users/users.service.ts`. Find:

```ts
export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) throw new HttpError(404, "User not found");
  return user;
}
```

Change it to:

```ts
export async function getUserById(id: string, viewerId?: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) throw new HttpError(404, "User not found");

  let isBlocked = false;
  if (viewerId) {
    const block = await prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: viewerId, blockedId: id } },
    });
    isBlocked = !!block;
  }

  return { ...user, isBlocked };
}
```

- [ ] **Step 11: Pass the viewer through in `users.controller.ts`**

Open `backend/src/modules/users/users.controller.ts`. Find:

```ts
export async function getById(req: AuthedRequest, res: Response) {
  const user = await service.getUserById(req.params.id);
  res.json(user);
}
```

Change it to:

```ts
export async function getById(req: AuthedRequest, res: Response) {
  const user = await service.getUserById(req.params.id, req.userId);
  res.json(user);
}
```

- [ ] **Step 12: Write the smoke test**

Create `backend/scripts/smoke-test-safety.mjs`:

```js
// Black-box smoke test for Report & Block: /safety/users/:id/report,
// /safety/users/:id/block, /safety/blocked, and their enforcement inside
// the Buddies matching/connection system. Follows the same conventions as
// scripts/smoke-test-buddies.mjs (plain fetch, no framework).
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const rand = () => Math.random().toString(36).slice(2, 8);

async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

async function registerUser(label) {
  const email = `${label}-${rand()}@example.com`;
  return requestOk("POST", "/auth/register", { body: { email, password: "password123", name: label } });
}

async function main() {
  console.log(`Smoke testing Report & Block against ${BASE}`);

  const alice = await registerUser("safety-alice");
  const bob = await registerUser("safety-bob");

  // --- Self-report and self-block are rejected ---
  const selfReport = await request("POST", `/safety/users/${alice.user.id}/report`, {
    token: alice.token,
    body: { reason: "SPAM" },
  });
  assert(selfReport.status === 400, `self-report should 400, got ${selfReport.status}`);
  const selfBlock = await request("POST", `/safety/users/${alice.user.id}/block`, { token: alice.token });
  assert(selfBlock.status === 400, `self-block should 400, got ${selfBlock.status}`);
  console.log("✓ self-report and self-block are rejected with 400");

  // --- Reporting/blocking a nonexistent user 404s ---
  const fakeUserId = `nonexistent-${rand()}`;
  const reportMissing = await request("POST", `/safety/users/${fakeUserId}/report`, {
    token: alice.token,
    body: { reason: "SPAM" },
  });
  assert(reportMissing.status === 404, `reporting a nonexistent user should 404, got ${reportMissing.status}`);
  const blockMissing = await request("POST", `/safety/users/${fakeUserId}/block`, { token: alice.token });
  assert(blockMissing.status === 404, `blocking a nonexistent user should 404, got ${blockMissing.status}`);
  console.log("✓ reporting/blocking a nonexistent user 404s");

  // --- OTHER reason requires details; other reasons don't ---
  const otherNoDetails = await request("POST", `/safety/users/${bob.user.id}/report`, {
    token: alice.token,
    body: { reason: "OTHER" },
  });
  assert(otherNoDetails.status === 400, `OTHER without details should 400, got ${otherNoDetails.status}`);
  const otherWithDetails = await request("POST", `/safety/users/${bob.user.id}/report`, {
    token: alice.token,
    body: { reason: "OTHER", details: "Something specific happened" },
  });
  assert(otherWithDetails.status === 201, `OTHER with details should succeed, got ${otherWithDetails.status}`);
  console.log("✓ OTHER reason requires non-empty details; other reasons don't");

  // --- A report notifies only the reporter, never the reported user ---
  const spamReport = await requestOk("POST", `/safety/users/${bob.user.id}/report`, {
    token: alice.token,
    body: { reason: "SPAM", details: "Sending unsolicited links" },
  });
  assert(spamReport.reason === "SPAM", "the created report should carry the submitted reason");
  const aliceNotifications = await requestOk("GET", "/notifications", { token: alice.token });
  assert(
    aliceNotifications.items.some((n) => n.type === "REPORT_RECEIVED"),
    "the reporter should receive a REPORT_RECEIVED notification"
  );
  const bobNotifications = await requestOk("GET", "/notifications", { token: bob.token });
  assert(
    !bobNotifications.items.some((n) => n.type === "REPORT_RECEIVED"),
    "the reported user must never be notified about a report against them"
  );
  console.log("✓ a report notifies only the reporter, never the reported user");

  // --- Blocking hides a (previously ACCEPTED) connection from both sides' matches ---
  const carol = await registerUser("safety-carol");
  const dave = await registerUser("safety-dave");
  await requestOk("PATCH", "/users/me", {
    token: carol.token,
    body: { interests: ["Diving"], preferredModes: ["WATER_ADVENTURE"] },
  });
  await requestOk("PATCH", "/users/me", {
    token: dave.token,
    body: { interests: ["Diving"], preferredModes: ["WATER_ADVENTURE"] },
  });

  const carolMatchesBefore = await requestOk("GET", "/buddies/matches", { token: carol.token });
  assert(
    carolMatchesBefore.items.some((m) => m.id === dave.user.id),
    "dave should appear in carol's matches given the shared interest/mode"
  );

  const connectReq = await requestOk("POST", `/buddies/${dave.user.id}/connect`, { token: carol.token });
  await requestOk("POST", `/buddies/requests/${connectReq.id}/accept`, { token: dave.token });

  const carolMatchesConnected = await requestOk("GET", "/buddies/matches", { token: carol.token });
  const daveAsConnected = carolMatchesConnected.items.find((m) => m.id === dave.user.id);
  assert(!!daveAsConnected && daveAsConnected.connectionState === "connected", "dave should show as connected before any block");

  await requestOk("POST", `/safety/users/${dave.user.id}/block`, { token: carol.token });

  const carolMatchesAfterBlock = await requestOk("GET", "/buddies/matches", { token: carol.token });
  assert(
    !carolMatchesAfterBlock.items.some((m) => m.id === dave.user.id),
    "dave should no longer appear in carol's matches after carol blocks him, even though they were connected"
  );
  const daveMatchesAfterBlock = await requestOk("GET", "/buddies/matches", { token: dave.token });
  assert(
    !daveMatchesAfterBlock.items.some((m) => m.id === carol.user.id),
    "carol should also disappear from dave's matches - blocking is mutually invisible"
  );
  console.log("✓ blocking hides a previously-connected pair from each other's matches");

  // --- Blocking auto-rejects a pending connection request ---
  const erin = await registerUser("safety-erin");
  const frank = await registerUser("safety-frank");
  const pendingReq = await requestOk("POST", `/buddies/${frank.user.id}/connect`, { token: erin.token });

  const frankPendingBefore = await requestOk("GET", "/buddies/requests/pending", { token: frank.token });
  assert(frankPendingBefore.some((r) => r.id === pendingReq.id), "frank should see erin's pending request before any block");

  await requestOk("POST", `/safety/users/${frank.user.id}/block`, { token: erin.token });

  const frankPendingAfter = await requestOk("GET", "/buddies/requests/pending", { token: frank.token });
  assert(
    !frankPendingAfter.some((r) => r.id === pendingReq.id),
    "the pending request should be auto-rejected (and no longer pending) once erin blocks frank"
  );
  console.log("✓ blocking auto-rejects a pending connection request between the pair");

  // --- Blocked users can't send a fresh connect request to each other ---
  const connectAttempt = await request("POST", `/buddies/${erin.user.id}/connect`, { token: frank.token });
  assert(connectAttempt.status === 403, `connecting between blocked users should 403, got ${connectAttempt.status}`);
  console.log("✓ sendBuddyRequest is rejected between blocked users");

  // --- Double-block is idempotent ---
  await requestOk("POST", `/safety/users/${frank.user.id}/block`, { token: erin.token });
  const erinBlockedList = await requestOk("GET", "/safety/blocked", { token: erin.token });
  assert(
    erinBlockedList.filter((u) => u.id === frank.user.id).length === 1,
    "blocking the same user twice should not create a duplicate blocked-list entry"
  );
  console.log("✓ double-block is idempotent");

  // --- Unblock removes the user from the list and clears isBlocked ---
  const frankProfileBlocked = await requestOk("GET", `/users/${frank.user.id}`, { token: erin.token });
  assert(frankProfileBlocked.isBlocked === true, "isBlocked should be true for the blocker's view of a blocked user");

  await requestOk("DELETE", `/safety/users/${frank.user.id}/block`, { token: erin.token });

  const erinBlockedListAfterUnblock = await requestOk("GET", "/safety/blocked", { token: erin.token });
  assert(
    !erinBlockedListAfterUnblock.some((u) => u.id === frank.user.id),
    "frank should no longer appear in erin's blocked list after unblocking"
  );
  const frankProfileUnblocked = await requestOk("GET", `/users/${frank.user.id}`, { token: erin.token });
  assert(frankProfileUnblocked.isBlocked === false, "isBlocked should be false after unblocking");
  console.log("✓ unblocking clears the block from the list and from isBlocked");

  // --- isBlocked only reflects the viewer's own block, not being blocked by the other party ---
  const frankViewOfErin = await requestOk("GET", `/users/${erin.user.id}`, { token: frank.token });
  assert(
    frankViewOfErin.isBlocked === false,
    "isBlocked should be false when the viewer is the one who WAS blocked, not the blocker"
  );
  console.log("✓ isBlocked reflects only the viewer's own block, not the reverse direction");

  console.log("All Report & Block smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
```

- [ ] **Step 13: Run the smoke test against a live dev server**

In one terminal: `cd backend && npm run dev`
In another terminal: `cd backend && node scripts/smoke-test-safety.mjs`

Expected: all `✓` lines print in order, then `All Report & Block smoke tests passed.`, exit code 0. Also re-run `node scripts/smoke-test-buddies.mjs` against the same server to confirm the `excludedUserIds`/`sendBuddyRequest` changes didn't break any existing Buddies behavior.

- [ ] **Step 14: Typecheck and commit**

```bash
cd backend && npx tsc -p tsconfig.json --noEmit
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/modules/safety backend/src/app.ts backend/src/modules/buddies/buddies.service.ts backend/src/modules/users/users.service.ts backend/src/modules/users/users.controller.ts backend/scripts/smoke-test-safety.mjs
git commit -m "Add Report & Block backend (schema, safety module, buddies enforcement, smoke test)"
```

---

### Task 2: Mobile — types and API hooks

**Files:**
- Modify: `mobile/src/types/index.ts`
- Create: `mobile/src/api/safety.ts`

**Interfaces:**
- Consumes: the `/safety/*` endpoints and `User.isBlocked` produced by Task 1.
- Produces: `ReportReason` type; `User.isBlocked?: boolean`; `useReportUser(userId)`, `useBlockUser(userId)`, `useUnblockUser(userId)`, `useBlockedUsers()` hooks — consumed by Tasks 3-5.

- [ ] **Step 1: Add `isBlocked` to `User` and export `ReportReason`**

Open `mobile/src/types/index.ts`. In the `User` interface, add one field directly after `createdAt: string;`:

```ts
export interface User {
  id: string;
  name: string;
  photoUrl?: string | null;
  coverPhotoUrl?: string | null;
  age?: number | null;
  location?: string | null;
  bio?: string | null;
  interests: string[];
  preferredModes: TravelMode[];
  email?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  createdAt: string;
  isBlocked?: boolean;
}
```

Add this type directly after the existing `export type BuddyConnectionState = ...` line:

```ts
export type ReportReason = "SPAM" | "HARASSMENT" | "FAKE_PROFILE" | "INAPPROPRIATE_CONTENT" | "SAFETY_CONCERN" | "OTHER";
```

- [ ] **Step 2: Create the safety API hooks**

Create `mobile/src/api/safety.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { ReportReason, User } from "../types";

export function useReportUser(userId: string) {
  return useMutation({
    mutationFn: async (input: { reason: ReportReason; details?: string }) =>
      (await apiClient.post(`/safety/users/${userId}/report`, input)).data,
  });
}

export function useBlockUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.post(`/safety/users/${userId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", userId] });
      queryClient.invalidateQueries({ queryKey: ["safety", "blocked"] });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
    },
  });
}

export function useUnblockUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.delete(`/safety/users/${userId}/block`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", userId] });
      queryClient.invalidateQueries({ queryKey: ["safety", "blocked"] });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
    },
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: ["safety", "blocked"],
    queryFn: async () => (await apiClient.get<User[]>("/safety/blocked")).data,
  });
}
```

(The `["buddies"]` invalidation matters because blocking/unblocking changes match visibility — Discover's Travel Buddies section and `TravelBuddiesScreen` both need to refetch.)

- [ ] **Step 3: Typecheck and commit**

```bash
cd mobile && npx tsc --noEmit
git add mobile/src/types/index.ts mobile/src/api/safety.ts
git commit -m "Add safety API hooks and isBlocked/ReportReason types"
```

---

### Task 3: Mobile — UserSafetyMenu and ReportUserModal components

**Files:**
- Create: `mobile/src/components/UserSafetyMenu.tsx`
- Create: `mobile/src/components/ReportUserModal.tsx`

**Interfaces:**
- Consumes: `RADIUS`/`SHADOW` (`../theme/tokens`), `useTheme` (`../theme/ThemeContext`), `Palette` (`../theme/palettes`), `ReportReason` (`../types`, from Task 2) — all existing.
- Produces:
  - `UserSafetyMenu({ visible, anchor, isBlocked, userName, onClose, onSelectReport, onConfirmBlock, onConfirmUnblock })` and the `UserSafetyMenuAnchor` type (`{x,y,width,height}`) — consumed by Task 4.
  - `ReportUserModal({ visible, userName, isSubmitting, onClose, onSubmit })` where `onSubmit: (input: { reason: ReportReason; details?: string }) => void` — consumed by Task 4.

- [ ] **Step 1: Create `UserSafetyMenu.tsx`**

This mirrors `mobile/src/components/ProfileMenu.tsx`'s exact visual pattern (Animated dropdown Modal + a confirm-sheet Modal for the destructive action), with different menu items and a different confirm action.

Create `mobile/src/components/UserSafetyMenu.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, SHADOW } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

export interface UserSafetyMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MENU_WIDTH = 190;
const SCREEN_MARGIN = 12;

export function UserSafetyMenu({
  visible,
  anchor,
  isBlocked,
  userName,
  onClose,
  onSelectReport,
  onConfirmBlock,
  onConfirmUnblock,
}: {
  visible: boolean;
  anchor: UserSafetyMenuAnchor | null;
  isBlocked: boolean;
  userName: string;
  onClose: () => void;
  onSelectReport: () => void;
  onConfirmBlock: () => void;
  onConfirmUnblock: () => void;
}) {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  }, [visible, progress]);

  if (!visible || !anchor) return null;

  const screenWidth = Dimensions.get("window").width;
  const right = Math.max(SCREEN_MARGIN, screenWidth - (anchor.x + anchor.width));
  const top = anchor.y + anchor.height + 8;

  const onSelectReportItem = () => {
    onClose();
    onSelectReport();
  };

  const onSelectBlockItem = () => {
    onClose();
    if (isBlocked) {
      onConfirmUnblock();
    } else {
      setConfirmVisible(true);
    }
  };

  const onConfirm = () => {
    setConfirmVisible(false);
    onConfirmBlock();
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Animated.View
            style={[
              styles.menu,
              {
                top,
                right,
                opacity: progress,
                transform: [
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                  { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
                ],
              },
            ]}
          >
            <Pressable style={styles.menuItem} onPress={onSelectReportItem}>
              <View style={styles.menuIconWrap}>
                <MaterialCommunityIcons name="flag-outline" size={17} color={colors.primary} />
              </View>
              <Text style={styles.menuItemText}>Report User</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={onSelectBlockItem}>
              <View style={[styles.menuIconWrap, styles.menuIconWrapDanger]}>
                <MaterialCommunityIcons
                  name={isBlocked ? "account-check-outline" : "account-cancel-outline"}
                  size={17}
                  color={colors.danger}
                />
              </View>
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                {isBlocked ? "Unblock User" : "Block User"}
              </Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.confirmSheet} onPress={() => {}}>
            <View style={[styles.menuIconWrap, styles.menuIconWrapDanger, styles.confirmIconWrap]}>
              <MaterialCommunityIcons name="account-cancel-outline" size={22} color={colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Block {userName}?</Text>
            <Text style={styles.confirmSubtitle}>
              They won't be able to send you buddy requests or appear in your matches, and you won't appear in theirs.
            </Text>
            <View style={styles.confirmButtonRow}>
              <Pressable style={styles.confirmCancelButton} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBlockButton} onPress={onConfirm}>
                <Text style={styles.confirmBlockText}>Block</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
    menu: {
      position: "absolute",
      width: MENU_WIDTH,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.field,
      paddingVertical: 6,
      ...SHADOW.card,
    },
    menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
    menuIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.successBg,
      alignItems: "center",
      justifyContent: "center",
    },
    menuIconWrapDanger: { backgroundColor: colors.dangerBg },
    menuItemText: { fontSize: 14, fontWeight: "600", color: colors.ink },
    menuItemTextDanger: { color: colors.danger },
    menuDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 10 },
    confirmSheet: {
      width: "82%",
      maxWidth: 340,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.card,
      padding: 22,
      alignItems: "center",
      ...SHADOW.card,
    },
    confirmIconWrap: { width: 48, height: 48, borderRadius: 24, marginBottom: 12 },
    confirmTitle: { fontSize: 17, fontWeight: "700", color: colors.ink, marginBottom: 6 },
    confirmSubtitle: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 19, marginBottom: 18 },
    confirmButtonRow: { flexDirection: "row", gap: 10, width: "100%" },
    confirmCancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.fieldBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmCancelText: { fontSize: 14, fontWeight: "700", color: colors.ink },
    confirmBlockButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.danger,
    },
    confirmBlockText: { fontSize: 14, fontWeight: "700", color: colors.white },
  });
}
```

- [ ] **Step 2: Create `ReportUserModal.tsx`**

Create `mobile/src/components/ReportUserModal.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, SHADOW } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import type { ReportReason } from "../types";

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam" },
  { value: "HARASSMENT", label: "Harassment or abuse" },
  { value: "FAKE_PROFILE", label: "Fake profile" },
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate content" },
  { value: "SAFETY_CONCERN", label: "Safety concern" },
  { value: "OTHER", label: "Other" },
];

export function ReportUserModal({
  visible,
  userName,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  userName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: { reason: ReportReason; details?: string }) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const requiresDetails = reason === "OTHER";
  const canSubmit = !!reason && (!requiresDetails || details.trim().length > 0);

  const onClosePress = () => {
    setReason(null);
    setDetails("");
    onClose();
  };

  const onSubmitPress = () => {
    if (!canSubmit || !reason) return;
    onSubmit({ reason, details: details.trim() || undefined });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClosePress}>
      <Pressable style={styles.backdrop} onPress={onClosePress}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="flag-outline" size={22} color={colors.danger} />
          </View>
          <Text style={styles.title}>Report {userName}</Text>
          <Text style={styles.subtitle}>Why are you reporting this user?</Text>

          <ScrollView style={styles.reasonList} nestedScrollEnabled>
            {REPORT_REASONS.map((r) => (
              <Pressable key={r.value} style={styles.reasonRow} onPress={() => setReason(r.value)}>
                <View style={[styles.radio, reason === r.value && styles.radioSelected]}>
                  {reason === r.value && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            style={styles.detailsInput}
            placeholder={requiresDetails ? "Please describe what happened (required)" : "Additional details (optional)"}
            placeholderTextColor={colors.mutedLight}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={1000}
          />

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onClosePress} disabled={isSubmitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={onSubmitPress}
              disabled={!canSubmit || isSubmitting}
            >
              <Text style={styles.submitText}>{isSubmitting ? "Submitting…" : "Submit Report"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
    sheet: {
      width: "88%",
      maxWidth: 380,
      maxHeight: "80%",
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.card,
      padding: 22,
      alignItems: "center",
      ...SHADOW.card,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.dangerBg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    title: { fontSize: 17, fontWeight: "700", color: colors.ink, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 14 },
    reasonList: { width: "100%", maxHeight: 220 },
    reasonRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, width: "100%" },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    radioSelected: { borderColor: colors.primary },
    radioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.primary },
    reasonLabel: { fontSize: 14, color: colors.ink },
    detailsInput: {
      width: "100%",
      minHeight: 60,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.field,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 13.5,
      color: colors.ink,
      backgroundColor: colors.fieldBg,
      marginTop: 12,
    },
    buttonRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 16 },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.fieldBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelText: { fontSize: 14, fontWeight: "700", color: colors.ink },
    submitButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.danger,
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitText: { fontSize: 14, fontWeight: "700", color: colors.white },
  });
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
cd mobile && npx tsc --noEmit
git add mobile/src/components/UserSafetyMenu.tsx mobile/src/components/ReportUserModal.tsx
git commit -m "Add UserSafetyMenu and ReportUserModal components"
```

---

### Task 4: Mobile — UserProfileScreen integration

**Files:**
- Modify: `mobile/src/screens/UserProfileScreen.tsx`

**Interfaces:**
- Consumes: `UserSafetyMenu`, `UserSafetyMenuAnchor`, `ReportUserModal` (Task 3); `useBlockUser`, `useUnblockUser`, `useReportUser` (Task 2); `useAuthStore` (`../store/authStore`, already used elsewhere e.g. `TripDetailScreen.tsx`); `Alert` (`../utils/alert`, already used elsewhere).
- Produces: no new exports — screen-level UI change only.

- [ ] **Step 1: Update imports**

Open `mobile/src/screens/UserProfileScreen.tsx`. Change:

```ts
import { useMemo } from "react";
import type { ComponentProps } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
```

to:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
```

Add these imports directly after the existing `import { optimizedImageUrl } from "../utils/optimizedImage";` line (the last import):

```ts
import { useAuthStore } from "../store/authStore";
import { useBlockUser, useReportUser, useUnblockUser } from "../api/safety";
import { UserSafetyMenu, type UserSafetyMenuAnchor } from "../components/UserSafetyMenu";
import { ReportUserModal } from "../components/ReportUserModal";
import { Alert } from "../utils/alert";
import type { ReportReason } from "../types";
```

- [ ] **Step 2: Add state and hooks before the early return**

Find:

```ts
export function UserProfileScreen({ route }: Props) {
  const { userId, groupRole } = route.params;
  const { data: user, isLoading } = useUser(userId);
  const { data: completedTrips } = useCompletedTrips(userId);
  const isWeb = Platform.OS === "web";
  const { width: windowWidth } = useWindowDimensions();
  const coverHeight = Math.min(Math.max(windowWidth / 2.2, 200), 280);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isLoading || !user) return <UserProfileSkeleton styles={styles} />;
```

Change it to:

```ts
export function UserProfileScreen({ route, navigation }: Props) {
  const { userId, groupRole } = route.params;
  const { data: user, isLoading } = useUser(userId);
  const { data: completedTrips } = useCompletedTrips(userId);
  const isWeb = Platform.OS === "web";
  const { width: windowWidth } = useWindowDimensions();
  const coverHeight = Math.min(Math.max(windowWidth / 2.2, 200), 280);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const me = useAuthStore((s) => s.user);
  const isSelf = me?.id === userId;
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<UserSafetyMenuAnchor | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const blockUser = useBlockUser(userId);
  const unblockUser = useUnblockUser(userId);
  const reportUser = useReportUser(userId);

  useEffect(() => {
    if (isSelf) {
      navigation.setOptions({ headerRight: undefined });
      return;
    }
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          ref={menuButtonRef}
          style={styles.headerMenuButton}
          onPress={() => {
            menuButtonRef.current?.measureInWindow((x, y, width, height) => {
              setMenuAnchor({ x, y, width, height });
              setMenuVisible(true);
            });
          }}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.ink} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isSelf, colors]);

  if (isLoading || !user) return <UserProfileSkeleton styles={styles} />;
```

- [ ] **Step 3: Add the block/report handlers**

Directly after the `if (isLoading || !user) return <UserProfileSkeleton styles={styles} />;` line, add:

```ts

  const onConfirmBlock = () => {
    blockUser.mutate(undefined, {
      onError: (err: any) => Alert.alert("Couldn't block user", err?.response?.data?.error ?? "Try again"),
    });
  };

  const onConfirmUnblock = () => {
    unblockUser.mutate(undefined, {
      onError: (err: any) => Alert.alert("Couldn't unblock user", err?.response?.data?.error ?? "Try again"),
    });
  };

  const onSubmitReport = (input: { reason: ReportReason; details?: string }) => {
    reportUser.mutate(input, {
      onSuccess: () => {
        setReportModalVisible(false);
        Alert.alert("Report submitted", "Thanks for letting us know. Our team will review it.");
      },
      onError: (err: any) => Alert.alert("Couldn't submit report", err?.response?.data?.error ?? "Try again"),
    });
  };
```

- [ ] **Step 4: Wrap the returned JSX and add the menu/modal**

Find the end of the component's `return (...)` (the very end of the `ScrollView`):

```tsx
        </View>
      </View>
    </ScrollView>
  );
}
```

Change it to:

```tsx
        </View>
      </View>
    </ScrollView>
      <UserSafetyMenu
        visible={menuVisible}
        anchor={menuAnchor}
        isBlocked={!!user.isBlocked}
        userName={user.name}
        onClose={() => setMenuVisible(false)}
        onSelectReport={() => setReportModalVisible(true)}
        onConfirmBlock={onConfirmBlock}
        onConfirmUnblock={onConfirmUnblock}
      />
      <ReportUserModal
        visible={reportModalVisible}
        userName={user.name}
        isSubmitting={reportUser.isPending}
        onClose={() => setReportModalVisible(false)}
        onSubmit={onSubmitReport}
      />
    </>
  );
}
```

Then find the start of the same `return`:

```tsx
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
```

Change it to:

```tsx
  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
```

(The `ScrollView` and its contents in between are unchanged — only the opening `<>` before it and the closing additions after it are new. Indentation inside the fragment doesn't need to be perfectly realigned for this to compile; fix it up for readability if you'd like, but it's not required.)

- [ ] **Step 5: Add the header button style**

Open the `createStyles` function in the same file. Add this key directly after the existing `skeletonMeta` key (the last one before the closing `});`):

```ts
  headerMenuButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
```

- [ ] **Step 6: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/UserProfileScreen.tsx
git commit -m "Add Report/Block menu to UserProfileScreen"
```

---

### Task 5: Mobile — BlockedUsersScreen, Settings integration, navigation

**Files:**
- Create: `mobile/src/screens/BlockedUsersScreen.tsx`
- Modify: `mobile/src/screens/SettingsScreen.tsx`
- Modify: `mobile/src/navigation/types.ts`
- Modify: `mobile/src/navigation/AppNavigator.tsx`

**Interfaces:**
- Consumes: `useBlockedUsers`, `useUnblockUser` (Task 2).
- Produces: `BlockedUsersScreen` component, registered as the `"BlockedUsers"` route — no other task depends on this.

- [ ] **Step 1: Create `BlockedUsersScreen.tsx`**

This mirrors `mobile/src/screens/ConnectionRequestsScreen.tsx`'s list pattern.

Create `mobile/src/screens/BlockedUsersScreen.tsx`:

```tsx
import { useMemo } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useBlockedUsers, useUnblockUser } from "../api/safety";
import type { User } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = NativeStackScreenProps<AppStackParamList, "BlockedUsers">;

function BlockedUserRow({ user, styles, colors }: { user: User; styles: ReturnType<typeof createStyles>; colors: Palette }) {
  const unblockUser = useUnblockUser(user.id);
  return (
    <View style={styles.card}>
      {user.photoUrl ? (
        <Image source={{ uri: optimizedImageUrl(user.photoUrl, 44) }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{user.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {user.name}
      </Text>
      <TouchableOpacity style={styles.unblockButton} onPress={() => unblockUser.mutate()} disabled={unblockUser.isPending}>
        <Text style={styles.unblockText}>{unblockUser.isPending ? "…" : "Unblock"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function BlockedUsersScreen(_props: Props) {
  const { data: blockedUsers, isLoading } = useBlockedUsers();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton style={styles.skeletonAvatar} />
              <Skeleton style={styles.skeletonName} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={blockedUsers ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-off-outline" size={40} color={colors.mutedLight} />
            <Text style={styles.empty}>You haven't blocked anyone.</Text>
          </View>
        }
        renderItem={({ item }) => <BlockedUserRow user={item} styles={styles} colors={colors} />}
      />
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.fieldBg },
    list: { padding: 12, gap: 12 },
    empty: { textAlign: "center", color: colors.mutedLight },
    emptyWrap: { alignItems: "center", gap: 10, marginTop: 60, paddingHorizontal: 32 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.field,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 16 },
    name: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
    unblockButton: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.dangerBg,
    },
    unblockText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
    skeletonCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.field,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skeletonAvatar: { width: 44, height: 44, borderRadius: 22 },
    skeletonName: { flex: 1, height: 16 },
  });
}
```

- [ ] **Step 2: Add the "Privacy & Safety" section to `SettingsScreen.tsx`**

Open `mobile/src/screens/SettingsScreen.tsx`. Add `TouchableOpacity` handling is already imported. Find:

```tsx
      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          {THEME_OPTIONS.map((option, index) => {
            const active = preference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.row, index < THEME_OPTIONS.length - 1 && styles.rowDivider]}
                onPress={() => setPreference(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <MaterialCommunityIcons name={option.icon} size={18} color={active ? colors.white : colors.muted} />
                </View>
                <Text style={styles.rowLabel}>{option.label}</Text>
                {active && <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
```

Change it to:

```tsx
      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          {THEME_OPTIONS.map((option, index) => {
            const active = preference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.row, index < THEME_OPTIONS.length - 1 && styles.rowDivider]}
                onPress={() => setPreference(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <MaterialCommunityIcons name={option.icon} size={18} color={active ? colors.white : colors.muted} />
                </View>
                <Text style={styles.rowLabel}>{option.label}</Text>
                {active && <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Privacy & Safety</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("BlockedUsers")}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="account-off-outline" size={18} color={colors.muted} />
            </View>
            <Text style={styles.rowLabel}>Blocked Users</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedLight} />
          </TouchableOpacity>
        </View>
      </View>
```

Add this style key directly after the existing `sectionTitle` key in `createStyles`:

```ts
    sectionTitleSpaced: { marginTop: 24 },
```

- [ ] **Step 3: Register the route**

Open `mobile/src/navigation/types.ts`. Add this line directly after the existing `ConnectionRequests: undefined;` line:

```ts
  BlockedUsers: undefined;
```

Open `mobile/src/navigation/AppNavigator.tsx`. Add this import directly after the existing `import { ConnectionRequestsScreen } from "../screens/ConnectionRequestsScreen";` line:

```ts
import { BlockedUsersScreen } from "../screens/BlockedUsersScreen";
```

Add this screen registration directly after the existing `<Stack.Screen name="ConnectionRequests" ... />` line:

```tsx
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ title: "Blocked Users" }} />
```

- [ ] **Step 4: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/BlockedUsersScreen.tsx mobile/src/screens/SettingsScreen.tsx mobile/src/navigation/types.ts mobile/src/navigation/AppNavigator.tsx
git commit -m "Add BlockedUsersScreen and Settings/navigation integration"
```

---

### Task 6: Mobile — NotificationsScreen integration

**Files:**
- Modify: `mobile/src/screens/NotificationsScreen.tsx`

**Interfaces:**
- Consumes: the `REPORT_RECEIVED` notification type created by Task 1's `reportUser`.
- Produces: no new exports — this just teaches the existing type-to-copy/icon maps about one more type.

- [ ] **Step 1: Add the copy entry**

Open `mobile/src/screens/NotificationsScreen.tsx`. Find:

```ts
const NOTIFICATION_COPY: Record<string, (payload: Record<string, unknown>) => string> = {
  NEW_JOIN_REQUEST: (p) => `Someone wants to join "${p.tripTitle}"`,
  JOIN_REQUEST_APPROVED: (p) => `You're in! Your request for "${p.tripTitle}" was approved`,
  JOIN_REQUEST_REJECTED: (p) => `Your request for "${p.tripTitle}" wasn't approved`,
  GROUP_MESSAGE: (p) => `${p.senderName} in "${p.tripTitle}": ${messagePreview(p)}`,
  MESSAGE_REACTION: (p) => `${p.reactorName} reacted ${p.emoji} to your message in "${p.tripTitle}": ${messagePreview(p)}`,
  TRIP_COMMENT: (p) => `${p.commenterName} commented on "${p.tripTitle}": ${messagePreview(p)}`,
  BUDDY_REQUEST: () => `Someone wants to be travel buddies`,
  BUDDY_REQUEST_ACCEPTED: () => `Your travel buddy request was accepted`,
};
```

Change it to:

```ts
const NOTIFICATION_COPY: Record<string, (payload: Record<string, unknown>) => string> = {
  NEW_JOIN_REQUEST: (p) => `Someone wants to join "${p.tripTitle}"`,
  JOIN_REQUEST_APPROVED: (p) => `You're in! Your request for "${p.tripTitle}" was approved`,
  JOIN_REQUEST_REJECTED: (p) => `Your request for "${p.tripTitle}" wasn't approved`,
  GROUP_MESSAGE: (p) => `${p.senderName} in "${p.tripTitle}": ${messagePreview(p)}`,
  MESSAGE_REACTION: (p) => `${p.reactorName} reacted ${p.emoji} to your message in "${p.tripTitle}": ${messagePreview(p)}`,
  TRIP_COMMENT: (p) => `${p.commenterName} commented on "${p.tripTitle}": ${messagePreview(p)}`,
  BUDDY_REQUEST: () => `Someone wants to be travel buddies`,
  BUDDY_REQUEST_ACCEPTED: () => `Your travel buddy request was accepted`,
  REPORT_RECEIVED: () => `Report received — our team will review it`,
};
```

- [ ] **Step 2: Add the icon entry**

Find:

```ts
function notificationIconMap(colors: Palette): Record<string, { icon: IconName; bg: string; color: string }> {
  return {
    NEW_JOIN_REQUEST: { icon: "account-multiple-plus", bg: colors.fieldBg, color: colors.primary },
    JOIN_REQUEST_APPROVED: { icon: "check-circle", bg: colors.successBg, color: colors.primary },
    JOIN_REQUEST_REJECTED: { icon: "close-circle-outline", bg: colors.dangerBg, color: colors.danger },
    GROUP_MESSAGE: { icon: "chat-processing-outline", bg: colors.successBg, color: colors.primary },
    MESSAGE_REACTION: { icon: "heart-outline", bg: colors.successBg, color: colors.primary },
    TRIP_COMMENT: { icon: "comment-text-outline", bg: colors.fieldBg, color: colors.primary },
    BUDDY_REQUEST: { icon: "account-heart-outline", bg: colors.fieldBg, color: colors.primary },
    BUDDY_REQUEST_ACCEPTED: { icon: "check-circle", bg: colors.successBg, color: colors.primary },
  };
}
```

Change it to:

```ts
function notificationIconMap(colors: Palette): Record<string, { icon: IconName; bg: string; color: string }> {
  return {
    NEW_JOIN_REQUEST: { icon: "account-multiple-plus", bg: colors.fieldBg, color: colors.primary },
    JOIN_REQUEST_APPROVED: { icon: "check-circle", bg: colors.successBg, color: colors.primary },
    JOIN_REQUEST_REJECTED: { icon: "close-circle-outline", bg: colors.dangerBg, color: colors.danger },
    GROUP_MESSAGE: { icon: "chat-processing-outline", bg: colors.successBg, color: colors.primary },
    MESSAGE_REACTION: { icon: "heart-outline", bg: colors.successBg, color: colors.primary },
    TRIP_COMMENT: { icon: "comment-text-outline", bg: colors.fieldBg, color: colors.primary },
    BUDDY_REQUEST: { icon: "account-heart-outline", bg: colors.fieldBg, color: colors.primary },
    BUDDY_REQUEST_ACCEPTED: { icon: "check-circle", bg: colors.successBg, color: colors.primary },
    REPORT_RECEIVED: { icon: "flag-outline", bg: colors.fieldBg, color: colors.primary },
  };
}
```

No change is needed to `onPressNotification`'s switch statement — tapping a `REPORT_RECEIVED` notification falls through to the existing `default: break;` case, which is the correct behavior (there's nothing to navigate to).

- [ ] **Step 3: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/NotificationsScreen.tsx
git commit -m "Add REPORT_RECEIVED notification copy and icon"
```

---

## Post-implementation summary (for the final report to the user)

After all tasks are complete and verified, report back to the user covering:
- The new `UserBlock`/`UserReport` models and the `/safety/*` endpoints (report, block, unblock, list blocked).
- How block enforcement reuses the existing Buddy matching/connection machinery (`excludedUserIds`, `sendBuddyRequest`) rather than inventing new state — and that it's scoped to Buddies only, not trip join requests.
- Where the feature surfaces in the mobile app: the "..." menu on `UserProfileScreen` (Report/Block), the "Blocked Users" screen under Settings, and the `REPORT_RECEIVED` notification.
- Confirmation that reports never notify the reported user — only the reporter gets a receipt.
- A reminder to walk through the golden path manually on a device/simulator (per the project README's existing note that mobile UI isn't visually verified in this dev environment): block someone, confirm they vanish from Discover/matches, unblock them, and submit a report.
