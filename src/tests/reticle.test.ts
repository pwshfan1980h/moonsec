import { describe, expect, it } from 'vitest';
import { RETICLE_SIZE, reticlePixels } from '../ui/reticle';
import { PALETTE } from '../render/palette';

describe('mission reticle', () => {
  const g = reticlePixels();
  const C = (RETICLE_SIZE - 1) / 2;

  it('has a bright centre pixel with a clear gap around it', () => {
    expect(g[C][C]).toBe('cyan3');
    for (const [x, y] of [[C - 1, C], [C + 1, C], [C, C - 1], [C, C + 1]]) expect(g[y][x]).toBe('hull0'); // outline only
    expect(g[C - 2][C]).toBeNull();
  });

  it('is symmetric in both axes so the hotspot sits on the centre', () => {
    for (let y = 0; y < RETICLE_SIZE; y++) for (let x = 0; x < RETICLE_SIZE; x++) {
      expect(g[y][x]).toBe(g[y][RETICLE_SIZE - 1 - x]);
      expect(g[y][x]).toBe(g[RETICLE_SIZE - 1 - y][x]);
    }
  });

  it('uses palette colours only and outlines every lit pixel', () => {
    const names = new Set<string>(PALETTE.map((p) => p.name));
    for (let y = 0; y < RETICLE_SIZE; y++) for (let x = 0; x < RETICLE_SIZE; x++) {
      const c = g[y][x];
      if (c === null) continue;
      expect(names.has(c)).toBe(true);
      if (c === 'hull0') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(g[y + dy]?.[x + dx] ?? 'edge').not.toBeNull();
    }
  });
});
