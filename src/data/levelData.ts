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
  variation: {
    pitCount:       [number, number];
    pitWidth:       [number, number];
    extraPlatforms: [number, number];
    platformRows:   number[];
    platformWidth:  [number, number];
    wallCount:      [number, number];
    wallHeight:     number;
  };
};

// Mulberry32 — fast seedable RNG, no deps
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMap(tmpl: LevelTemplate, seed: number): number[][] {
  const rng = mulberry32(seed);
  const randi = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
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

  // Variation: pits (cut ground tiles; avoids first 12 cols — spawn area)
  if (tmpl.hasGround && tmpl.variation.pitCount[1] > 0) {
    const pitCount = randi(tmpl.variation.pitCount[0], tmpl.variation.pitCount[1]);
    const usedCols = new Set<number>();
    for (let p = 0; p < pitCount; p++) {
      const pitW = randi(tmpl.variation.pitWidth[0], tmpl.variation.pitWidth[1]);
      let startCol = 12;
      for (let attempt = 0; attempt < 30; attempt++) {
        const c = randi(14, tmpl.cols - pitW - 5);
        let clear = true;
        for (let i = c - 2; i < c + pitW + 2; i++) if (usedCols.has(i)) { clear = false; break; }
        if (clear) { startCol = c; break; }
      }
      for (let c = startCol; c < startCol + pitW && c < tmpl.cols; c++) {
        usedCols.add(c);
        for (let r = tmpl.groundRow; r < tmpl.rows; r++) map[r][c] = T.EMPTY;
      }
    }
  }

  // Variation: extra platforms
  const platCount = randi(tmpl.variation.extraPlatforms[0], tmpl.variation.extraPlatforms[1]);
  const pRows = tmpl.variation.platformRows;
  for (let p = 0; p < platCount; p++) {
    const row   = pRows[Math.floor(rng() * pRows.length)];
    const width = randi(tmpl.variation.platformWidth[0], tmpl.variation.platformWidth[1]);
    const col   = randi(5, tmpl.cols - width - 5);
    for (let w = 0; w < width && col + w < tmpl.cols; w++) map[row][col + w] = T.SURFACE;
  }

  // Variation: random walls (vertical fill columns, min 15-col spacing)
  const wallCount = randi(tmpl.variation.wallCount[0], tmpl.variation.wallCount[1]);
  let lastWallCol = -20;
  for (let w = 0; w < wallCount; w++) {
    let col = 15;
    for (let attempt = 0; attempt < 30; attempt++) {
      col = randi(15, tmpl.cols - 15);
      if (Math.abs(col - lastWallCol) >= 15) break;
    }
    lastWallCol = col;
    const rowEnd   = tmpl.hasGround ? tmpl.groundRow : tmpl.rows - 2;
    const rowStart = rowEnd - tmpl.variation.wallHeight;
    for (let h = 0; h < tmpl.variation.wallHeight; h++) {
      const r = rowStart + h;
      if (r >= 0 && r < tmpl.rows) map[r][col] = T.FILL_B;
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
    { col: 40,  row: 22, width: 8 },
    { col: 80,  row: 18, width: 8 },
    { col: 130, row: 24, width: 6 },
    { col: 160, row: 19, width: 7 },
  ],
  fixedWalls: [],
  variation: {
    pitCount:       [2, 4], pitWidth:       [4, 8],
    extraPlatforms: [2, 5], platformRows:   [20, 23, 26],
    platformWidth:  [4, 8], wallCount:      [1, 3], wallHeight: 5,
  },
};

export const TMPL_TRADE_LANES: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: false, groundRow: 30, fillBelow: false,
  hasCeiling: true, ceilingRow: 3,
  fixedArenaWalls: false,
  tileK: TILE,
  fixedPlatforms: [
    { col:   5, row: 22, width: 15 },
    { col:  45, row: 22, width: 15 },
    { col:  85, row: 22, width: 15 },
    { col: 125, row: 22, width: 15 },
    { col: 165, row: 22, width: 12 },
  ],
  fixedWalls: [
    { col:  30, rowStart: 10, height: 14 },
    { col:  70, rowStart: 10, height: 14 },
    { col: 110, rowStart: 10, height: 14 },
    { col: 150, rowStart: 10, height: 14 },
  ],
  variation: {
    pitCount:       [0, 0], pitWidth:       [0, 0],
    extraPlatforms: [3, 6], platformRows:   [17, 20, 25],
    platformWidth:  [3, 6], wallCount:      [2, 4], wallHeight: 12,
  },
};

export const TMPL_DEEP_FACILITY: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: true, groundRow: 26, fillBelow: true,
  hasCeiling: true, ceilingRow: 8,
  fixedArenaWalls: false,
  tileK: TILE_VIOLET,
  fixedPlatforms: [
    { col: 30, row: 17, width: 6 },
    { col: 80, row: 15, width: 5 },
  ],
  fixedWalls: [
    { col:  55, rowStart:  9, height: 12 },
    { col: 110, rowStart:  9, height: 12 },
  ],
  variation: {
    pitCount:       [3, 6], pitWidth:       [6, 10],
    extraPlatforms: [1, 3], platformRows:   [14, 17, 21],
    platformWidth:  [4, 7], wallCount:      [2, 4], wallHeight: 8,
  },
};

export const TMPL_ORBITAL: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: false, groundRow: 30, fillBelow: false,
  hasCeiling: false, ceilingRow: 0,
  fixedArenaWalls: false,
  tileK: TILE,
  fixedPlatforms: [
    { col:  25, row: 12, width: 8 }, { col:  32, row: 15, width: 5 },
    { col:  70, row: 20, width: 8 }, { col:  75, row: 23, width: 5 },
    { col: 110, row: 10, width: 8 }, { col: 116, row: 14, width: 5 },
    { col: 152, row: 18, width: 8 }, { col: 158, row: 22, width: 5 },
  ],
  fixedWalls: [],
  variation: {
    pitCount:       [0, 0], pitWidth:       [0, 0],
    extraPlatforms: [4, 8], platformRows:   [8, 12, 16, 20, 24],
    platformWidth:  [4, 8], wallCount:      [0, 0], wallHeight: 0,
  },
};

export const TMPL_NEXUS_CORE: LevelTemplate = {
  cols: 200, rows: 34,
  hasGround: true, groundRow: 30, fillBelow: true,
  hasCeiling: true, ceilingRow: 4,
  fixedArenaWalls: true,
  tileK: TILE,
  fixedPlatforms: [
    { col:  15, row: 19, width: 15 },
    { col:  70, row: 15, width: 10 },
    { col:  85, row: 19, width: 10 },
    { col: 140, row: 19, width: 15 },
  ],
  fixedWalls: [
    { col:  50, rowStart: 5, height: 15 },
    { col: 100, rowStart: 5, height: 15 },
    { col: 150, rowStart: 5, height: 15 },
  ],
  variation: {
    pitCount:       [1, 2], pitWidth:       [4, 6],
    extraPlatforms: [2, 4], platformRows:   [14, 18, 22],
    platformWidth:  [4, 7], wallCount:      [1, 2], wallHeight: 6,
  },
};
