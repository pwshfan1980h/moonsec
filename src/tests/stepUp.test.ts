import { describe, expect, it } from 'vitest';
import { stepUpHeight } from '../level/stepUp';

/** Rows of '.'/'#' (32-unit cells) over a solid bottom row. */
function grid(rows: string[]) {
  const all = [...rows, '#'.repeat(rows[0].length)];
  return { solidCell: (c: number, r: number) => all[r]?.[c] === '#' };
}

// HARROW's hitbox: 40 x 92, feet at y.
const body = (x: number, y: number) => ({ x, y, halfW: 20, h: 92 });

describe('stepUpHeight', () => {
  const terrace = grid([
    '..........',
    '..........',
    '..........',
    '.....#####',
    '...#######',
  ]);
  // floor top at row 5 → y 160; one-tile ledge at col 3 (top y 128); two-tile wall at col 5

  it('lifts onto a one-tile ledge ahead', () => {
    expect(stepUpHeight(terrace, body(3 * 32 - 22, 160), 1)).toBe(32);
  });

  it('does not climb walls taller than a tile', () => {
    expect(stepUpHeight(terrace, body(5 * 32 - 22, 128), 1)).toBe(32);
    expect(stepUpHeight(terrace, body(5 * 32 - 22, 160), 1)).toBe(0);
  });

  it('ignores open ground and the direction away from the ledge', () => {
    expect(stepUpHeight(terrace, body(40, 160), 1)).toBe(0);
    expect(stepUpHeight(terrace, body(3 * 32 - 22, 160), -1)).toBe(0);
  });

  it('refuses when there is no headroom above the ledge', () => {
    const lowCeiling = grid([
      '..........',
      '...####...',
      '..........',
      '..........',
      '...#######',
    ]);
    expect(stepUpHeight(lowCeiling, body(3 * 32 - 22, 160), 1)).toBe(0);
  });
});
