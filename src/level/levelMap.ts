/**
 * Text level maps: the collision grid is the source of truth and art is derived from it.
 *
 * One character per 32-unit cell, one line per row:
 *   .  empty
 *   #  solid mass — regolith, rock, walls, ceilings
 *   %  plated floor — built solid mass (pads, dome floors)
 *   =  deck — a built platform surface (solid for now; drawn as a thin structure on a truss)
 *   C  container — solid cover drawn as stacked shipping containers; each stack is a 4-wide,
 *      2n-tall rectangle of C (one container per 4×2 block)
 *   S  player spawn — an empty cell the mech's feet stand in; the cell below must be solid
 * Lines starting with `;` are comments. Blank lines are ignored. Every row must be the same width.
 *
 * Pure (no Phaser) so maps can be validated in tests.
 */
export type Cell = 'empty' | 'solid' | 'plate' | 'deck' | 'container';

export interface Deck { col: number; row: number; width: number }

export interface LevelMap {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly (readonly Cell[])[];
  readonly spawn: { col: number; row: number };
}

const LEGEND: Record<string, Cell> = { '.': 'empty', '#': 'solid', '%': 'plate', '=': 'deck', C: 'container', S: 'empty' };

/** Container footprint in cells. */
export const CONTAINER = { cols: 4, rows: 2 } as const;

export function parseLevelMap(src: string, name = 'map'): LevelMap {
  const lines = src.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l !== '' && !l.startsWith(';'));
  if (lines.length === 0) throw new Error(`${name}: empty map`);
  const cols = lines[0].length;
  let spawn: { col: number; row: number } | undefined;
  const cells = lines.map((line, row) => {
    if (line.length !== cols) throw new Error(`${name}: row ${row} is ${line.length} wide, expected ${cols}`);
    return [...line].map((ch, col) => {
      const cell = LEGEND[ch];
      if (!cell) throw new Error(`${name}: unknown cell '${ch}' at col ${col}, row ${row}`);
      if (ch === 'S') {
        if (spawn) throw new Error(`${name}: more than one spawn`);
        spawn = { col, row };
      }
      return cell;
    });
  });
  if (!spawn) throw new Error(`${name}: no spawn (S)`);
  if (cells[spawn.row + 1]?.[spawn.col] === undefined || cells[spawn.row + 1][spawn.col] === 'empty') {
    throw new Error(`${name}: spawn at col ${spawn.col}, row ${spawn.row} is not standing on solid ground`);
  }
  const map = { cols, rows: cells.length, cells, spawn };
  containerBlocks(map, name); // validates stacks
  return map;
}

/**
 * Container stacks as 4×2 blocks (top-left cell), bottom to top. Throws if a stack of C cells
 * is not a whole number of containers wide and tall.
 */
export function containerBlocks(map: LevelMap, name = 'map'): { col: number; row: number }[] {
  const seen = new Set<number>();
  const out: { col: number; row: number }[] = [];
  const is = (c: number, r: number) => map.cells[r]?.[c] === 'container';
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
    if (!is(c, r) || seen.has(r * map.cols + c)) continue;
    let w = 0; while (is(c + w, r)) w++;
    let h = 0; while ([...Array(w).keys()].every((i) => is(c + i, r + h))) h++;
    if (w !== CONTAINER.cols || h % CONTAINER.rows !== 0 || is(c - 1, r) || is(c + w, r + h - 1) || is(c, r + h)) {
      throw new Error(`${name}: container stack at col ${c}, row ${r} must be ${CONTAINER.cols} wide and a multiple of ${CONTAINER.rows} tall`);
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen.add((r + j) * map.cols + c + i);
    for (let j = h - CONTAINER.rows; j >= 0; j -= CONTAINER.rows) out.push({ col: c, row: r + j });
  }
  return out;
}

export function isSolid(map: LevelMap, col: number, row: number): boolean {
  const c = map.cells[row]?.[col];
  return c !== undefined && c !== 'empty';
}

/** Horizontal runs of deck cells, left to right, top to bottom. */
export function decks(map: LevelMap): Deck[] {
  const out: Deck[] = [];
  map.cells.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] !== 'deck') continue;
      const start = col;
      while (line[col + 1] === 'deck') col++;
      out.push({ col: start, row, width: col - start + 1 });
    }
  });
  return out;
}

/**
 * World y (32-unit cells) of the first standable top in `col` at or below `fromRow`: ground and
 * containers, plus decks when `decks` is set. The map's bottom edge when there is none.
 */
export function surfaceY(map: LevelMap, col: number, opts: { fromRow?: number; decks?: boolean } = {}): number {
  for (let r = opts.fromRow ?? 0; r < map.rows; r++) {
    const k = map.cells[r]?.[col];
    if (k !== undefined && k !== 'empty' && (opts.decks || k !== 'deck')) return r * 32;
  }
  return map.rows * 32;
}
