import Phaser from 'phaser';
import { GLYPHS, epx, type Glyph } from '../font/glyphs';
import { ICONS, ICON_NAMES, ICON_SIZE } from '../icons';
import { PALETTE_RGB, palIndex, type PaletteName } from '../../render/palette';
import { ROLE, UPX, type Role } from '../theme';

/** Font keys and their glyph metrics. */
export const FONTS = {
  moon8: { glyphH: 7, lineH: 10, tracking: 1 },
  moon16: { glyphH: 14, lineH: 18, tracking: 2 },
} as const;
export type FontKey = keyof typeof FONTS;

export const ICON_TEXTURE = 'ui-icons';
export const DIM_TEXTURE = 'ui-dim';

/** Nine-slice panel looks. Corner size (screen px) is PANEL_CORNER. */
export type PanelLook =
  | 'panel' | 'panel-hot' | 'inset' | 'alert' | 'repair' | 'warn'
  | 'button' | 'button-hot' | 'button-down' | 'button-off'
  | 'key' | 'key-hot';
export const PANEL_CORNER = 12;
const PANEL_DESIGN = 16;

interface PanelSpec { fill: Role; border: Role; bracket?: Role; top?: Role; bottom?: Role }
const PANELS: Record<PanelLook, PanelSpec> = {
  'panel': { fill: 'panel', border: 'edgeDim', bracket: 'accentDim' },
  'panel-hot': { fill: 'panel', border: 'edge', bracket: 'accent' },
  'inset': { fill: 'well', border: 'edgeDim' },
  'alert': { fill: 'panel', border: 'dangerDim', bracket: 'danger' },
  'repair': { fill: 'panel', border: 'repairDim', bracket: 'repair' },
  'warn': { fill: 'panel', border: 'warnDim', bracket: 'warn' },
  'button': { fill: 'panelHi', border: 'edge', top: 'edge', bottom: 'well' },
  'button-hot': { fill: 'accentDeep', border: 'accent', top: 'accentDim', bottom: 'well' },
  'button-down': { fill: 'accentDim', border: 'accent', top: 'accentDeep', bottom: 'accentDeep' },
  'button-off': { fill: 'panel', border: 'edgeDim' },
  'key': { fill: 'edgeDim', border: 'edge', top: 'inkFaint', bottom: 'well' },
  'key-hot': { fill: 'accentDeep', border: 'accent', top: 'accentDim', bottom: 'well' },
};

export function panelKey(look: PanelLook): string { return `ui-panel-${look}`; }

function rgbOf(role: Role): readonly [number, number, number] {
  return PALETTE_RGB[palIndex(ROLE[role] as PaletteName)];
}

/** Paint a design-pixel grid (value = rgb or null) into a canvas texture at `scale`. */
function paint(scene: Phaser.Scene, key: string, w: number, h: number, scale: number, at: (x: number, y: number) => readonly [number, number, number] | null): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w * scale, h * scale)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w * scale, h * scale);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y);
    if (!c) continue;
    for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
      const o = ((y * scale + sy) * w * scale + x * scale + sx) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return tex;
}

const WHITE = [255, 255, 255] as const;

function buildFont(scene: Phaser.Scene, key: FontKey, glyphs: readonly Glyph[]): void {
  const m = FONTS[key];
  const pad = 1;
  const cellH = m.glyphH + pad;
  // single-row strip keeps the layout trivial; widths are small (≈ 60 glyphs × ≤ 11px)
  const total = glyphs.reduce((s, g) => s + g.w + pad, 0);
  const W = total, H = cellH;
  const positions = new Map<string, number>();
  let cx = 0;
  for (const g of glyphs) { positions.set(g.ch, cx); cx += g.w + pad; }
  const lookup = new Map(glyphs.map((g) => [g.ch, g]));
  paint(scene, `font-${key}`, W, H, 1, (x, y) => {
    for (const g of glyphs) {
      const gx = positions.get(g.ch)!;
      if (x >= gx && x < gx + g.w) return y < g.h && g.px[y * g.w + (x - gx)] ? WHITE : null;
    }
    return null;
  });
  const chars: Record<number, unknown> = {};
  for (const [ch, x] of positions) {
    const g = lookup.get(ch)!;
    chars[ch.charCodeAt(0)] = {
      x, y: 0, width: g.w, height: g.h, centerX: Math.floor(g.w / 2), centerY: Math.floor(g.h / 2),
      xOffset: 0, yOffset: 0, xAdvance: g.w + m.tracking, data: {}, kerning: {},
      u0: x / W, v0: 1, u1: (x + g.w) / W, v1: 1 - g.h / H,
    };
  }
  const data = { retroFont: true, font: key, size: m.glyphH, lineHeight: m.lineH, chars };
  scene.cache.bitmapFont.add(key, { data, texture: `font-${key}`, frame: null });
}

function buildIcons(scene: Phaser.Scene): void {
  const cell = ICON_SIZE + 1;
  const tex = paint(scene, ICON_TEXTURE, ICON_NAMES.length * cell, ICON_SIZE, 1, (x, y) => {
    const i = Math.floor(x / cell), lx = x % cell;
    if (lx >= ICON_SIZE) return null;
    return ICONS[ICON_NAMES[i]][y][lx] === '#' ? WHITE : null;
  });
  ICON_NAMES.forEach((n, i) => tex.add(n, 0, i * cell, 0, ICON_SIZE, ICON_SIZE));
}

function buildPanels(scene: Phaser.Scene): void {
  const N = PANEL_DESIGN, B = 4;
  for (const [look, s] of Object.entries(PANELS) as [PanelLook, PanelSpec][]) {
    paint(scene, panelKey(look), N, N, UPX, (x, y) => {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      if (s.bracket && edge) {
        const nearX = x < B || x >= N - B, nearY = y < B || y >= N - B;
        if (nearX && nearY) return rgbOf(s.bracket);
      }
      if (edge) return rgbOf(s.border);
      if (s.bottom && y >= N - 2) return rgbOf(s.bottom);
      if (s.top && y === 1) return rgbOf(s.top);
      return rgbOf(s.fill);
    });
  }
}

/** 2×2-design-pixel checker of void: tiled over the screen it dims without alpha. */
function buildDim(scene: Phaser.Scene): void {
  const v = PALETTE_RGB[palIndex('void')];
  paint(scene, DIM_TEXTURE, 2, 2, UPX, (x, y) => ((x + y) % 2 === 0 ? v : null));
}

/** Rasterize fonts, icons and panels. Idempotent; call once from Boot. */
export function buildUiTextures(scene: Phaser.Scene): void {
  if (!scene.cache.bitmapFont.exists('moon8')) {
    buildFont(scene, 'moon8', GLYPHS);
    buildFont(scene, 'moon16', GLYPHS.map(epx));
  }
  if (!scene.textures.exists(ICON_TEXTURE)) buildIcons(scene);
  if (!scene.textures.exists(panelKey('panel'))) buildPanels(scene);
  if (!scene.textures.exists(DIM_TEXTURE)) buildDim(scene);
}
