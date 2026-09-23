// Rewrites raw colour literals in source files to palette references:
//   0xRRGGBB  → pal('<nearest>')
//   '#RRGGBB' → palCss('<nearest>')   (quoted string literal only)
// Nearest is perceptual (OKLab), the same match the retro filter makes at runtime, so the
// on-screen result is unchanged. Adds the palette import where needed.
//
//   node --import ./tools/register-ts.mjs tools/palette/codemod.ts src/scenes/GameScene.ts ...
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PALETTE, nearestIndex, type RGB } from '../../src/render/palette.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PALETTE_FILE = path.join(ROOT, 'src/render/palette');

function nearestName(hex: string): string {
  const n = parseInt(hex, 16);
  const rgb: RGB = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return PALETTE[nearestIndex(rgb)].name;
}

function ensureImport(src: string, file: string, names: string[]): string {
  let rel = path.relative(path.dirname(file), PALETTE_FILE).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  const re = new RegExp(`import \\{([^}]*)\\} from '${rel.replace(/\./g, '\\.')}';`);
  const m = src.match(re);
  if (m) {
    const have = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const merged = [...new Set([...have, ...names])].sort((a, b) => a.replace('type ', '').localeCompare(b.replace('type ', '')));
    return src.replace(re, `import { ${merged.join(', ')} } from '${rel}';`);
  }
  return `import { ${names.sort().join(', ')} } from '${rel}';\n` + src;
}

for (const arg of process.argv.slice(2)) {
  const file = path.resolve(arg);
  let src = readFileSync(file, 'utf8');
  const used = new Set<string>();
  let count = 0;
  src = src.replace(/(['"])#([0-9a-fA-F]{6})\1/g, (_m, _q, hex: string) => { used.add('palCss'); count++; return `palCss('${nearestName(hex)}')`; });
  src = src.replace(/0x([0-9a-fA-F]{6})\b/g, (_m, hex: string) => { used.add('pal'); count++; return `pal('${nearestName(hex)}')`; });
  if (used.size) src = ensureImport(src, file, [...used]);
  writeFileSync(file, src);
  const left = (src.match(/(?:0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{6}\b)/g) ?? []).length;
  console.log(`${path.relative(ROOT, file)}: ${count} rewritten${left ? `, ${left} left for hand edits` : ''}`);
}
