import { describe, it, expect } from 'vitest';

// Pure proximity + fuse logic extracted for testing
function shouldArm(mineX: number, mineY: number, targetX: number, targetY: number, radius: number): boolean {
  return Math.hypot(targetX - mineX, targetY - mineY) < radius;
}

function mineDetonationDamage(pilotActive: boolean): { killPilot: boolean; mechDamage: number } {
  if (pilotActive) return { killPilot: true, mechDamage: 0 };
  return { killPilot: false, mechDamage: 2 };
}

describe('Mine logic', () => {
  it('arms when player is within 120px', () => {
    expect(shouldArm(0, 0, 100, 0, 120)).toBe(true);
  });

  it('does not arm when player is outside 120px', () => {
    expect(shouldArm(0, 0, 130, 0, 120)).toBe(false);
  });

  it('kills pilot on detonation', () => {
    const r = mineDetonationDamage(true);
    expect(r.killPilot).toBe(true);
    expect(r.mechDamage).toBe(0);
  });

  it('deals 2 mech damage when not piloted', () => {
    const r = mineDetonationDamage(false);
    expect(r.killPilot).toBe(false);
    expect(r.mechDamage).toBe(2);
  });
});
