// Black-box smoke test for the Explore Map backend changes: the raised
// /trips pageSize cap and the new /trips/trending-destinations endpoint.
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
      title: `Explore Map Test Trip ${rand()}`,
      destination: "Goa",
      startLocation: "Bengaluru",
      startLat: 15.2993,
      startLng: 74.124,
      startDate: futureDate(10),
      endDate: futureDate(12),
      travelMode: "BEACH",
      seats: 6,
      description: "Smoke-test trip for Explore Map",
      placesToVisit: [],
      images: [],
      joinType: "OPEN",
      ...overrides,
    },
  });
}

async function main() {
  console.log(`Smoke testing Explore Map against ${BASE}`);

  // --- Raised pageSize cap: GET /trips?pageSize=200 should echo pageSize:200, not clamp to 50 ---
  const owner = await registerUser("explore-map-owner");
  await createTrip(owner.token);
  const paged = await request("GET", "/trips?pageSize=200");
  assert(paged.pageSize === 200, `expected pageSize 200, got ${paged.pageSize}`);
  console.log("✓ /trips accepts pageSize up to 200 (previously clamped to 50)");

  // --- Trending destinations: two trips in Goa (one liked), one trip in Manali ---
  const liker = await registerUser("explore-map-liker");
  const goaTripA = await createTrip(owner.token, { destination: "Goa", startLat: 15.2993, startLng: 74.124 });
  const goaTripB = await createTrip(owner.token, { destination: "Goa", startLat: 15.4, startLng: 73.9 });
  await request("POST", `/trips/${goaTripA.id}/like`, { token: liker.token });
  const manaliTrip = await createTrip(owner.token, {
    destination: "Manali",
    startLat: 32.2432,
    startLng: 77.1892,
    travelMode: "TREK",
  });

  const destinations = await request("GET", "/trips/trending-destinations");
  assert(Array.isArray(destinations.items), "trending-destinations.items should be an array");
  const goa = destinations.items.find((d) => d.destination === "Goa");
  const manali = destinations.items.find((d) => d.destination === "Manali");
  assert(!!goa, "Goa should appear in trending destinations");
  assert(goa.tripCount >= 2, `Goa should aggregate at least 2 trips, got ${goa.tripCount}`);
  assert(
    goa.lat > 15 && goa.lat < 15.5 && goa.lng > 73.5 && goa.lng < 74.5,
    `Goa's centroid should be near its contributing trips' coordinates, got ${goa.lat},${goa.lng}`
  );
  assert(!("score" in goa), "trending-destinations items must never expose the internal score field");
  if (manali) {
    const goaIndex = destinations.items.indexOf(goa);
    const manaliIndex = destinations.items.indexOf(manali);
    assert(goaIndex < manaliIndex, "Goa (liked trip, more engagement) should rank above Manali (no likes)");
  }
  console.log("✓ trending-destinations aggregates real trips by destination with a correct centroid, ranked by engagement, no leaked score field");

  console.log("All Explore Map backend smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
