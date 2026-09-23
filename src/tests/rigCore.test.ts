import { describe, expect, it } from 'vitest';
import { AimTracker } from '../rig/aim';
import { Gait, LIMP, type GaitSpec } from '../rig/gait';
import { solveTwoBone } from '../rig/ik';
import { Spring, wrapAngle } from '../rig/math';

const BIPED: GaitSpec = { cycle: 36, stance: 0.5, lift: 6, bob: 2, legs: [{ rest: -3, phase: 0.5 }, { rest: 3, phase: 0 }] };

describe('solveTwoBone', () => {
  it('reaches a reachable target with bones of the right length', () => {
    const r = solveTwoBone(0, 0, 4, 26, 15, 17, 1);
    expect(r.reached).toBe(true);
    expect(Math.hypot(r.kneeX, r.kneeY)).toBeCloseTo(15, 6);
    expect(Math.hypot(r.endX - r.kneeX, r.endY - r.kneeY)).toBeCloseTo(17, 6);
    expect(r.endX).toBeCloseTo(4, 6);
    expect(r.endY).toBeCloseTo(26, 6);
  });

  it('bends backward for +1 and forward for -1', () => {
    expect(solveTwoBone(0, 0, 0, 26, 15, 17, 1).kneeX).toBeLessThan(0);
    expect(solveTwoBone(0, 0, 0, 26, 15, 17, -1).kneeX).toBeGreaterThan(0);
  });

  it('clamps unreachable targets to full extension along the target direction', () => {
    const r = solveTwoBone(0, 0, 0, 100, 15, 17, 1);
    expect(r.reached).toBe(false);
    expect(r.endY).toBeCloseTo(32, 3);
    expect(r.endX).toBeCloseTo(0, 6);
  });
});

describe('AimTracker', () => {
  it('converges on the target inside its arc', () => {
    const a = new AimTracker(-1.3, 1.1);
    for (let i = 0; i < 120; i++) a.update(0.4, 1 / 60);
    expect(a.angle).toBeCloseTo(0.4, 3);
    expect(a.onTarget(0.4)).toBe(true);
  });

  it('clamps to the firing arc and respects the turn-rate cap', () => {
    const a = new AimTracker(-1.3, 1.1);
    a.update(3, 1 / 60);
    expect(Math.abs(a.velocity)).toBeLessThanOrEqual(9 + 1e-9);
    for (let i = 0; i < 240; i++) a.update(3, 1 / 60);
    expect(a.angle).toBeCloseTo(1.1, 3);
  });

  it('instant feel snaps', () => {
    const a = new AimTracker(-1, 1, 'instant');
    expect(a.update(0.5, 1 / 60)).toBe(0.5);
  });

  it('wraps angles', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 9);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('Spring', () => {
  it('settles back to rest after an impulse', () => {
    const s = new Spring(260, 16);
    s.impulse(200);
    for (let i = 0; i < 240; i++) s.step(1 / 60);
    expect(Math.abs(s.x)).toBeLessThan(0.05);
  });
});

/** Walks a gait and tracks each planted foot's world x (body x + local x · facing). */
function walk(gait: Gait, speed: number, facing: 1 | -1, seconds: number, limp?: { leg: number; weight: number }) {
  const dt = 1 / 60;
  let bodyX = 0;
  const drift = gait.feet.map(() => 0);
  const plantedAt: (number | null)[] = gait.feet.map(() => null);
  const stanceFrames = gait.feet.map(() => 0);
  const footfalls: number[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const dx = speed * dt;
    bodyX += dx;
    gait.update(dt, dx, facing, true, limp);
    gait.events.forEach((e) => footfalls.push(e.leg));
    gait.feet.forEach((f, k) => {
      const worldX = bodyX + f.x * facing;
      if (gait.weight >= 1 && f.stance && f.lift === 0) {
        stanceFrames[k]++;
        if (plantedAt[k] === null) plantedAt[k] = worldX;
        else drift[k] = Math.max(drift[k], Math.abs(worldX - plantedAt[k]!));
      } else plantedAt[k] = null;
    });
  }
  return { drift, stanceFrames, footfalls };
}

describe('Gait', () => {
  it('keeps planted feet fixed in the world while walking', () => {
    const { drift } = walk(new Gait(BIPED), 66, 1, 3);
    for (const d of drift) expect(d).toBeLessThan(0.5);
  });

  it('keeps feet planted while backpedalling (moving against facing)', () => {
    const { drift } = walk(new Gait(BIPED), 66, -1, 3);
    for (const d of drift) expect(d).toBeLessThan(0.5);
  });

  it('alternates footfalls between the legs', () => {
    const { footfalls } = walk(new Gait(BIPED), 66, 1, 3);
    expect(footfalls.length).toBeGreaterThan(8);
    for (let i = 1; i < footfalls.length; i++) expect(footfalls[i]).not.toBe(footfalls[i - 1]);
  });

  it('limps: the bad leg spends less time planted, never slides, and drags', () => {
    const gait = new Gait(BIPED);
    const { drift, stanceFrames } = walk(gait, 66, 1, 4, { leg: 1, weight: 1 });
    expect(stanceFrames[1]).toBeLessThan(stanceFrames[0] * 0.7);
    for (const d of drift) expect(d).toBeLessThan(0.5);
    const p = gait.legParams(1, { leg: 1, weight: 1 });
    expect(p.stance).toBeCloseTo(LIMP.badStance, 9);
    expect(p.liftScale).toBeCloseTo(LIMP.badLift, 9);
  });

  it('dips the hip only while the bad leg carries the weight', () => {
    const gait = new Gait(BIPED);
    let maxDip = 0;
    for (let i = 0; i < 240; i++) {
      gait.update(1 / 60, 66 / 60, 1, true, { leg: 1, weight: 1 });
      const badPlanted = gait.feet[1].stance && gait.feet[1].lift === 0;
      if (!badPlanted) expect(gait.lurch).toBeCloseTo(0, 6);
      maxDip = Math.max(maxDip, gait.lurch);
    }
    expect(maxDip).toBeGreaterThan(LIMP.lurch * 0.9);
  });

  it('returns feet to rest when stopping', () => {
    const gait = new Gait(BIPED);
    walk(gait, 66, 1, 1);
    for (let i = 0; i < 60; i++) gait.update(1 / 60, 0, 1, false);
    gait.feet.forEach((f, i) => { expect(f.x).toBeCloseTo(BIPED.legs[i].rest, 3); expect(f.y).toBeCloseTo(0, 6); });
  });
});
