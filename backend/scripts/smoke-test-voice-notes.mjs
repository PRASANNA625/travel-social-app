// Black-box smoke test for Voice Notes: audio upload endpoint, real-time
// AUDIO message delivery + duration persistence, REST history round-trip,
// wrong-mimetype rejection, and closed-trip send blocking.
// Follows the same conventions as scripts/smoke-test.mjs (plain fetch +
// socket.io-client, no framework).
//
// Note: the real Cloudinary upload happy-path is skipped gracefully when
// this environment has no CLOUDINARY_* credentials configured (server
// responds with the pre-existing "Uploads are not configured" 500) - this
// predates voice notes entirely (no smoke test in this repo exercises the
// existing image upload endpoint either, for the same reason). Every other
// assertion, including all of message:send's new AUDIO/durationMs handling,
// uses a placeholder mediaUrl and does not depend on Cloudinary at all.
import { io } from "socket.io-client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const rand = () => Math.random().toString(36).slice(2, 8);
const PLACEHOLDER_AUDIO_URL = "https://res.cloudinary.com/demo/video/upload/placeholder-voice-note.m4a";

async function request(method, path, { token, body, isForm } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
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
  console.log(`Smoke testing Voice Notes against ${BASE}`);

  // --- Setup: trip + approved joiner -> group with 2 members ---
  const owner = await registerUser("owner-voice");
  const joiner = await registerUser("joiner-voice");

  const trip = await requestOk("POST", "/trips", {
    token: owner.token,
    body: {
      title: "Voice Notes Test Trip",
      destination: "Goa",
      startLocation: "Pune",
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 9 * 86400000).toISOString(),
      travelMode: "CAR",
      seats: 4,
      description: "Trip for the voice notes smoke test.",
      placesToVisit: [],
      joinType: "APPROVAL",
    },
  });

  await requestOk("POST", `/join-requests/trips/${trip.id}`, {
    token: joiner.token,
    body: { message: "count me in" },
  });
  const requests = await requestOk("GET", `/join-requests/trips/${trip.id}`, { token: owner.token });
  await requestOk("POST", `/join-requests/${requests[0].id}/approve`, { token: owner.token });
  const group = await requestOk("GET", `/groups/by-trip/${trip.id}`, { token: owner.token });
  assert(group.members.length === 2, "group should have owner + approved joiner");
  console.log("✓ trip + group set up with 2 members");

  // --- Wrong mimetype is rejected by the audio upload endpoint (multer's fileFilter runs before any Cloudinary call) ---
  const badForm = new FormData();
  badForm.append("audio", new Blob(["not audio"], { type: "text/plain" }), "note.txt");
  const badUpload = await request("POST", "/messages/audio", { token: joiner.token, body: badForm, isForm: true });
  assert(badUpload.status >= 400, "uploading a non-audio mimetype to /messages/audio should be rejected");
  console.log("✓ /messages/audio rejects non-audio mimetypes");

  // --- Real Cloudinary upload happy path (best-effort: skipped if this environment has no Cloudinary credentials configured) ---
  const audioBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  const form = new FormData();
  form.append("audio", new Blob([audioBytes], { type: "audio/m4a" }), "note.m4a");
  const uploadAttempt = await request("POST", "/messages/audio", { token: joiner.token, body: form, isForm: true });
  if (uploadAttempt.status === 500 && typeof uploadAttempt.data?.error === "string" && uploadAttempt.data.error.startsWith("Uploads are not configured")) {
    console.log("⚠ Skipped: /messages/audio happy-path upload (no CLOUDINARY_* credentials configured in this environment)");
  } else {
    assert(uploadAttempt.status >= 200 && uploadAttempt.status < 300, `audio upload should succeed, got ${uploadAttempt.status}: ${JSON.stringify(uploadAttempt.data)}`);
    assert(typeof uploadAttempt.data.url === "string" && uploadAttempt.data.url.length > 0, "audio upload should return a url");
    console.log("✓ audio file uploaded to Cloudinary, url returned:", uploadAttempt.data.url);
  }

  // --- Happy path: send an AUDIO message (placeholder mediaUrl - exercises message:send's new handling
  // directly, no Cloudinary dependency), receive it in real time ---
  const DURATION_MS = 4200;
  const message = await new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token: joiner.token } });
    socket.on("connect", () => socket.emit("group:join", group.id));
    socket.on("message:new", (msg) => {
      socket.disconnect();
      resolve(msg);
    });
    socket.on("connect_error", reject);
    setTimeout(() => {
      if (socket.connected) {
        socket.emit("message:send", { groupId: group.id, type: "AUDIO", mediaUrl: PLACEHOLDER_AUDIO_URL, durationMs: DURATION_MS });
      }
    }, 300);
    setTimeout(() => reject(new Error("Timed out waiting for AUDIO message:new")), 5000);
  });
  assert(message.type === "AUDIO", "delivered message should have type AUDIO");
  assert(message.mediaUrl === PLACEHOLDER_AUDIO_URL, "delivered message should carry the sent mediaUrl");
  assert(message.durationMs === DURATION_MS, "delivered message should carry the exact durationMs sent");
  console.log("✓ AUDIO message delivered in real time with url + durationMs intact");

  // --- Persistence: durationMs and mediaUrl survive a REST history fetch (refresh/re-login) ---
  const history = await requestOk("GET", `/messages/groups/${group.id}`, { token: owner.token });
  const persisted = history.items.find((m) => m.id === message.id);
  assert(!!persisted, "AUDIO message should be present in REST history");
  assert(
    persisted.type === "AUDIO" && persisted.mediaUrl === PLACEHOLDER_AUDIO_URL && persisted.durationMs === DURATION_MS,
    "AUDIO message's type/mediaUrl/durationMs should survive a REST history fetch"
  );
  console.log("✓ AUDIO message metadata persists across a REST history fetch (refresh/re-login)");

  // --- Closed trip: message:send is silently dropped once the trip is COMPLETED ---
  await requestOk("PATCH", `/trips/${trip.id}`, { token: owner.token, body: { status: "COMPLETED" } });
  const gotMessageAfterClose = await new Promise((resolve) => {
    const socket = io(BASE, { auth: { token: joiner.token } });
    let gotMessage = false;
    socket.on("connect", () => socket.emit("group:join", group.id));
    socket.on("message:new", () => {
      gotMessage = true;
    });
    setTimeout(() => {
      if (socket.connected) {
        socket.emit("message:send", { groupId: group.id, type: "AUDIO", mediaUrl: PLACEHOLDER_AUDIO_URL, durationMs: DURATION_MS });
      }
    }, 300);
    setTimeout(() => {
      socket.disconnect();
      resolve(gotMessage);
    }, 1500);
  });
  assert(gotMessageAfterClose === false, "message:send on a COMPLETED trip should not deliver a new message");
  console.log("✓ voice notes cannot be sent once the trip is closed (COMPLETED)");

  // --- Existing voice messages remain readable after the trip closes ---
  const historyAfterClose = await requestOk("GET", `/messages/groups/${group.id}`, { token: owner.token });
  assert(
    historyAfterClose.items.some((m) => m.id === message.id),
    "previously sent voice message should remain readable after the trip closes"
  );
  console.log("✓ previously sent voice messages remain readable after the trip closes");

  console.log("\nAll voice notes smoke checks passed.");
}

main().catch((err) => {
  console.error("\nSmoke test failed:", err.message);
  process.exit(1);
});
