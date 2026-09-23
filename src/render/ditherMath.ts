/**
 * CPU mirror of the retro filter's colour pick (src/render/shaders/retro.frag.ts).
 * The shader cannot be unit-tested; this keeps the maths honest and documents it.
 *
 * Each screen block is snapped to one sample, matched against the palette with a
 * luma-weighted RGB distance, and dithered between the nearest two palette colours
 * with a 4×4 ordered (Bayer) threshold. Exact palette colours never dither.
 */
import type { RGB } from './palette';

/** 2×2 Bayer via the shader's closed form; returns 0, .25, .5 or .75 scaled pattern. */
export function bayer2(x: number, y: number): number {
  x = Math.floor(x); y = Math.floor(y);
  const v = x * 0.5 + y * y * 0.75;
  return v - Math.floor(v);
}

/** 4×4 ordered-dither threshold in [0, 1): 16 distinct levels. */
export function bayer4(x: number, y: number): number {
  return bayer2(x * 0.5, y * 0.5) * 0.25 + bayer2(x, y);
}

const W: RGB = [0.3, 0.59, 0.11];

function dist(a: RGB, b: readonly number[]): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr * W[0] + dg * dg * W[1] + db * db * W[2];
}

/**
 * Picks the output colour for a block. `rgb` and palette are 0..1 floats.
 * `spread` 0 = nearest colour only, 1 = full ordered dither.
 */
export function pickColor(rgb: RGB, palette: readonly RGB[], cellX: number, cellY: number, spread: number): RGB {
  let d1 = Infinity, d2 = Infinity;
  let c1: RGB = rgb, c2: RGB = rgb;
  for (const p of palette) {
    const d = dist(rgb, p);
    if (d < d1) { d2 = d1; c2 = c1; d1 = d; c1 = p; }
    else if (d < d2) { d2 = d; c2 = p; }
  }
  const s1 = Math.sqrt(d1), s2 = Math.sqrt(d2);
  const p2 = s1 / Math.max(s1 + s2, 1e-6);
  return p2 * spread > bayer4(cellX, cellY) ? c2 : c1;
}
