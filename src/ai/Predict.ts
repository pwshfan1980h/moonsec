import type { Vec } from './Perception';

/**
 * Where to aim a projectile of `speed` so it meets a target moving at constant velocity.
 * Falls back to the target's current position when no intercept exists.
 */
export function leadTarget(from: Vec, target: Vec, vel: Vec, speed: number): Vec {
  const dx = target.x - from.x, dy = target.y - from.y;
  const a = vel.x * vel.x + vel.y * vel.y - speed * speed;
  const b = 2 * (dx * vel.x + dy * vel.y);
  const c = dx * dx + dy * dy;
  let t: number;
  if (Math.abs(a) < 1e-6) t = b !== 0 ? -c / b : 0;
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return { x: target.x, y: target.y };
    const r = Math.sqrt(disc);
    const t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a);
    t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  }
  if (!(t > 0) || !Number.isFinite(t)) return { x: target.x, y: target.y };
  return { x: target.x + vel.x * t, y: target.y + vel.y * t };
}

/**
 * Predicts where a falling/jumping body will touch down: integrates a ballistic arc
 * (with optional upward thrust) until it reaches the ground under it.
 * `groundAt(x, fromY)` returns the surface y at or below `fromY`, or null.
 */
export function predictLanding(
  pos: Vec, vel: Vec, gravity: number,
  groundAt: (x: number, fromY: number) => number | null,
  opts: { maxTime?: number; step?: number; thrust?: number } = {},
): Vec & { t: number } {
  const maxTime = opts.maxTime ?? 2.5, step = opts.step ?? 1 / 30, thrust = opts.thrust ?? 0;
  let x = pos.x, y = pos.y, vx = vel.x, vy = vel.y;
  for (let t = 0; t <= maxTime; t += step) {
    const g = groundAt(x, y);
    if (g !== null && y >= g - 1 && vy >= 0) return { x, y: g, t };
    vy += (gravity - thrust) * step;
    x += vx * step;
    const ny = y + vy * step;
    if (g !== null && ny >= g) return { x, y: g, t: t + step };
    y = ny;
  }
  const g = groundAt(x, y);
  return { x, y: g ?? y, t: maxTime };
}
