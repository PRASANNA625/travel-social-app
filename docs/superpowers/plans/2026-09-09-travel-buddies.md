# Travel Buddies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users discover, view the profile of, and connect with other travelers based on real shared interests/modes/location/trip-history signals, via a new Discover section and a dedicated Travel Buddies page.

**Architecture:** A new `BuddyConnection` Prisma model + backend module mirrors the existing `JoinRequest` pattern exactly (request/accept/reject + notifications). A new matching endpoint follows the same in-memory candidate-pool-then-score pattern already used by Trending/Recommended trips. The frontend reuses `UserProfileScreen` unchanged for profile viewing and `publicUserSelect` for privacy; new UI is a person-card component, a 5th Discover section, and two new screens (Travel Buddies "See All", Connection Requests inbox).

**Tech Stack:** Express + Prisma (backend), Expo/React Native + React Query (mobile, shared with web via React Native Web). No new dependencies. Backend testing follows this repo's only convention: a plain-Node black-box smoke-test script (`backend/scripts/smoke-test-buddies.mjs`), matching `smoke-test.mjs`/`smoke-test-discover.mjs` exactly — no test framework.

**Spec:** [docs/superpowers/specs/2026-09-09-travel-buddies-design.md](../specs/2026-09-09-travel-buddies-design.md)

## Global Constraints

- One schema migration total (`BuddyConnection` model + two `User` relations) — no other schema changes.
- Every field surfaced anywhere in this feature must come from `publicUserSelect` (`backend/src/modules/users/users.service.ts`) — never add `email`/`phone`/`phoneVerified`/`passwordHash` to any select used by this feature.
- New backend routes live under `/buddies`, registered in `backend/src/app.ts` alongside the other routers.
- No new npm dependencies on either `backend` or `mobile`.
- Reuse `UserProfileScreen` unchanged for profile viewing — do not create a second profile screen.
- Reuse `travelModes` from `backend/src/modules/trips/trips.types.ts` — do not redefine the enum list.
- Follow the existing black-box smoke-test convention (plain ESM + `fetch`, homegrown `assert()` helper, run against a live dev server) for backend verification — no Jest/Vitest/supertest.

---

### Task 1: Backend — BuddyConnection schema, module, and smoke test

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/buddies/buddies.types.ts`
- Create: `backend/src/modules/buddies/buddies.service.ts`
- Create: `backend/src/modules/buddies/buddies.controller.ts`
- Create: `backend/src/modules/buddies/buddies.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/scripts/smoke-test-buddies.mjs`

**Interfaces:**
- Consumes: `prisma` (`../../config/prisma`), `HttpError` (`../../middleware/error`), `notify` (`../notifications/notify`), `parsePageParams`/`toSkipTake` (`../../utils/pagination`), `publicUserSelect` (`../users/users.service`, already exported), `travelModes` (`../trips/trips.types`, already exported), `requireAuth`/`AuthedRequest` (`../../middleware/auth`), `asyncHandler` (`../../utils/asyncHandler`).
- Produces: `GET /buddies/matches` → `{ items: BuddyMatchDTO[], total, page, pageSize }`; `GET /buddies/requests/pending` → `BuddyConnectionWithFromUser[]`; `POST /buddies/:userId/connect` → `BuddyConnection`; `POST /buddies/requests/:id/accept|reject` → `BuddyConnection`. `BuddyMatchDTO` shape: every `publicUserSelect` field plus `sharedInterests: string[]`, `sharedModesCount: number`, `locationMatch: boolean`, `compatibilityPercent: number | null`, `connectionState: "none"|"pending_sent"|"pending_received"|"connected"`, `connectionRequestId: string | null`. Task 2 consumes these exact shapes.

- [ ] **Step 1: Add the schema migration**

Open `backend/prisma/schema.prisma`. Add this enum anywhere near the other enums (e.g. directly above `model User {`, which starts at line 61):

```prisma
enum BuddyConnectionStatus {
  PENDING
  ACCEPTED
  REJECTED
}
```

Then add this model directly after the closing `}` of `model User` (after line 90):

```prisma
model BuddyConnection {
  id         String                @id @default(cuid())
  fromUserId String
  fromUser   User                  @relation("BuddyRequestsSent", fields: [fromUserId], references: [id])
  toUserId   String
  toUser     User                  @relation("BuddyRequestsReceived", fields: [toUserId], references: [id])
  status     BuddyConnectionStatus @default(PENDING)
  createdAt  DateTime              @default(now())
  updatedAt  DateTime              @updatedAt

  @@unique([fromUserId, toUserId])
  @@index([toUserId, status])
  @@index([fromUserId, status])
}
```

Then add these two lines to `model User`'s relation block (after the existing `reads MessageRead[]` line, which is line 89):

```prisma
  buddyRequestsSent     BuddyConnection[] @relation("BuddyRequestsSent")
  buddyRequestsReceived BuddyConnection[] @relation("BuddyRequestsReceived")
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && npx prisma migrate dev --name add_buddy_connections`
Expected: a new folder appears under `backend/prisma/migrations/` (e.g. `<timestamp>_add_buddy_connections`), the command prints "Your database is now in sync with your schema" and regenerates the Prisma client with no errors.

- [ ] **Step 3: Write `buddies.types.ts`**

Create `backend/src/modules/buddies/buddies.types.ts`:

```ts
import { z } from "zod";
import { travelModes } from "../trips/trips.types";

export const buddyFiltersSchema = z.object({
  search: z.string().optional(),
  interest: z.string().optional(),
  travelMode: z.enum(travelModes).optional(),
  location: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

export type BuddyFilters = z.infer<typeof buddyFiltersSchema>;
```

- [ ] **Step 4: Write `buddies.service.ts`**

Create `backend/src/modules/buddies/buddies.service.ts`:

```ts
import { prisma } from "../../config/prisma";
import { HttpError } from "../../middleware/error";
import { notify } from "../notifications/notify";
import { parsePageParams, toSkipTake } from "../../utils/pagination";
import { publicUserSelect } from "../users/users.service";
import type { BuddyFilters } from "./buddies.types";

const CANDIDATE_POOL_LIMIT = 150;

async function connectionStateMap(viewerId: string, candidateIds: string[]) {
  if (candidateIds.length === 0) return new Map<string, { state: string; requestId: string }>();

  const rows = await prisma.buddyConnection.findMany({
    where: {
      OR: [
        { fromUserId: viewerId, toUserId: { in: candidateIds } },
        { toUserId: viewerId, fromUserId: { in: candidateIds } },
      ],
    },
  });
  const map = new Map<string, { state: string; requestId: string }>();
  for (const row of rows) {
    const otherId = row.fromUserId === viewerId ? row.toUserId : row.fromUserId;
    if (row.status === "ACCEPTED") {
      map.set(otherId, { state: "connected", requestId: row.id });
    } else if (row.status === "PENDING") {
      map.set(otherId, {
        state: row.fromUserId === viewerId ? "pending_sent" : "pending_received",
        requestId: row.id,
      });
    }
    // REJECTED rows are intentionally not surfaced as a distinct card state -
    // a rejected candidate is excluded from the pool entirely (see excludedUserIds).
  }
  return map;
}

async function excludedUserIds(viewerId: string): Promise<Set<string>> {
  const rows = await prisma.buddyConnection.findMany({
    where: { OR: [{ fromUserId: viewerId }, { toUserId: viewerId }] },
    select: { fromUserId: true, toUserId: true },
  });
  const excluded = new Set<string>([viewerId]);
  for (const row of rows) {
    excluded.add(row.fromUserId === viewerId ? row.toUserId : row.fromUserId);
  }
  return excluded;
}

function overlapCount<T>(a: T[], b: T[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

async function tripSignals(userId: string): Promise<{ modes: Set<string>; destinations: Set<string> }> {
  const [owned, joined] = await Promise.all([
    prisma.trip.findMany({ where: { ownerId: userId }, select: { travelMode: true, destination: true } }),
    prisma.groupMember.findMany({
      where: { userId },
      select: { group: { select: { trip: { select: { travelMode: true, destination: true } } } } },
    }),
  ]);
  const trips = [...owned, ...joined.map((g) => g.group.trip)];
  return {
    modes: new Set(trips.map((t) => t.travelMode)),
    destinations: new Set(trips.map((t) => t.destination.toLowerCase())),
  };
}

export async function getBuddyMatches(viewerId: string, filters: BuddyFilters) {
  const pageParams = parsePageParams(filters as unknown as Record<string, unknown>, 10, 30);
  const { skip, take } = toSkipTake(pageParams);

  const viewer = await prisma.user.findUniqueOrThrow({
    where: { id: viewerId },
    select: { interests: true, preferredModes: true, location: true },
  });
  const viewerTripSignals = await tripSignals(viewerId);
  const excluded = await excludedUserIds(viewerId);

  const where: Parameters<typeof prisma.user.findMany>[0]["where"] = {
    id: { notIn: [...excluded] },
  };
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { bio: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.interest) where.interests = { has: filters.interest };
  if (filters.travelMode) where.preferredModes = { has: filters.travelMode };
  if (filters.location) where.location = { contains: filters.location, mode: "insensitive" };

  const candidates = await prisma.user.findMany({
    where,
    select: publicUserSelect,
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    take: CANDIDATE_POOL_LIMIT,
  });

  const scored = await Promise.all(
    candidates.map(async (c) => {
      const sharedInterests = viewer.interests.filter((i) => c.interests.includes(i));
      const sharedModesCount = overlapCount(viewer.preferredModes, c.preferredModes);
      const locationMatch =
        !!viewer.location &&
        !!c.location &&
        (viewer.location.toLowerCase().includes(c.location.toLowerCase()) ||
          c.location.toLowerCase().includes(viewer.location.toLowerCase()));
      const candidateTripSignals = await tripSignals(c.id);
      const sharedTripModes = overlapCount([...viewerTripSignals.modes], [...candidateTripSignals.modes]);
      const sharedDestinations = overlapCount(
        [...viewerTripSignals.destinations],
        [...candidateTripSignals.destinations]
      );

      const rawScore =
        sharedInterests.length * 15 +
        sharedModesCount * 10 +
        (locationMatch ? 15 : 0) +
        Math.min(sharedTripModes, 3) * 10 +
        Math.min(sharedDestinations, 3) * 10;

      const hasStrongSignal = sharedInterests.length > 0 || sharedModesCount > 0;

      return {
        ...c,
        sharedInterests,
        sharedModesCount,
        locationMatch,
        compatibilityPercent: hasStrongSignal ? Math.min(100, rawScore) : null,
        score: rawScore,
      };
    })
  );

  scored.sort((a, b) => b.score - a.score);
  const total = scored.length;
  const pageItems = scored.slice(skip, skip + take).map(({ score, ...rest }) => rest);

  const stateMap = await connectionStateMap(
    viewerId,
    pageItems.map((c) => c.id)
  );
  const items = pageItems.map((c) => ({
    ...c,
    connectionState: (stateMap.get(c.id)?.state ?? "none") as "none" | "pending_sent" | "pending_received" | "connected",
    connectionRequestId: stateMap.get(c.id)?.requestId ?? null,
  }));

  return { items, total, ...pageParams };
}

export async function sendBuddyRequest(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) throw new HttpError(400, "You can't connect with yourself");

  const existing = await prisma.buddyConnection.findFirst({
    where: {
      OR: [
        { fromUserId, toUserId },
        { fromUserId: toUserId, toUserId: fromUserId },
      ],
    },
  });
  if (existing) {
    if (existing.status === "ACCEPTED") throw new HttpError(409, "You're already connected");
    if (existing.status === "PENDING") throw new HttpError(409, "A request is already pending");
    throw new HttpError(409, "This connection was previously declined");
  }

  const request = await prisma.buddyConnection.create({ data: { fromUserId, toUserId } });
  await notify(toUserId, "BUDDY_REQUEST", { fromUserId, requestId: request.id });
  return request;
}

export async function respondToBuddyRequest(requestId: string, toUserId: string, accept: boolean) {
  const request = await prisma.buddyConnection.findUnique({ where: { id: requestId } });
  if (!request) throw new HttpError(404, "Request not found");
  if (request.toUserId !== toUserId) throw new HttpError(403, "You can't respond to this request");
  if (request.status !== "PENDING") throw new HttpError(400, "This request has already been handled");

  const updated = await prisma.buddyConnection.update({
    where: { id: requestId },
    data: { status: accept ? "ACCEPTED" : "REJECTED" },
  });

  if (accept) {
    await notify(request.fromUserId, "BUDDY_REQUEST_ACCEPTED", { toUserId });
  }
  return updated;
}

export async function myPendingBuddyRequests(userId: string) {
  return prisma.buddyConnection.findMany({
    where: { toUserId: userId, status: "PENDING" },
    include: { fromUser: { select: publicUserSelect } },
    orderBy: { createdAt: "desc" },
  });
}
```

- [ ] **Step 5: Write `buddies.controller.ts`**

Create `backend/src/modules/buddies/buddies.controller.ts`:

```ts
import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth";
import * as service from "./buddies.service";
import { buddyFiltersSchema } from "./buddies.types";

export async function matches(req: AuthedRequest, res: Response) {
  const filters = buddyFiltersSchema.parse(req.query);
  const result = await service.getBuddyMatches(req.userId!, filters);
  res.json(result);
}

export async function connect(req: AuthedRequest, res: Response) {
  const request = await service.sendBuddyRequest(req.userId!, req.params.userId);
  res.status(201).json(request);
}

export async function accept(req: AuthedRequest, res: Response) {
  const request = await service.respondToBuddyRequest(req.params.id, req.userId!, true);
  res.json(request);
}

export async function reject(req: AuthedRequest, res: Response) {
  const request = await service.respondToBuddyRequest(req.params.id, req.userId!, false);
  res.json(request);
}

export async function pending(req: AuthedRequest, res: Response) {
  const requests = await service.myPendingBuddyRequests(req.userId!);
  res.json(requests);
}
```

- [ ] **Step 6: Write `buddies.routes.ts`**

Create `backend/src/modules/buddies/buddies.routes.ts`:

```ts
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./buddies.controller";

export const buddiesRouter = Router();
buddiesRouter.use(requireAuth);

buddiesRouter.get("/matches", asyncHandler(controller.matches));
buddiesRouter.get("/requests/pending", asyncHandler(controller.pending));
buddiesRouter.post("/:userId/connect", asyncHandler(controller.connect));
buddiesRouter.post("/requests/:id/accept", asyncHandler(controller.accept));
buddiesRouter.post("/requests/:id/reject", asyncHandler(controller.reject));
```

- [ ] **Step 7: Register the router in `app.ts`**

Open `backend/src/app.ts`. Add the import alongside the other module imports (near `import { joinRequestsRouter } from "./modules/joinRequests/joinRequests.routes";`):

```ts
import { buddiesRouter } from "./modules/buddies/buddies.routes";
```

Add the registration alongside the other `app.use(...)` router calls (near `app.use("/join-requests", joinRequestsRouter);`):

```ts
app.use("/buddies", buddiesRouter);
```

- [ ] **Step 8: Write the smoke test**

Create `backend/scripts/smoke-test-buddies.mjs`:

```js
// Black-box smoke test for the Travel Buddies backend: matching, scoring,
// connection request/accept/reject, and duplicate/permission guards.
// Follows the same conventions as scripts/smoke-test.mjs (plain fetch, no framework).
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

async function registerUser(label, extra = {}) {
  const email = `${label}-${rand()}@example.com`;
  const user = await requestOk("POST", "/auth/register", { body: { email, password: "password123", name: label, ...extra } });
  return user;
}

async function main() {
  console.log(`Smoke testing Travel Buddies against ${BASE}`);

  // --- Matching: shared interests/modes should surface with a compatibility % ---
  const alice = await registerUser("alice-buddies");
  const bob = await registerUser("bob-buddies");

  await requestOk("PATCH", "/users/me", {
    token: alice.token,
    body: { interests: ["Trekking", "Photography"], preferredModes: ["TREK"], location: "Chennai" },
  });
  await requestOk("PATCH", "/users/me", {
    token: bob.token,
    body: { interests: ["Trekking", "Camping"], preferredModes: ["TREK"], location: "Chennai" },
  });

  const aliceMatches = await requestOk("GET", "/buddies/matches", { token: alice.token });
  assert(Array.isArray(aliceMatches.items), "matches.items should be an array");
  const bobMatch = aliceMatches.items.find((m) => m.id === bob.user.id);
  assert(!!bobMatch, "bob should appear in alice's matches given shared interests/modes/location");
  assert(typeof bobMatch.compatibilityPercent === "number", "bob's match should have a numeric compatibilityPercent given shared interests");
  assert(bobMatch.sharedInterests.includes("Trekking"), "sharedInterests should include the real overlap (Trekking)");
  assert(!("email" in bobMatch) && !("phone" in bobMatch), "matches must never expose email/phone");
  console.log("✓ matching surfaces a real compatibility % from shared interests/modes/location");

  // --- Zero-signal candidate: no percentage, text fallback only ---
  const stranger = await registerUser("stranger-buddies");
  const aliceMatches2 = await requestOk("GET", "/buddies/matches", { token: alice.token });
  const strangerMatch = aliceMatches2.items.find((m) => m.id === stranger.user.id);
  if (strangerMatch) {
    assert(strangerMatch.compatibilityPercent === null, "a candidate with zero shared interests/modes should have compatibilityPercent: null");
  }
  console.log("✓ zero-signal candidates get compatibilityPercent: null instead of a fabricated score");

  // --- Connect flow: send -> pending states on both sides -> accept -> connected both sides ---
  const sendResult = await request("POST", `/buddies/${bob.user.id}/connect`, { token: alice.token });
  assert(sendResult.status === 201, `connect should return 201, got ${sendResult.status}`);
  const requestId = sendResult.data.id;

  const aliceAfterSend = await requestOk("GET", "/buddies/matches", { token: alice.token });
  const bobFromAlice = aliceAfterSend.items.find((m) => m.id === bob.user.id);
  assert(!bobFromAlice, "bob should no longer appear as a fresh match once a request is pending (excluded from candidate pool)");

  const bobPending = await requestOk("GET", "/buddies/requests/pending", { token: bob.token });
  assert(bobPending.some((r) => r.id === requestId), "bob should see alice's request in pending");
  console.log("✓ sending a request removes the pair from each other's fresh match pool and shows up as pending for the recipient");

  // --- Duplicate request rejected ---
  const dup = await request("POST", `/buddies/${bob.user.id}/connect`, { token: alice.token });
  assert(dup.status === 409, `duplicate connect should return 409, got ${dup.status}`);
  console.log("✓ duplicate connection requests are rejected with 409");

  // --- Wrong-user accept rejected ---
  const wrongAccept = await request("POST", `/buddies/requests/${requestId}/accept`, { token: alice.token });
  assert(wrongAccept.status === 403, `accept by non-recipient should return 403, got ${wrongAccept.status}`);
  console.log("✓ only the request recipient can accept/reject");

  // --- Accept succeeds ---
  const accepted = await requestOk("POST", `/buddies/requests/${requestId}/accept`, { token: bob.token });
  assert(accepted.status === "ACCEPTED", "accepted request should have status ACCEPTED");
  console.log("✓ accepting a request updates its status");

  console.log("All Travel Buddies smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
```

Note: this test assumes `PATCH /users/me` accepts `interests`/`preferredModes`/`location` (confirmed — `ProfileUpdateInput` in `users.service.ts` already includes all three) and that `POST /auth/register` returns `{ token, user: { id, ... } }` (confirmed — this exact shape is already used by `backend/scripts/smoke-test.mjs` and `smoke-test-discover.mjs`).

- [ ] **Step 9: Run the smoke test against a live dev server**

In one terminal: `cd backend && npm run dev`
In another terminal: `cd backend && node scripts/smoke-test-buddies.mjs`

Expected: all `✓` lines print in order, then `All Travel Buddies smoke tests passed.`, exit code 0. If it fails, read the assertion message.

- [ ] **Step 10: Typecheck and commit**

```bash
cd backend && npx tsc -p tsconfig.json --noEmit
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/modules/buddies backend/src/app.ts backend/scripts/smoke-test-buddies.mjs
git commit -m "Add Travel Buddies backend: matching, connection requests"
```

---

### Task 2: Frontend types and `api/buddies.ts` hooks

**Files:**
- Modify: `mobile/src/types/index.ts`
- Create: `mobile/src/api/buddies.ts`

**Interfaces:**
- Consumes: `GET /buddies/matches`, `GET /buddies/requests/pending`, `POST /buddies/:userId/connect`, `POST /buddies/requests/:id/accept|reject` (Task 1); `apiClient` (`mobile/src/api/client.ts`, existing); `Paginated<T>`, `User`, `TravelMode` types (`mobile/src/types`, existing).
- Produces: `BuddyMatch`, `BuddyConnection`, `BuddyConnectionState` types; `useBuddyMatches(filters?)`, `usePendingBuddyRequests()`, `useSendBuddyRequest()`, `useRespondToBuddyRequest()` hooks. Tasks 3-6 consume these by name.

- [ ] **Step 1: Add the new types**

Open `mobile/src/types/index.ts`. Add after the existing `JoinRequest` interface (which ends around line 117, right before `export interface GroupMember`):

```ts
export type BuddyConnectionState = "none" | "pending_sent" | "pending_received" | "connected";

export interface BuddyMatch extends Omit<User, "email" | "phone" | "phoneVerified"> {
  sharedInterests: string[];
  sharedModesCount: number;
  locationMatch: boolean;
  compatibilityPercent: number | null;
  connectionState: BuddyConnectionState;
  connectionRequestId: string | null;
}

export interface BuddyConnection {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  fromUser?: User;
}
```

- [ ] **Step 2: Write `mobile/src/api/buddies.ts`**

Create `mobile/src/api/buddies.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { BuddyConnection, BuddyMatch, Paginated, TravelMode } from "../types";

export interface BuddyFilters {
  search?: string;
  interest?: string;
  travelMode?: TravelMode;
  location?: string;
  page?: number;
  pageSize?: number;
}

export function useBuddyMatches(filters: BuddyFilters = {}) {
  return useQuery({
    queryKey: ["buddies", "matches", filters],
    queryFn: async () => (await apiClient.get<Paginated<BuddyMatch>>("/buddies/matches", { params: filters })).data,
  });
}

export function usePendingBuddyRequests() {
  return useQuery({
    queryKey: ["buddies", "requests", "pending"],
    queryFn: async () => (await apiClient.get<BuddyConnection[]>("/buddies/requests/pending")).data,
  });
}

export function useSendBuddyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => (await apiClient.post<BuddyConnection>(`/buddies/${userId}/connect`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buddies"] }),
  });
}

export function useRespondToBuddyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) =>
      (await apiClient.post<BuddyConnection>(`/buddies/requests/${requestId}/${accept ? "accept" : "reject"}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buddies"] }),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/types/index.ts mobile/src/api/buddies.ts
git commit -m "Add Travel Buddies types and API hooks"
```

---

### Task 3: `BuddyCard` and `BuddyCardSkeleton` components

**Files:**
- Create: `mobile/src/components/BuddyCard.tsx`
- Create: `mobile/src/components/BuddyCardSkeleton.tsx`

**Interfaces:**
- Consumes: `BuddyMatch` type (Task 2); `TRAVEL_MODE_ICONS`/`travelModeText` (`../utils/travelModeIcons`, existing); `optimizedImageUrl` (`../utils/optimizedImage`, existing); `useTheme`/`Palette` (existing); `Skeleton` (`./theme/Skeleton`, existing).
- Produces: `BuddyCard({ buddy, onViewProfile, onConnect, onRespond }): JSX.Element`; `BuddyCardSkeleton(): JSX.Element`. Tasks 4-6 render these.

- [ ] **Step 1: Write `BuddyCard.tsx`**

Create `mobile/src/components/BuddyCard.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BuddyMatch } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";

const CONNECT_BUTTON_COPY: Record<BuddyMatch["connectionState"], { label: string; disabled: boolean }> = {
  none: { label: "Connect", disabled: false },
  pending_sent: { label: "Requested", disabled: true },
  pending_received: { label: "Respond", disabled: false },
  connected: { label: "Connected", disabled: true },
};

export function BuddyCard({
  buddy,
  onViewProfile,
  onConnect,
  onRespond,
}: {
  buddy: BuddyMatch;
  onViewProfile: () => void;
  onConnect: () => void;
  onRespond: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [imageFailed, setImageFailed] = useState(false);
  const buttonMeta = CONNECT_BUTTON_COPY[buddy.connectionState];
  const onButtonPress = buddy.connectionState === "pending_received" ? onRespond : onConnect;

  return (
    <TouchableOpacity style={styles.card} onPress={onViewProfile} activeOpacity={0.9}>
      {buddy.photoUrl && !imageFailed ? (
        <Image
          source={{ uri: optimizedImageUrl(buddy.photoUrl, 300) }}
          style={styles.avatar}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{buddy.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <Text style={styles.name} numberOfLines={1}>
        {buddy.name}
      </Text>
      {buddy.location && (
        <Text style={styles.meta} numberOfLines={1}>
          📍 {buddy.location}
        </Text>
      )}
      {buddy.bio && (
        <Text style={styles.bio} numberOfLines={2}>
          {buddy.bio}
        </Text>
      )}

      {(buddy.interests.length > 0 || buddy.preferredModes.length > 0) && (
        <View style={styles.chipRow}>
          {buddy.interests.slice(0, 2).map((interest) => (
            <View key={interest} style={styles.chip}>
              <Text style={styles.chipText}>{interest}</Text>
            </View>
          ))}
          {buddy.preferredModes.slice(0, 1).map((mode) => (
            <View key={mode} style={styles.chip}>
              <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[mode]} size={12} color={colors.primary} />
              <Text style={styles.chipText}>{travelModeText(mode)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.matchRow}>
        {buddy.compatibilityPercent !== null ? (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>{buddy.compatibilityPercent}% match</Text>
          </View>
        ) : (
          <Text style={styles.matchText}>
            {buddy.sharedInterests.length > 0
              ? `${buddy.sharedInterests.length} shared interest${buddy.sharedInterests.length === 1 ? "" : "s"}`
              : buddy.sharedModesCount > 0
                ? `${buddy.sharedModesCount} shared travel mode${buddy.sharedModesCount === 1 ? "" : "s"}`
                : "New to Triply"}
          </Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onViewProfile}>
          <Text style={styles.secondaryButtonText}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, buttonMeta.disabled && styles.primaryButtonDisabled]}
          onPress={onButtonPress}
          disabled={buttonMeta.disabled}
        >
          <Text style={styles.primaryButtonText}>{buttonMeta.label}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      width: 240,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 20,
      padding: 14,
      alignItems: "center",
      shadowColor: colors.ink,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontWeight: "700", fontSize: 24 },
    name: { fontSize: 15, fontWeight: "700", color: colors.ink },
    meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
    bio: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 6, lineHeight: 16 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.fieldBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    chipText: { fontSize: 11, color: colors.ink, fontWeight: "600" },
    matchRow: { marginTop: 10 },
    matchBadge: { backgroundColor: colors.successBg, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
    matchBadgeText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    matchText: { fontSize: 12, color: colors.mutedLight },
    actionsRow: { flexDirection: "row", gap: 8, marginTop: 12, width: "100%" },
    secondaryButton: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: RADIUS.field,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    secondaryButtonText: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
    primaryButton: { flex: 1, paddingVertical: 9, borderRadius: RADIUS.field, backgroundColor: colors.primary, alignItems: "center" },
    primaryButtonDisabled: { backgroundColor: colors.mutedLight },
    primaryButtonText: { fontSize: 12.5, fontWeight: "700", color: colors.white },
  });
}
```

- [ ] **Step 2: Write `BuddyCardSkeleton.tsx`**

Create `mobile/src/components/BuddyCardSkeleton.tsx`:

```tsx
import { StyleSheet, View } from "react-native";
import { Skeleton } from "./theme/Skeleton";
import { useTheme } from "../theme/ThemeContext";

// Mirrors BuddyCard's shape (avatar + name + meta + button row) so the
// loading state reads as "buddy cards are coming" instead of a blank row.
export function BuddyCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]}>
      <Skeleton style={styles.avatar} />
      <Skeleton style={styles.line} />
      <Skeleton style={styles.lineShort} />
      <View style={styles.actionsRow}>
        <Skeleton style={styles.action} />
        <Skeleton style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: 20, padding: 14, alignItems: "center" },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
  line: { height: 14, width: "60%", marginTop: 4 },
  lineShort: { height: 12, width: "40%", marginTop: 8 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  action: { flex: 1, height: 34, borderRadius: 10 },
});
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/BuddyCard.tsx mobile/src/components/BuddyCardSkeleton.tsx
git commit -m "Add BuddyCard and BuddyCardSkeleton components"
```

---

### Task 4: `DiscoverScreen` integration — 5th section

**Files:**
- Modify: `mobile/src/navigation/types.ts`
- Modify: `mobile/src/screens/DiscoverScreen.tsx`

**Interfaces:**
- Consumes: `useBuddyMatches`, `useSendBuddyRequest` (Task 2); `BuddyCard`, `BuddyCardSkeleton` (Task 3).
- Produces: `AppStackParamList.TravelBuddies: undefined` and `AppStackParamList.ConnectionRequests: undefined` route types (Tasks 5 and 6 register the actual screens against these types; both are added now since `DiscoverScreen` is the first place that navigates to either).

- [ ] **Step 1: Add the two new route types**

Open `mobile/src/navigation/types.ts`. Add two lines to `AppStackParamList` (after the existing `Settings: undefined;` line):

```ts
  TravelBuddies: undefined;
  ConnectionRequests: undefined;
```

- [ ] **Step 2: Add imports and hooks to `DiscoverScreen.tsx`**

Open `mobile/src/screens/DiscoverScreen.tsx`. Add to the import block (after `import { getUpcomingWeekendRange } from "../utils/weekendRange";`):

```ts
import { useBuddyMatches, useSendBuddyRequest } from "../api/buddies";
import { BuddyCard } from "../components/BuddyCard";
import { BuddyCardSkeleton } from "../components/BuddyCardSkeleton";
```

Inside the `DiscoverScreen` function, after the existing `const { data: weekendData, isLoading: weekendLoading } = useTrips(...)` block (ends around line 91), add:

```ts
const { data: buddyMatches, isLoading: buddiesLoading } = useBuddyMatches({ pageSize: 6 });
const sendBuddyRequest = useSendBuddyRequest();
```

- [ ] **Step 3: Render the 5th section**

Inside `ListHeaderComponent`'s JSX, directly after the existing `<DiscoverSection title="This Weekend" .../>` block (and before the `{isLoading && (...)}` main-list skeleton block), add:

```tsx
{(buddiesLoading || (buddyMatches?.items.length ?? 0) > 0) && (
  <View style={styles.section}>
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>👥 Travel Buddies</Text>
      <TouchableOpacity onPress={() => navigation.navigate("TravelBuddies")}>
        <Text style={styles.seeAllLink}>See All</Text>
      </TouchableOpacity>
    </View>
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.buddyRow}
      data={buddiesLoading ? [] : buddyMatches?.items}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        buddiesLoading ? (
          <View style={styles.buddyRow}>
            <BuddyCardSkeleton />
            <BuddyCardSkeleton />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <BuddyCard
          buddy={item}
          onViewProfile={() => navigation.navigate("UserProfile", { userId: item.id })}
          onConnect={() => sendBuddyRequest.mutate(item.id)}
          onRespond={() => navigation.navigate("ConnectionRequests")}
        />
      )}
    />
  </View>
)}
```

- [ ] **Step 4: Add the new styles**

Inside `createStyles(colors)`'s returned `StyleSheet.create({...})` object, add these entries (anywhere in the object, e.g. right after the existing `clearAllChipText` entry):

```ts
    section: { marginTop: 18 },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginHorizontal: 16,
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
    seeAllLink: { fontSize: 13, fontWeight: "700", color: colors.primary },
    buddyRow: { flexDirection: "row", paddingHorizontal: 16, gap: 12 },
```

(`flexDirection: "row"` is included explicitly on `buddyRow` from the start — the Personalized Discover feature had a bug where a horizontal row style without an explicit `flexDirection` stacked loading skeletons vertically; this avoids repeating that mistake.)

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors. (`navigation.navigate("TravelBuddies")` and `("ConnectionRequests")` will typecheck cleanly because of Step 1's route types, even though those screens aren't registered in `AppNavigator.tsx` yet — that happens in Tasks 5 and 6. Actually navigating to them before then would runtime-crash, so don't manually test this screen's new button yet; Task 5/6 close that gap.)

- [ ] **Step 6: Commit**

```bash
git add mobile/src/navigation/types.ts mobile/src/screens/DiscoverScreen.tsx
git commit -m "Add Travel Buddies section to DiscoverScreen"
```

---

### Task 5: `TravelBuddiesScreen` — the "See All" page

**Files:**
- Create: `mobile/src/screens/TravelBuddiesScreen.tsx`
- Modify: `mobile/src/navigation/AppNavigator.tsx`

**Interfaces:**
- Consumes: `useBuddyMatches`, `usePendingBuddyRequests`, `useSendBuddyRequest` (Task 2); `BuddyCard`, `BuddyCardSkeleton` (Task 3); `TravelBuddies` route type (Task 4); `TRAVEL_MODES`, `TRAVEL_MODE_ICONS`, `travelModeText`, `TravelMode` type (existing, same imports `DiscoverScreen.tsx` already uses).
- Produces: `TravelBuddiesScreen` registered against the `"TravelBuddies"` route. Nothing downstream consumes this screen directly (it's a navigation leaf), but Task 6 also touches `AppNavigator.tsx`, so both tasks change the same file in different, non-overlapping places (only the `Stack.Screen` list grows).

- [ ] **Step 1: Write `TravelBuddiesScreen.tsx`**

Create `mobile/src/screens/TravelBuddiesScreen.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useBuddyMatches, usePendingBuddyRequests, useSendBuddyRequest } from "../api/buddies";
import { BuddyCard } from "../components/BuddyCard";
import { BuddyCardSkeleton } from "../components/BuddyCardSkeleton";
import type { BuddyMatch, TravelMode } from "../types";
import { TRAVEL_MODES } from "../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = NativeStackScreenProps<AppStackParamList, "TravelBuddies">;
type SortMode = "best" | "newest";

export function TravelBuddiesScreen({ navigation }: Props) {
  const [search, setSearch] = useState("");
  const [interest, setInterest] = useState<string | undefined>(undefined);
  const [travelMode, setTravelMode] = useState<TravelMode | undefined>(undefined);
  const [location, setLocation] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<BuddyMatch[]>([]);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      interest,
      travelMode,
      location: location || undefined,
      page,
      pageSize: 12,
    }),
    [search, interest, travelMode, location, page]
  );

  const { data, isLoading, isFetching } = useBuddyMatches(filters);
  const { data: pendingRequests } = usePendingBuddyRequests();
  const sendBuddyRequest = useSendBuddyRequest();

  // Reset to page 1 and clear accumulated items whenever a filter changes.
  useEffect(() => {
    setPage(1);
    setAllItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, interest, travelMode, location]);

  useEffect(() => {
    if (!data) return;
    setAllItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
  }, [data, page]);

  const availableInterests = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((m) => m.interests.forEach((i) => set.add(i)));
    return Array.from(set).slice(0, 12);
  }, [allItems]);

  const displayedItems = useMemo(() => {
    if (sortMode === "newest") {
      return [...allItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return allItems;
  }, [allItems, sortMode]);

  const hasMore = data ? page * (filters.pageSize ?? 12) < data.total : false;

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.mutedLight} />
        <TextInput
          style={styles.search}
          placeholder="Search by name or bio..."
          placeholderTextColor={colors.mutedLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.mutedLight} />
        <TextInput
          style={styles.search}
          placeholder="Filter by location..."
          placeholderTextColor={colors.mutedLight}
          value={location}
          onChangeText={setLocation}
        />
      </View>

      {pendingRequests && pendingRequests.length > 0 && (
        <TouchableOpacity style={styles.requestsPill} onPress={() => navigation.navigate("ConnectionRequests")}>
          <MaterialCommunityIcons name="account-heart-outline" size={16} color={colors.primary} />
          <Text style={styles.requestsPillText}>Requests ({pendingRequests.length})</Text>
        </TouchableOpacity>
      )}

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
        data={["SORT" as const, ...TRAVEL_MODES, ...availableInterests]}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          if (item === "SORT") {
            return (
              <TouchableOpacity
                style={styles.chip}
                onPress={() => setSortMode((prev) => (prev === "best" ? "newest" : "best"))}
              >
                <MaterialCommunityIcons
                  name={sortMode === "best" ? "star-outline" : "clock-outline"}
                  size={15}
                  color={colors.ink}
                />
                <Text style={styles.chipText}>{sortMode === "best" ? "Best match" : "Newest"}</Text>
              </TouchableOpacity>
            );
          }
          if ((TRAVEL_MODES as readonly string[]).includes(item)) {
            const mode = item as TravelMode;
            const active = travelMode === mode;
            return (
              <TouchableOpacity
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setTravelMode(active ? undefined : mode)}
              >
                <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[mode]} size={15} color={active ? colors.white : colors.ink} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{travelModeText(mode)}</Text>
              </TouchableOpacity>
            );
          }
          const active = interest === item;
          return (
            <TouchableOpacity
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setInterest(active ? undefined : item)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {isLoading && page === 1 ? (
        <View style={styles.skeletonGrid}>
          <BuddyCardSkeleton />
          <BuddyCardSkeleton />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={displayedItems}
          keyExtractor={(item) => item.id}
          numColumns={1}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="account-search-outline" size={40} color={colors.mutedLight} />
              <Text style={styles.empty}>No travel buddies match yet — try widening your filters.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <BuddyCard
                buddy={item}
                onViewProfile={() => navigation.navigate("UserProfile", { userId: item.id })}
                onConnect={() => sendBuddyRequest.mutate(item.id)}
                onRespond={() => navigation.navigate("ConnectionRequests")}
              />
            </View>
          )}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={() => setPage((p) => p + 1)} disabled={isFetching}>
                <Text style={styles.loadMoreText}>{isFetching ? "Loading..." : "Load more"}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    search: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.ink },
    requestsPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: colors.successBg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    requestsPillText: { fontSize: 12.5, fontWeight: "700", color: colors.primary },
    filterRow: { minHeight: 46, marginTop: 12, flexGrow: 0 },
    filterRowContent: { paddingHorizontal: 16, paddingRight: 24, paddingVertical: 4, alignItems: "center", gap: 8 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      justifyContent: "center",
      minHeight: 38,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12.5, color: colors.ink, fontWeight: "500" },
    chipTextActive: { color: colors.white, fontWeight: "700" },
    skeletonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 16 },
    list: { padding: 16, paddingBottom: 40, alignItems: "center" },
    cardWrap: { marginBottom: 16 },
    emptyWrap: { alignItems: "center", marginTop: 48, gap: 10, paddingHorizontal: 32 },
    empty: { textAlign: "center", color: colors.mutedLight, fontSize: 13 },
    loadMoreButton: {
      alignSelf: "center",
      marginTop: 8,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loadMoreText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  });
}
```

- [ ] **Step 2: Register the screen in `AppNavigator.tsx`**

Open `mobile/src/navigation/AppNavigator.tsx`. Add the import (after `import { SettingsScreen } from "../screens/SettingsScreen";`):

```ts
import { TravelBuddiesScreen } from "../screens/TravelBuddiesScreen";
```

Add the registration (after the `Settings` screen entry, before the closing `</Stack.Navigator>`):

```tsx
<Stack.Screen name="TravelBuddies" component={TravelBuddiesScreen} options={{ title: "Travel Buddies" }} />
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/TravelBuddiesScreen.tsx mobile/src/navigation/AppNavigator.tsx
git commit -m "Add TravelBuddiesScreen with search, filters, and pagination"
```

---

### Task 6: `ConnectionRequestsScreen`, navigation, and notifications integration

**Files:**
- Create: `mobile/src/screens/ConnectionRequestsScreen.tsx`
- Modify: `mobile/src/navigation/AppNavigator.tsx`
- Modify: `mobile/src/screens/NotificationsScreen.tsx`

**Interfaces:**
- Consumes: `usePendingBuddyRequests`, `useRespondToBuddyRequest` (Task 2); `ConnectionRequests` route type (Task 4).
- Produces: `ConnectionRequestsScreen` registered against `"ConnectionRequests"` — the last piece; nothing downstream depends on this task.

- [ ] **Step 1: Write `ConnectionRequestsScreen.tsx`**

Create `mobile/src/screens/ConnectionRequestsScreen.tsx` (mirrors `JoinRequestsInboxScreen.tsx`'s structure, adapted for buddy requests — no per-item highlight/scroll-to since there's no equivalent `highlightRequestId` param for this screen):

```tsx
import { useMemo } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { usePendingBuddyRequests, useRespondToBuddyRequest } from "../api/buddies";
import type { BuddyConnection } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { RADIUS } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

type Props = NativeStackScreenProps<AppStackParamList, "ConnectionRequests">;

export function ConnectionRequestsScreen({ navigation }: Props) {
  const { data: requests, isLoading } = usePendingBuddyRequests();
  const respond = useRespondToBuddyRequest();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton style={styles.skeletonName} />
              <Skeleton style={styles.skeletonMeta} />
              <View style={styles.skeletonActionsRow}>
                <Skeleton style={styles.skeletonAction} />
                <Skeleton style={styles.skeletonAction} />
              </View>
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
        data={requests ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-heart-outline" size={40} color={colors.mutedLight} />
            <Text style={styles.empty}>No pending connection requests.</Text>
          </View>
        }
        renderItem={({ item }: { item: BuddyConnection }) => (
          <View style={styles.card}>
            <TouchableOpacity onPress={() => navigation.navigate("UserProfile", { userId: item.fromUserId })}>
              <Text style={styles.name}>{item.fromUser?.name}</Text>
            </TouchableOpacity>
            {item.fromUser?.location && <Text style={styles.meta}>📍 {item.fromUser.location}</Text>}
            {item.fromUser?.bio && <Text style={styles.meta}>{item.fromUser.bio}</Text>}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.accept]}
                onPress={() => respond.mutate({ requestId: item.id, accept: true })}
              >
                <Text style={styles.actionText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.reject]}
                onPress={() => respond.mutate({ requestId: item.id, accept: false })}
              >
                <Text style={styles.actionText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.field,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    name: { fontSize: 16, fontWeight: "700", color: colors.primary },
    meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
    actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    actionButton: { flex: 1, padding: 10, borderRadius: 8, alignItems: "center" },
    accept: { backgroundColor: colors.primary },
    reject: { backgroundColor: colors.danger },
    actionText: { color: colors.white, fontWeight: "700" },
    skeletonCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.field,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    skeletonName: { height: 16, width: "50%" },
    skeletonMeta: { height: 12, width: "70%" },
    skeletonActionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
    skeletonAction: { flex: 1, height: 38, borderRadius: 8 },
  });
}
```

- [ ] **Step 2: Register the screen in `AppNavigator.tsx`**

Open `mobile/src/navigation/AppNavigator.tsx`. Add the import (after the `TravelBuddiesScreen` import added in Task 5):

```ts
import { ConnectionRequestsScreen } from "../screens/ConnectionRequestsScreen";
```

Add the registration (after the `TravelBuddies` screen entry, before the closing `</Stack.Navigator>`):

```tsx
<Stack.Screen name="ConnectionRequests" component={ConnectionRequestsScreen} options={{ title: "Connection Requests" }} />
```

- [ ] **Step 3: Wire notifications**

Open `mobile/src/screens/NotificationsScreen.tsx`. Add two entries to `NOTIFICATION_COPY` (after the existing `TRIP_COMMENT` entry):

```ts
  BUDDY_REQUEST: () => `Someone wants to be travel buddies`,
  BUDDY_REQUEST_ACCEPTED: () => `Your travel buddy request was accepted`,
```

Add two entries to `notificationIconMap` (after the existing `TRIP_COMMENT` entry):

```ts
    BUDDY_REQUEST: { icon: "account-heart-outline", bg: colors.fieldBg, color: colors.primary },
    BUDDY_REQUEST_ACCEPTED: { icon: "check-circle", bg: colors.successBg, color: colors.primary },
```

Add a case to `onPressNotification`'s `switch` statement (after the existing `case "TRIP_COMMENT":` block's closing `break;`):

```ts
      case "BUDDY_REQUEST": {
        navigation.navigate("ConnectionRequests");
        break;
      }
      case "BUDDY_REQUEST_ACCEPTED": {
        const { toUserId } = payload;
        if (typeof toUserId === "string") {
          navigation.navigate("UserProfile", { userId: toUserId });
        }
        break;
      }
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no new errors.

- [ ] **Step 5: Manual validation — mobile (Expo Go / dev client)**

The full feature is now wired end-to-end. Start the app (`cd mobile && npx expo start`) with the backend running (`cd backend && npm run dev`), and using two separate accounts (register a second test user if needed), walk through:
1. Login as user A → Discover → verify the "👥 Travel Buddies" section appears (skeleton then real cards, or hidden entirely if there are truly no candidates) with at most 6 cards.
2. Verify a card with real overlapping data (set matching `interests`/`preferredModes` on both test accounts via Edit Profile first, if needed) shows a `%` badge; verify a card with no overlap shows "N shared interests" text instead, never a `0%` or a fabricated number.
3. Tap **View Profile** on a card → `UserProfileScreen` opens with the correct user's data.
4. Back → tap **Connect** → button becomes **Requested**.
5. Log in as user B (the target) → Notifications → verify a "Someone wants to be travel buddies" entry appears → tap it → `ConnectionRequestsScreen` opens → verify the request from user A is listed → tap **Accept**.
6. Log back in as user A → verify the notification "Your travel buddy request was accepted" appears and tapping it opens user B's profile; verify user A's Discover Travel Buddies section (or the See All page) now shows user B as **Connected**, not in a fresh candidate list.
7. From Discover, tap **See All** → `TravelBuddiesScreen` opens → verify search, the travel-mode filter chips, and the "Best match"/"Newest" sort toggle all narrow/reorder the list correctly → tap **Load more** if more than one page of candidates exists → verify no duplicate cards appear.
8. Verify a user with an empty profile (no interests, no modes, no location, no bio — a freshly registered account with nothing filled in) still renders a valid, non-broken `BuddyCard` (initials avatar, "New to Triply" text, no blank/undefined text anywhere).
9. Spot-check the existing Discover sections/filters, `ProfileScreen`, Notifications' other types, Group Chat, and login/logout are all unaffected.

- [ ] **Step 6: Manual validation — web**

Run `cd mobile && npx expo start --web`, repeat steps 1-4 and 7-8 above in a browser window, and additionally resize to a narrow (mobile-width) viewport to confirm the Travel Buddies horizontal row and the `TravelBuddiesScreen` filter row both still scroll smoothly.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/ConnectionRequestsScreen.tsx mobile/src/navigation/AppNavigator.tsx mobile/src/screens/NotificationsScreen.tsx
git commit -m "Add ConnectionRequestsScreen and wire buddy-request notifications"
```

---

## Post-implementation summary (for the final report to the user)

After all 6 tasks are complete and verified, report back to the user covering exactly what the spec's "Final validation" section asked for:
- What existing data was used for matching (`User.interests`, `User.preferredModes`, `User.location` text match, and upcoming-trip `travelMode`/`destination` patterns derived from `Trip`/`GroupMember`).
- Which files/components changed (list the Files sections from all 6 tasks).
- How the connection system works (request → pending → accept/reject, mirroring `JoinRequest`, with the "no re-request after rejection" rule).
- Confirmation that existing functionality (Discover's other 4 sections/filters, `UserProfileScreen`, Notifications' other types, Group Chat, auth) was not modified — only additive changes plus the one new Discover section.
- What currently has no percentage: any candidate with zero shared interests AND zero shared travel modes shows "N shared interests"/"N shared travel modes" text (or "New to Triply" if truly nothing overlaps) instead of a fabricated score.
- Prompt the user to run `cd backend && npx prisma migrate dev` on any other environment (their own local machine, if different from where this was implemented) before the feature will work there, since a schema migration is part of this change.
