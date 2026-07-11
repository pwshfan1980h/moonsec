// Industrial tileset — 6 cols × 4 rows, 32×32 tiles
// Index layout:
//   0  1  2  3  4  5   ← row 0 (primary surface tiles)
//   6  7  8  9 10 11   ← row 1
//  12 13 14 15 16 17   ← row 2
//  18 19 20 21 22 23   ← row 3
export const TILE = {
  EMPTY:       -1,
  SURFACE:      0,   // row-0 col-0 — top surface
  SURFACE_VAR:  1,   // row-0 col-1 — surface variant
  FILL_A:       7,   // row-1 col-1 — mid fill
  FILL_B:      13,   // row-2 col-1 — deep fill
} as const;

// Violet tileset — 3 cols × 3 rows, 32×32 tiles
// Index layout:
//   0  1  2   ← row 0
//   3  4  5   ← row 1
//   6  7  8   ← row 2
export const TILE_VIOLET = {
  EMPTY:       -1,
  SURFACE:      0,
  SURFACE_VAR:  1,
  FILL_A:       3,
  FILL_B:       6,
} as const;

type TileConstants = { EMPTY: number; SURFACE: number; SURFACE_VAR: number; FILL_A: number; FILL_B: number };

export type LevelTemplate = {
  cols:            number;   // tile columns (200 = 6400px)
  rows:            number;   // tile rows (34)
  hasGround:       boolean;
  groundRow:       number;   // default 30 (Y=960)
  fillBelow:       boolean;  // fill rows below groundRow
  hasCeiling:      boolean;
  ceilingRow:      number;
  fixedArenaWalls: boolean;  // solid col 0-1 and last 2 cols (Nexus Core)
  tileK:           TileConstants;
  fixedPlatforms:  { col: number; row: number; width: number }[];
  fixedWalls:      { col: number; rowStart: number; height: number }[];
  fixedGaps:       { col: number; width: number; depth: number }[];
};

export function buildMap(tmpl: LevelTemplate, _seed: number): number[][] {
  const T = tmpl.tileK;

  const map = Array.from({ length: tmpl.rows }, () =>
    Array<number>(tmpl.cols).fill(T.EMPTY),
  );

  // Ground + fill
  if (tmpl.hasGround) {
    for (let c = 0; c < tmpl.cols; c++) {
      map[tmpl.groundRow][c] = T.SURFACE;
      if (tmpl.fillBelow) {
        for (let r = tmpl.groundRow + 1; r < tmpl.rows; r++) {
          map[r][c] = r === tmpl.groundRow + 1 ? T.FILL_A : T.FILL_B;
        }
      }
    }
  }

  // Ceiling
  if (tmpl.hasCeiling) {
    for (let c = 0; c < tmpl.cols; c++) {
      map[tmpl.ceilingRow][c] = T.FILL_B;
      if (tmpl.ceilingRow + 1 < tmpl.rows) map[tmpl.ceilingRow + 1][c] = T.FILL_A;
    }
  }

  // Arena side walls (2 cols wide on each edge)
  if (tmpl.fixedArenaWalls) {
    for (let r = 0; r < tmpl.rows; r++) {
      map[r][0] = T.FILL_B; map[r][1] = T.FILL_B;
      map[r][tmpl.cols - 1] = T.FILL_B; map[r][tmpl.cols - 2] = T.FILL_B;
    }
  }

  // Authored gaps are applied before platforms so a lower trench floor can be
  // placed inside a gap. Traversal geometry intentionally does not vary by seed.
  for (const gap of tmpl.fixedGaps) {
    for (let c = gap.col; c < gap.col + gap.width && c < tmpl.cols; c++) {
      const floorRow = Math.min(tmpl.rows - 1, tmpl.groundRow + gap.depth);
      for (let r = tmpl.groundRow; r < floorRow; r++) map[r][c] = T.EMPTY;
      map[floorRow][c] = T.SURFACE;
    }
  }

  // Fixed platforms
  for (const fp of tmpl.fixedPlatforms) {
    for (let w = 0; w < fp.width; w++) {
      const c = fp.col + w;
      if (c >= 0 && c < tmpl.cols) map[fp.row][c] = T.SURFACE;
    }
  }

  // Fixed walls
  for (const fw of tmpl.fixedWalls) {
    for (let h = 0; h < fw.height; h++) {
      const r = fw.rowStart + h;
      if (r >= 0 && r < tmpl.rows && fw.col >= 0 && fw.col < tmpl.cols)
        map[r][fw.col] = T.FILL_B;
    }
  }

  return map;
}

// ── Level Templates ────────────────────────────────────────────────────────

export const TMPL_SURFACE_OPS: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: true, groundRow: 30, fillBelow: true,
  hasCeiling: false, ceilingRow: 0,
  fixedArenaWalls: false,
  tileK: TILE,
  fixedPlatforms: [
    { col: 36,  row: 23, width: 12 }, // survey overlook
    { col: 90,  row: 20, width: 16 }, // jetpack gate, left side
    { col: 110, row: 20, width: 14 }, // jetpack gate, right side
    { col: 158, row: 22, width: 16 }, // final defensive roof
  ],
  fixedWalls: [],
  fixedGaps: [{ col: 62, width: 4, depth: 2 }, { col: 144, width: 5, depth: 2 }],
};

export const TMPL_TRADE_LANES: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: false, groundRow: 30, fillBelow: false,
  hasCeiling: true, ceilingRow: 3,
  fixedArenaWalls: false,
  tileK: TILE,
  fixedPlatforms: [
    // Six large cargo decks form a readable main route.
    { col:   4, row: 22, width: 26 },
    { col:  35, row: 22, width: 28 },
    { col:  68, row: 22, width: 28 },
    { col: 101, row: 22, width: 29 },
    { col: 135, row: 22, width: 29 },
    { col: 169, row: 22, width: 27 },
    // Optional service route; each catwalk reconnects within one screen.
    { col:  30, row: 16, width: 14 },
    { col:  75, row: 14, width: 14 },
    { col: 120, row: 16, width: 14 },
    { col: 163, row: 14, width: 14 },
  ],
  fixedWalls: [
    { col:  66, rowStart: 10, height: 12 },
    { col: 134, rowStart: 10, height: 12 },
  ],
  fixedGaps: [],
};

export const TMPL_DEEP_FACILITY: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: true, groundRow: 26, fillBelow: true,
  hasCeiling: true, ceilingRow: 8,
  fixedArenaWalls: false,
  tileK: TILE_VIOLET,
  fixedPlatforms: [
    { col:  44, row: 18, width: 16 }, // west maintenance shelf
    { col: 112, row: 16, width: 18 }, // central elevator fallback
    { col: 148, row: 19, width: 14 }, // east maintenance shelf
    { col: 176, row: 21, width: 12 }, // final chamber overlook
  ],
  fixedWalls: [
    { col:  76, rowStart:  9, height: 11 },
    { col: 154, rowStart:  9, height: 11 },
  ],
  fixedGaps: [{ col: 58, width: 10, depth: 4 }, { col: 136, width: 10, depth: 4 }],
};

export const TMPL_ORBITAL: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: false, groundRow: 30, fillBelow: false,
  hasCeiling: false, ceilingRow: 0,
  fixedArenaWalls: false,
  tileK: TILE,
  fixedPlatforms: [
    // Eight broad hull plates carry the critical route.
    { col:   3, row: 23, width: 22 },
    { col:  29, row: 21, width: 20 },
    { col:  54, row: 24, width: 20 },
    { col:  79, row: 20, width: 21 },
    { col: 105, row: 23, width: 20 },
    { col: 130, row: 19, width: 21 },
    { col: 156, row: 22, width: 20 },
    { col: 181, row: 20, width: 16 },
    // Optional antenna/service decks.
    { col:  34, row: 13, width: 12 },
    { col:  84, row: 12, width: 12 },
    { col: 134, row: 11, width: 12 },
    { col: 172, row: 13, width: 12 },
  ],
  fixedWalls: [],
  fixedGaps: [],
};

export const TMPL_NEXUS_CORE: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: true, groundRow: 30, fillBelow: true,
  hasCeiling: true, ceilingRow: 4,
  fixedArenaWalls: true,
  tileK: TILE,
  fixedPlatforms: [
    { col:  28, row: 20, width: 18 },
    { col:  88, row: 18, width: 20 },
    { col: 151, row: 20, width: 18 },
  ],
  fixedWalls: [
    { col:  62, rowStart: 5, height: 13 },
    { col: 138, rowStart: 5, height: 13 },
  ],
  fixedGaps: [],
};
