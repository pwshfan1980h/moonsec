import { describe, expect, it } from 'vitest';
import { decks, isSolid, parseLevelMap, toTileIndices } from '../level/levelMap';
import { TILE, TMPL_SURFACE_OPS, buildMap } from '../data/levelData';
import { LEVEL_CONFIGS, spawnPoint } from '../data/levelConfigs';

const SMALL = `
; comment lines and blank lines are ignored

......
..S.==
######
`;

describe('parseLevelMap', () => {
  it('reads cells, spawn and decks', () => {
    const m = parseLevelMap(SMALL);
    expect([m.cols, m.rows]).toEqual([6, 3]);
    expect(m.spawn).toEqual({ col: 2, row: 1 });
    expect(m.cells[1][2]).toBe('empty');
    expect(isSolid(m, 4, 1)).toBe(true);
    expect(isSolid(m, 0, 0)).toBe(false);
    expect(isSolid(m, -1, 2)).toBe(false);
    expect(decks(m)).toEqual([{ col: 4, row: 1, width: 2 }]);
  });

  it('rejects ragged rows, unknown cells, missing or floating spawns', () => {
    expect(() => parseLevelMap('..\n...\nS.\n##')).toThrow(/row 1/);
    expect(() => parseLevelMap('.x\nS.\n##')).toThrow(/unknown cell 'x'/);
    expect(() => parseLevelMap('..\n##')).toThrow(/no spawn/);
    expect(() => parseLevelMap('S.\n..\n##')).toThrow(/not standing/);
    expect(() => parseLevelMap('SS\n##')).toThrow(/more than one/);
  });

  it('derives legacy tile indices from exposure', () => {
    const tiles = toTileIndices(parseLevelMap('S.\n#=\n#.\n#.'), { EMPTY: -1, SURFACE: 0, FILL_A: 7, FILL_B: 13 });
    expect(tiles.map((r) => r[0])).toEqual([-1, 0, 7, 13]);
    expect(tiles[1][1]).toBe(0);
  });
});

describe('Surface Ops text map', () => {
  const map = TMPL_SURFACE_OPS.map!;

  it('is the full 200 x 34 mission with a continuous floor at row 30', () => {
    expect([map.cols, map.rows]).toEqual([200, 34]);
    expect(TMPL_SURFACE_OPS.groundRow).toBe(30);
    const floor = map.cells[30].filter((c) => c === 'solid').length;
    expect(floor).toBeGreaterThan(map.cols * 0.8);
    for (let c = 0; c < map.cols; c++) expect(map.cells.some((row) => row[c] !== 'empty'), `col ${c}`).toBe(true);
  });

  it('spawns the mech clear of the opening trench, on the main floor', () => {
    expect(map.spawn.row).toBe(29);
    expect(map.spawn.col).toBeLessThan(20);
    expect(spawnPoint(LEVEL_CONFIGS[0], 960).y).toBe(955);
  });

  it('feeds the tile renderer and physics through buildMap', () => {
    const tiles = buildMap(TMPL_SURFACE_OPS, 1);
    expect(tiles.length).toBe(34);
    expect(tiles[30][0]).toBe(TILE.SURFACE);
    for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
      expect(tiles[r][c] !== TILE.EMPTY).toBe(isSolid(map, c, r));
    }
  });
});
