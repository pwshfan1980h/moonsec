import type { PaletteName } from '../render/palette';
import type { DrawApi, PartSpec } from '../rig/parts/types';
import { hash, line, ramp } from './shade';

/**
 * Terrain tiles, 16×16 native (one 32-unit cell at 2×), drawn without an outline pass: exposed
 * edges carry their own hull0 line so neighbouring tiles join seamlessly.
 *
 * Regolith masks: bit 1 = open above, 2 = open right, 4 = open below, 8 = open left.
 */
export const T = 16;
export const VARIANTS = 8;
export const EDGE = { up: 1, right: 2, down: 4, left: 8 } as const;

const FILL: readonly PaletteName[] = ['hull1', 'regolith0', 'regolith1'];

/** Pebbles and embedded stones scattered over the fill, placed by variant. */
function stones(d: DrawApi, v: number, seed: number, deep: boolean): void {
  const n = 2 + Math.floor(hash(v, 5, seed) * 4);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(hash(v, k, seed) * 15), y = Math.floor(hash(k, v, seed + 1) * 15);
    d.px(x, y, deep || hash(x, y, seed) < 0.6 ? 'hull1' : 'regolith1');
  }
  // an embedded rock in some tiles only: lit top-left, shadowed underside
  if (v % 3 !== 0) return;
  const rx = 2 + Math.floor(hash(v, 9, seed) * 10), ry = 3 + Math.floor(hash(9, v, seed) * 9);
  const big = hash(v, v, seed + 7) < 0.5;
  const w = big ? 4 : 3, h = big ? 3 : 2;
  d.R(rx, ry, w, h, deep ? 'regolith0' : 'regolith1');
  d.R(rx, ry, w - 1, 1, deep ? 'regolith1' : 'regolith2');
  d.R(rx, ry + h, w, 1, 'hull1');
  d.px(rx + w, ry + 1, 'hull1');
}

function regolithTile(mask: number, v: number, deep: boolean): PartSpec {
  return {
    w: T, h: T, px: 0, py: 0,
    draw: (d) => {
      // compacted body: faint diagonal shading so large fills don't read as flat colour
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        // darkens with depth; the upper fill's bottom meets the deep fill's top at the same value
        const t = deep ? 0.3 - 0.08 * (y / (T - 1)) : 0.44 - 0.14 * (y / (T - 1));
        d.px(x, y, ramp(FILL, t + 0.04 * Math.sin((x * 0.7 + y + v * 5) * 0.45), x, y));
      }
      if (deep && v % 2 === 0) { // strata
        const sy = 3 + v;
        for (let x = 0; x < T; x++) if (hash(x, sy, v) > 0.25) d.px(x, sy + (x > 8 ? 1 : 0), 'hull1');
      }
      stones(d, v, deep ? 31 : 17, deep);

      const up = mask & EDGE.up, right = mask & EDGE.right, down = mask & EDGE.down, left = mask & EDGE.left;
      if (up) {
        // sunlit crust: outline, bright lip, dithered fall-off into the fill, small craterlets
        for (let x = 0; x < T; x++) {
          d.px(x, 0, 'hull0');
          d.px(x, 1, 'regolith2');
          d.px(x, 2, (x + v) % 3 === 0 ? 'regolith1' : 'regolith2');
          d.px(x, 3, 'regolith1');
          d.px(x, 4, (x & 1) ? 'regolith1' : 'regolith0');
          d.px(x, 5, (x & 1) || (x & 2) ? 'regolith0' : 'regolith1');
        }
        const cx = 2 + Math.floor(hash(v, 3, 5) * 10);
        if (v % 2) { d.R(cx, 1, 3, 1, 'regolith0'); d.px(cx + 1, 2, 'regolith0'); d.R(cx, 2, 1, 1, 'regolith1'); d.px(cx + 2, 2, 'regolith2'); }
      }
      if (left) {
        for (let y = up ? 1 : 0; y < T; y++) {
          d.px(0, y, 'hull0');
          if (y > 5 || !up) d.px(1, y, y % 4 === 0 ? 'regolith1' : 'regolith0');
        }
        if (up) d.px(1, 1, 'regolith1');
      }
      if (right) {
        for (let y = up ? 1 : 0; y < T; y++) {
          d.px(T - 1, y, 'hull0');
          d.px(T - 2, y, 'hull1');
          if (y % 2) d.px(T - 3, y, 'hull1');
        }
      }
      if (down) {
        for (let x = 0; x < T; x++) {
          d.px(x, T - 1, 'hull0');
          d.px(x, T - 2, 'hull1');
          if (x % 2) d.px(x, T - 3, 'hull1');
        }
      }
      // outer corners get rounded one pixel
      if (up && left) d.px(0, 0, 'hull0');
      if (up && right) { d.px(T - 1, 0, 'hull0'); d.px(T - 2, 1, 'hull0'); }
    },
  };
}

/** Deck shapes by horizontal neighbours: 0 middle, 1 left end, 2 right end, 3 single. */
export type DeckShape = 0 | 1 | 2 | 3;

function deckTile(shape: DeckShape, v: number): PartSpec {
  const leftEnd = shape === 1 || shape === 3, rightEnd = shape === 2 || shape === 3;
  return {
    w: T, h: T, px: 0, py: 0,
    draw: (d) => {
      // tread plate
      for (let x = 0; x < T; x++) {
        d.px(x, 0, 'hull0');
        d.px(x, 1, 'hull5');
        d.px(x, 2, 'hull4');
        d.px(x, 3, (x + v) % 3 === 0 ? 'hull2' : 'hull4');
        d.px(x, 4, 'hull3');
        d.px(x, 5, 'hull2');
        d.px(x, 6, 'hull0');
      }
      if (v === 1) for (let x = 2; x < T; x += 6) d.px(x, 1, 'hull6');
      // truss beneath: top chord is the plate, bottom chord at 13–15, diagonals between
      for (let x = 0; x < T; x++) { d.px(x, 13, 'hull0'); d.px(x, 14, 'hull3'); d.px(x, 15, 'hull0'); }
      line(d, 0, 7, 7, 12, 'hull3'); line(d, 0, 8, 6, 12, 'hull1');
      line(d, 8, 12, 15, 7, 'hull3'); line(d, 9, 12, 15, 8, 'hull1');
      d.R(7, 7, 2, 6, 'hull2'); d.px(7, 7, 'hull4');
      if (leftEnd) {
        d.R(0, 0, 1, 16, 'hull0'); d.R(1, 7, 2, 6, 'hull3'); d.R(1, 7, 1, 6, 'hull4'); d.px(1, 1, 'hull4');
        d.R(2, 2, 2, 2, 'cyan2'); d.px(2, 2, 'cyan3'); d.R(2, 4, 2, 1, 'cyan1');
      }
      if (rightEnd) {
        d.R(15, 0, 1, 16, 'hull0'); d.R(13, 7, 2, 6, 'hull2'); d.px(14, 1, 'hull4');
        d.R(12, 2, 2, 2, 'cyan2'); d.px(12, 2, 'cyan3'); d.R(12, 4, 2, 1, 'cyan1');
      }
    },
  };
}

/** Tileset layout: regolith masks × variants, then deep fill variants, then deck shapes × 2. */
export const TILE_INDEX = {
  regolith: (mask: number, v: number) => mask * VARIANTS + v,
  deep: (v: number) => 16 * VARIANTS + v,
  deck: (shape: DeckShape, v: number) => 16 * VARIANTS + VARIANTS + shape * 2 + v,
} as const;

/** Every tile, in tileset order. */
export function terrainTiles(): PartSpec[] {
  const out: PartSpec[] = [];
  for (let m = 0; m < 16; m++) for (let v = 0; v < VARIANTS; v++) out.push(regolithTile(m, v, false));
  for (let v = 0; v < VARIANTS; v++) out.push(regolithTile(0, v, true));
  for (let s = 0; s < 4; s++) for (let v = 0; v < 2; v++) out.push(deckTile(s as DeckShape, v));
  return out;
}
