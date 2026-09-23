import type { PaletteName } from '../render/palette';
import type { DrawApi } from '../rig/parts/types';

/**
 * Shading helpers for world art. Everything resolves to palette names; smooth light falls onto
 * a ramp through a 4×4 ordered dither, so curved metal reads as curved at native resolution.
 * Light comes from the upper left, matching HARROW.
 */

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Deterministic 0..1 hash of integer coordinates and a seed. */
export function hash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Pick from a dark→light ramp for light level t (0..1), ordered-dithered at (x, y). */
export function ramp(r: readonly PaletteName[], t: number, x: number, y: number): PaletteName {
  const v = Math.max(0, Math.min(1, t)) * (r.length - 1);
  const lo = Math.floor(v);
  const threshold = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  return r[Math.min(r.length - 1, v - lo > threshold ? lo + 1 : lo)];
}

/** Light direction (unit), upper-left and toward the viewer. */
const L = (() => { const v = [-0.55, -0.6, 0.58]; const n = Math.hypot(...v); return v.map((c) => c / n); })();

/** Lambert term for a surface normal. */
export function lambert(nx: number, ny: number, nz: number): number {
  return Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
}

/**
 * Chrome: a mirror of the environment. Normals facing up reflect the black sky, the band at
 * the horizon reflects the lit regolith plain, normals facing down reflect the ground, and a
 * hard specular sits where the normal meets the light.
 */
export function chrome(nx: number, ny: number, nz: number): { t: number; ramp: readonly PaletteName[] } {
  const spec = lambert(nx, ny, nz);
  if (spec > 0.996) return { t: 1, ramp: ['hull6', 'cyan3'] };
  if (spec > 0.985) return { t: (spec - 0.985) / 0.011, ramp: ['hull5', 'hull6'] };
  // reflected view ray's vertical component: -1 up (sky) .. +1 down (ground)
  const ry = 2 * nz * ny;
  if (ry < -0.12) return { t: 0.15 + 0.5 * spec + 0.25 * (1 + ry), ramp: CHROME_SKY };
  if (ry < 0.08) return { t: 0.55 + 0.45 * spec, ramp: CHROME_HORIZON };
  return { t: 0.3 + 0.5 * spec, ramp: CHROME_GROUND };
}
const CHROME_SKY: readonly PaletteName[] = ['hull0', 'cold0', 'hull1', 'cold1', 'hull3', 'hull4'];
const CHROME_HORIZON: readonly PaletteName[] = ['hull4', 'hull5', 'hull6'];
const CHROME_GROUND: readonly PaletteName[] = ['hull1', 'regolith0', 'hull3', 'regolith1', 'hull4'];

/** Brushed metal: lambert onto the hull ramp. */
export const METAL: readonly PaletteName[] = ['hull1', 'hull2', 'hull3', 'hull4', 'hull5', 'hull6'];
/** Lunar rock, dark → light. */
export const ROCK: readonly PaletteName[] = ['hull1', 'regolith0', 'regolith1', 'regolith2'];

/** Plain filled rect with a lit top edge and a shaded bottom edge (a machined plate). */
export function plate(d: DrawApi, x: number, y: number, w: number, h: number, mid: PaletteName, lit: PaletteName, dark: PaletteName): void {
  d.R(x, y, w, h, mid);
  d.R(x, y, w, 1, lit);
  d.R(x, y + h - 1, w, 1, dark);
  d.R(x + w - 1, y + 1, 1, h - 1, dark);
}

/** Line of rivets. */
export function rivets(d: DrawApi, x0: number, y: number, x1: number, step: number, c: PaletteName): void {
  for (let x = x0; x <= x1; x += step) d.px(x, y, c);
}

/** 1 px line between two points (Bresenham). */
export function line(d: DrawApi, x0: number, y0: number, x1: number, y1: number, c: PaletteName): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    d.px(x0, y0, c);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Vertical cylinder shaded with `shader(nx, ny, nz)` (nx across the width, ny = 0). */
export function cylinderV(
  d: DrawApi, x: number, y: number, w: number, h: number,
  shader: (nx: number, ny: number, nz: number, px: number, py: number) => PaletteName,
): void {
  const r = w / 2;
  for (let i = 0; i < w; i++) {
    const nx = (i + 0.5 - r) / r;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx));
    for (let j = 0; j < h; j++) d.px(x + i, y + j, shader(nx, 0, nz, x + i, y + j));
  }
}

/** Horizontal cylinder (a pipe) — ny across the height. */
export function cylinderH(
  d: DrawApi, x: number, y: number, w: number, h: number,
  shader: (nx: number, ny: number, nz: number, px: number, py: number) => PaletteName,
): void {
  const r = h / 2;
  for (let j = 0; j < h; j++) {
    const ny = (j + 0.5 - r) / r;
    const nz = Math.sqrt(Math.max(0, 1 - ny * ny));
    for (let i = 0; i < w; i++) d.px(x + i, y + j, shader(0, ny, nz, x + i, y + j));
  }
}

/**
 * Upper hemisphere (or squashed dome) centred on (cx, baseY), radius rx × ry, shaded per pixel.
 * `shader` gets the surface normal and the pixel; returning null leaves the pixel untouched.
 */
export function dome(
  d: DrawApi, cx: number, baseY: number, rx: number, ry: number,
  shader: (nx: number, ny: number, nz: number, px: number, py: number) => PaletteName | null,
): void {
  for (let y = Math.floor(baseY - ry); y < baseY; y++) {
    for (let x = Math.floor(cx - rx); x < Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - baseY) / ry;
      const q = u * u + v * v;
      if (q > 1) continue;
      const c = shader(u, v, Math.sqrt(1 - q), x, y);
      if (c) d.px(x, y, c);
    }
  }
}
