# Post-Trip Ratings & Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let trip participants rate (1-5 stars) and optionally comment on a trip after it ends, with the average rating shown on `TripCard` and `TripDetailScreen`.

**Architecture:** A new `TripReview` model (composite `@@id([tripId, userId])`, mirroring `TripLike`/`TripBookmark`), denormalized `avgRating`/`reviewCount` fields on `Trip` recomputed transactionally on every review write, three new endpoints on the existing `tripsRouter`, and mobile UI added to `TripCard` (a small badge) and `TripDetailScreen` (a full Reviews section mirroring the existing Comments section).

**Tech Stack:** Express + Prisma (backend), Expo/React Native + TanStack Query (mobile). Backend testing follows this repo's only convention: a plain-Node black-box smoke-test script — no test framework.

**Spec:** [docs/superpowers/specs/2026-09-09-trip-reviews-design.md](../specs/2026-09-09-trip-reviews-design.md)

## Global Constraints

- No new npm dependencies (backend or mobile).
- `TripReview` uses a composite `@@id([tripId, userId])` — one review per user per trip, edited via upsert rather than creating duplicates.
- Trip owners cannot review their own trip; reviews open only once `trip.endDate` has passed and `trip.status !== "CANCELLED"`.
- `avgRating`/`reviewCount` are denormalized on `Trip` and must be recomputed transactionally on every review create/update/delete — never left stale.
- `avgRating` does NOT feed into `getTrendingTrips`'s `engagementScore` — out of scope for this pass.
- No pagination on `GET /trips/:id/reviews`, matching the existing unpaginated `listComments`.
- Rating validation: integer 1-5. Comment: optional, max 2000 chars (matches `commentSchema`'s existing limit).

---

### Task 1: Backend — schema, service, controller, routes, smoke test

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/modules/trips/trips.service.ts`
- Modify: `backend/src/modules/trips/trips.controller.ts`
- Modify: `backend/src/modules/trips/trips.routes.ts`
- Create: `backend/scripts/smoke-test-trip-reviews.mjs`

**Interfaces:**
- Consumes: `prisma` (`../../config/prisma`), `HttpError` (`../../middleware/error`), `Prisma` namespace (`@prisma/client`) — all already imported in `trips.service.ts`.
- Produces (for later tasks / mobile consumption — response shapes only, no mobile code in this task):
  - `GET /trips/:id/reviews` → `{ items: Array<{ tripId, userId, rating, comment, createdAt, updatedAt, user: { id, name, photoUrl } }>, avgRating: number | null, reviewCount: number, viewerCanReview: boolean, viewerReview: (same item shape) | null }`
  - `POST /trips/:id/reviews` → the upserted review row (same item shape), HTTP 201.
  - `DELETE /trips/:id/reviews` → `{ ok: true }`.
  - Every `Trip` object returned by any existing endpoint now also carries `avgRating: number | null` and `reviewCount: number`.

- [ ] **Step 1: Add the `TripReview` model and `Trip` aggregate fields**

Open `backend/prisma/schema.prisma`. In the `Trip` model, add two fields right after `updatedAt` and a new relation line after `group Group?`:

```prisma
model Trip {
  id                 String     @id @default(cuid())
  ownerId            String
  owner              User       @relation("TripOwner", fields: [ownerId], references: [id])
  title              String
  destination        String
  startLocation      String
  startLat           Float?
  startLng           Float?
  destLat            Float?
  destLng            Float?
  startDate          DateTime
  endDate            DateTime
  travelMode         TravelMode
  budget             Float?
  seats              Int
  seatsFilled        Int        @default(0)
  description        String
  placesToVisit      String[]   @default([])
  groupSizeExpected  Int?
  images             String[]   @default([])
  notes              String?
  joinType           JoinType   @default(APPROVAL)
  status             TripStatus @default(OPEN)
  avgRating          Float?
  reviewCount        Int        @default(0)
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt

  joinRequests JoinRequest[]
  likes        TripLike[]
  bookmarks    TripBookmark[]
  comments     TripComment[]
  reviews      TripReview[]
  group        Group?

  @@index([destination])
  @@index([travelMode])
  @@index([status])
  @@index([startDate])
}
```

Add `tripReviews TripReview[]` to the `User` model, right after `tripComments TripComment[]`:

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
  tripReviews     TripReview[]
  groupMemberships GroupMember[]
  messages        Message[]
  notifications   Notification[]
  reactions       MessageReaction[]
  reads           MessageRead[]
}
```

Add a new `TripReview` model, right after `TripComment`:

```prisma
model TripReview {
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating    Int
  comment   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@id([tripId, userId])
}
```

- [ ] **Step 2: Generate and run the migration**

```bash
cd backend
npx prisma migrate dev --name add_trip_reviews
```

Expected: a new folder under `backend/prisma/migrations/` containing `add_trip_reviews`, and `Prisma Client` regenerated with no errors. If the CLI prompts about anything unexpected, stop and report — don't force it through.

- [ ] **Step 3: Add the eligibility check and aggregate-recompute helpers to `trips.service.ts`**

Open `backend/src/modules/trips/trips.service.ts`. Add this directly above `export async function addComment(...)` (i.e., right after `listComments`'s neighbor `addComment` — place it right before `addComment`, after the closing brace of `getBookmarkedTrips`):

```ts
const REVIEW_ELIGIBILITY_REASONS = {
  TRIP_NOT_ENDED: "You can review this trip once it has ended",
  OWNER_CANNOT_REVIEW: "Trip owners can't review their own trip",
  NOT_A_MEMBER: "Only trip participants can leave a review",
  TRIP_CANCELLED: "Cancelled trips can't be reviewed",
} as const;

async function canReviewTrip(
  tripId: string,
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.status === "CANCELLED") {
    return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.TRIP_CANCELLED };
  }
  if (trip.endDate.getTime() >= Date.now()) {
    return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.TRIP_NOT_ENDED };
  }
  if (trip.ownerId === userId) {
    return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.OWNER_CANNOT_REVIEW };
  }

  const group = await prisma.group.findUnique({ where: { tripId } });
  if (!group) return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.NOT_A_MEMBER };
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId } },
  });
  if (!membership) return { allowed: false, reason: REVIEW_ELIGIBILITY_REASONS.NOT_A_MEMBER };

  return { allowed: true };
}

async function recomputeTripRatingAggregate(tx: Prisma.TransactionClient, tripId: string) {
  const agg = await tx.tripReview.aggregate({
    where: { tripId },
    _avg: { rating: true },
    _count: true,
  });
  await tx.trip.update({
    where: { id: tripId },
    data: { avgRating: agg._avg.rating, reviewCount: agg._count },
  });
}
```

- [ ] **Step 4: Add `listReviews`, `submitReview`, `deleteReview` to `trips.service.ts`**

Add these three functions directly after `listComments` (at the end of the file):

```ts
const reviewInclude = { user: { select: { id: true, name: true, photoUrl: true } } } satisfies Prisma.TripReviewInclude;

export async function listReviews(tripId: string, viewerId?: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new HttpError(404, "Trip not found");

  const items = await prisma.tripReview.findMany({
    where: { tripId },
    include: reviewInclude,
    orderBy: { createdAt: "desc" },
  });

  let viewerCanReview = false;
  let viewerReview = null as (typeof items)[number] | null;
  if (viewerId) {
    viewerReview = items.find((r) => r.userId === viewerId) ?? null;
    if (!viewerReview) {
      const eligibility = await canReviewTrip(tripId, viewerId);
      viewerCanReview = eligibility.allowed;
    }
  }

  return {
    items,
    avgRating: trip.avgRating,
    reviewCount: trip.reviewCount,
    viewerCanReview,
    viewerReview,
  };
}

export async function submitReview(
  tripId: string,
  userId: string,
  input: { rating: number; comment?: string }
) {
  const eligibility = await canReviewTrip(tripId, userId);
  if (!eligibility.allowed) throw new HttpError(403, eligibility.reason!);

  return prisma.$transaction(async (tx) => {
    const row = await tx.tripReview.upsert({
      where: { tripId_userId: { tripId, userId } },
      update: { rating: input.rating, comment: input.comment ?? null },
      create: { tripId, userId, rating: input.rating, comment: input.comment ?? null },
      include: reviewInclude,
    });
    await recomputeTripRatingAggregate(tx, tripId);
    return row;
  });
}

export async function deleteReview(tripId: string, userId: string) {
  const existing = await prisma.tripReview.findUnique({ where: { tripId_userId: { tripId, userId } } });
  if (!existing) throw new HttpError(404, "You haven't reviewed this trip");

  await prisma.$transaction(async (tx) => {
    await tx.tripReview.delete({ where: { tripId_userId: { tripId, userId } } });
    await recomputeTripRatingAggregate(tx, tripId);
  });
}
```

- [ ] **Step 5: Add controller handlers to `trips.controller.ts`**

Open `backend/src/modules/trips/trips.controller.ts`. Add directly after `listComments`, before `uploadImages`:

```ts
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export async function listReviews(req: AuthedRequest, res: Response) {
  const result = await service.listReviews(req.params.id, req.userId);
  res.json(result);
}

export async function submitReview(req: AuthedRequest, res: Response) {
  const input = reviewSchema.parse(req.body);
  const review = await service.submitReview(req.params.id, req.userId!, input);
  res.status(201).json(review);
}

export async function deleteReview(req: AuthedRequest, res: Response) {
  await service.deleteReview(req.params.id, req.userId!);
  res.json({ ok: true });
}
```

- [ ] **Step 6: Register the routes in `trips.routes.ts`**

Open `backend/src/modules/trips/trips.routes.ts`. Add the GET route directly after the existing `/:id/comments` read route:

```ts
tripsRouter.get("/:id/comments", asyncHandler(controller.listComments));
tripsRouter.get("/:id/reviews", optionalAuth, asyncHandler(controller.listReviews));
```

Add the POST and DELETE routes directly after the existing `/:id/comments` write route, at the end of the file:

```ts
tripsRouter.post("/:id/comments", requireAuth, asyncHandler(controller.addComment));
tripsRouter.post("/:id/reviews", requireAuth, asyncHandler(controller.submitReview));
tripsRouter.delete("/:id/reviews", requireAuth, asyncHandler(controller.deleteReview));
```

- [ ] **Step 7: Write the smoke test**

Create `backend/scripts/smoke-test-trip-reviews.mjs`:

```js
// Black-box smoke test for Post-Trip Ratings & Reviews: GET/POST/DELETE
// /trips/:id/reviews. Follows the same conventions as scripts/smoke-test.mjs
// (plain fetch, no framework) - with one deliberate exception: the trip
// create/update APIs both correctly reject a past endDate (a real product
// rule, not a bug), so there's no way to get a trip into an "already ended"
// state through the HTTP API alone. This script uses Prisma directly for
// exactly that one setup step - backdating a trip's dates after creating it
// normally through the API - everything else here is a normal HTTP call.
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();
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

function futureDate(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

async function registerUser(label) {
  const email = `${label}-${rand()}@example.com`;
  return requestOk("POST", "/auth/register", { body: { email, password: "password123", name: label } });
}

async function createTrip(token, overrides = {}) {
  return requestOk("POST", "/trips", {
    token,
    body: {
      title: `Review Test Trip ${rand()}`,
      destination: "Coorg",
      startLocation: "Bengaluru",
      startDate: futureDate(5),
      endDate: futureDate(7),
      travelMode: "TREK",
      seats: 4,
      description: "Smoke-test trip for post-trip reviews",
      placesToVisit: [],
      images: [],
      joinType: "APPROVAL",
      ...overrides,
    },
  });
}

async function joinAndApprove(tripId, ownerToken, joinerToken) {
  const joinRequest = await requestOk("POST", `/join-requests/trips/${tripId}`, {
    token: joinerToken,
    body: { message: "Would love to join!" },
  });
  await requestOk("POST", `/join-requests/${joinRequest.id}/approve`, { token: ownerToken });
}

async function backdateTrip(tripId) {
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      startDate: new Date(Date.now() - 5 * 86400000),
      endDate: new Date(Date.now() - 3 * 86400000),
    },
  });
}

async function main() {
  console.log(`Smoke testing Trip Reviews against ${BASE}`);

  const owner = await registerUser("review-owner");
  const member1 = await registerUser("review-member1");
  const member2 = await registerUser("review-member2");
  const outsider = await registerUser("review-outsider");

  const trip = await createTrip(owner.token);
  await joinAndApprove(trip.id, owner.token, member1.token);
  await joinAndApprove(trip.id, owner.token, member2.token);

  // --- Reviews are rejected before the trip has ended ---
  const tooEarly = await request("POST", `/trips/${trip.id}/reviews`, {
    token: member1.token,
    body: { rating: 5 },
  });
  assert(tooEarly.status === 403, `reviewing before the trip ends should 403, got ${tooEarly.status}`);
  console.log("✓ reviews are rejected before the trip's endDate has passed");

  await backdateTrip(trip.id);

  // --- Owner cannot review their own trip ---
  const ownerAttempt = await request("POST", `/trips/${trip.id}/reviews`, {
    token: owner.token,
    body: { rating: 5 },
  });
  assert(ownerAttempt.status === 403, `owner reviewing their own trip should 403, got ${ownerAttempt.status}`);
  console.log("✓ the trip owner cannot review their own trip");

  // --- A non-member cannot review ---
  const outsiderAttempt = await request("POST", `/trips/${trip.id}/reviews`, {
    token: outsider.token,
    body: { rating: 1 },
  });
  assert(outsiderAttempt.status === 403, `a non-member reviewing should 403, got ${outsiderAttempt.status}`);
  console.log("✓ a non-member cannot review the trip");

  // --- A member can submit a review once the trip has ended ---
  const review1 = await requestOk("POST", `/trips/${trip.id}/reviews`, {
    token: member1.token,
    body: { rating: 4, comment: "Good trip!" },
  });
  assert(review1.rating === 4, "the submitted review should carry the rating back");
  console.log("✓ an eligible member can submit a review after the trip ends");

  // --- Re-submitting edits the existing review instead of duplicating it ---
  await requestOk("POST", `/trips/${trip.id}/reviews`, {
    token: member1.token,
    body: { rating: 5, comment: "Actually, even better than I thought!" },
  });
  const afterEdit = await requestOk("GET", `/trips/${trip.id}/reviews`, { token: member1.token });
  const member1Reviews = afterEdit.items.filter((r) => r.userId === member1.user.id);
  assert(member1Reviews.length === 1, "re-submitting a review should edit it in place, not create a duplicate");
  assert(member1Reviews[0].rating === 5, "the edited review should carry the new rating");
  console.log("✓ re-submitting a review edits it in place rather than creating a duplicate");

  // --- avgRating/reviewCount update correctly as reviews are added ---
  await requestOk("POST", `/trips/${trip.id}/reviews`, { token: member2.token, body: { rating: 3 } });
  const afterSecondReview = await requestOk("GET", `/trips/${trip.id}/reviews`, {});
  assert(afterSecondReview.reviewCount === 2, `reviewCount should be 2, got ${afterSecondReview.reviewCount}`);
  assert(
    afterSecondReview.avgRating === 4,
    `avgRating should average to 4 (5 and 3), got ${afterSecondReview.avgRating}`
  );
  console.log("✓ avgRating/reviewCount update correctly as reviews are added");

  // --- Deleting a review recomputes the aggregate ---
  await requestOk("DELETE", `/trips/${trip.id}/reviews`, { token: member1.token });
  const afterDelete = await requestOk("GET", `/trips/${trip.id}/reviews`, {});
  assert(afterDelete.reviewCount === 1, `reviewCount should drop to 1 after delete, got ${afterDelete.reviewCount}`);
  assert(
    afterDelete.avgRating === 3,
    `avgRating should revert to 3 (only member2's review left), got ${afterDelete.avgRating}`
  );
  console.log("✓ deleting a review recomputes avgRating/reviewCount");

  // --- Cancelled trips cannot be reviewed ---
  const trip2 = await createTrip(owner.token);
  await joinAndApprove(trip2.id, owner.token, member1.token);
  await requestOk("POST", `/trips/${trip2.id}/cancel`, { token: owner.token });
  const cancelledAttempt = await request("POST", `/trips/${trip2.id}/reviews`, {
    token: member1.token,
    body: { rating: 5 },
  });
  assert(cancelledAttempt.status === 403, `reviewing a cancelled trip should 403, got ${cancelledAttempt.status}`);
  console.log("✓ a cancelled trip cannot be reviewed");

  console.log("All Trip Reviews smoke tests passed.");
}

main()
  .catch((err) => {
    console.error("✗ smoke test failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 8: Run the smoke test against a live dev server**

In one terminal: `cd backend && npm run dev`
In another terminal: `cd backend && node scripts/smoke-test-trip-reviews.mjs`

Expected: all `✓` lines print in order, then `All Trip Reviews smoke tests passed.`, exit code 0.

- [ ] **Step 9: Typecheck and commit**

```bash
cd backend && npx tsc -p tsconfig.json --noEmit
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/modules/trips/trips.service.ts backend/src/modules/trips/trips.controller.ts backend/src/modules/trips/trips.routes.ts backend/scripts/smoke-test-trip-reviews.mjs
git commit -m "Add Post-Trip Ratings & Reviews backend (schema, service, endpoints, smoke test)"
```

---

### Task 2: Mobile — types, StarRating component, API hooks

**Files:**
- Modify: `mobile/src/types/index.ts`
- Create: `mobile/src/components/StarRating.tsx`
- Modify: `mobile/src/api/trips.ts`

**Interfaces:**
- Consumes: `Trip.avgRating`/`Trip.reviewCount` fields and the `GET/POST/DELETE /trips/:id/reviews` endpoints produced by Task 1.
- Produces: `TripReview` and `TripReviewsResponse` types; `StarRating({ rating, onChange?, readOnly?, size? })` component; `useTripReviews(tripId?)`, `useSubmitReview(tripId)`, `useDeleteReview(tripId)` hooks — all consumed by Tasks 3 and 4.

- [ ] **Step 1: Add `avgRating`/`reviewCount` to `Trip`, and the new review types**

Open `mobile/src/types/index.ts`. In the `Trip` interface, add two fields right after `_count`:

```ts
export interface Trip {
  id: string;
  ownerId: string;
  owner: TripOwnerSummary;
  title: string;
  destination: string;
  startLocation: string;
  startLat?: number | null;
  startLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  startDate: string;
  endDate: string;
  travelMode: TravelMode;
  budget?: number | null;
  seats: number;
  seatsFilled: number;
  description: string;
  placesToVisit: string[];
  groupSizeExpected?: number | null;
  images: string[];
  notes?: string | null;
  joinType: JoinType;
  status: TripStatus;
  createdAt: string;
  isLiked: boolean;
  isBookmarked: boolean;
  distanceKm?: number;
  _count: { likes: number; comments: number; joinRequests: number };
  avgRating: number | null;
  reviewCount: number;
}
```

Add these two new interfaces directly after `TripComment`:

```ts
export interface TripReview {
  tripId: string;
  userId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  user: TripOwnerSummary;
}

export interface TripReviewsResponse {
  items: TripReview[];
  avgRating: number | null;
  reviewCount: number;
  viewerCanReview: boolean;
  viewerReview: TripReview | null;
}
```

- [ ] **Step 2: Create the `StarRating` component**

Create `mobile/src/components/StarRating.tsx`:

```tsx
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export function StarRating({
  rating,
  onChange,
  readOnly = true,
  size = 16,
}: {
  rating: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {STAR_VALUES.map((value) => {
        const filled = value <= Math.round(rating);
        const icon = (
          <MaterialCommunityIcons
            name={filled ? "star" : "star-outline"}
            size={size}
            color={filled ? colors.warningText : colors.mutedLight}
          />
        );
        return readOnly ? (
          <View key={value}>{icon}</View>
        ) : (
          <TouchableOpacity
            key={value}
            onPress={() => onChange?.(value)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${value} star${value > 1 ? "s" : ""}`}
          >
            {icon}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 2 },
});
```

- [ ] **Step 3: Add the review hooks to `mobile/src/api/trips.ts`**

Open `mobile/src/api/trips.ts`. Change the type import line at the top to include the two new types:

```ts
import type { JoinType, Paginated, Trip, TripComment, TripReview, TripReviewsResponse, TravelMode } from "../types";
```

Add these three hooks directly after `useAddComment` (at the end of the file):

```ts
export function useTripReviews(tripId?: string) {
  return useQuery({
    queryKey: ["trips", tripId, "reviews"],
    queryFn: async () => (await apiClient.get<TripReviewsResponse>(`/trips/${tripId}/reviews`)).data,
    enabled: !!tripId,
  });
}

export function useSubmitReview(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rating: number; comment?: string }) =>
      (await apiClient.post<TripReview>(`/trips/${tripId}/reviews`, input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips", tripId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export function useDeleteReview(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.delete(`/trips/${tripId}/reviews`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips", tripId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}
```

(The broad `["trips"]` invalidation matches the existing `useCreateTrip`'s pattern — it's needed because `avgRating`/`reviewCount` changes affect the `TripCard` badge on every list screen, not just this one trip's detail view.)

- [ ] **Step 4: Typecheck and commit**

```bash
cd mobile && npx tsc --noEmit
git add mobile/src/types/index.ts mobile/src/components/StarRating.tsx mobile/src/api/trips.ts
git commit -m "Add StarRating component and trip review API hooks"
```

---

### Task 3: Mobile — TripCard star badge

**Files:**
- Modify: `mobile/src/components/TripCard.tsx`

**Interfaces:**
- Consumes: `Trip.avgRating`/`Trip.reviewCount` (Task 2).
- Produces: no new exports — visual change only.

- [ ] **Step 1: Add the star badge to the existing meta-icon row**

Open `mobile/src/components/TripCard.tsx`. Find this block:

```tsx
            <MaterialCommunityIcons name="hand-front-right" size={14} color={colors.muted} style={styles.metaIconSpacer} />
            <Text style={[styles.meta, { color: colors.muted }]}>{trip._count.joinRequests}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
```

Change it to:

```tsx
            <MaterialCommunityIcons name="hand-front-right" size={14} color={colors.muted} style={styles.metaIconSpacer} />
            <Text style={[styles.meta, { color: colors.muted }]}>{trip._count.joinRequests}</Text>
            {trip.reviewCount > 0 && (
              <>
                <MaterialCommunityIcons name="star" size={14} color={colors.warningText} style={styles.metaIconSpacer} />
                <Text style={[styles.meta, { color: colors.muted }]}>
                  {trip.avgRating!.toFixed(1)} ({trip.reviewCount})
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/TripCard.tsx
git commit -m "Show average rating badge on TripCard"
```

---

### Task 4: Mobile — TripDetailScreen Reviews section

**Files:**
- Modify: `mobile/src/screens/TripDetailScreen.tsx`

**Interfaces:**
- Consumes: `useTripReviews`, `useSubmitReview`, `useDeleteReview` (Task 2), `StarRating` (Task 2), `TripReview`/`TripReviewsResponse` types (Task 2), `Alert` (`../utils/alert`, already imported in this file).
- Produces: no new exports — screen-level UI change only.

- [ ] **Step 1: Add imports and hooks**

Open `mobile/src/screens/TripDetailScreen.tsx`. Change the `../api/trips` import:

```ts
import {
  useAddComment,
  useBookmarkTrip,
  useDeleteReview,
  useLikeTrip,
  useSubmitReview,
  useTrip,
  useTripComments,
  useTripReviews,
  useUpdateTripImages,
  useUploadTripImages,
} from "../api/trips";
```

Add this import directly after the `PrimaryButton` import:

```ts
import { StarRating } from "../components/StarRating";
```

Directly after this existing line:

```ts
  const { data: comments, refetch: refetchComments } = useTripComments(tripId);
```

add:

```ts
  const { data: reviewsData, refetch: refetchReviews } = useTripReviews(tripId);
```

Directly after this existing line:

```ts
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
```

add:

```ts
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [editingReview, setEditingReview] = useState(false);
```

Directly after this existing line:

```ts
  const addComment = useAddComment(tripId);
```

add:

```ts
  const submitReview = useSubmitReview(tripId);
  const deleteReview = useDeleteReview(tripId);
```

- [ ] **Step 2: Add the review handlers**

Directly after the existing `onSendComment` function:

```ts
  const onSendComment = () => {
    if (!commentText.trim() || isClosed) return;
    addComment.mutate(commentText.trim(), { onSuccess: () => setCommentText("") });
  };
```

add:

```ts
  const startEditingReview = () => {
    setReviewRating(reviewsData?.viewerReview?.rating ?? 0);
    setReviewComment(reviewsData?.viewerReview?.comment ?? "");
    setEditingReview(true);
  };

  const onSubmitReview = () => {
    if (reviewRating < 1) return;
    submitReview.mutate(
      { rating: reviewRating, comment: reviewComment.trim() || undefined },
      {
        onSuccess: () => {
          setEditingReview(false);
          setReviewRating(0);
          setReviewComment("");
        },
        onError: (err: any) => Alert.alert("Couldn't save review", err?.response?.data?.error ?? "Try again"),
      }
    );
  };

  const onDeleteReview = () => {
    Alert.alert("Delete your review?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteReview.mutate() },
    ]);
  };
```

Change `onRefresh` to also refetch reviews:

```ts
  const onRefresh = () => {
    refetchTrip();
    refetchComments();
    refetchReviews();
    refetchMyRequest();
    refetchGroup();
  };
```

- [ ] **Step 3: Add the Reviews section to the JSX**

Find this block (the end of the Comments section, immediately before the `pageInnerWeb` wrapper closes):

```tsx
          <View style={styles.commentInputRow}>
            <TextInput
              style={[styles.commentInput, isClosed && styles.commentInputDisabled]}
              placeholder={isClosed ? "Comments are closed for this trip" : "Add a comment..."}
              placeholderTextColor={colors.mutedLight}
              value={commentText}
              onChangeText={setCommentText}
              editable={!isClosed}
              multiline
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={onSendComment}
              disabled={!commentText.trim() || addComment.isPending || isClosed}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
            >
              {addComment.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <MaterialCommunityIcons name="send" size={18} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </ScrollView>
```

Change it to (adding the new Reviews section between the Comments section's closing `</View>` and the `pageInnerWeb` wrapper's closing `</View>`):

```tsx
          <View style={styles.commentInputRow}>
            <TextInput
              style={[styles.commentInput, isClosed && styles.commentInputDisabled]}
              placeholder={isClosed ? "Comments are closed for this trip" : "Add a comment..."}
              placeholderTextColor={colors.mutedLight}
              value={commentText}
              onChangeText={setCommentText}
              editable={!isClosed}
              multiline
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={onSendComment}
              disabled={!commentText.trim() || addComment.isPending || isClosed}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
            >
              {addComment.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <MaterialCommunityIcons name="send" size={18} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.blockHeaderRow}>
            <MaterialCommunityIcons name="star-outline" size={16} color={colors.ink} />
            <Text style={styles.blockTitle}>Reviews ({reviewsData?.reviewCount ?? 0})</Text>
            {reviewsData?.avgRating != null && (
              <StarRating rating={reviewsData.avgRating} readOnly size={14} />
            )}
          </View>

          {!reviewsData || reviewsData.items.length === 0 ? (
            <View style={styles.emptyComments}>
              <MaterialCommunityIcons name="star-outline" size={32} color={colors.mutedLight} />
              <Text style={styles.emptyCommentsText}>No reviews yet.</Text>
            </View>
          ) : (
            <View style={styles.commentsListContent}>
              {reviewsData.items.map((r) => (
                <View key={`${r.tripId}-${r.userId}`} style={styles.commentCard}>
                  {r.user.photoUrl ? (
                    <Image source={{ uri: optimizedImageUrl(r.user.photoUrl, 34) }} style={styles.commentAvatar} />
                  ) : (
                    <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder]}>
                      <Text style={styles.commentAvatarInitial}>{r.user.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.commentBody}>
                    <View style={styles.commentHeaderRow}>
                      <Text style={styles.commentAuthor}>{r.user.name}</Text>
                      <Text style={styles.commentTime}>{formatRelativeTime(r.createdAt)}</Text>
                    </View>
                    <StarRating rating={r.rating} readOnly size={13} />
                    {r.comment && <Text style={styles.commentText}>{r.comment}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {reviewsData?.viewerReview && !editingReview && (
            <View style={styles.reviewOwnCard}>
              <Text style={styles.reviewOwnLabel}>Your review</Text>
              <View style={styles.reviewOwnActions}>
                <TouchableOpacity onPress={startEditingReview}>
                  <Text style={styles.reviewActionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onDeleteReview}>
                  <Text style={[styles.reviewActionText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(editingReview || (reviewsData?.viewerCanReview && !reviewsData.viewerReview)) && (
            <View style={styles.reviewFormPanel}>
              <StarRating rating={reviewRating} onChange={setReviewRating} readOnly={false} size={22} />
              <TextInput
                style={styles.reviewCommentInput}
                placeholder="Add a comment (optional)"
                placeholderTextColor={colors.mutedLight}
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
              />
              <View style={styles.reviewFormActions}>
                {editingReview && (
                  <PrimaryButton
                    variant="outline"
                    style={styles.stickyFlex}
                    label="Cancel"
                    onPress={() => setEditingReview(false)}
                  />
                )}
                <PrimaryButton
                  style={styles.stickyFlex}
                  label="Submit review"
                  onPress={onSubmitReview}
                  disabled={reviewRating < 1 || submitReview.isPending}
                  loading={submitReview.isPending}
                />
              </View>
            </View>
          )}
        </View>
      </View>
      </ScrollView>
```

- [ ] **Step 4: Add the new styles**

Open the `createStyles` function in the same file. Add these keys directly after `sendButton` (the last key before the closing `});`):

```ts
  reviewOwnCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    padding: 12,
    borderRadius: RADIUS.field,
    backgroundColor: colors.fieldBg,
  },
  reviewOwnLabel: { fontSize: 13, fontWeight: "600", color: colors.ink },
  reviewOwnActions: { flexDirection: "row", gap: 16 },
  reviewActionText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  reviewFormPanel: { marginTop: 14, gap: 10 },
  reviewCommentInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: RADIUS.field,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    minHeight: 44,
    backgroundColor: colors.fieldBg,
  },
  reviewFormActions: { flexDirection: "row", gap: 10 },
```

- [ ] **Step 5: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/TripDetailScreen.tsx
git commit -m "Add Reviews section to TripDetailScreen"
```

---

## Post-implementation summary (for the final report to the user)

After all tasks are complete and verified, report back to the user covering:
- The new `TripReview` model, denormalized `Trip.avgRating`/`reviewCount` fields, and the three new endpoints (`GET/POST/DELETE /trips/:id/reviews`).
- Eligibility rules enforced server-side: trip must have ended, must not be cancelled, reviewer must be a group member and not the owner.
- Where the average rating is now visible: `TripCard` (badge, only when `reviewCount > 0`) and `TripDetailScreen` (full Reviews section with edit/delete for your own review).
- Confirmation that `avgRating` does not feed into trending/recommended scoring — display-only in this pass.
- A reminder to walk through the golden path manually on a device/simulator (per the project README's existing note that mobile UI isn't visually verified in this dev environment): finish a trip, leave a review, edit it, delete it, and confirm the badge appears/disappears on `TripCard`.
