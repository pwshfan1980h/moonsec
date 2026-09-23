import type { PaletteName } from '../render/palette';
import type { DrawApi, PartSet } from '../rig/parts/types';
import { METAL, ROCK, chrome, cylinderH, cylinderV, dome, hash, inside, lambert, line, plate, ramp, rivets } from './shade';

/**
 * World props, built like HARROW's parts: palette-only primitives, one light from the upper
 * left, a 1 px hull0 outline added by the rasteriser. Anchors (px, py) sit where a prop meets
 * the ground (bottom centre) unless noted, so placement is "stand it on this surface".
 * Native pixels; drawn at 2× in the world.
 */

// ── storage dome ─────────────────────────────────────────────────────────────
const DOME_W = 184, DOME_H = 98, DOME_BASE = 86, DOME_RX = 88, DOME_RY = 80;
const LON = Math.PI / 9, LAT = Math.PI / 14;

function geodesicCell(nx: number, ny: number, nz: number): [number, number, number] {
  const lon = Math.atan2(nx, nz) / LON;
  const lat = Math.asin(Math.min(1, -ny)) / LAT;
  const band = Math.floor(lat);
  const diag = Math.floor(lon + (band % 2 ? 1 : -1) * (lat - band));
  return [Math.floor(lon), band, diag];
}

function drawDome(d: DrawApi): void {
  const cx = DOME_W / 2;
  const cell = (x: number, y: number): [number, number, number] | null => {
    const u = (x + 0.5 - cx) / DOME_RX, v = (y + 0.5 - DOME_BASE) / DOME_RY;
    const q = u * u + v * v;
    return q > 1 || v >= 0 ? null : geodesicCell(u, v, Math.sqrt(1 - q));
  };
  dome(d, cx, DOME_BASE, DOME_RX, DOME_RY, (nx, ny, nz, x, y) => {
    const s = chrome(nx, ny, nz);
    const here = cell(x, y)!, left = cell(x - 1, y), up = cell(x, y - 1);
    const lonSeam = left && left[0] !== here[0];
    const latSeam = up && up[1] !== here[1];
    const diagSeam = left && left[2] !== here[2] && !lonSeam;
    if (s.ramp[0] === 'hull6' || s.ramp[0] === 'hull5') return ramp(s.ramp, s.t, x, y); // no seams in the glare
    if (lonSeam && latSeam) return 'hull5'; // node
    if (lonSeam || latSeam) return s.ramp[0] === 'hull4' ? 'hull3' : 'hull1';
    if (diagSeam) return s.t > 0.7 ? 'hull4' : 'hull2';
    return ramp(s.ramp, s.t, x, y);
  });
  // viewport band: dim cyan windows set into one latitude ring
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const x = Math.round(cx + i * 20 - 2), y = DOME_BASE - 20 - Math.round(Math.abs(i) * 0.5);
    d.R(x, y, 5, 3, 'cyan0'); d.px(x, y, 'cyan1'); d.px(x + 1, y, 'cyan1'); d.R(x, y + 3, 5, 1, 'hull1');
  }
  // plinth ring with buttresses and vents
  plate(d, 0, DOME_BASE, DOME_W, DOME_H - DOME_BASE, 'hull3', 'hull5', 'hull1');
  for (let x = 6; x < DOME_W - 6; x += 16) {
    d.R(x, DOME_BASE + 1, 3, DOME_H - DOME_BASE - 2, 'hull2'); d.R(x, DOME_BASE + 1, 1, DOME_H - DOME_BASE - 2, 'hull4');
    d.R(x + 8, DOME_BASE + 4, 4, 2, 'hull0'); d.R(x + 8, DOME_BASE + 6, 4, 1, 'hull4');
  }
  // cargo bulkhead: lit frame, split leaves, hazard sill, status lamp
  const dx = cx - 16, dy = DOME_BASE - 30;
  d.R(dx - 3, dy - 3, 38, 33 + DOME_H - DOME_BASE, 'hull4');
  d.R(dx - 3, dy - 3, 38, 1, 'hull6');
  d.R(dx - 1, dy - 1, 34, 31 + DOME_H - DOME_BASE, 'hull2');
  d.R(dx, dy, 32, 30 + DOME_H - DOME_BASE - 4, 'hull3');
  d.R(dx + 15, dy, 2, 30 + DOME_H - DOME_BASE - 4, 'hull0');
  for (let y = dy + 4; y < DOME_H - 6; y += 6) { d.R(dx + 2, y, 12, 1, 'hull2'); d.R(dx + 18, y, 12, 1, 'hull2'); }
  for (let x = 0; x < 32; x++) {
    const stripe = ((x + (DOME_H - 4)) >> 2) & 1;
    d.R(dx + x, DOME_H - 4, 1, 3, stripe ? 'amber1' : 'hull0');
  }
  d.R(cx - 3, dy - 8, 6, 3, 'hull1'); d.R(cx - 2, dy - 7, 4, 1, 'cyan2'); d.px(cx - 1, dy - 7, 'cyan3');
}

// ── silo on legs ─────────────────────────────────────────────────────────────
function drawSilo(d: DrawApi): void {
  const W = 32, x0 = 2, cw = 28, top = 10, bot = 54;
  const metal = (nx: number, ny: number, nz: number, px: number, py: number): PaletteName =>
    ramp(METAL, 0.08 + 0.95 * lambert(nx, ny, nz) + (hash(px, 0, 3) - 0.5) * 0.06, px, py);
  // legs + bracing behind the tank
  for (const lx of [4, W - 6]) { d.R(lx, 50, 2, 26, 'hull3'); d.R(lx, 50, 1, 26, 'hull4'); }
  line(d, 6, 60, W - 7, 72, 'hull2'); line(d, W - 7, 60, 6, 72, 'hull2');
  d.R(2, 74, W - 4, 2, 'hull2');
  // tank
  cylinderV(d, x0, top, cw, bot - top, metal);
  dome(d, W / 2, top + 1, cw / 2, 8, (nx, ny, nz, px, py) => metal(nx, ny, nz, px, py));
  for (let j = 0; j < 8; j++) { // hopper cone
    const inset = Math.round(j * 1.4);
    for (let i = inset; i < cw - inset; i++) {
      const nx = (i + 0.5 - cw / 2) / (cw / 2);
      d.px(x0 + i, bot + j, ramp(METAL, 0.05 + 0.7 * lambert(nx, 0.4, Math.sqrt(Math.max(0, 1 - nx * nx))), x0 + i, bot + j));
    }
  }
  d.R(W / 2 - 2, bot + 8, 4, 4, 'hull2'); d.R(W / 2 - 2, bot + 8, 4, 1, 'hull4');
  // weld rings, ladder, stencil
  for (let y = top + 8; y < bot; y += 11) { d.R(x0, y, cw, 1, 'hull1'); d.R(x0 + 1, y + 1, cw - 2, 1, 'hull5'); }
  for (let y = top + 2; y < bot + 2; y++) { d.px(W - 9, y, 'hull2'); d.px(W - 6, y, 'hull2'); if (y % 3 === 0) d.R(W - 9, y, 4, 1, 'hull4'); }
  d.R(7, 22, 2, 10, 'amber1'); d.R(7, 34, 2, 3, 'amber1'); d.R(9, 22, 1, 15, 'amber0');
}

// ── shipping container: exactly one 4×2-cell map block (64×32 native) ─────────
export const CONTAINER_W = 64, CONTAINER_H = 32;
const CONTAINER_RAMPS: Record<'amber' | 'cold' | 'hull', readonly PaletteName[]> = {
  amber: ['hull1', 'regolith0', 'amber0', 'amber1'],
  cold: ['cold0', 'cold1', 'cold2', 'hull5'],
  hull: ['hull1', 'hull2', 'hull3', 'hull4', 'hull5'],
};

function drawContainer(tone: keyof typeof CONTAINER_RAMPS): (d: DrawApi) => void {
  const r = CONTAINER_RAMPS[tone];
  const W = CONTAINER_W, H = CONTAINER_H;
  return (d) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const rib = x % 4 < 2 ? 0.14 : -0.1;
      d.px(x, y, ramp(r, 0.72 - 0.4 * (y / H) + rib, x, y));
    }
    d.R(0, 0, W, 2, 'hull4'); d.R(0, 0, W, 1, 'hull5');
    d.R(0, H - 2, W, 2, 'hull1');
    for (const [cx, cy] of [[0, 0], [W - 3, 0], [0, H - 3], [W - 3, H - 3]]) { d.R(cx, cy, 3, 3, 'hull3'); d.px(cx + 1, cy + 1, 'hull0'); }
    // door end with lock rods and handles
    d.R(W - 10, 2, 1, H - 4, 'hull1');
    for (const lx of [W - 7, W - 4]) { d.R(lx, 2, 1, H - 4, 'hull5'); d.R(lx - 1, 14, 3, 2, 'hull4'); }
    d.R(5, 6, 10, 1, 'hull6'); d.R(5, 8, 6, 1, 'hull6'); d.R(17, 6, 2, 3, 'hull6');
  };
}

// ── gantry lattice ──────────────────────────────────────────────────────────
function drawGantryColumn(d: DrawApi): void {
  const W = 14, H = 96;
  for (const x of [0, W - 3]) { d.R(x, 3, 3, H - 6, 'hull3'); d.R(x, 3, 1, H - 6, 'hull4'); d.R(x + 2, 3, 1, H - 6, 'hull1'); }
  for (let y = 6; y < H - 16; y += 16) {
    line(d, 3, y, W - 4, y + 16, 'hull2'); line(d, W - 4, y, 3, y + 16, 'hull2');
    d.R(0, y, W, 2, 'hull3'); d.R(0, y, W, 1, 'hull4');
    d.R(1, y + 2, 2, 2, 'hull4'); d.R(W - 3, y + 2, 2, 2, 'hull4');
  }
  plate(d, 0, 0, W, 3, 'hull4', 'hull5', 'hull2');
  plate(d, 0, H - 3, W, 3, 'hull3', 'hull4', 'hull1');
}

/** One 16-native-tall lattice bay; stack to any height (anchored top-left). */
function drawGantrySegment(d: DrawApi): void {
  const W = 14;
  for (const x of [0, W - 3]) { d.R(x, 0, 3, 16, 'hull3'); d.R(x, 0, 1, 16, 'hull4'); d.R(x + 2, 0, 1, 16, 'hull1'); }
  line(d, 3, 1, W - 4, 15, 'hull2'); line(d, W - 4, 1, 3, 15, 'hull2');
  d.R(0, 0, W, 2, 'hull3'); d.R(0, 0, W, 1, 'hull4');
}

function drawGantryFoot(d: DrawApi): void {
  plate(d, 0, 0, 20, 4, 'hull3', 'hull4', 'hull1');
  d.px(2, 2, 'hull5'); d.px(17, 2, 'hull5');
}

function drawGantryBeam(d: DrawApi): void {
  const W = 64, H = 12;
  plate(d, 0, 0, W, 3, 'hull4', 'hull5', 'hull2');
  plate(d, 0, H - 3, W, 3, 'hull3', 'hull4', 'hull1');
  for (let x = 0; x < W; x += 8) {
    line(d, x, 3, x + 4, H - 4, 'hull3'); line(d, x + 4, H - 4, x + 8, 3, 'hull2');
  }
  rivets(d, 2, 1, W - 2, 6, 'hull6');
}

// ── bulkhead door (free-standing, for dome and hangar walls) ────────────────
function drawBulkhead(d: DrawApi): void {
  const W = 30, H = 44;
  plate(d, 0, 4, W, H - 4, 'hull3', 'hull5', 'hull1');
  d.R(3, 8, W - 6, H - 8, 'hull2');
  d.R(4, 9, 10, H - 10, 'hull3'); d.R(16, 9, 10, H - 10, 'hull3'); d.R(4, 9, 10, 1, 'hull4'); d.R(16, 9, 10, 1, 'hull4');
  d.R(14, 9, 2, H - 10, 'hull0');
  for (let y = 14; y < H - 6; y += 7) { d.R(6, y, 6, 1, 'hull2'); d.R(18, y, 6, 1, 'hull2'); }
  for (let x = 3; x < W - 3; x++) d.R(x, H - 4, 1, 3, ((x >> 2) & 1) ? 'amber1' : 'hull0');
  d.R(W / 2 - 5, 0, 10, 4, 'hull2'); d.R(W / 2 - 4, 1, 8, 2, 'cyan1'); d.R(W / 2 - 3, 1, 3, 1, 'cyan2'); d.px(W / 2 - 3, 1, 'cyan3');
}

// ── pipes ────────────────────────────────────────────────────────────────────
function drawPipe(d: DrawApi): void {
  cylinderH(d, 0, 1, 32, 6, (nx, ny, nz, px, py) => ramp(METAL, 0.1 + 0.9 * lambert(nx, ny, nz), px, py));
  d.R(0, 0, 3, 8, 'hull4'); d.R(0, 0, 1, 8, 'hull5'); d.R(2, 0, 1, 8, 'hull2');
  d.px(1, 1, 'hull6'); d.px(1, 6, 'hull6');
}

function drawPipeSupport(d: DrawApi): void {
  d.R(4, 6, 2, 14, 'hull3'); d.R(4, 6, 1, 14, 'hull4');
  d.R(0, 0, 10, 2, 'hull3'); d.R(0, 0, 2, 7, 'hull3'); d.R(8, 0, 2, 7, 'hull2'); d.R(0, 0, 10, 1, 'hull4');
  plate(d, 1, 18, 8, 2, 'hull3', 'hull4', 'hull1');
}

// ── mission relay: equipment cabinet, mast, dish; the screen recess is lit by the mission ──
/** Screen recess in native pixels, relative to the prop's top-left. */
export const RELAY_SCREEN = { x: 6, y: 24, w: 16, h: 10 } as const;

function drawRelay(d: DrawApi): void {
  const W = 28, H = 72;
  // mast + dish
  d.R(13, 6, 2, 12, 'hull3'); d.R(13, 6, 1, 12, 'hull4');
  const cx = 12, cy = 6, R = 6;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    const out = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2, inner = (x + 0.5 - cx - 3) ** 2 + (y + 0.5 - cy + 3) ** 2;
    if (out > R * R || inner < R * R) continue;
    d.px(x, y, Math.sqrt(inner) - R < 1.2 ? 'hull5' : 'hull3');
  }
  line(d, cx + 1, cy - 1, cx + 5, cy - 5, 'hull4'); d.px(cx + 5, cy - 5, 'cyan2');
  // cabinet
  plate(d, 0, 17, W, H - 17, 'hull3', 'hull5', 'hull1');
  d.R(2, 19, W - 4, 2, 'hull2');
  d.R(RELAY_SCREEN.x - 1, RELAY_SCREEN.y - 1, RELAY_SCREEN.w + 2, RELAY_SCREEN.h + 2, 'hull1');
  d.R(RELAY_SCREEN.x, RELAY_SCREEN.y, RELAY_SCREEN.w, RELAY_SCREEN.h, 'hull0');
  for (let y = 40; y < H - 8; y += 4) { d.R(4, y, 9, 2, 'hull1'); d.R(4, y + 2, 9, 1, 'hull4'); }
  d.R(16, 40, 8, 20, 'hull2'); d.R(16, 40, 8, 1, 'hull4'); d.R(22, 48, 1, 4, 'hull5');
  for (let x = 0; x < W; x++) d.R(x, H - 5, 1, 3, ((x >> 2) & 1) ? 'amber1' : 'hull0');
  plate(d, -1, H - 2, W + 2, 2, 'hull2', 'hull3', 'hull0');
}

// ── lamp post ────────────────────────────────────────────────────────────────
function drawLamp(d: DrawApi): void {
  d.R(3, 8, 2, 34, 'hull3'); d.R(3, 8, 1, 34, 'hull5');
  plate(d, 1, 41, 6, 3, 'hull3', 'hull4', 'hull1');
  plate(d, 0, 2, 8, 5, 'hull2', 'hull4', 'hull0');
  d.R(1, 7, 6, 1, 'amber0'); d.R(2, 7, 4, 1, 'amber1');
  d.R(3, 0, 2, 2, 'hull3');
}

// ── antenna mast with dish ──────────────────────────────────────────────────
function drawAntenna(d: DrawApi): void {
  const W = 30, H = 92, mx = 12;
  for (const x of [mx, mx + 5]) { d.R(x, 28, 1, H - 30, 'hull3'); }
  d.R(mx, 28, 1, H - 30, 'hull4');
  for (let y = 30; y < H - 4; y += 6) { line(d, mx, y, mx + 5, y + 6, 'hull2'); d.R(mx, y, 6, 1, 'hull3'); }
  plate(d, mx - 4, H - 3, 14, 3, 'hull3', 'hull4', 'hull1');
  // dish in profile: a crescent opening toward the upper right. The concave face catches the
  // light near its lip; the convex back falls into shadow.
  const cx = 13, cy = 17, R = 12, ox = 5, oy = -5;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    const out = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
    const inner = (x + 0.5 - cx - ox) ** 2 + (y + 0.5 - cy - oy) ** 2;
    if (out > R * R || inner < R * R) continue;
    const toFace = Math.sqrt(inner) - R; // 0 at the concave face .. thickness at the back
    d.px(x, y, toFace < 1.2 ? (y < cy ? 'hull6' : 'hull5') : toFace < 2.5 ? 'hull4' : ramp(METAL, 0.35 - 0.05 * toFace, x, y));
  }
  line(d, cx + 1, cy - 1, cx + 11, cy - 11, 'hull4'); d.R(cx + 10, cy - 13, 3, 3, 'hull3'); d.px(cx + 10, cy - 13, 'hull5');
  line(d, cx - 4, cy + 8, mx + 2, 28, 'hull3');
  d.R(mx + 2, 24, 2, 4, 'hull3'); d.px(cx + 12, cy - 14, 'amber1');
}

// ── solar array ──────────────────────────────────────────────────────────────
function drawSolar(d: DrawApi): void {
  const pts: [number, number][] = [[2, 6], [42, 0], [42, 14], [2, 20]];
  d.P(pts, 'cold1');
  for (let i = 0; i <= 8; i++) { const x = 2 + i * 5; line(d, x, 6 - i * 0.75, x, 20 - i * 0.75, 'cold0'); }
  for (let j = 1; j < 3; j++) line(d, 2, 6 + j * 4.7, 42, j * 4.7, 'cold0');
  for (const [gx, gy] of [[8, 9], [23, 7], [33, 3], [13, 13]]) { d.R(gx, gy, 3, 2, 'cold2'); d.px(gx, gy, 'cyan1'); }
  d.px(34, 3, 'cyan3');
  line(d, 2, 6, 42, 0, 'hull4'); line(d, 2, 20, 42, 14, 'hull2');
  d.R(21, 16, 2, 14, 'hull3'); d.R(21, 16, 1, 14, 'hull4'); plate(d, 17, 28, 10, 2, 'hull3', 'hull4', 'hull1');
}

// ── rock ─────────────────────────────────────────────────────────────────────
function drawBoulder(w: number, h: number, seed: number): (d: DrawApi) => void {
  return (d) => {
    const cx = w / 2, cy = h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      const wobble = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 7 + seed * 2);
      const u = (x + 0.5 - cx) / (w / 2 * wobble), v = (y + 0.5 - cy) / (h * wobble);
      const q = u * u + v * v;
      if (q > 1) continue;
      const facet = (hash(Math.floor(x / 4), Math.floor(y / 3), seed) - 0.5) * 0.18;
      d.px(x, y, ramp(ROCK, 0.1 + 0.95 * lambert(u, v, Math.sqrt(1 - q)) + facet, x, y));
    }
    const k = Math.floor(w * 0.55);
    line(d, k, Math.floor(h * 0.35), k - 2, h - 2, 'hull1');
  };
}

function drawCrate(d: DrawApi): void {
  plate(d, 0, 0, 14, 12, 'hull3', 'hull5', 'hull1');
  line(d, 1, 2, 12, 10, 'hull2'); line(d, 12, 2, 1, 10, 'hull2');
  d.R(0, 5, 14, 2, 'amber0'); d.R(0, 5, 14, 1, 'amber1');
}

// ── set pieces ───────────────────────────────────────────────────────────────
/**
 * A crashed lander, nose-down in the regolith: foil-wrapped descent stage tilted onto one
 * snapped leg, the ascent cabin cracked open, a scorch streak and scattered panels.
 */
function drawLanderWreck(d: DrawApi): void {
  const W = 84;
  // scorch across the ground it slid through
  for (let x = 2; x < 60; x++) if (hash(x, 1, 51) < 0.7) d.px(x, 55 - Math.floor(hash(x, 2, 51) * 2), 'hull0');
  // snapped far leg, lying flat
  line(d, 8, 54, 28, 50, 'hull3'); line(d, 8, 55, 28, 51, 'hull1'); d.R(4, 53, 6, 2, 'hull3');
  // descent stage: a tilted octagonal box wrapped in amber foil
  const stage: [number, number][] = [[20, 30], [52, 20], [66, 26], [70, 44], [60, 56], [28, 56], [18, 46]];
  // dusty gold foil: crinkled facets, lit from the upper left, darkening into the dirt
  const FOIL: readonly PaletteName[] = ['hull1', 'regolith0', 'amber0', 'amber1'];
  for (let y = 20; y < 57; y++) for (let x = 18; x < 71; x++) {
    if (!inside(stage, x + 0.5, y + 0.5)) continue;
    const crinkle = (hash(x >> 2, y >> 1, 53) - 0.5) * 0.35;
    const t = 0.72 - (y - 20) / 36 * 0.55 - (x - 18) / 52 * 0.12 + crinkle;
    d.px(x, y, ramp(FOIL, t, x, y));
  }
  line(d, 20, 30, 52, 20, 'amber1'); // lit top edge of the foil
  line(d, 30, 34, 62, 26, 'hull0'); line(d, 28, 45, 64, 38, 'regolith0'); // crumple creases
  d.P([[46, 44], [60, 40], [62, 52], [50, 55]], 'hull1'); // torn hole
  // near leg, still attached, buckled at the knee, footpad dug in
  line(d, 64, 44, 76, 50, 'hull4'); line(d, 64, 45, 76, 51, 'hull2'); line(d, 76, 50, 80, 56, 'hull4');
  d.R(76, 55, 8, 2, 'hull3'); d.R(76, 55, 8, 1, 'hull5');
  // ascent cabin: brushed metal, lit from the upper left, window blown out
  cylinderV(d, 30, 8, 22, 16, (nx, ny, nz, px, py) => ramp(METAL, 0.1 + 0.9 * lambert(nx, ny, nz) - (py - 8) * 0.012, px, py));
  dome(d, 41, 9, 11, 7, (nx, ny, nz, px, py) => ramp(METAL, 0.15 + 0.9 * lambert(nx, ny, nz), px, py));
  d.P([[35, 12], [42, 11], [42, 17], [35, 18]], 'hull0'); d.px(36, 13, 'cyan1'); line(d, 38, 12, 40, 17, 'hull2');
  d.R(48, 4, 1, 6, 'hull3'); d.px(48, 3, 'hull5'); // bent antenna
  // debris panels
  d.P([[8, 48], [14, 46], [15, 50], [9, 51]], 'amber0'); d.px(9, 48, 'amber1');
  d.P([[W - 12, 50], [W - 6, 49], [W - 5, 53], [W - 11, 54]], 'hull3');
}

/**
 * Cargo crawler, parked: bogie tracks with road wheels, a plated chassis, forward cab with a lit
 * window, a flatbed carrying a strapped load, and an amber beacon on the roof.
 */
function drawCrawler(d: DrawApi): void {
  const W = 96;
  // track run
  d.R(4, 34, W - 8, 10, 'hull1'); d.R(4, 34, W - 8, 1, 'hull2');
  for (let x = 5; x < W - 5; x += 3) d.R(x, 43, 2, 1, 'hull3');
  for (const cx of [12, 26, 40, 54, 68, 82]) {
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const q = (x * x + y * y) / 16;
      if (q > 1) continue;
      d.px(cx + x, 39 + y, q > 0.6 ? 'hull2' : ramp(METAL, 0.3 + 0.7 * lambert(x / 4, y / 4, Math.sqrt(1 - q)), cx + x, 39 + y));
    }
    d.px(cx, 39, 'hull0');
  }
  // chassis
  plate(d, 2, 26, W - 4, 8, 'hull3', 'hull5', 'hull1');
  rivets(d, 6, 30, W - 6, 6, 'hull5');
  for (let x = 0; x < 10; x++) d.R(W - 12 + x, 28, 1, 4, ((x >> 1) & 1) ? 'amber1' : 'hull0'); // bumper stripes
  // cab
  d.P([[W - 30, 26], [W - 30, 8], [W - 14, 8], [W - 6, 18], [W - 6, 26]], 'hull3');
  d.P([[W - 30, 8], [W - 14, 8], [W - 13, 10], [W - 30, 10]], 'hull5');
  d.P([[W - 26, 11], [W - 15, 11], [W - 10, 18], [W - 26, 18]], 'cyan0');
  d.P([[W - 25, 12], [W - 18, 12], [W - 20, 15], [W - 25, 15]], 'cyan1'); d.px(W - 24, 12, 'cyan3');
  d.R(W - 30, 20, 24, 1, 'hull1');
  d.R(W - 24, 4, 4, 4, 'hull2'); d.R(W - 23, 4, 2, 2, 'amber1'); // beacon
  // flatbed with a strapped load
  plate(d, 4, 22, W - 36, 4, 'hull2', 'hull4', 'hull0');
  plate(d, 10, 6, 42, 16, 'cold1', 'cold2', 'cold0');
  for (let x = 12; x < 50; x += 4) d.R(x, 8, 2, 13, 'cold0');
  for (const x of [18, 42]) { d.R(x, 6, 2, 16, 'amber0'); d.px(x, 6, 'amber1'); }
  d.R(14, 9, 6, 1, 'hull6');
}

// ── pickups: 18×18 native, anchored at the centre ────────────────────────────
/** Nanite repair canister: green fluid behind a glass window, machined caps, repair cross. */
function drawPickupHealth(d: DrawApi): void {
  cylinderV(d, 4, 3, 10, 12, (nx, ny, nz, px, py) => ramp(['green0', 'green1'], 0.2 + 0.9 * lambert(nx, ny, nz), px, py));
  d.R(5, 4, 1, 10, 'cyan3');
  for (const y of [0, 14]) cylinderV(d, 3, y, 12, 4, (nx, ny, nz, px, py) => ramp(METAL, 0.2 + 0.85 * lambert(nx, ny, nz), px, py));
  d.R(8, 6, 2, 6, 'hull6'); d.R(6, 8, 6, 2, 'hull6');
}

/** Pressurised fuel cell: brushed tank, cyan charge band, gauge, top valve. */
function drawPickupFuel(d: DrawApi): void {
  cylinderV(d, 4, 3, 10, 15, (nx, ny, nz, px, py) => ramp(METAL, 0.12 + 0.95 * lambert(nx, ny, nz), px, py));
  d.R(4, 8, 10, 3, 'cyan1'); d.R(5, 8, 7, 1, 'cyan2'); d.px(6, 9, 'cyan3');
  d.R(7, 0, 4, 3, 'hull3'); d.R(7, 0, 4, 1, 'hull5'); d.R(11, 1, 3, 1, 'hull4');
  d.R(6, 13, 3, 2, 'hull1'); d.px(7, 13, 'cyan2');
}

/** Ammo box: stamped steel case, amber band, a belt of rounds over the lid. */
function drawPickupAmmo(d: DrawApi): void {
  plate(d, 1, 7, 16, 10, 'hull3', 'hull5', 'hull1');
  d.R(1, 11, 16, 2, 'amber0'); d.R(1, 11, 16, 1, 'amber1');
  d.R(7, 8, 4, 2, 'hull2'); d.px(8, 8, 'hull4');
  for (let i = 0; i < 5; i++) {
    const x = 2 + i * 3, y = 2 + (i % 2);
    d.R(x, y + 1, 2, 4, 'amber0'); d.R(x, y, 2, 1, 'amber1'); d.px(x, y + 1, 'amber1'); d.R(x, y + 5, 2, 1, 'hull2');
  }
}

/** Data core: a cut crystal chip in an amber frame, one hard glint. */
function drawPickupScore(d: DrawApi): void {
  d.P([[9, 0], [17, 9], [9, 18], [1, 9]], 'amber0');
  d.P([[9, 2], [15, 9], [9, 16], [3, 9]], 'amber1');
  d.P([[9, 2], [9, 9], [3, 9]], 'hull6');
  d.P([[9, 9], [15, 9], [9, 16]], 'amber0');
  d.R(8, 8, 3, 3, 'hull1'); d.px(9, 9, 'cyan2');
  d.px(6, 5, 'cyan3');
}

/** Every world prop, by name. Frame names in the world atlas are `name@n` / `name@f` (far). */
export const WORLD_PROPS: PartSet = {
  dome: { w: DOME_W, h: DOME_H, px: DOME_W / 2, py: DOME_H, draw: drawDome },
  silo: { w: 32, h: 76, px: 16, py: 76, draw: drawSilo },
  containerAmber: { w: CONTAINER_W, h: CONTAINER_H, px: CONTAINER_W / 2, py: CONTAINER_H, draw: drawContainer('amber') },
  containerCold: { w: CONTAINER_W, h: CONTAINER_H, px: CONTAINER_W / 2, py: CONTAINER_H, draw: drawContainer('cold') },
  containerHull: { w: CONTAINER_W, h: CONTAINER_H, px: CONTAINER_W / 2, py: CONTAINER_H, draw: drawContainer('hull') },
  gantryColumn: { w: 14, h: 96, px: 7, py: 96, draw: drawGantryColumn },
  /** Anchored top-left: stack downward to build a support of any height. */
  gantrySegment: { w: 14, h: 16, px: 0, py: 0, draw: drawGantrySegment },
  gantryFoot: { w: 20, h: 4, px: 10, py: 4, draw: drawGantryFoot },
  /** Anchored top-left: lay beams end to end. */
  gantryBeam: { w: 64, h: 12, px: 0, py: 0, draw: drawGantryBeam },
  bulkhead: { w: 30, h: 44, px: 15, py: 44, draw: drawBulkhead },
  /** Anchored top-left: tile along x. */
  pipe: { w: 32, h: 8, px: 0, py: 0, draw: drawPipe },
  pipeSupport: { w: 10, h: 20, px: 5, py: 20, draw: drawPipeSupport },
  lamp: { w: 8, h: 44, px: 4, py: 44, draw: drawLamp },
  relay: { w: 28, h: 72, px: 14, py: 72, draw: drawRelay },
  antenna: { w: 30, h: 92, px: 15, py: 92, draw: drawAntenna },
  solar: { w: 44, h: 30, px: 22, py: 30, draw: drawSolar },
  boulderS: { w: 10, h: 7, px: 5, py: 7, draw: drawBoulder(10, 7, 1) },
  boulderM: { w: 18, h: 12, px: 9, py: 12, draw: drawBoulder(18, 12, 2) },
  boulderL: { w: 30, h: 19, px: 15, py: 19, draw: drawBoulder(30, 19, 3) },
  crate: { w: 14, h: 12, px: 7, py: 12, draw: drawCrate },
  landerWreck: { w: 84, h: 57, px: 42, py: 56, draw: drawLanderWreck },
  crawler: { w: 96, h: 44, px: 48, py: 44, draw: drawCrawler },
  pickupHealth: { w: 18, h: 18, px: 9, py: 9, draw: drawPickupHealth },
  pickupFuel: { w: 18, h: 18, px: 9, py: 9, draw: drawPickupFuel },
  pickupAmmo: { w: 18, h: 18, px: 9, py: 9, draw: drawPickupAmmo },
  pickupScore: { w: 18, h: 18, px: 9, py: 9, draw: drawPickupScore },
};
