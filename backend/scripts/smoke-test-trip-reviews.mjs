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
