import { describe, expect, it } from 'vitest';
import {
  buildMap,
  TMPL_DEEP_FACILITY,
  TMPL_ORBITAL,
  TMPL_TRADE_LANES,
} from '../data/levelData';

function solidRunsAtOrAbove(map: number[][], maxRow: number): number {
  let runs = 0;
  for (let r = 0; r <= maxRow; r++) {
    let inRun = false;
    for (const tile of map[r]) {
      if (tile !== -1 && !inRun) {
        runs++;
        inRun = true;
      } else if (tile === -1) {
        inRun = false;
      }
    }
  }
  return runs;
}

describe('level verticality templates', () => {
  it('trade lanes includes upper traversal pockets above the main deck', () => {
    const map = buildMap(TMPL_TRADE_LANES, 1234);

    expect(solidRunsAtOrAbove(map, 13)).toBeGreaterThanOrEqual(8);
  });

  it('orbital station has high routes near the top third of the map', () => {
    const map = buildMap(TMPL_ORBITAL, 1234);

    expect(solidRunsAtOrAbove(map, 8)).toBeGreaterThanOrEqual(4);
  });

  it('deep facility has mid and high platform routes for shaft traversal', () => {
    const map = buildMap(TMPL_DEEP_FACILITY, 1234);

    expect(solidRunsAtOrAbove(map, 14)).toBeGreaterThanOrEqual(5);
  });
});
