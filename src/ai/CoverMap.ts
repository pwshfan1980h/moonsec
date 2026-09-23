import { TILE, type TerrainProbe } from '../fx/terrain';
import type { Vec } from './Perception';

export interface CoverPoint {
  x: number;
  /** Floor surface y. */
  y: number;
  /** The side a threat must be on for this wall to block it (-1 left, +1 right). */
  protects: 1 | -1;
}

export interface Perch {
  x: number;
  y: number;
  /** Direction the ledge overlooks (-1 / +1). */
  overlooks: 1 | -1;
  /** Height of the drop below the ledge edge. */
  drop: number;
}

/** A standable floor cell: empty with headroom, solid underneath. */
export function isFloor(t: TerrainProbe, c: number, r: number, headroom = 2): boolean {
  if (!t.solidCell(c, r + 1)) return false;
  for (let k = 0; k < headroom; k++) if (t.solidCell(c, r - k)) return false;
  return true;
}

/**
 * Tactical points from the tile grid: cover spots tucked against walls at least two tiles
 * tall, and perches on ledge edges overlooking a drop. Built once per level.
 */
export class CoverMap {
  readonly cover: CoverPoint[] = [];
  readonly perches: Perch[] = [];

  constructor(private readonly terrain: TerrainProbe) {
    for (let r = 1; r < terrain.rows - 1; r++) {
      for (let c = 1; c < terrain.cols - 1; c++) {
        if (!isFloor(terrain, c, r)) continue;
        const x = (c + 0.5) * TILE, y = (r + 1) * TILE;
        for (const s of [-1, 1] as const) {
          if (terrain.solidCell(c + s, r) && terrain.solidCell(c + s, r - 1)) this.cover.push({ x, y, protects: s });
          if (!terrain.solidCell(c + s, r + 1) && !terrain.solidCell(c + s, r)) {
            const drop = terrain.groundBelow((c + s + 0.5) * TILE, y, 20 * TILE);
            if (drop === null || drop >= 2 * TILE) this.perches.push({ x, y, overlooks: s, drop: drop ?? Infinity });
          }
        }
      }
    }
  }

  /** Best cover against a threat, near `from`, not closer than `minRange` to the threat. */
  bestCover(threat: Vec, from: Vec, maxDist = 900, minRange = 160): CoverPoint | null {
    let best: CoverPoint | null = null, bestScore = Infinity;
    for (const p of this.cover) {
      const side = threat.x > p.x ? 1 : -1;
      if (side !== p.protects) continue;
      const toThreat = Math.hypot(threat.x - p.x, threat.y - p.y);
      if (toThreat < minRange) continue;
      const travel = Math.hypot(p.x - from.x, p.y - from.y);
      if (travel > maxDist) continue;
      const score = travel + Math.abs(toThreat - 420) * 0.5;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  /** A perch overlooking the threat, at a preferred firing range. */
  bestPerch(threat: Vec, from: Vec, range = 480): Perch | null {
    let best: Perch | null = null, bestScore = Infinity;
    for (const p of this.perches) {
      const side = threat.x > p.x ? 1 : -1;
      if (side !== p.overlooks) continue;
      const score = Math.abs(Math.hypot(threat.x - p.x, threat.y - p.y) - range) + Math.hypot(p.x - from.x, p.y - from.y) * 0.3;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
}
