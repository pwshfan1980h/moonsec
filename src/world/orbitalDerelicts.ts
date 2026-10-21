import type { PartSpec } from '../rig/parts/types';
import type { PaletteName } from '../render/palette';
import { hash, ramp } from './shade';

export const EARTH_RADIUS = 56;
export const EARTH_SUN = (() => { const v = [-0.72, -0.34, 0.6]; const n = Math.hypot(...v); return v.map(c => c / n); })();

/** Directional sunlight with a soft transition into the planet's cylindrical shadow. */
export function orbitalLight(x: number, y: number, z: number): number {
  const alongSun = x * EARTH_SUN[0] + y * EARTH_SUN[1] + z * EARTH_SUN[2];
  if (alongSun >= 0) return 1;
  const distance = Math.sqrt(Math.max(0, x * x + y * y + z * z - alongSun * alongSun));
  const t = Math.max(0, Math.min(1, (distance - EARTH_RADIUS + 5) / 12));
  return t * t * (3 - 2 * t);
}

/** Per-pixel depth test also clips partially hidden stations at Earth's limb. */
export function earthOccludes(x: number, y: number, z: number): boolean {
  const q = EARTH_RADIUS * EARTH_RADIUS - x * x - y * y;
  return q >= 0 && z < Math.sqrt(q);
}

const METAL: readonly PaletteName[] = ['void', 'cold0', 'hull1', 'hull3', 'hull5', 'hull6'];
const PANEL: readonly PaletteName[] = ['void', 'cold0', 'cold1', 'cold2', 'cyan1'];

/** Baked once, sharing Earth's centre, pixel scale and viewport-fixed placement. No emissive lamps on these wrecks. */
export const ORBITAL_DERELICTS: PartSpec = {
  w: 360, h: 260, px: 180, py: 130,
  draw(d) {
    const bodies = Array.from({ length: 410 }, (_, i) => {
      const a = hash(i, 3, 71) * Math.PI * 2;
      const r = 76 + hash(i, 8, 72) * 78;
      // Broad, inclined orbital lanes, broken up by a debris cloud.
      const inclination = 0.3 + hash(i, 6, 79) * 0.38;
      const u = Math.cos(a) * r, v = Math.sin(a) * r * inclination;
      return { i, x: u * 0.94 + v * 0.34, y: -u * 0.34 + v * 0.94,
        z: Math.sin(a) * r * Math.sqrt(1 - inclination * inclination) };
    }).sort((a, b) => a.z - b.z);
    for (const { i, x, y, z } of bodies) {
      const angle = hash(i, 4, 82) * Math.PI * 2;
      const cs = Math.cos(angle), sn = Math.sin(angle);
      const pixel = (u: number, v: number, face = 0.8, panel = false) => {
        const wx = Math.round(x + u * cs - v * sn), wy = Math.round(y + u * sn + v * cs);
        if (earthOccludes(wx, wy, z)) return;
        const light = orbitalLight(wx, wy, z);
        // Shadowed fragments disappear; large hulls retain only a very faint silhouette.
        if (light < 0.04 && i >= 32) return;
        const color = ramp(panel ? PANEL : METAL, 0.05 + light * face, wx, wy);
        d.px(180 + wx, 130 + wy, color);
      };
      const rect = (u: number, v: number, w: number, h: number, panel = false) => {
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
          // Sun-facing edges catch light; the underside stays muted.
          const nx = -sn, ny = cs;
          const edge = dy === 0 ? Math.max(0, -nx * EARTH_SUN[0] - ny * EARTH_SUN[1]) : 0;
          pixel(u + dx, v + dy, 0.48 + edge * 0.5 + (dy === 0 ? 0.12 : 0), panel);
        }
      };
      if (i < 12) { // fractured station: spine, modules and mismatched solar wings
        rect(-9, -1, 19, 3); rect(-5, -3, 4, 7); rect(3, -2, 4, 5);
        rect(-7, -10, 1, 19); rect(-11, -9, 9, 5, true); rect(-10, 5, 7, 4, true);
        rect(6, -6, 1, 12); rect(4, -7, 7, 3, true); pixel(9, 7); pixel(11, 8);
      } else if (i < 21) { // abandoned freighter, split bow and cold engine cluster
        rect(-8, -2, 14, 5); rect(-5, -4, 7, 2); rect(6, -1, 4, 2);
        rect(-10, -4, 2, 3); rect(-10, 2, 2, 3); rect(-2, 3, 5, 2, true);
        pixel(12, -2); pixel(14, -1);
      } else if (i < 32) { // broken habitat ring and central truss
        for (let a = 0.35; a < 5.6; a += 0.1) pixel(Math.cos(a) * 7, Math.sin(a) * 7, 0.68);
        rect(-6, 0, 12, 1); rect(-1, -5, 3, 9);
      } else if (i < 95) { // tumbling panels and torn beams
        rect(-2, 0, 3 + i % 4, 1 + i % 2, i % 3 === 0);
      } else {
        pixel(0, 0, 0.5 + hash(i, 1) * 0.35);
        if (i % 4 === 0) pixel(1, 0, 0.4);
      }
    }
  },
};
