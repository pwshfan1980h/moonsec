/** Small, allocation-free helpers shared by the rig core. Phaser-free. */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const frac = (v: number): number => v - Math.floor(v);
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Move `v` toward `target` by at most `rate` (per call). */
export function approach(v: number, target: number, rate: number): number {
  return v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);
}

/** Wrap an angle to [-π, π). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Frame-rate independent exponential smoothing factor for a per-second rate. */
export const expFactor = (ratePerSecond: number, dt: number): number => 1 - Math.exp(-ratePerSecond * dt);

/**
 * Damped spring around 0. Used for hip drop, recoil, lean, knockback: poke it with
 * `impulse` (velocity) and it settles back on its own.
 */
export class Spring {
  x = 0;
  v = 0;
  constructor(public k: number, public c: number, public min = -Infinity, public max = Infinity) {}

  impulse(v: number): void { this.v += v; }

  step(dt: number): void {
    this.v += (-this.k * this.x - this.c * this.v) * dt;
    this.x = clamp(this.x + this.v * dt, this.min, this.max);
  }

  reset(): void { this.x = 0; this.v = 0; }
}

/** Seeded PRNG (mulberry32) for deterministic presentation noise. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
