// End-to-end smoke test for the core loop:
// register 2 users -> A creates a trip -> B expresses interest ->
// A approves -> group auto-created for both -> B sends a chat message via socket ->
// A fetches chat history over REST.
import { io } from "socket.io-client";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const rand = () => Math.random().toString(36).slice(2, 8);

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
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  console.log(`Smoke testing against ${BASE}`);

  const ownerEmail = `owner-${rand()}@example.com`;
  const joinerEmail = `joiner-${rand()}@example.com`;

  const owner = await request("POST", "/auth/register", {
    body: { email: ownerEmail, password: "password123", name: "Trip Owner" },
  });
  console.log("✓ registered owner", owner.user.id);

  const joiner = await request("POST", "/auth/register", {
    body: { email: joinerEmail, password: "password123", name: "Trip Joiner" },
  });
  console.log("✓ registered joiner", joiner.user.id);

  const trip = await request("POST", "/trips", {
    token: owner.token,
    body: {
      title: "Weekend Trek to the Hills",
      destination: "Munnar",
      startLocation: "Bengaluru",
      startLat: 12.9716,
      startLng: 77.5946,
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 9 * 86400000).toISOString(),
      travelMode: "TREK",
      budget: 5000,
      seats: 4,
      description: "A relaxed weekend trek with good company.",
      placesToVisit: ["Eravikulam National Park", "Tea Museum"],
      joinType: "APPROVAL",
    },
  });
  console.log("✓ created trip", trip.id);

  const discover = await request("GET", `/trips?search=Munnar`, { token: joiner.token });
  assert(discover.items.some((t) => t.id === trip.id), "trip should appear in discovery search");
  console.log("✓ trip discoverable via search");

  const joinRequest = await request("POST", `/join-requests/trips/${trip.id}`, {
    token: joiner.token,
    body: { message: "Would love to join!" },
  });
  assert(joinRequest.status === "PENDING", "join request should start pending for APPROVAL trips");
  console.log("✓ join request created (pending)");

  const requests = await request("GET", `/join-requests/trips/${trip.id}`, { token: owner.token });
  assert(requests.length === 1, "owner should see exactly one join request");

  const approved = await request("POST", `/join-requests/${requests[0].id}/approve`, { token: owner.token });
  assert(approved.status === "APPROVED", "join request should be approved");
  console.log("✓ owner approved join request");

  const group = await request("GET", `/groups/by-trip/${trip.id}`, { token: owner.token });
  assert(group.members.length === 2, "group should have owner + approved joiner");
  console.log("✓ private group auto-created with both members", group.id);

  await new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token: joiner.token } });
    socket.on("connect", () => socket.emit("group:join", group.id));
    socket.on("message:new", async (message) => {
      try {
        assert(message.content === "Hey everyone, excited for this trip!", "message content should round-trip");
        console.log("✓ real-time chat message delivered", message.id);

        const history = await request("GET", `/messages/groups/${group.id}`, { token: owner.token });
        assert(history.items.some((m) => m.id === message.id), "message should be in REST history");
        console.log("✓ message present in chat history via REST");

        socket.disconnect();
        resolve();
      } catch (err) {
        socket.disconnect();
        reject(err);
      }
    });
    socket.on("connect_error", reject);
    setTimeout(() => {
      if (socket.connected) {
        socket.emit("message:send", { groupId: group.id, content: "Hey everyone, excited for this trip!" });
      }
    }, 300);
    setTimeout(() => reject(new Error("Timed out waiting for chat message")), 5000);
  });

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("\nSmoke test failed:", err.message);
  process.exit(1);
});
