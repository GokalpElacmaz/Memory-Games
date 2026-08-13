/** Small random helpers shared by every game. */

export function randInt(minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(Math.random() * (maxInclusive - minInclusive + 1));
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `count` distinct items drawn from `items`. */
export function sample<T>(items: readonly T[], count: number): T[] {
  return shuffle(items).slice(0, Math.min(count, items.length));
}

/** `count` distinct integers from [0, size). */
export function sampleIndices(size: number, count: number): number[] {
  const all = Array.from({ length: size }, (_, i) => i);
  return sample(all, count);
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pick from `items` while avoiding `exclude` where possible. */
export function pickOther<T>(items: readonly T[], exclude: T): T {
  const rest = items.filter((item) => item !== exclude);
  return rest.length ? pick(rest) : pick(items);
}
