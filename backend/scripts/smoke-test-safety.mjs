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
