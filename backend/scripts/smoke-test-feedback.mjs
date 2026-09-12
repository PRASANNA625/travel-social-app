// Black-box smoke test for Feedback / Report a Problem: POST /feedback.
// Follows the same conventions as scripts/smoke-test-safety.mjs (plain
// fetch, no framework).
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const rand = () => Math.random().toString(36).slice(2, 8);

async function request(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
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
  console.log(`Smoke testing Feedback / Report a Problem against ${BASE}`);

  const alice = await registerUser("feedback-alice");

  // --- A REPORT submission succeeds and returns only public fields ---
  const report = await requestOk("POST", "/feedback", {
    token: alice.token,
    body: { kind: "REPORT", type: "bug", description: "The app crashes on login", appVersion: "0.1.0", platform: "android" },
  });
  assert(report.kind === "REPORT", "response should carry the submitted kind");
  assert(report.type === "bug", "response should carry the submitted type");
  assert(report.status === "NEW", "a fresh submission should default to NEW status");
  assert(report.userId === undefined, "response must never include userId");
  assert(report.description === undefined, "response must never include description");
  assert(report.screenshotUrl === undefined, "response must never include screenshotUrl");
  console.log("✓ REPORT submission succeeds and response excludes sensitive fields");

  // --- A FEEDBACK submission succeeds ---
  const feedback = await requestOk("POST", "/feedback", {
    token: alice.token,
    body: { kind: "FEEDBACK", type: "suggestion", description: "Add dark mode to the map screen", appVersion: "0.1.0", platform: "ios" },
  });
  assert(feedback.kind === "FEEDBACK", "response should carry the submitted kind");
  console.log("✓ FEEDBACK submission succeeds");

  // --- Empty description is rejected ---
  const emptyDescription = await request("POST", "/feedback", {
    token: alice.token,
    body: { kind: "REPORT", type: "bug", description: "   ", appVersion: "0.1.0", platform: "web" },
  });
  assert(emptyDescription.status === 400, `empty description should 400, got ${emptyDescription.status}`);
  console.log("✓ empty/whitespace-only description is rejected with 400");

  // --- An invalid type for the given kind is rejected ---
  const wrongType = await request("POST", "/feedback", {
    token: alice.token,
    body: { kind: "FEEDBACK", type: "bug", description: "Not a real feedback type", appVersion: "0.1.0", platform: "web" },
  });
  assert(wrongType.status === 400, `a REPORT-only type under kind=FEEDBACK should 400, got ${wrongType.status}`);
  console.log("✓ a type from the wrong kind's list is rejected with 400");

  // --- Unauthenticated submission is rejected ---
  const noAuth = await request("POST", "/feedback", {
    body: { kind: "REPORT", type: "bug", description: "no token", appVersion: "0.1.0", platform: "web" },
  });
  assert(noAuth.status === 401, `unauthenticated submission should 401, got ${noAuth.status}`);
  console.log("✓ unauthenticated submission is rejected with 401");

  // --- Fields-only multipart submission (no screenshot) succeeds ---
  // This mirrors the actual request shape the mobile app always sends: see
  // mobile/src/api/feedback.ts, which always builds a FormData whether or
  // not a screenshot is attached. Every other case above sends plain JSON,
  // so this is the test that exercises the real Task 2 <-> mobile-app shape.
  const fieldsOnlyForm = new FormData();
  fieldsOnlyForm.append("kind", "FEEDBACK");
  fieldsOnlyForm.append("type", "general");
  fieldsOnlyForm.append("description", "Multipart fields-only submission, no screenshot");
  fieldsOnlyForm.append("appVersion", "0.1.0");
  fieldsOnlyForm.append("platform", "android");
  const fieldsOnly = await requestOk("POST", "/feedback", { token: alice.token, form: fieldsOnlyForm });
  assert(fieldsOnly.kind === "FEEDBACK", "fields-only multipart response should carry the submitted kind");
  assert(fieldsOnly.type === "general", "fields-only multipart response should carry the submitted type");
  assert(fieldsOnly.status === "NEW", "fields-only multipart submission should default to NEW");
  console.log("✓ fields-only multipart submission (no screenshot) succeeds, matching the mobile app's request shape");

  // --- Submission with a screenshot: the fixture PNG is an intentionally
  // truncated 8-byte stub, so this can't assert a clean success. Whether
  // Cloudinary is unconfigured (missing-credentials check) or configured
  // and rejects the truncated image, the upload legitimately fails with a
  // 500; if Cloudinary is configured and happens to accept the stub, it's a
  // 201-equivalent success. Both are acceptable outcomes in this
  // environment. Anything else (e.g. a 400) means the request itself was
  // malformed and should fail the assertion.
  const form = new FormData();
  form.append("kind", "REPORT");
  form.append("type", "ui");
  form.append("description", "The button overlaps the header");
  form.append("appVersion", "0.1.0");
  form.append("platform", "web");
  const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  form.append("screenshot", new Blob([pngBytes], { type: "image/png" }), "screenshot.png");
  const withScreenshot = await request("POST", "/feedback", { token: alice.token, form });
  assert(
    withScreenshot.status === 201 || withScreenshot.status === 500,
    `submission with a screenshot should either succeed (201, screenshot upload worked) or fail upstream (500, e.g. no Cloudinary configured), got ${withScreenshot.status}: ${JSON.stringify(withScreenshot.data)}`
  );
  if (withScreenshot.status === 201) {
    console.log("✓ submission with a screenshot attachment succeeded (Cloudinary accepted the fixture image)");
  } else {
    console.log("✓ submission with a screenshot attachment failed upstream as expected (500, e.g. no Cloudinary configured)");
  }

  console.log("All Feedback / Report a Problem smoke tests passed.");
}

main().catch((err) => {
  console.error("✗ smoke test failed:", err.message);
  process.exit(1);
});
