import type { Vec } from './Perception';

/** Steering behaviours: each returns a desired velocity (world units/s). Allocation-light. */

export function limit(v: Vec, max: number): Vec {
  const l = Math.hypot(v.x, v.y);
  return l > max && l > 0 ? { x: (v.x / l) * max, y: (v.y / l) * max } : v;
}

export function seek(pos: Vec, target: Vec, speed: number): Vec {
  const dx = target.x - pos.x, dy = target.y - pos.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: (dx / l) * speed, y: (dy / l) * speed };
}

/** Seek that slows inside `slowRadius` and stops on the target. */
export function arrive(pos: Vec, target: Vec, speed: number, slowRadius: number): Vec {
  const dx = target.x - pos.x, dy = target.y - pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return { x: 0, y: 0 };
  const s = d < slowRadius ? speed * (d / slowRadius) : speed;
  return { x: (dx / d) * s, y: (dy / d) * s };
}

export function flee(pos: Vec, threat: Vec, speed: number): Vec {
  const v = seek(pos, threat, speed);
  return { x: -v.x, y: -v.y };
}

/** Steer toward where a moving target will be. */
export function pursue(pos: Vec, target: Vec, targetVel: Vec, speed: number, maxLead = 1): Vec {
  const t = Math.min(maxLead, Math.hypot(target.x - pos.x, target.y - pos.y) / Math.max(1, speed));
  return seek(pos, { x: target.x + targetVel.x * t, y: target.y + targetVel.y * t }, speed);
}

/** Circle a centre at `radius`, `dir` = +1 clockwise (y-down), -1 counter. */
export function orbit(pos: Vec, centre: Vec, radius: number, speed: number, dir: 1 | -1): Vec {
  const dx = pos.x - centre.x, dy = pos.y - centre.y;
  const d = Math.hypot(dx, dy) || 1;
  const tx = (-dy / d) * dir, ty = (dx / d) * dir;
  const radial = (radius - d) / Math.max(radius, 1);
  return limit({ x: (tx + (dx / d) * radial * 2) * speed, y: (ty + (dy / d) * radial * 2) * speed }, speed);
}

export interface Boid { x: number; y: number; vx: number; vy: number }

export interface FlockWeights { separation: number; alignment: number; cohesion: number; radius: number }

/** Classic boids forces for one member against its neighbours (excluding itself). */
export function flock(self: Boid, others: readonly Boid[], w: FlockWeights): Vec {
  let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
  for (const o of others) {
    if (o === self) continue;
    const dx = self.x - o.x, dy = self.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d > w.radius || d < 1e-3) continue;
    n++;
    sx += (dx / d) * (1 - d / w.radius); sy += (dy / d) * (1 - d / w.radius);
    ax += o.vx; ay += o.vy;
    cx += o.x; cy += o.y;
  }
  if (!n) return { x: 0, y: 0 };
  cx /= n; cy /= n; ax /= n; ay /= n;
  return {
    x: sx * w.separation * 100 + (ax - self.vx) * w.alignment + (cx - self.x) * w.cohesion,
    y: sy * w.separation * 100 + (ay - self.vy) * w.alignment + (cy - self.y) * w.cohesion,
  };
}
