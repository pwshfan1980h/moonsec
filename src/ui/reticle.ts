import type Phaser from 'phaser';
import { PALETTE_RGB, palIndex, type PaletteName } from '../render/palette';

/**
 * Aiming reticle used as the mouse cursor during missions: cyan arms around a gap, corner
 * brackets, a bright centre pixel, and a hull0 outline so it reads on bright regolith too.
 * Drawn on a 15 × 15 native grid at 2× (the UI's pixel size); the hotspot is the centre pixel.
 */
export const RETICLE_SIZE = 15;
export const RETICLE_SCALE = 2;
const C = 7;

/** Native pixel grid (null = transparent). Pure, so it can be tested. */
export function reticlePixels(): (PaletteName | null)[][] {
  const g: (PaletteName | null)[][] = Array.from({ length: RETICLE_SIZE }, () => Array<PaletteName | null>(RETICLE_SIZE).fill(null));
  for (let i = 1; i <= 3; i++) { // arms stop 3 px out: outline, a clear pixel, outline, centre
    g[C - 7 + i][C] = 'cyan2'; g[C + 7 - i][C] = 'cyan2'; // top, bottom
    g[C][C - 7 + i] = 'cyan2'; g[C][C + 7 - i] = 'cyan2'; // left, right
  }
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = C + dx * 5, y = C + dy * 5;
    g[y][x] = 'cyan1'; g[y][x - dx] = 'cyan1'; g[y - dy][x] = 'cyan1';
  }
  g[C][C] = 'cyan3';
  // outline every transparent pixel touching a coloured one (4-neighbour)
  const lit = (x: number, y: number) => g[y]?.[x] !== null && g[y]?.[x] !== undefined && g[y][x] !== 'hull0';
  for (let y = 0; y < RETICLE_SIZE; y++) for (let x = 0; x < RETICLE_SIZE; x++) {
    if (g[y][x] === null && (lit(x - 1, y) || lit(x + 1, y) || lit(x, y - 1) || lit(x, y + 1))) g[y][x] = 'hull0';
  }
  return g;
}

let css: string | undefined;

/** CSS `cursor` value: the reticle as a PNG data URL with its centre as the hotspot. */
export function reticleCursor(): string {
  if (css) return css;
  const size = RETICLE_SIZE * RETICLE_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  reticlePixels().forEach((row, y) => row.forEach((c, x) => {
    if (!c) return;
    const [r, g, b] = PALETTE_RGB[palIndex(c)];
    for (let j = 0; j < RETICLE_SCALE; j++) for (let i = 0; i < RETICLE_SCALE; i++) {
      const o = ((y * RETICLE_SCALE + j) * size + x * RETICLE_SCALE + i) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }));
  ctx.putImageData(img, 0, 0);
  const hot = C * RETICLE_SCALE + RETICLE_SCALE / 2;
  css = `url(${canvas.toDataURL('image/png')}) ${hot} ${hot}, crosshair`;
  return css;
}

/**
 * Shows the reticle while `scene` (a mission) is running; the normal pointer returns whenever
 * it pauses (pause menu, game over, level complete) or shuts down.
 */
export function installReticle(scene: Phaser.Scene): void {
  // Phaser.Scenes.Events values; plain strings keep this module loadable in tests
  const on = () => scene.input.setDefaultCursor(reticleCursor());
  const off = () => scene.input.setDefaultCursor('default');
  const handlers: [string, () => void][] = [['resume', on], ['wake', on], ['pause', off], ['sleep', off]];
  on();
  for (const [e, f] of handlers) scene.events.on(e, f);
  scene.events.once('shutdown', () => {
    off();
    for (const [e, f] of handlers) scene.events.off(e, f);
  });
}
