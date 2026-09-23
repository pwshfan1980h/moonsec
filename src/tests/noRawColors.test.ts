import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASELINE_FILE, countColorLiterals } from '../../tools/palette/colorLiterals.ts';

describe('raw colour literals', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Record<string, number>;
  const counts = countColorLiterals();

  it('never increase above the committed baseline (use palette names from render/palette.ts)', () => {
    for (const [file, n] of Object.entries(counts)) {
      expect(n, `${file}: ${n} raw colours (baseline ${baseline[file] ?? 0})`).toBeLessThanOrEqual(baseline[file] ?? 0);
    }
  });

  it('baseline is kept tight (regenerate with node tools/palette/colorLiterals.ts --write)', () => {
    for (const [file, n] of Object.entries(baseline)) {
      expect(counts[file] ?? 0, `${file} dropped to ${counts[file] ?? 0}; lower the baseline`).toBe(n);
    }
  });
});
