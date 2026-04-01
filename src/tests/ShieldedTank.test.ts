import { describe, it, expect } from 'vitest';

// Pure logic extracted for testing — mirrors ShieldedTank internal state
function applyShieldDamage(shieldHp: number, amount: number): { shieldHp: number; shieldBroken: boolean } {
  const next = shieldHp - amount;
  return { shieldHp: Math.max(0, next), shieldBroken: next <= 0 };
}

function shieldedTankInRange(
  tankX: number, tankY: number,
  targetX: number, targetY: number,
  rangeH: number, rangeV: number,
): boolean {
  return Math.abs(targetX - tankX) < rangeH && Math.abs(targetY - tankY) < rangeV;
}

describe('ShieldedTank logic', () => {
  it('shield absorbs damage and tracks HP', () => {
    const r = applyShieldDamage(3, 1);
    expect(r.shieldHp).toBe(2);
    expect(r.shieldBroken).toBe(false);
  });

  it('shield breaks at zero HP', () => {
    const r = applyShieldDamage(1, 1);
    expect(r.shieldHp).toBe(0);
    expect(r.shieldBroken).toBe(true);
  });

  it('extra damage does not go negative', () => {
    const r = applyShieldDamage(1, 5);
    expect(r.shieldHp).toBe(0);
    expect(r.shieldBroken).toBe(true);
  });

  it('detects target in attack range', () => {
    expect(shieldedTankInRange(0, 0, 400, 200, 420, 300)).toBe(true);
  });

  it('target out of horizontal range', () => {
    expect(shieldedTankInRange(0, 0, 500, 0, 420, 300)).toBe(false);
  });
});
