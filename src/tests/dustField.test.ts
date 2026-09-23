import { describe, expect, it } from 'vitest';
import { DustField } from '../fx/DustField';
import { TerrainProbe } from '../fx/terrain';

const mk = (o: Partial<ConstructorParameters<typeof DustField>[0]> = {}) => new DustField({ cols: 40, rows: 24, cell: 8, sink: 0, ...o });

describe('DustField', () => {
  it('decays without sources', () => {
    const f = mk();
    f.deposit(160, 96, 24, 1);
    let prev = f.totalMass();
    for (let i = 0; i < 30; i++) {
      f.step(1 / 30);
      const m = f.totalMass();
      expect(m).toBeLessThan(prev);
      prev = m;
    }
  });

  it('conserves mass under advection and diffusion when decay is off', () => {
    const f = mk({ retain: 1 });
    f.deposit(160, 96, 24, 1);
    f.windX = 20;
    const before = f.totalMass();
    for (let i = 0; i < 20; i++) f.step(1 / 30);
    expect(Math.abs(f.totalMass() - before) / before).toBeLessThan(0.02);
  });

  it('moves dust with the wind', () => {
    const f = mk({ retain: 1 });
    f.deposit(80, 96, 16, 1);
    const centroidX = () => {
      let m = 0, mx = 0;
      for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) { const d = f.density[r * f.cols + c]; m += d; mx += d * (c + 0.5) * f.cell; }
      return mx / m;
    };
    const start = centroidX();
    f.windX = 60;
    for (let i = 0; i < 30; i++) f.step(1 / 30);
    expect(centroidX() - start).toBeGreaterThan(25);
  });

  it('a jet blast clears the cell under the nozzle', () => {
    const f = mk();
    for (let x = 40; x < 280; x += 16) f.deposit(x, 150, 16, 1);
    const before = f.densityAt(160, 150);
    for (let i = 0; i < 12; i++) { f.blast(160, 150, 48, 240); f.step(1 / 30); }
    expect(f.densityAt(160, 150)).toBeLessThan(before * 0.3);
  });

  it('keeps dust fixed in the world when the camera scrolls', () => {
    const f = mk({ retain: 1, diffuse: 0 });
    f.deposit(100, 100, 8, 1);
    const before = f.densityAt(100, 100);
    f.anchor(16, 0);
    expect(f.densityAt(100, 100)).toBeCloseTo(before, 6);
  });
});

describe('TerrainProbe', () => {
  const E = -1;
  const tiles = [
    [E, E, E, E],
    [E, E, 1, E],
    [E, E, E, E],
    [1, 1, 1, 1],
  ];
  const probe = new TerrainProbe(tiles, E);

  it('finds the ground below a point', () => {
    expect(probe.groundBelow(16, 10, 200)).toBe(96 - 10);
    expect(probe.groundBelow(80, 10, 200)).toBe(32 - 10);
    expect(probe.groundBelow(16, 10, 40)).toBeNull();
  });

  it('reports solid cells', () => {
    expect(probe.solidAt(70, 40)).toBe(true);
    expect(probe.solidAt(10, 40)).toBe(false);
    expect(probe.surfaceBelow(16, 0)).toBe(96);
  });
});
