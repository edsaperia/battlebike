/**
 * Every gameplay number lives here, so mechanics can be tuned (and exposed in
 * the debug panel) without touching the rules.
 */
export const tuning = {
  laneCount: 5,
  /** metres */
  laneWidth: 2.4,

  /** metres per second */
  startSpeed: 26,
  maxSpeed: 60,
  /** m/s gained per second of riding */
  accel: 0.5,

  /** seconds to cross one lane */
  laneChangeTime: 0.11,

  /** distance to the first row of obstacles, metres */
  firstRowDist: 110,
  /** rows are spaced by this much riding time, but never closer than minRowGap */
  rowGapSeconds: 1.05,
  minRowGap: 24,
  /** obstacles are created this far ahead and removed this far behind */
  spawnAhead: 300,
  despawnBehind: 14,

  /** collision box: half length in metres, half width in lanes */
  hitHalfLength: 1.3,
  hitHalfLanes: 0.36,
  /** passing an obstacle closer than this (in lanes) counts as a near miss */
  nearMissLanes: 1.2,

  /** how quickly the bike scrubs speed after a crash, m/s per second */
  crashDecel: 34,
};

export type Tuning = typeof tuning;
