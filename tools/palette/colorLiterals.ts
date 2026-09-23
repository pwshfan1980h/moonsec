// Counts raw colour literals (0xRRGGBB and #RRGGBB) per source file. Colours belong
// in src/render/palette.ts (and the UI theme derived from it); everything else should
// reference palette names. The committed baseline may only go down.
//
//   node tools/palette/colorLiterals.ts --write   # regenerate the baseline after reducing counts
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const BASELINE_FILE = path.join(ROOT, 'tools/palette/color-literal-baseline.json');
const EXEMPT = new Set(['src/render/palette.ts', 'src/ui/theme.ts']);
const PATTERN = /(?:0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{6}\b)/g;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'tests') walk(full, out); }
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

export function countColorLiterals(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of walk(path.join(ROOT, 'src'), []).sort()) {
    const rel = path.relative(ROOT, file);
    if (EXEMPT.has(rel)) continue;
    const n = (readFileSync(file, 'utf8').match(PATTERN) ?? []).length;
    if (n) counts[rel] = n;
  }
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--write')) {
  const counts = countColorLiterals();
  writeFileSync(BASELINE_FILE, JSON.stringify(counts, null, 2) + '\n');
  console.log(`baseline: ${Object.values(counts).reduce((a, b) => a + b, 0)} literals in ${Object.keys(counts).length} files`);
}
