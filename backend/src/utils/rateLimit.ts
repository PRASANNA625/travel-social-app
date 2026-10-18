// In-memory sliding-window counters. Fine for one server instance; they reset on restart.
const hits = new Map<string, number[]>();

function fresh(key: string, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, list);
  return list;
}

// Number of hits for `key` within the window.
export function recent(key: string, windowMs: number): number {
  return fresh(key, windowMs).length;
}

export function record(key: string): void {
  const list = hits.get(key) ?? [];
  list.push(Date.now());
  hits.set(key, list);
}

// True (and counted) while under `limit` hits per window; false once the limit is reached.
export function allow(key: string, limit: number, windowMs: number): boolean {
  if (fresh(key, windowMs).length >= limit) return false;
  record(key);
  return true;
}

export function resetRateLimits(): void {
  hits.clear();
}
