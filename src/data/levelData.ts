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
