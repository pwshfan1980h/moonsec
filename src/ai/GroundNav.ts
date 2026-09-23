import { TILE, type TerrainProbe } from '../fx/terrain';
import { isFloor } from './CoverMap';
import type { Vec } from './Perception';

/** A contiguous run of standable floor on one tile row. */
export interface Span {
  id: number;
  row: number;
  c0: number;
  c1: number;
  /** Floor surface y. */
  y: number;
}

export interface SpanLink { to: number; from: Vec; land: Vec; kind: 'walk' | 'jump' | 'drop' }

export interface WalkerLimits {
  /** Tiles a walker can jump up. */
  climb: number;
  /** Tiles a walker is willing to drop. */
  drop: number;
  /** Horizontal gap in tiles it can cross. */
  gap: number;
}

/**
 * Walkable spans and the jumps/drops between them, for ground enemies. Pathing runs over
 * spans (BFS), which keeps it cheap enough for every walker in every mission.
 */
export class GroundNav {
  readonly spans: Span[] = [];
  readonly links: SpanLink[][] = [];
  private readonly spanAtCell = new Map<number, number>();

  constructor(private readonly terrain: TerrainProbe, private readonly limits: WalkerLimits = { climb: 3, drop: 10, gap: 4 }) {
    for (let r = 1; r < terrain.rows - 1; r++) {
      let c = 0;
      while (c < terrain.cols) {
        if (!isFloor(terrain, c, r)) { c++; continue; }
        const start = c;
        while (c + 1 < terrain.cols && isFloor(terrain, c + 1, r)) c++;
        const id = this.spans.length;
        this.spans.push({ id, row: r, c0: start, c1: c, y: (r + 1) * TILE });
        for (let k = start; k <= c; k++) this.spanAtCell.set(r * terrain.cols + k, id);
        c++;
      }
    }
    this.spans.forEach(() => this.links.push([]));
    for (const a of this.spans) for (const b of this.spans) {
      if (a === b) continue;
      const rise = a.row - b.row; // >0 means b is higher
      for (const [edge, dir] of [[a.c1, 1], [a.c0, -1]] as const) {
        const target = dir > 0 ? b.c0 : b.c1;
        const gap = (target - edge) * dir;
        if (gap < 1 || gap > limits.gap + 1) continue;
        if (rise > 0 && rise > limits.climb) continue;
        if (rise < 0 && -rise > limits.drop) continue;
        this.links[a.id].push({
          to: b.id,
          from: { x: (edge + 0.5) * TILE, y: a.y },
          land: { x: (target + 0.5) * TILE, y: b.y },
          kind: rise > 0 ? 'jump' : rise < 0 ? 'drop' : 'walk',
        });
      }
      // Overlapping spans on different rows: jump up beside a ledge's end, or step off it.
      if (rise !== 0 && a.c0 <= b.c1 + 1 && b.c0 <= a.c1 + 1) {
        if (rise > 0 && rise > limits.climb) continue;
        if (rise < 0 && -rise > limits.drop) continue;
        // Jump up: stand on `a` just past one end of ledge `b`, land on that end.
        // Drop: walk off one end of ledge `a`, land on `b` just past it.
        const upper = rise > 0 ? b : a, lower = rise > 0 ? a : b;
        for (const [edge, outside] of [[upper.c0, upper.c0 - 1], [upper.c1, upper.c1 + 1]] as const) {
          if (outside < lower.c0 || outside > lower.c1) continue;
          const onUpper = { x: (edge + 0.5) * TILE, y: upper.y };
          const onLower = { x: (outside + 0.5) * TILE, y: lower.y };
          this.links[a.id].push(rise > 0
            ? { to: b.id, from: onLower, land: onUpper, kind: 'jump' }
            : { to: b.id, from: onUpper, land: onLower, kind: 'drop' });
        }
      }
    }
  }

  /** The span a foot position stands on (x, surface y), or null. */
  spanAt(x: number, y: number): Span | null {
    const c = Math.floor(x / TILE), r = Math.round(y / TILE) - 1;
    const id = this.spanAtCell.get(r * this.terrain.cols + c);
    return id === undefined ? null : this.spans[id];
  }

  /** Links to follow from one span to reach another (BFS, fewest hops), or null. */
  route(from: number, to: number): SpanLink[] | null {
    if (from === to) return [];
    const prev = new Map<number, SpanLink & { at: number }>();
    const queue = [from];
    const seen = new Set([from]);
    while (queue.length) {
      const s = queue.shift()!;
      for (const l of this.links[s]) {
        if (seen.has(l.to)) continue;
        seen.add(l.to);
        prev.set(l.to, { ...l, at: s });
        if (l.to === to) {
          const out: SpanLink[] = [];
          let cur = to;
          while (cur !== from) { const p = prev.get(cur)!; out.unshift(p); cur = p.at; }
          return out;
        }
        queue.push(l.to);
      }
    }
    return null;
  }

  /** Clamp an x target to a span (walkers stop at edges instead of falling). */
  clampToSpan(span: Span, x: number, margin = 8): number {
    return Math.min((span.c1 + 1) * TILE - margin, Math.max(span.c0 * TILE + margin, x));
  }
}
