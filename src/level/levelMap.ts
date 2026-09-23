/**
 * Text level maps: the collision grid is the source of truth and art is derived from it.
 *
 * One character per 32-unit cell, one line per row:
 *   .  empty
 *   #  solid mass — regolith, rock, hull, walls, ceilings
 *   =  deck — a built platform surface (solid for now; drawn as a thin structure)
 *   S  player spawn — an empty cell the mech's feet stand in; the cell below must be solid
 * Lines starting with `;` are comments. Blank lines are ignored. Every row must be the same width.
 *
 * Pure (no Phaser) so maps can be validated in tests.
 */
export type Cell = 'empty' | 'solid' | 'deck';

export interface Deck { col: number; row: number; width: number }

export interface LevelMap {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly (readonly Cell[])[];
  readonly spawn: { col: number; row: number };
}

const LEGEND: Record<string, Cell> = { '.': 'empty', '#': 'solid', '=': 'deck', S: 'empty' };

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
  return { cols, rows: cells.length, cells, spawn };
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
