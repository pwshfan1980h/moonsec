// Remaps legacy art onto the Moonsec palette.
//
//   node tools/palette/remap.ts            # remap every job below
//   node tools/palette/remap.ts collectables
//
// Pixels are classified by OKLab hue family (neutral / cool / warm / red / green / violet)
// and each family is sent to a palette ramp. Within a ramp the entry with the closest
// lightness wins (optionally after a gain/bias, or stretched to the ramp for low-contrast
// sources), so every pixel lands on the palette while the art keeps its value structure. Sources live in art/originals/ so the remap is
// always re-run from pristine input.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PALETTE_LAB, PALETTE_RGB, RAMPS, palIndex, toOklab, type PaletteName } from '../../src/render/palette.ts';
import { decodePng, encodePng } from './png.ts';

type Family = 'neutral' | 'cool' | 'warm' | 'red' | 'green' | 'violet';
type RampRef = keyof typeof RAMPS | readonly PaletteName[];

interface Job {
  src: string;
  out: string;
  families: Record<Family, RampRef>;
  /** Chroma below this counts as neutral. */
  chroma?: number;
  /** Lightness transform before matching: L' = L * gain + bias. */
  gain?: number;
  bias?: number;
  /** Stretch each family's lightness range to its ramp (for low-contrast sources). */
  stretch?: boolean;
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

export const JOBS: Record<string, Job> = {
  'industrial-tileset': {
    src: 'art/originals/industrial-tileset.png', out: 'public/assets/industrial-tileset.png',
    families: { neutral: 'hull', cool: 'hull', violet: 'hull', warm: 'amber', red: 'amber', green: 'green' },
    gain: 1.18,
  },
  'industrial-tileset-blue': {
    src: 'art/originals/industrial-tileset-blue.png', out: 'public/assets/industrial-tileset-blue.png',
    families: { neutral: 'cold', cool: 'cold', violet: 'cold', warm: 'amber', red: 'amber', green: 'green' },
  },
  // Deep Facility: an excavated regolith facility rather than a purple one.
  'industrial-tileset-violet': {
    src: 'art/originals/industrial-tileset-violet.png', out: 'public/assets/industrial-tileset-violet.png',
    families: {
      neutral: ['hull0', 'hull1', 'regolith0', 'regolith1', 'regolith2'], cool: ['hull0', 'hull1', 'regolith0', 'regolith1', 'regolith2'],
      violet: ['hull0', 'hull1', 'regolith0', 'regolith1', 'regolith2'], warm: 'amber', red: 'amber', green: 'regolith',
    },
    chroma: 0.2, stretch: true,
  },
  collectables: {
    src: 'art/originals/collectables.png', out: 'public/assets/collectables.png',
    families: { neutral: 'hull', cool: 'cyan', violet: 'cyan', warm: 'amber', red: 'amber', green: 'green' },
    stretch: true,
  },
};

function family(a: number, b: number, chroma: number, threshold: number): Family {
  if (chroma < threshold) return 'neutral';
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  if (h < 40 || h >= 345) return 'red';
  if (h < 110) return 'warm';
  if (h < 170) return 'green';
  if (h < 280) return 'cool';
  return 'violet';
}

function rampIndices(ref: RampRef): number[] {
  const names = typeof ref === 'string' ? RAMPS[ref] : ref;
  return [...names].sort((x, y) => PALETTE_LAB[palIndex(x)][0] - PALETTE_LAB[palIndex(y)][0]).map(palIndex);
}

export function remapJob(job: Job): { width: number; height: number; data: Uint8Array } {
  const img = decodePng(readFileSync(path.join(ROOT, job.src)));
  const threshold = job.chroma ?? 0.035;
  const n = img.width * img.height;
  const labs = new Float32Array(n * 3);
  const fam: Family[] = new Array(n);
  const lsByFam = new Map<Family, number[]>();
  for (let i = 0; i < n; i++) {
    if (img.data[i * 4 + 3] < 128) continue;
    const [L, A, B] = toOklab([img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]]);
    labs[i * 3] = L; labs[i * 3 + 1] = A; labs[i * 3 + 2] = B;
    // very dark pixels are outlines/shadow regardless of hue
    const f = L < 0.2 ? 'neutral' : family(A, B, Math.hypot(A, B), threshold);
    fam[i] = f;
    if (!lsByFam.has(f)) lsByFam.set(f, []);
    lsByFam.get(f)!.push(L);
  }
  // per-family lightness range (2nd–98th percentile) so each family uses its full ramp
  const range = new Map<Family, [number, number]>();
  for (const [f, ls] of lsByFam) {
    ls.sort((x, y) => x - y);
    const lo = ls[Math.floor(ls.length * 0.02)], hi = ls[Math.min(ls.length - 1, Math.floor(ls.length * 0.98))];
    range.set(f, [lo, Math.max(hi, lo + 1e-3)]);
  }
  const ramps = new Map<Family, number[]>();
  for (const f of Object.keys(job.families) as Family[]) ramps.set(f, rampIndices(job.families[f]));

  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (img.data[i * 4 + 3] < 128) continue;
    const f = fam[i];
    const ramp = ramps.get(f)!;
    const [lo, hi] = range.get(f)!;
    const rl = ramp.map((p) => PALETTE_LAB[p][0]);
    let target: number;
    if (job.stretch) {
      const t = Math.min(1, Math.max(0, (labs[i * 3] - lo) / (hi - lo)));
      target = rl[0] + t * (rl[rl.length - 1] - rl[0]);
    } else {
      target = labs[i * 3] * (job.gain ?? 1) + (job.bias ?? 0);
    }
    let best = ramp[0], bestD = Infinity;
    for (let k = 0; k < ramp.length; k++) {
      const d = Math.abs(rl[k] - target);
      if (d < bestD) { bestD = d; best = ramp[k]; }
    }
    const [r, g, b] = PALETTE_RGB[best];
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  for (const [name, job] of Object.entries(JOBS)) {
    if (only.length && !only.includes(name)) continue;
    writeFileSync(path.join(ROOT, job.out), encodePng(remapJob(job)));
    console.log(`remapped ${name} → ${job.out}`);
  }
}
