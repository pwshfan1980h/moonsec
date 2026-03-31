import { describe, it, expect } from 'vitest';

// Pure function extracted from HomingMissile for testability
type TargetCandidate = { x: number; y: number; active: boolean; isBoss: boolean };

function selectMissileTarget(
  candidates: TargetCandidate[],
  fromX: number,
  fromY: number,
  seekRange: number,
): TargetCandidate | null {
  let nearest: TargetCandidate | null = null;
  let bestDist = seekRange;

  for (const c of candidates) {
    if (!c.active) continue;
    if (c.isBoss) return c; // boss always wins
    const dist = Math.hypot(c.x - fromX, c.y - fromY);
    if (dist < bestDist) { bestDist = dist; nearest = c; }
  }
  return nearest;
}

describe('selectMissileTarget', () => {
  it('returns null when no candidates', () => {
    expect(selectMissileTarget([], 0, 0, 800)).toBeNull();
  });

  it('returns nearest drone by distance', () => {
    const a: TargetCandidate = { x: 100, y: 0, active: true, isBoss: false };
    const b: TargetCandidate = { x: 500, y: 0, active: true, isBoss: false };
    expect(selectMissileTarget([a, b], 0, 0, 800)).toBe(a);
  });

  it('prefers boss over a closer escort', () => {
    const escort: TargetCandidate = { x: 50,  y: 0, active: true, isBoss: false };
    const boss:   TargetCandidate = { x: 400, y: 0, active: true, isBoss: true  };
    expect(selectMissileTarget([escort, boss], 0, 0, 800)).toBe(boss);
  });

  it('ignores inactive candidates', () => {
    const dead: TargetCandidate = { x: 10, y: 0, active: false, isBoss: false };
    expect(selectMissileTarget([dead], 0, 0, 800)).toBeNull();
  });
});
