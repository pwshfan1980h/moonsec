import type Phaser from 'phaser';
import type { PaletteName } from '../render/palette';
import type { DrawApi, PartSpec } from '../rig/parts/types';
import { rasterizePart } from '../rig/raster';
import { METAL, hash, lambert, line, ramp } from './shade';

/** Native size of the storage-dome interior backdrop (drawn at 2×: 1408 × 600 world units). */
export const INTERIOR_W = 704, INTERIOR_H = 300;
export const DOME_INTERIOR_KEY = 'dome-interior';

const SHELL: readonly PaletteName[] = ['void', 'cold0', 'hull1', 'hull2', 'hull3'];
const RIB: readonly PaletteName[] = ['cold0', 'hull1', 'hull2', 'hull3', 'hull4'];
const LAMPS = [0.14, 0.32, 0.68, 0.86];

/**
 * The inside of a giant storage dome, seen from its floor: the concave shell fades from lamp-lit
 * ribs at the base to black under an oculus open to the sky; a rear bay door and storage racks
 * stand against the back wall; the cut shell shows as a thick chrome rim at the edge.
 */
function drawInterior(d: DrawApi): void {
  const cx = INTERIOR_W / 2, base = INTERIOR_H, rx = INTERIOR_W / 2 - 2, ry = INTERIOR_H - 6;
  const lampGlow = (x: number, y: number) => {
    let g = 0;
    for (const f of LAMPS) {
      const lx = f * INTERIOR_W, dx = Math.abs(x - lx) / (18 + (base - y) * 0.35), dy = (base - y) / ry;
      if (dx < 1) g = Math.max(g, (1 - dx) * (1 - dy) ** 1.6);
    }
    return g;
  };
  const LON = Math.PI / 12, LAT = Math.PI / 14;
  const cellOf = (x: number, y: number): [number, number] | null => {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - base) / ry;
    const q = u * u + v * v;
    if (q > 1) return null;
    return [Math.floor(Math.atan2(u, Math.sqrt(1 - q)) / LON), Math.floor(Math.asin(Math.min(1, -v)) / LAT)];
  };
  for (let y = 0; y < INTERIOR_H; y++) for (let x = 0; x < INTERIOR_W; x++) {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - base) / ry;
    const q = u * u + v * v;
    if (q > 1) continue;
    if (q > 0.985) { // the cut shell: brushed metal rim, lit from the upper left
      const n = Math.sqrt(q);
      d.px(x, y, ramp(METAL, 0.15 + 0.8 * lambert(u / n, v / n, 0.3), x, y));
      continue;
    }
    if (((x + 0.5 - cx) / 20) ** 2 + ((y + 0.5 - (base - ry + 20)) / 6) ** 2 < 1) { d.px(x, y, 'void'); continue; } // oculus
    const height = -v; // 0 at the floor .. 1 at the apex
    const glow = lampGlow(x, y);
    const t = 0.12 + 0.45 * (1 - height) ** 2 + 0.45 * glow;
    const here = cellOf(x, y)!, left = cellOf(x - 1, y), up = cellOf(x, y - 1);
    const seam = (left && left[0] !== here[0]) || (up && up[1] !== here[1]);
    d.px(x, y, ramp(seam ? RIB : SHELL, seam ? t + 0.25 : t, x, y));
  }
  // oculus rim and a few stars through it
  for (let a = 0; a < Math.PI * 2; a += 0.02) d.px(Math.round(cx + Math.cos(a) * 21), Math.round(base - ry + 20 + Math.sin(a) * 6), 'hull3');
  for (let k = 0; k < 6; k++) d.px(Math.round(cx - 12 + hash(k, 1) * 24), Math.round(base - ry + 17 + hash(1, k) * 5), 'cyan3');

  // storage racks against the back wall, left and right
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x0 = Math.round(cx + side * (110 + k * 58)) - (side < 0 ? 44 : 0), top = base - 70 + k * 6;
      d.R(x0, top, 44, base - top, 'hull1');
      for (let y = top; y < base; y += 16) { d.R(x0, y, 44, 2, 'hull2'); d.R(x0, y, 44, 1, 'hull3'); }
      for (const px of [x0, x0 + 21, x0 + 42]) d.R(px, top, 2, base - top, 'hull2');
      for (let y = top + 4; y < base - 4; y += 16) for (let bx = x0 + 3; bx < x0 + 40; bx += 10) {
        if (hash(bx, y, k) < 0.35) continue;
        d.R(bx, y, 8, 10, hash(bx, y) < 0.5 ? 'cold0' : 'regolith0'); d.R(bx, y, 8, 1, 'hull3');
      }
    }
  }
  // rear bay door
  const dw = 132, dh = 96, dx = cx - dw / 2, dy = base - dh;
  d.R(dx - 6, dy - 8, dw + 12, dh + 8, 'hull2'); d.R(dx - 6, dy - 8, dw + 12, 2, 'hull4');
  d.R(dx, dy, dw, dh, 'hull1');
  for (let y = dy + 6; y < base; y += 8) { d.R(dx, y, dw, 1, 'hull0'); d.R(dx, y + 1, dw, 1, 'hull2'); }
  for (let x = 0; x < dw; x++) d.R(dx + x, base - 6, 1, 4, ((x >> 3) & 1) ? 'amber0' : 'hull0');
  d.R(cx - 8, dy - 6, 16, 3, 'amber0'); d.R(cx - 5, dy - 5, 10, 1, 'amber1');
  // lamp housings at the base of each light
  for (const f of LAMPS) {
    const lx = Math.round(f * INTERIOR_W);
    d.R(lx - 6, base - 5, 12, 5, 'hull2'); d.R(lx - 6, base - 5, 12, 1, 'hull4'); d.R(lx - 4, base - 6, 8, 1, 'amber1');
    line(d, lx - 5, base - 7, lx + 5, base - 7, 'amber0');
  }
}

const INTERIOR: PartSpec = { w: INTERIOR_W, h: INTERIOR_H, px: INTERIOR_W / 2, py: INTERIOR_H, draw: drawInterior };

/** Build the interior backdrop texture once (native size; place it at 2×). */
export function ensureDomeInterior(scene: Phaser.Scene): string {
  if (scene.textures.exists(DOME_INTERIOR_KEY)) return DOME_INTERIOR_KEY;
  const r = rasterizePart(INTERIOR, 'n', { outline: false });
  const tex = scene.textures.createCanvas(DOME_INTERIOR_KEY, r.width, r.height)!;
  const img = tex.getContext().createImageData(r.width, r.height);
  img.data.set(r.data);
  tex.getContext().putImageData(img, 0, 0);
  tex.refresh();
  return DOME_INTERIOR_KEY;
}

export { INTERIOR as DOME_INTERIOR_SPEC };
