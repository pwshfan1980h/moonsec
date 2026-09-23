import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE_RGB } from '../render/palette';
import { decodePng } from '../../tools/palette/png.ts';
import allowlist from '../../tools/palette/asset-allowlist.json';

const ASSETS = path.resolve(__dirname, '../../public/assets');
const ALLOWED = new Set<string>(allowlist.pending);
const KEYS = new Set(PALETTE_RGB.map(([r, g, b]) => (r << 16) | (g << 8) | b));

describe('assets use only palette colours', () => {
  const pngs = readdirSync(ASSETS).filter((f) => f.endsWith('.png'));

  for (const file of pngs) {
    it(file, () => {
      const img = decodePng(readFileSync(path.join(ASSETS, file)));
      let off = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] === 0) continue;
        if (img.data[i + 3] !== 255 || !KEYS.has((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2])) off++;
      }
      if (ALLOWED.has(file)) {
        // Legacy art awaiting replacement. Fails once it is clean so the allowlist only shrinks.
        expect(off, `${file} is now on-palette — remove it from asset-allowlist.json`).toBeGreaterThan(0);
      } else {
        expect(off, `${file} has ${off} off-palette or semi-transparent pixels`).toBe(0);
      }
    });
  }

  it('allowlist only names existing files', () => {
    for (const f of ALLOWED) expect(pngs).toContain(f);
  });
});
