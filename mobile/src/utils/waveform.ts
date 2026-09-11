// V1 uses a simulated waveform, not real amplitude data: a deterministic
// bar-height pattern derived from a string seed (a message id once sent, or
// the local recording's uri while still in the pre-send preview - either
// way a stable per-item key), so a given voice note always renders the same
// pattern without decoding any audio or storing sample data.
const BAR_COUNT = 28;

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function waveformBarHeights(seedKey: string): number[] {
  const random = mulberry32(hashSeed(seedKey));
  return Array.from({ length: BAR_COUNT }, () => 0.3 + random() * 0.7);
}
