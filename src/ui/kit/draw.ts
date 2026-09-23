import Phaser from 'phaser';
import { GLYPHS, normalizeText } from '../font/glyphs';
import type { IconName } from '../icons';
import { ICON_SIZE } from '../icons';
import { TEXT, UPX, tc, type Role, type TextStyle } from '../theme';
import { DIM_TEXTURE, FONTS, ICON_TEXTURE, PANEL_CORNER, panelKey, type PanelLook } from './uiTextures';

/*
 * Plain draw helpers (no Phaser subclasses), safe to import from gameplay code and from
 * tests that mock only part of Phaser. Stateful widgets live in ./widgets.
 */

const KNOWN = new Set(GLYPHS.map((g) => g.ch));
export type Label = Phaser.GameObjects.BitmapText;

/** Bitmap text on the pixel grid. Text is caps-only; unknown characters show '?'. */
export function label(scene: Phaser.Scene, x: number, y: number, text: string, style: TextStyle = 'body', role: Role = 'ink'): Label {
  const t = TEXT[style];
  const size = FONTS[t.font].glyphH * t.scale;
  return scene.add.bitmapText(Math.round(x), Math.round(y), t.font, normalizeText(text, KNOWN), size).setTint(tc(role));
}

/** Update a label's text (normalized) and optionally its role colour. */
export function setLabel(l: Label, text: string, role?: Role): Label {
  l.setText(normalizeText(text, KNOWN));
  if (role) l.setTint(tc(role));
  return l;
}

/** A tinted icon. `scale` is in icon pixels → screen px (2 = one UI pixel per icon pixel). */
export function icon(scene: Phaser.Scene, x: number, y: number, name: IconName, scale = 2, role: Role = 'accent'): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), ICON_TEXTURE, name).setScale(scale).setTint(tc(role));
}

export function iconSize(scale = 2): number { return ICON_SIZE * scale; }

/** A nine-slice panel with its origin at the top-left. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, look: PanelLook = 'panel'): Phaser.GameObjects.NineSlice {
  const c = PANEL_CORNER;
  return scene.add.nineslice(Math.round(x), Math.round(y), panelKey(look), undefined, snapUp(w), snapUp(h), c, c, c, c).setOrigin(0, 0);
}

export function setPanelLook(p: Phaser.GameObjects.NineSlice, look: PanelLook): void {
  p.setTexture(panelKey(look));
}

export function snapUp(v: number): number { return Math.ceil(v / UPX) * UPX; }

/** Full-screen dithered dim layer (works with the UI camera's binary alpha). */
export function dim(scene: Phaser.Scene, depth: number): Phaser.GameObjects.TileSprite {
  const { width, height } = scene.scale;
  return scene.add.tileSprite(0, 0, width, height, DIM_TEXTURE).setOrigin(0, 0).setDepth(depth).setScrollFactor(0);
}

/** Corner brackets around a rectangle (big frames without a panel fill). */
export function brackets(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, role: Role, len = 16, thick = 4): void {
  g.fillStyle(tc(role), 1);
  const r = (rx: number, ry: number, rw: number, rh: number) => g.fillRect(Math.round(rx), Math.round(ry), rw, rh);
  r(x, y, len, thick); r(x, y, thick, len);
  r(x + w - len, y, len, thick); r(x + w - thick, y, thick, len);
  r(x, y + h - thick, len, thick); r(x, y + h - len, thick, len);
  r(x + w - len, y + h - thick, len, thick); r(x + w - thick, y + h - len, thick, len);
}

