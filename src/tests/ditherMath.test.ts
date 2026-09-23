import { describe, expect, it } from 'vitest';
import { bayer4, pickColor } from '../render/ditherMath';
import { PALETTE_RGB, type RGB } from '../render/palette';

const PAL: RGB[] = PALETTE_RGB.map(([r, g, b]) => [r / 255, g / 255, b / 255]);
const same = (a: RGB, b: RGB) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

describe('bayer4', () => {
  it('produces 16 distinct thresholds over a 4×4 tile', () => {
    const vals = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) vals.add(Math.round(bayer4(x, y) * 16));
    expect(vals.size).toBe(16);
  });

  it('stays in [0, 1) and tiles every 4 cells', () => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = bayer4(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBeCloseTo(bayer4(x + 4, y + 4), 9);
    }
  });
});

describe('pickColor', () => {
  it('never dithers exact palette colours', () => {
    for (const c of PAL) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      expect(same(pickColor(c, PAL, x, y, 1), c)).toBe(true);
    }
  });

  it('always returns a palette colour', () => {
    const probe: RGB = [0.5, 0.2, 0.7];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const out = pickColor(probe, PAL, x, y, 1);
      expect(PAL.some((p) => same(p, out))).toBe(true);
    }
  });

  it('mixes the two nearest colours in proportion for an in-between colour', () => {
    const a = PAL[3], b = PAL[4];
    const mid: RGB = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    let countB = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!same(pickColor(mid, PAL, x, y, 1), pickColor(mid, PAL, x, y, 0))) countB++;
    expect(countB).toBeGreaterThanOrEqual(6);
    expect(countB).toBeLessThanOrEqual(8);
  });

  it('uses only the nearest colour when spread is 0', () => {
    const probe: RGB = [0.3, 0.33, 0.4];
    const first = pickColor(probe, PAL, 0, 0, 0);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) expect(same(pickColor(probe, PAL, x, y, 0), first)).toBe(true);
  });
});
