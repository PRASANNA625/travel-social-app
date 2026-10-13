// "#rrggbb" (or "#rgb") -> "rgba(r,g,b,alpha)". Other color strings are returned unchanged.
export function hexAlpha(hex: string, alpha: number) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const full = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
