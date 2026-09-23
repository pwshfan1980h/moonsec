// Counts off-palette pixels in screenshots.
//   node tools/shots/audit.ts .shots/p2/*.png
// Exits non-zero if any image has off-palette pixels (ignore with --report).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PALETTE_RGB } from '../../src/render/palette.ts';
import { decodePng } from '../palette/png.ts';

// GPU output may round a channel by one step; count those as on-palette.
const keys = new Set<number>();
for (const [r, g, b] of PALETTE_RGB) {
  for (const dr of [-1, 0, 1]) for (const dg of [-1, 0, 1]) for (const db of [-1, 0, 1]) {
    keys.add(((r + dr) << 16) | ((g + dg) << 8) | (b + db));
  }
}
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const reportOnly = process.argv.includes('--report');
let bad = 0;
for (const f of files) {
  const img = decodePng(readFileSync(f));
  let off = 0;
  const offColors = new Map<number, number>();
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    if (!keys.has(k)) { off++; offColors.set(k, (offColors.get(k) ?? 0) + 1); }
  }
  const pct = ((off / (img.width * img.height)) * 100).toFixed(3);
  const top = [...offColors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `#${k.toString(16).padStart(6, '0')}×${n}`);
  console.log(`${off ? '✗' : '✓'} ${path.basename(f)}: ${off} off-palette (${pct}%) ${top.join(' ')}`);
  if (off) bad++;
}
process.exit(bad && !reportOnly ? 1 : 0);
