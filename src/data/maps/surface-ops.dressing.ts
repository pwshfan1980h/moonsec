import type { Dressing } from '../../world/dressing';

/**
 * Surface Ops set dressing (containers and gantry supports come from the grid). Columns match
 * the zones in surface-ops.txt; props stand on whatever surface is under their column.
 */
export const SURFACE_OPS_DRESSING: readonly Dressing[] = [
  // landing pad
  { prop: 'lamp', col: 2 }, { prop: 'lamp', col: 15 },
  { prop: 'crate', col: 13 }, { prop: 'crate', col: 13, dx: 30 },
  { prop: 'antenna', col: 5, far: true },
  // crater: loose rock on the rims and floor
  { prop: 'boulderM', col: 20 }, { prop: 'boulderS', col: 23 }, { prop: 'landerWreck', col: 29 },
  { prop: 'boulderS', col: 31 }, { prop: 'boulderM', col: 38, flip: true },
  // training ground
  { prop: 'silo', col: 42, far: true }, { prop: 'silo', col: 44, dx: 8, far: true },
  { prop: 'solar', col: 45 }, { prop: 'crawler', col: 52 }, { prop: 'solar', col: 57 },
  // survey plateau (relay 1 at 65)
  { prop: 'lamp', col: 62 }, { prop: 'antenna', col: 70 }, { prop: 'boulderS', col: 60 },
  // container yard
  { prop: 'lamp', col: 74 }, { prop: 'crate', col: 80 }, { prop: 'crate', col: 87 }, { prop: 'lamp', col: 93 },
  // habitat dome behind the gantry route (relay 2 at 109)
  { prop: 'dome', col: 101, far: true },
  { prop: 'silo', col: 112, far: true },
  { prop: 'lamp', col: 98, onDeck: true }, { prop: 'lamp', col: 120, onDeck: true }, { prop: 'crate', col: 133, onDeck: true },
  // service trench
  { pipe: { from: 116, to: 133, row: 32 } },
  { prop: 'lamp', col: 116 }, { prop: 'lamp', col: 134 },
  // uplink ridge (relay 3 at 150): antenna farm
  { prop: 'solar', col: 140 }, { prop: 'antenna', col: 146 }, { prop: 'antenna', col: 154, flip: true },
  { prop: 'boulderM', col: 143 },
  // storage dome: interior backdrop, entrance bulkhead
  { domeInterior: { col: 178, row: 30 } },
  { prop: 'bulkhead', col: 157 }, { prop: 'lamp', col: 159 },
  { prop: 'crate', col: 196 }, { prop: 'crate', col: 197, dx: 8 },
];
