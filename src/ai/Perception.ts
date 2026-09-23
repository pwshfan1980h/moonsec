export interface Vec { x: number; y: number }

export interface PerceptionOptions {
  /** Sight range, world units. */
  range: number;
  /** Full field of view in radians (2π = all-round sensors). */
  fov: number;
  /** Seconds a last-known position stays useful. */
  memory: number;
  /** Hearing radius for gunfire/footfalls, world units. */
  hearing?: number;
}

export interface Noise { x: number; y: number; loudness: number }

/**
 * What an enemy knows about the player. Sight needs range, field of view and a clear
 * line through terrain; without sight an enemy remembers where it last saw or heard
 * the player and searches there instead of tracking through walls.
 */
export class Perception {
  sees = false;
  heard = false;
  lastKnown: Vec | null = null;
  /** 1 while seen, decays toward 0 over `memory` seconds. */
  confidence = 0;
  /** Seconds since last direct sight. */
  sinceSeen = Infinity;

  constructor(public opts: PerceptionOptions) {}

  update(dt: number, self: Vec, facing: 1 | -1, target: Vec, lineClear: (a: Vec, b: Vec) => boolean, noises: readonly Noise[] = []): void {
    const dx = target.x - self.x, dy = target.y - self.y;
    const dist = Math.hypot(dx, dy);
    let sees = dist <= this.opts.range;
    if (sees && this.opts.fov < Math.PI * 2) {
      const ang = Math.atan2(dy, dx * facing);
      sees = Math.abs(ang) <= this.opts.fov / 2;
    }
    if (sees) sees = lineClear(self, target);
    this.sees = sees;
    this.heard = false;
    if (sees) {
      this.lastKnown = { x: target.x, y: target.y };
      this.confidence = 1;
      this.sinceSeen = 0;
      return;
    }
    this.sinceSeen += dt;
    const hearing = this.opts.hearing ?? 0;
    for (const n of noises) {
      if (Math.hypot(n.x - self.x, n.y - self.y) <= hearing * n.loudness) {
        this.heard = true;
        this.lastKnown = { x: n.x, y: n.y };
        this.confidence = Math.max(this.confidence, 0.6);
      }
    }
    this.confidence = Math.max(0, this.confidence - dt / this.opts.memory);
    if (this.confidence <= 0) this.lastKnown = null;
  }

  /** Whether the enemy should act on the player at all (seen or recently located). */
  get aware(): boolean { return this.sees || this.confidence > 0; }
}
