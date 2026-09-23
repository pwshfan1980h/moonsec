import type { LevelMap } from '../level/levelMap';
import { hash } from './shade';
import { EDGE, TILE_INDEX, VARIANTS, type DeckShape } from './terrainTiles';

export const EMPTY_TILE = -1;

/**
 * Tile indices for a text map, chosen from each cell's neighbours: regolith picks its exposed
 * edges (decks count as open, so ground under a gantry keeps its crust), cells three or more
 * deep use the darker strata fill, decks pick their end caps. Empty cells stay -1, so the result
 * doubles as the collision grid.
 */
export function autotile(map: LevelMap): number[][] {
  // regolith and plating join each other; decks and containers sit on top (the crust shows)
  const ground = (c: number, r: number) => {
    if (c < 0 || c >= map.cols) return true; // the world edge is not a cliff
    if (r >= map.rows) return true;
    const k = map.cells[r]?.[c];
    return k === 'solid' || k === 'plate';
  };
  const deck = (c: number, r: number) => map.cells[r]?.[c] === 'deck';
  return map.cells.map((line, r) => line.map((cell, c) => {
    const v = Math.floor(hash(c, r, 11) * VARIANTS);
    if (cell === 'empty') return EMPTY_TILE;
    if (cell === 'container') return TILE_INDEX.blank;
    if (cell === 'deck') {
      // bit 1: no deck to the left (left end cap), bit 2: none to the right
      const shape = ((deck(c - 1, r) ? 0 : 1) | (deck(c + 1, r) ? 0 : 2)) as DeckShape;
      return TILE_INDEX.deck(shape, v & 1);
    }
    const mask = (ground(c, r - 1) ? 0 : EDGE.up) | (ground(c + 1, r) ? 0 : EDGE.right)
      | (ground(c, r + 1) ? 0 : EDGE.down) | (ground(c - 1, r) ? 0 : EDGE.left);
    if (cell === 'plate') return TILE_INDEX.plate(mask, v & 1);
    if (mask === 0 && ground(c, r - 2) && ground(c, r - 3)) return TILE_INDEX.deep(v);
    return TILE_INDEX.regolith(mask, v);
  }));
}
