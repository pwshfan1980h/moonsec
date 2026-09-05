export interface FlightPoint { x: number; y: number; }
interface Obstacle { x: number; y: number; w: number; h: number; }

/** Clearance-aware flight graph built from the same solid tiles used by physics. */
export class FlightNavigation {
  private readonly obstacles: Obstacle[] = [];
  private readonly grids = new Map<string, Uint8Array>();
  private ceilingBottom = 0;
  readonly width: number;
  readonly height: number;

  constructor(private readonly tiles: number[][], private readonly cell = 32) {
    this.width = tiles[0].length;
    this.height = tiles.length;
    tiles.forEach((row, y) => {
      if (y < this.height / 2 && row.every(tile => tile >= 0)) this.ceilingBottom = (y + 1) * cell;
      for (let x = 0; x < row.length; x++) {
        if (row[x] < 0) continue;
        const start = x;
        while (x + 1 < row.length && row[x + 1] >= 0) x++;
        this.obstacles.push({ x: start * cell, y: y * cell, w: (x - start + 1) * cell, h: cell });
      }
    });
  }

  isOpen(p: FlightPoint, halfW = 48, halfH = 40): boolean {
    if (p.x < halfW || p.x > this.width * this.cell - halfW || p.y < this.ceilingBottom + halfH || p.y > this.height * this.cell - halfH) return false;
    return !this.obstacles.some(r => p.x + halfW > r.x && p.x - halfW < r.x + r.w && p.y + halfH > r.y && p.y - halfH < r.y + r.h);
  }

  lineClear(a: FlightPoint, b: FlightPoint, halfW = 48, halfH = 40): boolean {
    if (!this.isOpen(a, halfW, halfH) || !this.isOpen(b, halfW, halfH)) return false;
    // Exact segment/expanded-rectangle intersection avoids clipping narrow corners.
    return !this.obstacles.some(r => {
      let enter = 0, exit = 1;
      for (const [origin, delta, min, max] of [
        [a.x, b.x - a.x, r.x - halfW, r.x + r.w + halfW],
        [a.y, b.y - a.y, r.y - halfH, r.y + r.h + halfH],
      ]) {
        if (Math.abs(delta) < 0.00001) {
          if (origin <= min || origin >= max) return false;
        } else {
          const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
          enter = Math.max(enter, Math.min(t1, t2));
          exit = Math.min(exit, Math.max(t1, t2));
          if (enter >= exit) return false;
        }
      }
      return enter < exit;
    });
  }

  private grid(halfW: number, halfH: number): Uint8Array {
    const key = `${halfW}:${halfH}`;
    let grid = this.grids.get(key);
    if (!grid) {
      grid = new Uint8Array(this.width * this.height);
      for (let i = 0; i < grid.length; i++) grid[i] = Number(this.isOpen(this.point(i), halfW + 4, halfH + 4));
      this.grids.set(key, grid);
    }
    return grid;
  }

  private point(index: number): FlightPoint {
    return { x: (index % this.width + 0.5) * this.cell, y: (Math.floor(index / this.width) + 0.5) * this.cell };
  }

  private nearestIndex(p: FlightPoint, grid: Uint8Array): number {
    let nearest = -1, best = Infinity;
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i]) continue;
      const q = this.point(i), distance = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (distance < best) { nearest = i; best = distance; }
    }
    return nearest;
  }

  nearestOpen(p: FlightPoint, halfW = 48, halfH = 40): FlightPoint | undefined {
    const index = this.nearestIndex(p, this.grid(halfW, halfH));
    return index < 0 ? undefined : this.point(index);
  }

  findPath(start: FlightPoint, goal: FlightPoint, halfW = 48, halfH = 40): FlightPoint[] {
    if (this.lineClear(start, goal, halfW, halfH)) return [goal];
    const grid = this.grid(halfW, halfH);
    const from = this.nearestIndex(start, grid), to = this.nearestIndex(goal, grid);
    if (from < 0 || to < 0) return [];
    const previous = new Int32Array(grid.length).fill(-1);
    const queue = new Int32Array(grid.length);
    let read = 0, write = 1;
    queue[0] = from; previous[from] = from;
    while (read < write && previous[to] < 0) {
      const at = queue[read++];
      for (const next of [at - this.width, at + this.width, at % this.width ? at - 1 : -1, at % this.width < this.width - 1 ? at + 1 : -1]) {
        if (next < 0 || next >= grid.length || !grid[next] || previous[next] >= 0) continue;
        previous[next] = at; queue[write++] = next;
      }
    }
    if (previous[to] < 0) return [];
    const path: FlightPoint[] = [];
    for (let i = to; i !== from; i = previous[i]) path.push(this.point(i));
    path.push(this.point(from));
    return path.reverse();
  }

  firingPosition(origin: FlightPoint, target: FlightPoint, range: number, halfW = 48, halfH = 40, maxRange = Infinity): FlightPoint {
    const candidates: FlightPoint[] = [];
    for (const side of [-1, 1]) {
      for (const height of [100, 220, 340]) candidates.push({ x: target.x + side * range, y: target.y - height });
    }
    candidates.push({ x: target.x, y: target.y - 240 });
    const clear = candidates.filter(p => Math.hypot(p.x - target.x, p.y - target.y) <= maxRange && this.isOpen(p, halfW, halfH) && this.lineClear(p, target, 3, 3));
    clear.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
    return clear[0] ?? this.nearestOpen({ x: target.x, y: target.y - 160 }, halfW, halfH) ?? origin;
  }
}

/** Replans at a bounded cadence and smooths the grid route into clear flight segments. */
export class FlightRoute {
  private path: FlightPoint[] = [];
  private refreshAt = -Infinity;
  private destination?: FlightPoint;

  constructor(private readonly nav: FlightNavigation, private readonly halfW = 48, private readonly halfH = 40) {}

  steer(position: FlightPoint, destination: FlightPoint, speed: number, time: number): FlightPoint {
    if (time >= this.refreshAt || !this.destination || Math.hypot(destination.x - this.destination.x, destination.y - this.destination.y) > 128) {
      this.path = this.nav.findPath(position, destination, this.halfW, this.halfH);
      this.destination = { ...destination };
      this.refreshAt = time + 800;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - position.x, this.path[0].y - position.y) < 20 && this.nav.lineClear(position, this.path[1], this.halfW, this.halfH)) this.path.shift();
    for (let i = this.path.length - 1; i > 0; i--) {
      if (this.nav.lineClear(position, this.path[i], this.halfW, this.halfH)) { this.path.splice(0, i); break; }
    }
    const next = this.path[0];
    if (!next) return { x: 0, y: 0 };
    const dx = next.x - position.x, dy = next.y - position.y, distance = Math.hypot(dx, dy);
    if (distance < 6) return { x: 0, y: 0 };
    const scale = Math.min(speed, distance * 4) / distance;
    return { x: dx * scale, y: dy * scale };
  }
}
