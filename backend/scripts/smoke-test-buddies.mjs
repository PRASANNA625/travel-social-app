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

  // --- Age proximity: closer age should score higher than a large age gap, all else equal ---
  const agePivot = await registerUser("age-pivot-buddies");
  const closeAge = await registerUser("close-age-buddies");
  const farAge = await registerUser("far-age-buddies");

  await requestOk("PATCH", "/users/me", {
    token: agePivot.token,
    body: { interests: ["Photography"], preferredModes: ["TREK"], age: 30 },
  });
  await requestOk("PATCH", "/users/me", {
    token: closeAge.token,
    body: { interests: ["Photography"], preferredModes: ["TREK"], age: 30 },
  });
  await requestOk("PATCH", "/users/me", {
    token: farAge.token,
    body: { interests: ["Photography"], preferredModes: ["TREK"], age: 55 },
  });

  const agePivotMatches = await requestOk("GET", "/buddies/matches", { token: agePivot.token });
  const closeAgeMatch = agePivotMatches.items.find((m) => m.id === closeAge.user.id);
  const farAgeMatch = agePivotMatches.items.find((m) => m.id === farAge.user.id);
  assert(!!closeAgeMatch, "closeAge should appear in agePivot's matches given the shared interest/mode");
  assert(!!farAgeMatch, "farAge should appear in agePivot's matches given the shared interest/mode");
  assert(
    closeAgeMatch.compatibilityPercent > farAgeMatch.compatibilityPercent,
    `same shared interest/mode, but a 0-year age gap should score higher than a 25-year gap: got ${closeAgeMatch.compatibilityPercent} vs ${farAgeMatch.compatibilityPercent}`
  );
  console.log("✓ age proximity boosts compatibility score when real shared-interest/mode signal already exists");

  // --- Age alone (with zero shared interests/modes) must never unlock a compatibility % ---
  const ageOnlyViewer = await registerUser("age-only-viewer-buddies");
  const ageOnlyMatch = await registerUser("age-only-match-buddies");
  await requestOk("PATCH", "/users/me", { token: ageOnlyViewer.token, body: { age: 30 } });
  await requestOk("PATCH", "/users/me", { token: ageOnlyMatch.token, body: { age: 30 } });

  const ageOnlyMatches = await requestOk("GET", "/buddies/matches", { token: ageOnlyViewer.token });
  const ageOnlyResult = ageOnlyMatches.items.find((m) => m.id === ageOnlyMatch.user.id);
  if (ageOnlyResult) {
    assert(
      ageOnlyResult.compatibilityPercent === null,
      "two users with the same age but zero shared interests/modes must still get compatibilityPercent: null - age alone must never unlock a score"
    );
  }
  console.log("✓ age proximity alone (zero shared interests/modes) never unlocks a compatibility %");

  // --- Connect flow: send -> pending states on both sides -> accept -> connected both sides ---
  const sendResult = await request("POST", `/buddies/${bob.user.id}/connect`, { token: alice.token });
  assert(sendResult.status === 201, `connect should return 201, got ${sendResult.status}`);
  const requestId = sendResult.data.id;

  const aliceAfterSend = await requestOk("GET", "/buddies/matches", { token: alice.token });
  const bobFromAlice = aliceAfterSend.items.find((m) => m.id === bob.user.id);
  assert(!!bobFromAlice, "bob should still appear in alice's matches while a request is pending (only REJECTED connections are excluded from the pool)");
  assert(bobFromAlice.connectionState === "pending_sent", "alice's view of bob should show connectionState 'pending_sent'");
  assert(bobFromAlice.connectionRequestId === requestId, "bob's match should carry the pending request's id as connectionRequestId");

  const bobPending = await requestOk("GET", "/buddies/requests/pending", { token: bob.token });
  assert(bobPending.some((r) => r.id === requestId), "bob should see alice's request in pending");
  console.log("✓ sending a request keeps the pair visible in each other's matches with connectionState 'pending_sent' and shows up as pending for the recipient");

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

  // --- Accepted connections stay visible in matches with connectionState: "connected" ---
  const aliceAfterAccept = await requestOk("GET", "/buddies/matches", { token: alice.token });
  const bobAfterAccept = aliceAfterAccept.items.find((m) => m.id === bob.user.id);
  assert(!!bobAfterAccept, "bob should still appear in alice's matches after the request is accepted");
  assert(bobAfterAccept.connectionState === "connected", "bob's match should show connectionState 'connected' after acceptance");
  assert(bobAfterAccept.connectionRequestId === requestId, "the connected match should carry the original request's id");
  console.log("✓ accepted connections remain visible in matches with connectionState 'connected'");

  console.log("All Travel Buddies smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
