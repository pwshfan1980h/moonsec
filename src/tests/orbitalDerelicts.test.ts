import { describe, it, expect } from 'vitest';
import { EARTH_SUN, earthOccludes, orbitalLight, ORBITAL_DERELICTS } from '../world/orbitalDerelicts';
import { rasterizePart } from '../rig/raster';

describe('Earth orbital derelicts', () => {
  it('blocks sunlight behind Earth and softens its shadow edge', () => {
    const p = EARTH_SUN.map(v => -100 * v);
    expect(orbitalLight(...p as [number, number, number])).toBe(0);
    expect(orbitalLight(...EARTH_SUN.map(v => 100 * v) as [number, number, number])).toBe(1);
    const n = Math.hypot(EARTH_SUN[0], EARTH_SUN[1]);
    const side = [-EARTH_SUN[1] / n, EARTH_SUN[0] / n, 0];
    const at = (r: number) => orbitalLight(...p.map((v, i) => v + r * side[i]) as [number, number, number]);
    expect(at(50)).toBe(0);
    expect(at(56)).toBeGreaterThan(0);
    expect(at(56)).toBeLessThan(at(60));
    expect(at(70)).toBe(1);
  });
  it('occludes far objects and permits near objects and objects beyond the limb', () => {
    expect(earthOccludes(0, 0, -90)).toBe(true);
    expect(earthOccludes(0, 0, 90)).toBe(false);
    expect(earthOccludes(57, 0, -90)).toBe(false);
    expect(earthOccludes(54, 0, 0)).toBe(true);
  });
  it('bakes a deterministic dense population within the texture', () => {
    const a = rasterizePart(ORBITAL_DERELICTS, 'n', { outline: false });
    const b = rasterizePart(ORBITAL_DERELICTS, 'n', { outline: false });
    expect(a.data).toEqual(b.data);
    expect(Array.from(a.data).filter((v, i) => i % 4 === 3 && v > 0).length).toBeGreaterThan(1000);
  });
});
