// Industrial tileset — 6 cols × 4 rows, 32×32 tiles
// Index layout:
//   0  1  2  3  4  5   ← row 0 (primary surface tiles)
//   6  7  8  9 10 11   ← row 1
//  12 13 14 15 16 17   ← row 2
//  18 19 20 21 22 23   ← row 3
export const TILE = {
  EMPTY:         -1,
  SURFACE:        0,   // row-0 col-0 — top surface
  SURFACE_VAR:    1,   // row-0 col-1 — surface variant
  FILL_A:         7,   // row-1 col-1 — mid fill
  FILL_B:        13,   // row-2 col-1 — deep fill
} as const;

// World: 6400×1080, tile size: 32×32
const COLS = 200;        // 6400 / 32
const ROWS = 34;         // ceil(1080 / 32)
const GROUND_ROW = 30;   // Y=960 / 32

export function buildLevel1Map(): number[][] {
  const map = Array.from({ length: ROWS }, () =>
    Array<number>(COLS).fill(TILE.EMPTY),
  );

  for (let c = 0; c < COLS; c++) {
    map[GROUND_ROW][c]     = TILE.SURFACE;
    map[GROUND_ROW + 1][c] = TILE.FILL_A;
    map[GROUND_ROW + 2][c] = TILE.FILL_B;
    map[GROUND_ROW + 3][c] = TILE.FILL_B;
  }

  return map;
}

export function buildLevel2Map(): number[][] {
  const map = Array.from({ length: ROWS }, () =>
    Array<number>(COLS).fill(TILE.EMPTY),
  );

  for (let c = 0; c < COLS; c++) {
    map[GROUND_ROW][c]     = TILE.SURFACE_VAR;
    map[GROUND_ROW + 1][c] = TILE.FILL_A;
    map[GROUND_ROW + 2][c] = TILE.FILL_B;
    map[GROUND_ROW + 3][c] = TILE.FILL_B;
  }

  return map;
}

/**
 * Level 3 — Ice Caverns
 * Uneven terrain with 6 death pits. 200×34 grid (matches L1/L2 dimensions).
 * Floor baseline at row 28 (GROUND_ROW=30 minus 2 for elevated shelves).
 * Pit columns are entirely empty (-1), causing the player to fall to their death.
 */
export function buildLevel3Map(): number[][] {
  const COLS = 200;
  const ROWS = 34;

  const map = Array.from({ length: ROWS }, () =>
    Array<number>(COLS).fill(-1),
  );

  // Per-column solid height (number of rows filled from the bottom)
  const colHeight: number[] = new Array(COLS).fill(3);

  // Raised ice shelves — create uneven terrain
  const hills: [number, number, number][] = [
    [10,  25,  3],
    [40,  55,  5],
    [70,  80,  2],
    [90, 110,  4],
    [130, 145, 6],
    [160, 175, 3],
  ];
  for (const [s, e, extra] of hills) {
    for (let c = s; c <= e && c < COLS; c++) {
      colHeight[c] = 3 + extra;
    }
  }

  // Death pits — columns completely absent (stay -1)
  const pits: [number, number][] = [
    [28,  33],
    [60,  65],
    [83,  90],
    [115, 122],
    [148, 155],
    [178, 185],
  ];
  const pitSet = new Set<number>();
  for (const [s, e] of pits) {
    for (let c = s; c <= e; c++) pitSet.add(c);
  }

  // Fill tiles — row 0 = top, row 33 = bottom
  // solidFrom = ROWS - colHeight[c] means tiles from that row downward are solid (tile index 0)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (pitSet.has(col)) continue; // stays -1 (void)
      const solidFrom = ROWS - colHeight[col];
      if (row >= solidFrom) {
        map[row][col] = 0; // solid tile (same index as TILE.SURFACE in L1)
      }
    }
  }

  return map;
}
