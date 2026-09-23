// Writes the palette in artist-friendly formats from src/render/palette.ts:
//   art/palette/moonsec.gpl   (GIMP / Aseprite palette)
//   art/palette/moonsec.hex   (Lospec hex list)
//   art/palette/moonsec-1x.png, moonsec-swatch.png
//
//   node tools/palette/export.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PALETTE, PALETTE_RGB } from '../../src/render/palette.ts';
import { encodePng } from './png.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'art/palette');
mkdirSync(OUT, { recursive: true });

const gpl = ['GIMP Palette', 'Name: Moonsec', 'Columns: 8', '#',
  ...PALETTE.map((e, i) => `${PALETTE_RGB[i].map((c) => String(c).padStart(3)).join(' ')}\t${e.name}`)];
writeFileSync(path.join(OUT, 'moonsec.gpl'), gpl.join('\n') + '\n');
writeFileSync(path.join(OUT, 'moonsec.hex'), PALETTE.map((e) => e.hex.slice(1)).join('\n') + '\n');

function strip(cell: number, cols: number): Uint8Array {
  const rows = Math.ceil(PALETTE.length / cols);
  const w = cols * cell, h = rows * cell;
  const data = new Uint8Array(w * h * 4);
  PALETTE_RGB.forEach(([r, g, b], i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    for (let y = cy; y < cy + cell; y++) for (let x = cx; x < cx + cell; x++) {
      const o = (y * w + x) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  });
  return data;
}
writeFileSync(path.join(OUT, 'moonsec-1x.png'), encodePng({ width: PALETTE.length, height: 1, data: strip(1, PALETTE.length) }));
writeFileSync(path.join(OUT, 'moonsec-swatch.png'), encodePng({ width: 8 * 16, height: 3 * 16, data: strip(16, 8) }));
console.log(`wrote ${PALETTE.length} colours to art/palette/`);
