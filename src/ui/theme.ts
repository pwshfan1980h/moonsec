import { pal, palCss, type PaletteName } from '../render/palette';

/**
 * UI design tokens. Every colour is a palette entry (src/render/palette.ts); screens
 * reference roles, never raw colours. Geometry is on the 2px UI pixel grid: the game
 * canvas is 1920×1080, so one UI pixel (UPX) = 2 screen px and the UI is laid out on a
 * 960×540 virtual grid.
 */
export const ROLE = {
  /** Brightest text and glyphs. */
  ink: 'cyan3',
  /** Secondary labels. */
  inkDim: 'hull5',
  /** Disabled / tertiary. */
  inkFaint: 'hull4',
  accent: 'cyan2',
  accentDim: 'cyan1',
  accentDeep: 'cyan0',
  panel: 'hull0',
  panelHi: 'hull1',
  edge: 'hull3',
  edgeDim: 'hull2',
  well: 'void',
  warn: 'amber1',
  warnDim: 'amber0',
  repair: 'green1',
  repairDim: 'green0',
  danger: 'hostile1',
  dangerDim: 'hostile0',
} as const satisfies Record<string, PaletteName>;

export type Role = keyof typeof ROLE;

/** Numeric colour for a UI role. */
export function tc(role: Role): number { return pal(ROLE[role]); }
/** CSS colour for a UI role. */
export function tcss(role: Role): string { return palCss(ROLE[role]); }

/** One UI pixel in screen px. */
export const UPX = 2;

/** Snap a screen coordinate to the UI pixel grid. */
export function snap(v: number): number { return Math.round(v / UPX) * UPX; }

/** Text scales (multiples of the UI pixel so glyph pixels stay on the grid). */
export const TEXT = {
  /** 5×7 font at 2× → 14px tall: captions, key-caps. */
  small: { font: 'moon8', scale: 2 },
  /** 5×7 font at 4× → 28px: readouts. */
  body: { font: 'moon8', scale: 4 },
  /** Smooth 10×14 font at 2× → 28px: titles. */
  title: { font: 'moon16', scale: 2 },
  /** Smooth 10×14 font at 4× → 56px: screen headers. */
  display: { font: 'moon16', scale: 4 },
} as const;

export type TextStyle = keyof typeof TEXT;

/** Depth bands for UI layers. */
export const DEPTH = {
  hud: 10,
  beacon: 20,
  radio: 25,
  announce: 30,
  pause: 50,
  telegraph: 55,
  damage: 58,
  modal: 60,
} as const;
