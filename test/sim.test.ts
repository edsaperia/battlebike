import { describe, expect, it } from 'vitest';
import { createState, step, type Intent, type SimEvent } from '../src/sim/sim';
import { tuning } from '../src/sim/tuning';

/** A scripted rider: looks at the next row and steers to the nearest open lane. */
function autopilot(s: ReturnType<typeof createState>): Intent[] {
  const next = s.obstacles.filter((o) => o.d > s.dist - 1).sort((a, b) => a.d - b.d)[0];
  if (!next) return [];
  const blocked = new Set(s.obstacles.filter((o) => o.d === next.d).map((o) => o.lane));
  if (!blocked.has(s.lane)) return [];
  let best = -1;
  for (let lane = 0; lane < tuning.laneCount; lane++) {
    if (blocked.has(lane)) continue;
    if (best < 0 || Math.abs(lane - s.lane) < Math.abs(best - s.lane)) best = lane;
  }
  return [{ type: 'lane', dir: best > s.lane ? 1 : -1 }];
}

describe('simulation', () => {
  it('is deterministic for a given seed and inputs', () => {
    const a = createState(1234);
    const b = createState(1234);
    for (let i = 0; i < 3000; i++) {
      const intents: Intent[] = i % 97 === 0 ? [{ type: 'lane', dir: i % 2 ? 1 : -1 }] : [];
      step(a, intents);
      step(b, intents);
    }
    expect(a).toEqual(b);
  });

  it('never blocks every lane in a row', () => {
    const s = createState(42);
    const rows = new Map<number, Set<number>>();
    for (let i = 0; i < 60 * 240; i++) {
      s.alive = true; // ride through everything
      step(s, []);
      for (const o of s.obstacles) {
        if (!rows.has(o.d)) rows.set(o.d, new Set());
        rows.get(o.d)!.add(o.lane);
      }
    }
    expect(rows.size).toBeGreaterThan(100);
    for (const lanes of rows.values()) {
      expect(lanes.size).toBeGreaterThanOrEqual(1);
      expect(lanes.size).toBeLessThan(tuning.laneCount);
    }
  });

  it('crashes a rider who never steers', () => {
    const s = createState(7);
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 * 120 && s.alive; i++) events.push(...step(s, []));
    expect(s.alive).toBe(false);
    expect(events.some((e) => e.type === 'crash')).toBe(true);
    // After a crash the bike coasts to a stop.
    for (let i = 0; i < 60 * 5; i++) step(s, []);
    expect(s.speed).toBe(0);
  });

  it('can always be survived: every row is reachable in time', () => {
    for (const seed of [1, 2, 3, 99, 2026]) {
      const s = createState(seed);
      for (let i = 0; i < 60 * 180; i++) step(s, autopilot(s));
      expect(s.alive, `seed ${seed}`).toBe(true);
      expect(s.speed).toBe(tuning.maxSpeed);
    }
  });

  it('keeps the bike on the road', () => {
    const s = createState(5);
    const events: SimEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(...step(s, [{ type: 'lane', dir: -1 }]));
    expect(s.lane).toBe(0);
    expect(events.filter((e) => e.type === 'edgeBump').length).toBe(8);
  });
});
