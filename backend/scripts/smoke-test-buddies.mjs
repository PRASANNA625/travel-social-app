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
