import Phaser from 'phaser';
import { GAME_W } from '../constants';
import type { PaletteName } from '../render/palette';
import type { DrawApi, PartSpec } from '../rig/parts/types';
import { rasterizePart } from '../rig/raster';
import { hash, lambert, line, noise3, ramp, ridge1 } from './shade';

/**
 * Parallax backdrop for surface missions, built from the same shading tools as the world kit:
 * a lit Earth, far highlands, a distant colony skyline, and near regolith hills. Strips tile
 * horizontally and are drawn at 2× like everything else, so the retro grid keeps them crisp.
 */

// ── Earth ──────────────────────────────────────────────────────────────────────
const EARTH_R = 56;
const SUN = (() => { const v = [-0.72, -0.34, 0.6]; const n = Math.hypot(...v); return v.map((c) => c / n); })();
const OCEAN: readonly PaletteName[] = ['cold0', 'cold1', 'cold2', 'cyan1'];
const LAND: readonly PaletteName[] = ['regolith0', 'regolith1', 'regolith2', 'hull5'];
const CLOUD: readonly PaletteName[] = ['hull4', 'hull5', 'hull6', 'cyan3'];

function fbm(x: number, y: number, z: number, seed: number): number {
  return 0.55 * noise3(x, y, z, seed) + 0.3 * noise3(x * 2.1, y * 2.1, z * 2.1, seed + 1) + 0.15 * noise3(x * 4.3, y * 4.3, z * 4.3, seed + 2);
}

function drawEarth(d: DrawApi): void {
  const c = EARTH_R + 2;
  for (let y = 0; y < c * 2; y++) for (let x = 0; x < c * 2; x++) {
    const u = (x + 0.5 - c) / EARTH_R, v = (y + 0.5 - c) / EARTH_R;
    const q = u * u + v * v;
    const lit = (nx: number, ny: number, nz: number) => nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
    if (q > 1) {
      // thin atmosphere halo on the sunlit limb
      const r = Math.sqrt(q);
      if (r < 1 + 2.2 / EARTH_R && lit(u / r, v / r, 0) > 0.15) d.px(x, y, r < 1 + 1.1 / EARTH_R ? 'cyan1' : 'cyan0');
      continue;
    }
    const nx = u, ny = v, nz = Math.sqrt(1 - q);
    const l = lit(nx, ny, nz);
    const land = fbm(nx * 2.4 + 3, ny * 2.4, nz * 2.4, 7) > 0.56;
    const ice = Math.abs(ny) > 0.82 + 0.06 * noise3(nx * 6, ny * 6, nz * 6, 3);
    const cloud = fbm(nx * 3.2, ny * 9, nz * 3.2, 19) > 0.6;
    if (l < -0.06) { // night side: black oceans, amber city lights on land
      const city = land && !ice && hash(x, y, 41) < 0.09;
      d.px(x, y, city ? (hash(y, x, 42) < 0.4 ? 'amber1' : 'amber0') : ramp(['void', 'cold0', 'cold1'], 0.55 + l * 0.5, x, y));
      continue;
    }
    const t = Math.min(1, 0.15 + 1.05 * Math.max(0, l));
    let col: PaletteName = cloud ? ramp(CLOUD, t, x, y) : ice ? ramp(CLOUD, t * 0.9, x, y) : land ? ramp(LAND, t, x, y) : ramp(OCEAN, t, x, y);
    if (l < 0.08) col = ramp(['void', 'cold0', col], (l + 0.06) / 0.14, x, y); // dithered terminator
    if (q > 0.9 && l > 0.1) col = q > 0.965 ? 'cyan2' : ramp(['cyan1', col], (0.965 - q) / 0.065, x, y); // lit limb scattering
    if (lambert(nx, ny, nz) > 0.992 && !land) col = 'cyan3'; // ocean glint
    d.px(x, y, col);
  }
}

export const EARTH_SPEC: PartSpec = { w: (EARTH_R + 2) * 2, h: (EARTH_R + 2) * 2, px: EARTH_R + 2, py: EARTH_R + 2, draw: drawEarth };

// ── strips ─────────────────────────────────────────────────────────────────────
interface Strip { key: string; spec: PartSpec }

/** Far lunar highlands: tall ridges, sunlit slopes facing the upper-left light. */
function highlands(): Strip {
  const W = 960, H = 170, CELL = 40, P = W / CELL;
  const crest = (x: number) => 40 + 64 * ridge1(((x % W) + W) % W / CELL, P, 5);
  const BODY: readonly PaletteName[] = ['void', 'cold0', 'hull1', 'hull2'];
  return {
    key: 'bg-highlands',
    spec: {
      w: W, h: H, px: 0, py: 0,
      draw: (d) => {
        for (let x = 0; x < W; x++) {
          const top = Math.round(crest(x)), slope = crest(x - 1) - crest(x + 1);
          for (let y = top; y < H; y++) {
            // light only rakes the crest; the massif below is a flat, darkening body
            const near = Math.max(0, 1 - (y - top) / 10);
            d.px(x, y, ramp(BODY, 0.36 + slope * 0.16 * near - ((y - top) / (H - top)) * 0.3, x, y));
          }
          if (slope > 0.4) d.px(x, top, 'hull2');
        }
      },
    },
  };
}

const DIST: readonly PaletteName[] = ['void', 'cold0', 'hull1', 'cold1', 'hull2', 'hull3'];

/** Distant colony skyline: domes, silos, masts, blocks and gantries, windows lit. */
function colony(): Strip {
  const W = 1200, H = 120, BASE = 96;
  return {
    key: 'bg-colony',
    spec: {
      w: W, h: H, px: 0, py: 0,
      draw: (d) => {
        d.R(0, BASE, W, H - BASE, 'cold0');
        for (let x = 0; x < W; x += 1) if (hash(x, 1, 3) < 0.3) d.px(x, BASE, 'hull1');
        let x = 10;
        let k = 0;
        while (x < W - 70) {
          const kind = Math.floor(hash(k, 7, 11) * 6);
          const w = structure(d, kind, x, BASE, k);
          x += w + 8 + Math.floor(hash(k, 9, 11) * 40);
          k++;
        }
      },
    },
  };
}

function structure(d: DrawApi, kind: number, x: number, base: number, k: number): number {
  if (kind <= 1) { // dome with seams and a window ring
    const rx = 18 + Math.floor(hash(k, 1) * 16), ry = Math.round(rx * 0.75), cx = x + rx;
    for (let y = base - ry; y < base; y++) for (let px = cx - rx; px < cx + rx; px++) {
      const u = (px + 0.5 - cx) / rx, v = (y + 0.5 - base) / ry, q = u * u + v * v;
      if (q > 1) continue;
      const seam = Math.abs(Math.sin(Math.atan2(u, Math.sqrt(1 - q)) * 4)) < 0.12;
      d.px(px, y, seam ? 'hull1' : ramp(DIST, 0.2 + 0.75 * lambert(u, v, Math.sqrt(1 - q)), px, y));
    }
    for (let i = -2; i <= 2; i++) if (hash(k, i + 5) < 0.6) d.R(cx + i * Math.round(rx / 3) - 1, base - 5, 2, 2, hash(i, k) < 0.5 ? 'cyan1' : 'amber0');
    d.R(x - 2, base - 2, rx * 2 + 4, 2, 'hull1');
    return rx * 2;
  }
  if (kind === 2) { // silo pair
    for (const off of [0, 11]) {
      const h = 34 + Math.floor(hash(k, off) * 16);
      for (let i = 0; i < 9; i++) {
        const nx = (i + 0.5 - 4.5) / 4.5;
        for (let y = base - h; y < base; y++) d.px(x + off + i, y, ramp(DIST, 0.15 + 0.8 * lambert(nx, 0, Math.sqrt(1 - nx * nx)), x + off + i, y));
      }
      d.R(x + off + 1, base - h - 2, 7, 2, 'hull2');
    }
    return 20;
  }
  if (kind === 3) { // lattice mast with a beacon
    const h = 60 + Math.floor(hash(k, 3) * 24);
    d.R(x + 2, base - h, 1, h, 'hull2'); d.R(x + 6, base - h, 1, h, 'hull1');
    for (let y = base - h; y < base - 4; y += 6) line(d, x + 2, y, x + 6, y + 6, 'hull1');
    d.R(x + 3, base - h - 3, 3, 3, 'amber1');
    return 9;
  }
  if (kind === 4) { // habitat block with lit windows
    const w = 30 + Math.floor(hash(k, 4) * 26), h = 16 + Math.floor(hash(4, k) * 14);
    for (let y = base - h; y < base; y++) for (let i = 0; i < w; i++) d.px(x + i, y, ramp(DIST, 0.5 - (y - base + h) / h * 0.25, x + i, y));
    d.R(x, base - h, w, 1, 'hull3');
    for (let wy = base - h + 4; wy < base - 3; wy += 5) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (hash(wx, wy, k) < 0.35) d.R(wx, wy, 2, 2, hash(wy, wx) < 0.7 ? 'cyan0' : 'amber0');
    return w;
  }
  // gantry crane
  const h = 48 + Math.floor(hash(k, 6) * 16), w = 44;
  for (const lx of [x + 4, x + 30]) { d.R(lx, base - h, 2, h, 'hull2'); for (let y = base - h; y < base; y += 6) line(d, lx - 2, y, lx + 3, y + 6, 'hull1'); }
  d.R(x, base - h - 3, w, 3, 'hull2'); d.R(x, base - h - 3, w, 1, 'hull3');
  d.R(x + 18, base - h, 1, 14, 'hull1'); d.R(x + 15, base - h + 14, 7, 5, 'amber0');
  return w;
}

/** Near regolith hills, just behind the playfield: rolling crests with rocks. */
function hills(): Strip {
  const W = 800, H = 110, CELL = 50, P = W / CELL;
  const crest = (x: number) => 12 + 44 * ridge1(((x % W) + W) % W / CELL, P, 23, 3);
  const BODY: readonly PaletteName[] = ['void', 'hull1', 'regolith0', 'regolith1'];
  return {
    key: 'bg-hills',
    spec: {
      w: W, h: H, px: 0, py: 0,
      draw: (d) => {
        for (let x = 0; x < W; x++) {
          const top = Math.round(crest(x)), slope = crest(x - 1) - crest(x + 1);
          for (let y = top; y < H; y++) d.px(x, y, ramp(BODY, 0.5 + slope * 0.15 * Math.max(0, 1 - (y - top) / 8) - (y - top) / (H - top) * 0.5, x, y));
          d.px(x, top, slope > -0.1 ? 'regolith1' : 'hull1');
          if (hash(x, 3, 29) < 0.012) { // a boulder on the crest
            const r = 2 + Math.floor(hash(x, 4, 29) * 4);
            for (let j = -r; j <= 0; j++) for (let i = -r; i <= r; i++) if (i * i + j * j * 2 <= r * r) d.px(x + i, top + j, ramp(BODY, 0.55 - (i + j) * 0.06, x + i, top + j));
          }
        }
      },
    },
  };
}

/** The strips, for tests and tools. */
export function backdropStrips(): Strip[] { return [highlands(), colony(), hills()]; }

// ── layers ─────────────────────────────────────────────────────────────────────
function texture(scene: Phaser.Scene, key: string, spec: PartSpec): void {
  if (scene.textures.exists(key)) return;
  const r = rasterizePart(spec, 'n', { outline: false });
  const tex = scene.textures.createCanvas(key, r.width, r.height)!;
  const img = tex.getContext().createImageData(r.width, r.height);
  img.data.set(r.data);
  tex.getContext().putImageData(img, 0, 0);
  tex.refresh();
}

interface Layer { sprite: Phaser.GameObjects.TileSprite; fx: number }

/**
 * Surface backdrop: Earth plus three parallax strips. `fx` is horizontal parallax (0 = fixed to
 * the screen, 1 = the world); strips also sink a little as the camera climbs (scroll factor y).
 */
export class SurfaceBackdrop {
  private readonly layers: Layer[] = [];

  constructor(scene: Phaser.Scene) {
    texture(scene, 'bg-earth', EARTH_SPEC);
    scene.add.image(1240, 250, 'bg-earth').setScale(2).setScrollFactor(0.02).setDepth(1.05);
    const strips: [Strip, number, number, number, number][] = [
      // strip, fx, fy, bottom (world y at rest), depth
      [highlands(), 0.06, 0.05, 1010, 1.2],
      [colony(), 0.16, 0.12, 1010, 1.3],
      [hills(), 0.38, 0.3, 1060, 1.4],
    ];
    for (const [strip, fx, fy, bottom, depth] of strips) {
      texture(scene, strip.key, strip.spec);
      const h = strip.spec.h * 2;
      const sprite = scene.add.tileSprite(GAME_W / 2, bottom, GAME_W, h, strip.key)
        .setOrigin(0.5, 1).setTileScale(2, 2).setScrollFactor(0, fy).setDepth(depth);
      this.layers.push({ sprite, fx });
    }
  }

  /** Scroll strips with the camera; snapped to whole native pixels so the grid stays clean. */
  update(scrollX: number): void {
    for (const l of this.layers) l.sprite.tilePositionX = Math.round((scrollX * l.fx) / 2);
  }
}
