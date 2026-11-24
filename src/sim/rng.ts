/**
 * Small seeded random number generator (mulberry32). The state is a plain
 * number so it can live inside the simulation state and be replayed exactly.
 */
export interface Rng {
  s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** Float in [0, 1). */
export function rand(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(r: Rng, min: number, max: number): number {
  return min + (max - min) * rand(r);
}

/** Integer in [min, max]. */
export function int(r: Rng, min: number, max: number): number {
  return Math.floor(range(r, min, max + 1));
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[Math.floor(rand(r) * items.length)];
}

export function chance(r: Rng, p: number): boolean {
  return rand(r) < p;
}
