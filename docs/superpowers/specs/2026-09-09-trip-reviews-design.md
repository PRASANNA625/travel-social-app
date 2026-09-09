# Triply — Step 5: Post-Trip Ratings & Reviews — Design Spec

## Goal

Let trip participants rate and review a trip after it ends, giving future browsers of that trip a trust signal (average star rating) — one of the roadmap's explicitly deferred items ("Post-trip ratings & reviews").

## Scope

Trip-level reviews only (not participant-to-participant / travel-buddy reviews). A new `TripReview` model, three new endpoints on the existing `tripsRouter`, denormalized aggregate fields on `Trip`, and mobile UI on `TripDetailScreen` + a small badge on `TripCard`.

## Current State (for reference)

- `Trip.endDate` (`DateTime`, required) already exists on the schema.
- `GroupMember` (composite key `[groupId, userId]`) already tracks real participation — a trip's `Group` is created at trip-creation time and the owner is added immediately, with members added on join-request approval.
- `TripLike` / `TripBookmark` use a composite `@@id([tripId, userId])` for "one row per user per trip" — the pattern this feature's `TripReview` model reuses.
- `TripComment` (`id`, `tripId`, `userId`, `text`, `createdAt`) is the closest existing analog for a review's shape, and its controller validation (`commentSchema = z.object({ text: z.string().min(1).max(2000) })`) is the pattern the new review schema follows.
- `trips.routes.ts` registers reads (`GET /:id/comments`) above the `POST /` trip-creation route, and writes (`POST/DELETE /:id/like`, `POST/DELETE /:id/bookmark`, `POST /:id/comments`) below it — new review routes follow the same placement.
- Trending/recommended trips use an in-memory `engagementScore()` candidate-pool pattern (see `getTrendingTrips`) — reviews do **not** hook into this in this pass (see Global Constraints).

## Design

### Data model

```prisma
model TripReview {
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating    Int      // 1-5
  comment   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@id([tripId, userId])
}
```

Add to `Trip`: `avgRating Float?` and `reviewCount Int @default(0)`. Add the inverse relations (`reviews TripReview[]`) to `Trip` and `User`.

**Why denormalized aggregates instead of computing them live:** `TripCard` needs the average on list screens (Discover, My Trips) where many trips are returned per request. Computing a live aggregate per trip in those queries would add per-row cost to exactly the screens already identified as latency-sensitive in an earlier performance pass. Denormalizing means every existing list query — which already just selects `Trip` columns — needs zero changes; only the review write path (low-frequency relative to reads) pays the aggregate-recompute cost.

### API

New routes on the existing `tripsRouter`, following its established read-endpoints-above-create, write-endpoints-below-create ordering:

```
GET    /trips/:id/reviews   (optionalAuth — like GET /:id/comments)
POST   /trips/:id/reviews   (requireAuth — create or edit own review, upsert)
DELETE /trips/:id/reviews   (requireAuth — remove own review)
```

**`GET /trips/:id/reviews`** returns:
```ts
{
  items: Array<{ tripId, userId, rating, comment, createdAt, updatedAt, user: { id, name, photoUrl } }>,
  avgRating: number | null,
  reviewCount: number,
  viewerCanReview: boolean,      // false (and no reason exposed) if unauthenticated
  viewerReview: TripReviewItem | null,
}
```
Bundling eligibility and the viewer's own review into the list response avoids a second round-trip from `TripDetailScreen`, which already needs all of this at once (mirrors how the existing trip-detail fetch already bundles `isLiked`/`isBookmarked` flags for the viewer).

**Eligibility** (`canReviewTrip(tripId, userId)` in `trips.service.ts`, shared by the POST handler and by `viewerCanReview` in GET):
- `trip.endDate` must be in the past.
- `trip.status` must not be `CANCELLED`.
- `userId` must not equal `trip.ownerId`.
- `userId` must be a `GroupMember` of the trip's `Group`.

**`POST /trips/:id/reviews`** — body `{ rating: 1-5, comment?: string }`, validated by `reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(2000).optional() })` (mirrors `commentSchema`'s style exactly):
1. Run `canReviewTrip`; throw `HttpError(403, <specific reason>)` if not eligible.
2. In one `prisma.$transaction`: `upsert` the `TripReview` row (create if none exists for this `[tripId, userId]`, otherwise update `rating`/`comment`/`updatedAt`), then `aggregate()` over that trip's reviews (`_avg.rating`, `_count`) and write the result to `Trip.avgRating`/`Trip.reviewCount` in the same transaction.

**`DELETE /trips/:id/reviews`** — deletes the caller's own `TripReview` row (404 if none exists) and recomputes the same aggregate, in the same transaction pattern.

### Mobile UI

**New component** `StarRating.tsx` — renders 1-5 stars; a `readOnly` prop switches between a static display (used for averages, and for rendering other users' reviews) and a tappable input (used for the viewer's own rating entry). No new dependency — plain `MaterialCommunityIcons` `star`/`star-outline`, consistent with icons already used throughout `TripCard`/`TripDetailScreen`.

**`TripCard`**: extend the existing meta-icon row (which already shows seats/likes/comments counts via `MaterialCommunityIcons`) with a star badge — `★ {avgRating.toFixed(1)} ({reviewCount})` — shown only when `reviewCount > 0`. No badge for unreviewed trips, avoiding a misleading "0 stars" read.

**`TripDetailScreen`**: a new "Reviews" section placed immediately after the existing Comments section, structurally mirroring it:
- Header: `Reviews (N)` + a read-only `StarRating` showing the average.
- List: one card per review (avatar, name, relative time via the existing `formatRelativeTime` helper, read-only `StarRating`, optional comment text) — same visual layout as the comment cards, no pagination (trip group sizes are bounded by `seats`, matching why comments aren't paginated either).
- Below the list, driven by `viewerCanReview`/`viewerReview` from the GET response:
  - Not eligible → nothing further; the list stays read-only for everyone, same visibility model as comments.
  - Eligible, no existing review → a tappable `StarRating` input + optional text input + Submit button, same visual weight as the existing comment-input row.
  - Eligible, already reviewed → their review shown inline with Edit (reopens the same input, pre-filled — submitting calls the same upsert `POST`) and Delete (calls `DELETE`) affordances.

**New API hooks** in `mobile/src/api/trips.ts`: `useTripReviews(tripId)`, `useSubmitReview(tripId)`, `useDeleteReview(tripId)` — same shape as the existing `useTripComments`/`useAddComment`.

## Global Constraints

- No new npm dependencies (backend or mobile).
- `TripReview` reuses the `TripLike`/`TripBookmark` composite-key pattern (`@@id([tripId, userId])`) — one review per user per trip, edited via upsert rather than creating duplicates.
- Trip owners cannot review their own trip; reviews open only after `trip.endDate` has passed and the trip is not `CANCELLED`.
- `avgRating`/`reviewCount` are denormalized on `Trip` and must be recomputed transactionally on every review create/update/delete — never left stale.
- `avgRating` does **not** feed into `getTrendingTrips`'s `engagementScore` in this pass — explicitly out of scope, a separate future decision.
- No pagination on `GET /trips/:id/reviews`, matching the existing unpaginated `listComments`.
- Follow the existing black-box smoke-test convention for backend verification (extend a new `backend/scripts/smoke-test-trip-reviews.mjs` or fold into an existing trips smoke test — decided at planning time).

## Testing Plan

Backend smoke test covering: (1) a group member can submit a review only after `endDate` has passed — attempting before should 403; (2) the trip owner attempting to review their own trip should 403; (3) a non-member attempting to review should 403; (4) submitting a second review from the same user edits the existing one rather than creating a duplicate (`GET` still shows exactly one review from that user, with updated rating/comment); (5) `avgRating`/`reviewCount` on the trip update correctly after create, edit, and delete; (6) `DELETE` removes the review and recomputes the aggregate (verify `avgRating` reverts to the value excluding the deleted review, and `reviewCount` decrements); (7) reviews for a `CANCELLED` trip are rejected.

Typecheck (`tsc --noEmit`) on both `backend` and `mobile`.
