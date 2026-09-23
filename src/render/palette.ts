/**
 * The Moonsec palette — the single source of truth for every colour in the game.
 *
 * 24 entries in ramps. Art, shaders, UI theme and tools all derive from this list;
 * tests reject PNGs and code literals that step outside it (see src/tests/palette*.test.ts).
 *
 * Roles:
 *   void / hull     backgrounds, outlines, metal, UI panels
 *   regolith        lunar ground, dust, rock
 *   cold            sky, facility shadow, blue tiles
 *   cyan            the player — visor, jets, HUD accent (cyan3 is the only "white")
 *   amber           ordnance, hazard trim, warnings
 *   green           nanite repair only
 *   hostile         enemy eyes, enemy fire, telegraphs, damage
 *
 * Keep this module dependency-free: Node tools import it directly (type stripping).
 */

export const PALETTE = [
  { name: 'void', hex: '#06070f' },
  { name: 'hull0', hex: '#0e1019' },
  { name: 'hull1', hex: '#1b1e2c' },
  { name: 'hull2', hex: '#282c3f' },
  { name: 'hull3', hex: '#3b4159' },
  { name: 'hull4', hex: '#57607d' },
  { name: 'hull5', hex: '#8690b0' },
  { name: 'hull6', hex: '#c3cbe2' },
  { name: 'regolith0', hex: '#3a3431' },
  { name: 'regolith1', hex: '#625950' },
  { name: 'regolith2', hex: '#978b7c' },
  { name: 'cold0', hex: '#0b1233' },
  { name: 'cold1', hex: '#1a2d5c' },
  { name: 'cold2', hex: '#34579a' },
  { name: 'cyan0', hex: '#1d4a63' },
  { name: 'cyan1', hex: '#2a7fa3' },
  { name: 'cyan2', hex: '#6de3ff' },
  { name: 'cyan3', hex: '#dffaff' },
  { name: 'amber0', hex: '#9a5f22' },
  { name: 'amber1', hex: '#ffb347' },
  { name: 'green0', hex: '#1f7a4d' },
  { name: 'green1', hex: '#66ff99' },
  { name: 'hostile0', hex: '#8a1a3c' },
  { name: 'hostile1', hex: '#ff3a5c' },
] as const;

export type PaletteName = (typeof PALETTE)[number]['name'];
export type RGB = readonly [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PALETTE_RGB: readonly RGB[] = PALETTE.map((e) => hexToRgb(e.hex));
const INDEX = new Map<string, number>(PALETTE.map((e, i) => [e.name, i]));

/** Palette index of a named colour. */
export function palIndex(name: PaletteName): number {
  return INDEX.get(name)!;
}

/** Numeric colour (0xRRGGBB) for Phaser Graphics / tints. */
export function pal(name: PaletteName): number {
  return parseInt(PALETTE[palIndex(name)].hex.slice(1), 16);
}

/** CSS colour string for Phaser Text / DOM. */
export function palCss(name: PaletteName): string {
  return PALETTE[palIndex(name)].hex;
}

// ── OKLab, used for perceptual nearest-colour matching ─────────────────────
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function toOklab([r, g, b]: RGB): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export const PALETTE_LAB = PALETTE_RGB.map(toOklab);

/** Nearest palette index by OKLab distance, optionally restricted to a subset. */
export function nearestIndex(rgb: RGB, subset?: readonly number[]): number {
  const [L, A, B] = toOklab(rgb);
  let best = 0, bestD = Infinity;
  const candidates = subset ?? PALETTE_LAB.map((_, i) => i);
  for (const i of candidates) {
    const [l, a, b] = PALETTE_LAB[i];
    const d = (L - l) ** 2 + (A - a) ** 2 + (B - b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function isPaletteColor([r, g, b]: RGB): boolean {
  return PALETTE_RGB.some(([pr, pg, pb]) => pr === r && pg === g && pb === b);
}

/**
 * Ramps, dark → light, as palette names. Used by art tools (remapping, far-side
 * limb shading, EMP lights-out) and by effects that fade through a family.
 */
export const RAMPS = {
  hull: ['hull0', 'hull1', 'hull2', 'hull3', 'hull4', 'hull5', 'hull6'],
  regolith: ['hull1', 'regolith0', 'hull3', 'regolith1', 'hull4', 'regolith2', 'hull5'],
  cold: ['void', 'cold0', 'hull1', 'cold1', 'hull3', 'cold2', 'hull5', 'hull6'],
  cyan: ['cyan0', 'cyan1', 'cyan2', 'cyan3'],
  amber: ['amber0', 'amber1'],
  green: ['green0', 'green1'],
  hostile: ['hostile0', 'hostile1'],
  /** Jet flame, core → fringe. */
  jet: ['cyan3', 'amber1', 'amber0', 'cyan2', 'cyan1'],
  fire: ['cyan3', 'amber1', 'amber0', 'hostile0', 'hull1'],
  smoke: ['hull5', 'hull4', 'hull3', 'hull2'],
  dust: ['regolith2', 'regolith1', 'regolith0', 'hull2'],
} as const satisfies Record<string, readonly PaletteName[]>;

/**
 * Palette-index remaps. `far` darkens by one ramp step (far-side limbs); `emp`
 * kills every light (cyan / amber / green / hostile collapse to dark cold tones).
 */
export const REMAPS: Record<'far' | 'emp', Partial<Record<PaletteName, PaletteName>>> = {
  far: {
    hull1: 'hull0', hull2: 'hull1', hull3: 'hull2', hull4: 'hull3', hull5: 'hull4', hull6: 'hull5',
    regolith1: 'regolith0', regolith2: 'regolith1',
    cyan1: 'cyan0', cyan2: 'cyan1', cyan3: 'cyan2',
    amber1: 'amber0', green1: 'green0', hostile1: 'hostile0',
  },
  emp: {
    cyan0: 'cold0', cyan1: 'cold1', cyan2: 'cyan0', cyan3: 'cyan0',
    amber0: 'hull2', amber1: 'hull3', green0: 'hull2', green1: 'hull3',
    hostile0: 'hull2', hostile1: 'hull3',
  },
};
