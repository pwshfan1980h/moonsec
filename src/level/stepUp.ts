/**
 * Step-up for grounded walkers: a body pushing into a ledge no taller than `maxStep` is lifted
 * onto it instead of stopping, so terraced terrain reads as uneven ground rather than walls.
 * Pure (grid queries only) so it can be tested without physics.
 */
export interface SolidQuery { solidCell(c: number, r: number): boolean }

export interface StepBody {
  /** Feet centre x and feet (bottom) y, world units. */
  x: number;
  y: number;
  halfW: number;
  h: number;
}

/** One tile: terraces are authored in whole cells. */
export const MAX_STEP = 32;

/**
 * Height to lift `b` so it stands on the ledge just ahead in `dir`, or 0 when the obstacle is
 * not a step (too tall, a wall, or no headroom above it).
 */
export function stepUpHeight(t: SolidQuery, b: StepBody, dir: -1 | 1, maxStep = MAX_STEP, cell = 32): number {
  const ahead = Math.floor((b.x + dir * (b.halfW + 2)) / cell);
  const feetRow = Math.floor((b.y - 1) / cell);
  if (!t.solidCell(ahead, feetRow)) return 0;
  let top = feetRow;
  while (t.solidCell(ahead, top - 1)) {
    top--;
    if (b.y - top * cell > maxStep) return 0;
  }
  const rise = b.y - top * cell;
  if (rise <= 0 || rise > maxStep) return 0;
  // headroom for the whole body at its new height, nudged onto the ledge
  const newFeet = top * cell;
  const x0 = Math.floor((b.x + dir * 4 - b.halfW) / cell), x1 = Math.floor((b.x + dir * 4 + b.halfW - 1) / cell);
  const y0 = Math.floor((newFeet - b.h) / cell), y1 = Math.floor((newFeet - 1) / cell);
  for (let r = y0; r <= y1; r++) for (let c = x0; c <= x1; c++) if (t.solidCell(c, r)) return 0;
  return rise;
}
