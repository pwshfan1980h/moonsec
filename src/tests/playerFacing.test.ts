import { describe, expect, it } from 'vitest';
import { FACING_DEAD_ZONE, FACING_HOLD_MS, nextFacing, surgeDirection } from '../entities/playerFacing';

describe('nextFacing', () => {
  it('keeps facing inside the dead zone', () => {
    const s = nextFacing({ facing: 1, heldMs: 0 }, -FACING_DEAD_ZONE + 1, 500);
    expect(s.facing).toBe(1);
  });

  it('turns only after the cursor stays on the other side for the hold time', () => {
    let s = { facing: 1 as 1 | -1, heldMs: 0 };
    s = nextFacing(s, -200, FACING_HOLD_MS / 2);
    expect(s.facing).toBe(1);
    s = nextFacing(s, -200, FACING_HOLD_MS / 2);
    expect(s.facing).toBe(-1);
  });

  it('resets the hold when the cursor comes back', () => {
    let s = { facing: 1 as 1 | -1, heldMs: 0 };
    s = nextFacing(s, -200, FACING_HOLD_MS - 10);
    s = nextFacing(s, 200, 16);
    expect(s).toEqual({ facing: 1, heldMs: 0 });
  });
});

describe('surgeDirection', () => {
  it('follows the held direction, else the facing', () => {
    expect(surgeDirection(true, false, 1)).toBe(-1);
    expect(surgeDirection(false, true, -1)).toBe(1);
    expect(surgeDirection(false, false, -1)).toBe(-1);
    expect(surgeDirection(true, true, 1)).toBe(1);
  });
});
