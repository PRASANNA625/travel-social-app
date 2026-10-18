// Shared helpers for the password smoke tests (plain fetch, no framework).
export const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:4010";
export const rand = () => Math.random().toString(36).slice(2, 8);

export async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data };
}

const results = [];
export function check(name, pass, extra = "") {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
}
export function report() {
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

export async function register(prefix = "pw") {
  const email = `${prefix}-${rand()}@triply.test`;
  const password = "Passw0rd!" + rand();
  const r = await request("POST", "/auth/register", { body: { email, password, name: `${prefix} tester` } });
  if (r.status !== 201) throw new Error(`register failed ${r.status} ${JSON.stringify(r.data)}`);
  return { email, password, token: r.data.token, user: r.data.user };
}

// Newest message the dev outbox holds for this address, and the reset token in its link.
export async function lastMail(to) {
  const r = await request("GET", `/auth/dev/outbox?to=${encodeURIComponent(to)}`);
  const mail = Array.isArray(r.data) ? r.data[r.data.length - 1] : undefined;
  const token = mail?.text.match(/reset-password\?token=([\w-]+)/)?.[1];
  return { mail, token, count: Array.isArray(r.data) ? r.data.length : 0 };
}

export const resetLimits = () => request("POST", "/auth/dev/reset-limits");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
