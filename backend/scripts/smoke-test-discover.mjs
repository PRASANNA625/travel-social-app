// Black-box smoke test for the Personalized Discover backend endpoints:
// GET /trips/trending and GET /trips/recommended. Follows the same
// conventions as scripts/smoke-test.mjs (plain fetch, no framework).
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
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
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
  return request("POST", "/auth/register", { body: { email, password: "password123", name: label } });
}

async function createTrip(token, overrides = {}) {
  return request("POST", "/trips", {
    token,
    body: {
      title: `Discover Test Trip ${rand()}`,
      destination: "Goa",
      startLocation: "Bengaluru",
      startDate: futureDate(10),
      endDate: futureDate(12),
      travelMode: "BEACH",
      seats: 6,
      description: "Smoke-test trip for Discover sections",
      placesToVisit: [],
      images: [],
      joinType: "OPEN",
      ...overrides,
    },
  });
}

async function main() {
  console.log(`Smoke testing Personalized Discover against ${BASE}`);

  // --- Trending: two trips, one with more engagement, verify ordering ---
  const owner = await registerUser("trending-owner");
  const liker = await registerUser("trending-liker");

  const quietTrip = await createTrip(owner.token);
  const popularTrip = await createTrip(owner.token, { destination: "Manali", travelMode: "TREK" });
  await request("POST", `/trips/${popularTrip.id}/like`, { token: liker.token });

  const trending = await request("GET", "/trips/trending");
  assert(Array.isArray(trending.items), "trending.items should be an array");
  const popularIndex = trending.items.findIndex((t) => t.id === popularTrip.id);
  const quietIndex = trending.items.findIndex((t) => t.id === quietTrip.id);
  assert(popularIndex !== -1, "liked trip should appear in trending");
  assert(quietIndex === -1 || popularIndex < quietIndex, "liked trip should rank above the unliked trip");
  console.log("✓ trending ranks a liked trip above an unliked one");

  // --- Recommended: user with a preferred mode should see matching trips ranked up ---
  const recommendedUser = await registerUser("recommended-user");
  const bikeOwner = await registerUser("bike-owner");
  const beachTripByBikeOwner = await createTrip(bikeOwner.token, { travelMode: "BEACH" });
  const bikeTrip = await createTrip(bikeOwner.token, { travelMode: "BIKE", destination: "Ladakh" });

  // Bookmark a BIKE trip so recommendedUser has a structured history signal
  // (preferredModes is empty at registration, so history must supply it).
  await request("POST", `/trips/${bikeTrip.id}/bookmark`, { token: recommendedUser.token });
  const anotherBikeTrip = await createTrip(bikeOwner.token, { travelMode: "BIKE", destination: "Spiti" });

  const recommended = await request("GET", "/trips/recommended", { token: recommendedUser.token });
  assert(Array.isArray(recommended.items), "recommended.items should be an array");
  const bikeIndex = recommended.items.findIndex((t) => t.id === anotherBikeTrip.id);
  const beachIndex = recommended.items.findIndex((t) => t.id === beachTripByBikeOwner.id);
  assert(bikeIndex !== -1, "a BIKE trip should be recommended given the user's bookmarked-BIKE history");
  if (beachIndex !== -1) {
    assert(bikeIndex < beachIndex, "BIKE trip should rank above the non-preferred BEACH trip");
  }
  console.log("✓ recommended ranks trips matching the user's history higher");

  // --- Fallback: a brand new user with zero signal should get a non-empty, trending-like result ---
  const freshUser = await registerUser("fresh-user");
  const fallback = await request("GET", "/trips/recommended", { token: freshUser.token });
  assert(Array.isArray(fallback.items), "fallback recommended.items should be an array");
  assert(fallback.items.length > 0, "fresh user with no signal should still get fallback results");
  console.log("✓ recommended falls back to trending-style results for a user with no signal");

  console.log("All Personalized Discover smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
