import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../level/levelMap';
import { autotile, EMPTY_TILE } from '../world/autotile';
import { EDGE, TILE_INDEX, terrainTiles } from '../world/terrainTiles';
import { WORLD_PROPS } from '../world/props';
import { rasterizePart } from '../rig/raster';
import { isPaletteColor } from '../render/palette';
import { TMPL_SURFACE_OPS } from '../data/levelData';

const regolithMask = (index: number) => Math.floor(index / 8);

describe('autotile', () => {
  const map = parseLevelMap(`
......
...==.
S.##..
######
######
######
`);
  const tiles = autotile(map);

  it('keeps empty cells empty so the result is the collision grid', () => {
    expect(tiles[0].every((t) => t === EMPTY_TILE)).toBe(true);
    expect(tiles[2][0]).toBe(EMPTY_TILE);
  });

  it('opens edges toward empty cells and treats the world edge as solid', () => {
    expect(regolithMask(tiles[2][2])).toBe(EDGE.up | EDGE.left);
    expect(regolithMask(tiles[2][3])).toBe(EDGE.up | EDGE.right);
    expect(regolithMask(tiles[3][0])).toBe(EDGE.up); // left world edge is not a cliff
    expect(regolithMask(tiles[4][2])).toBe(0);
  });

  it('uses deep strata three cells down and end caps on decks', () => {
    const deep = [0, 1, 2, 3, 4, 5, 6, 7].map(TILE_INDEX.deep);
    expect(deep).toContain(tiles[5][2]); // three solid cells above
    expect(deep).not.toContain(tiles[5][0]);
    expect([0, 1].map((v) => TILE_INDEX.deck(1, v))).toContain(tiles[1][3]);
    expect([0, 1].map((v) => TILE_INDEX.deck(2, v))).toContain(tiles[1][4]);
  });

  it('only emits indices the tileset has', () => {
    const count = terrainTiles().length;
    for (const row of autotile(TMPL_SURFACE_OPS.map!)) for (const t of row) expect(t < count).toBe(true);
  });
});

describe('world kit art', () => {
  it('draws every tile to the full 16 x 16 cell in palette colours', () => {
    for (const spec of terrainTiles()) {
      const r = rasterizePart(spec, 'n', { outline: false });
      expect([r.width, r.height]).toEqual([16, 16]);
      for (let i = 0; i < r.data.length; i += 4) {
        if (r.data[i + 3]) expect(isPaletteColor([r.data[i], r.data[i + 1], r.data[i + 2]])).toBe(true);
      }
    }
  });

  it('keeps every prop inside its box, anchored inside it, in palette colours', () => {
    for (const [name, spec] of Object.entries(WORLD_PROPS)) {
      expect(spec.px, name).toBeLessThanOrEqual(spec.w);
      expect(spec.py, name).toBeLessThanOrEqual(spec.h);
      const r = rasterizePart(spec, 'n');
      let opaque = 0;
      for (let i = 0; i < r.data.length; i += 4) {
        if (!r.data[i + 3]) continue;
        opaque++;
        expect(isPaletteColor([r.data[i], r.data[i + 1], r.data[i + 2]]), name).toBe(true);
      }
      expect(opaque, name).toBeGreaterThan(spec.w * spec.h * 0.15);
    }
  });
});
