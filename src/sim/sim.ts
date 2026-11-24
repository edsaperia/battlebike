/**
 * The game rules. Plain data in, plain data out: no rendering, no DOM, no
 * clocks. Given the same seed and the same intents it always produces the same
 * run, so it can be tested and replayed without a browser.
 */
import { makeRng, rand, type Rng } from './rng';
import { tuning as defaultTuning, type Tuning } from './tuning';

export const STEP = 1 / 60;

export type ObstacleKind = 'barrelFire';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  lane: number;
  /** distance along the road, metres */
  d: number;
  passed: boolean;
}

export interface SimState {
  seed: number;
  rng: Rng;
  time: number;
  /** distance travelled, metres */
  dist: number;
  speed: number;
  /** lane the bike is heading for (integer) */
  lane: number;
  /** where the bike actually is, in lanes (fractional while changing lane) */
  laneX: number;
  /** values from the previous step, for smooth drawing between steps */
  prevDist: number;
  prevLaneX: number;
  obstacles: Obstacle[];
  nextRowD: number;
  rows: number;
  nextId: number;
  alive: boolean;
}

/** What the player wants to do. Touch, keyboard and gamepad all produce these. */
export type Intent = { type: 'lane'; dir: -1 | 1 };

/** Things that happened this step. Effects and sound listen to these. */
export type SimEvent =
  | { type: 'laneChange'; dir: -1 | 1; lane: number }
  | { type: 'edgeBump'; dir: -1 | 1 }
  | { type: 'nearMiss'; side: -1 | 1; obstacle: Obstacle }
  | { type: 'crash'; obstacle: Obstacle };

export function createState(seed: number, t: Tuning = defaultTuning): SimState {
  const mid = Math.floor(t.laneCount / 2);
  return {
    seed,
    rng: makeRng(seed),
    time: 0,
    dist: 0,
    speed: t.startSpeed,
    lane: mid,
    laneX: mid,
    prevDist: 0,
    prevLaneX: mid,
    obstacles: [],
    nextRowD: t.firstRowDist,
    rows: 0,
    nextId: 1,
    alive: true,
  };
}

/** Advance the game by one fixed step. */
export function step(
  s: SimState,
  intents: readonly Intent[],
  t: Tuning = defaultTuning,
): SimEvent[] {
  const events: SimEvent[] = [];
  s.prevDist = s.dist;
  s.prevLaneX = s.laneX;
  s.time += STEP;

  if (s.alive) {
    for (const intent of intents) {
      if (intent.type === 'lane') {
        const target = s.lane + intent.dir;
        if (target < 0 || target >= t.laneCount) {
          events.push({ type: 'edgeBump', dir: intent.dir });
        } else {
          s.lane = target;
          events.push({ type: 'laneChange', dir: intent.dir, lane: target });
        }
      }
    }
    s.speed = Math.min(t.maxSpeed, s.speed + t.accel * STEP);
  } else {
    s.speed = Math.max(0, s.speed - t.crashDecel * STEP);
  }

  // Slide toward the target lane at a constant rate.
  const maxMove = STEP / t.laneChangeTime;
  const delta = s.lane - s.laneX;
  s.laneX += Math.max(-maxMove, Math.min(maxMove, delta));

  s.dist += s.speed * STEP;

  spawnRows(s, t);

  if (s.alive) {
    for (const o of s.obstacles) {
      if (o.passed) continue;
      const along = o.d - s.dist;
      const across = Math.abs(o.lane - s.laneX);
      if (Math.abs(along) < t.hitHalfLength && across < t.hitHalfLanes) {
        s.alive = false;
        events.push({ type: 'crash', obstacle: o });
        break;
      }
      if (along < -t.hitHalfLength) {
        o.passed = true;
        if (across < t.nearMissLanes) {
          events.push({ type: 'nearMiss', side: o.lane < s.laneX ? -1 : 1, obstacle: o });
        }
      }
    }
  }

  // Drop obstacles that are well behind the bike.
  if (s.obstacles.length && s.obstacles[0].d < s.dist - t.despawnBehind) {
    s.obstacles = s.obstacles.filter((o) => o.d >= s.dist - t.despawnBehind);
  }

  return events;
}

/**
 * Obstacles arrive in rows across the road. Each row blocks some lanes and
 * always leaves at least one open. Rows are far enough apart that any open
 * lane can be reached from any other.
 */
function spawnRows(s: SimState, t: Tuning): void {
  while (s.nextRowD < s.dist + t.spawnAhead) {
    const blocked = pickBlockedCount(s, t);
    const lanes = shuffledLanes(s.rng, t.laneCount).slice(0, blocked);
    for (const lane of lanes) {
      s.obstacles.push({ id: s.nextId++, kind: 'barrelFire', lane, d: s.nextRowD, passed: false });
    }
    s.rows++;
    // Use the speed the bike will roughly have when it gets there.
    const speedThen = Math.min(t.maxSpeed, s.speed + 4);
    s.nextRowD += Math.max(t.minRowGap, speedThen * t.rowGapSeconds);
  }
}

function pickBlockedCount(s: SimState, t: Tuning): number {
  const r = rand(s.rng);
  const most = t.laneCount - 1;
  let n: number;
  if (s.rows < 6) n = r < 0.6 ? 1 : 2;
  else if (s.rows < 20) n = r < 0.25 ? 1 : r < 0.7 ? 2 : 3;
  else n = r < 0.1 ? 1 : r < 0.45 ? 2 : r < 0.85 ? 3 : 4;
  return Math.max(1, Math.min(most, n));
}

function shuffledLanes(rng: Rng, count: number): number[] {
  const lanes = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand(rng) * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes;
}
