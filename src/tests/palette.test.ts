import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_RGB, RAMPS, REMAPS, isPaletteColor, nearestIndex, pal, palCss, palIndex } from '../render/palette';

describe('palette', () => {
  it('has 24 unique colours', () => {
    expect(PALETTE).toHaveLength(24);
    expect(new Set(PALETTE.map((e) => e.hex)).size).toBe(24);
    expect(new Set(PALETTE.map((e) => e.name)).size).toBe(24);
  });

  it('exposes numeric and css forms', () => {
    expect(pal('cyan2')).toBe(0x6de3ff);
    expect(palCss('amber1')).toBe('#ffb347');
    expect(PALETTE[palIndex('void')].hex).toBe('#06070f');
  });

  it('maps every palette colour to itself', () => {
    PALETTE_RGB.forEach((rgb, i) => expect(nearestIndex(rgb)).toBe(i));
  });

  it('snaps off-palette colours to a palette entry', () => {
    expect(isPaletteColor(PALETTE_RGB[nearestIndex([250, 20, 20])])).toBe(true);
    expect(PALETTE[nearestIndex([255, 60, 90])].name).toBe('hostile1');
  });

  it('only references palette names in ramps and remaps', () => {
    const names = new Set<string>(PALETTE.map((e) => e.name));
    for (const ramp of Object.values(RAMPS)) for (const n of ramp) expect(names.has(n)).toBe(true);
    for (const map of Object.values(REMAPS)) for (const [k, v] of Object.entries(map)) {
      expect(names.has(k)).toBe(true);
      expect(names.has(v!)).toBe(true);
    }
  });
});
