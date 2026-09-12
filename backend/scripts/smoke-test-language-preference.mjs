// Black-box smoke test for the preferredLanguage profile field: PATCH/GET
// /users/me. Follows the same conventions as scripts/smoke-test-safety.mjs
// (plain fetch, no framework).
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
  console.log(`Smoke testing preferredLanguage against ${BASE}`);

  const alice = await registerUser("lang-alice");

  // --- New users default to "en" ---
  const meDefault = await requestOk("GET", "/users/me", { token: alice.token });
  assert(meDefault.preferredLanguage === "en", `new user should default to "en", got ${meDefault.preferredLanguage}`);
  console.log('✓ a new user defaults to preferredLanguage "en"');

  // --- Updating to a supported language persists and is echoed back ---
  const updated = await requestOk("PATCH", "/users/me", { token: alice.token, body: { preferredLanguage: "hi" } });
  assert(updated.preferredLanguage === "hi", `update should persist "hi", got ${updated.preferredLanguage}`);
  const meAfter = await requestOk("GET", "/users/me", { token: alice.token });
  assert(meAfter.preferredLanguage === "hi", `GET /users/me should reflect the update, got ${meAfter.preferredLanguage}`);
  console.log("✓ updating preferredLanguage persists and is reflected on GET /users/me");

  // --- An unsupported language code is rejected ---
  const invalid = await request("PATCH", "/users/me", { token: alice.token, body: { preferredLanguage: "fr" } });
  assert(invalid.status === 400, `an unsupported language code should 400, got ${invalid.status}`);
  console.log("✓ an unsupported language code is rejected with 400");

  // --- preferredLanguage is not exposed on another user's public profile ---
  const bob = await registerUser("lang-bob");
  const bobPublicView = await requestOk("GET", `/users/${bob.user.id}`, { token: alice.token });
  assert(
    bobPublicView.preferredLanguage === undefined,
    "preferredLanguage must not be exposed on another user's public profile"
  );
  console.log("✓ preferredLanguage is not exposed on another user's public profile");

  console.log("All preferredLanguage smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
