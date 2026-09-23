import { describe, expect, it } from 'vitest';
import { HARROW, HarrowRig, type HarrowInput } from '../rig/bodies/harrow';

function input(over: Partial<HarrowInput> = {}): HarrowInput {
  return {
    dt: 1 / 60, dx: 0, vx: 0, vy: 0, grounded: true, facing: 1, aimDx: 120, aimDy: -40,
    moving: false, dashing: false, dashDir: 1, thrust: 0, sputter: false, mode: 'normal',
    modeRemaining: 0, modeTime: 0, hp: 100, time: 0, ...over,
  };
}

function run(rig: HarrowRig, seconds: number, over: Partial<HarrowInput> = {}) {
  const events: string[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    rig.update(input({ time: i / 60, ...over }));
    rig.events.forEach((e) => events.push(e.type));
  }
  return events;
}

describe('HarrowRig', () => {
  it('exposes every socket gameplay and FX rely on, all finite', () => {
    const rig = new HarrowRig();
    run(rig, 0.5);
    for (const name of ['muzzleMain', 'muzzleRapid', 'podTube', 'eject', 'vent', 'breach', 'chest', 'jetBack', 'calfNear', 'calfFar', 'toeNear', 'antennaTip']) {
      const s = rig.sockets[name];
      expect(s, name).toBeDefined();
      expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.a), name).toBe(true);
    }
    for (const p of rig.placements) expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.rot)).toBe(true);
  });

  it('stands on its feet: foot placements rest on the ground line', () => {
    const rig = new HarrowRig();
    run(rig, 1);
    const feet = rig.placements.filter((p) => p.part === 'foot');
    expect(feet).toHaveLength(2);
    for (const f of feet) expect(f.y).toBeCloseTo(-4, 0);
  });

  it('points the cannon muzzle at the cursor', () => {
    const rig = new HarrowRig();
    run(rig, 1.5, { aimDx: 200, aimDy: -200 });
    const m = rig.sockets.muzzleMain;
    const sh = rig.sockets.shoulderNear;
    const want = Math.atan2(-200 - sh.y, 200 - sh.x);
    expect(m.a).toBeCloseTo(want, 1);
    expect(m.y).toBeLessThan(sh.y);
  });

  it('mirrors aim when facing left', () => {
    const rig = new HarrowRig();
    run(rig, 1.5, { facing: -1, aimDx: -200, aimDy: -40 });
    expect(Math.abs(rig.aimMain.angle)).toBeLessThan(0.4);
  });

  it('eases into the critical limp at 10 armor or less and out after repair', () => {
    const rig = new HarrowRig();
    run(rig, 0.2, { hp: 10, moving: true, dx: 1.1, vx: 66 });
    expect(rig.limpW).toBeGreaterThan(0.3);
    expect(rig.limpW).toBeLessThan(1);
    run(rig, 1, { hp: 10, moving: true, dx: 1.1, vx: 66 });
    expect(rig.limpW).toBe(1);
    expect(rig.damage).toMatchObject({ fire: true, limp: true });
    run(rig, 1, { hp: 60 });
    expect(rig.limpW).toBe(0);
  });

  it('drags the bad foot while limping', () => {
    const rig = new HarrowRig();
    const events = run(rig, 3, { hp: 8, moving: true, dx: 1.1, vx: 66 });
    expect(events).toContain('toeDrag');
    expect(events).toContain('footfall');
  });

  it('cooks off four times when destroyed and ends dark', () => {
    const rig = new HarrowRig();
    const events = run(rig, 2, { mode: 'dead', hp: 0 });
    expect(events.filter((e) => e === 'boom')).toHaveLength(HARROW.cookOff.length);
    expect(rig.lightsOff).toBe(true);
    expect(rig.placements.every((p) => p.variant === 'e' || p.variant === 'fe' || p.part.startsWith('flash') || p.part === 'core')).toBe(true);
  });

  it('raises the antenna for a relay uplink and opens the plate for repair', () => {
    const rig = new HarrowRig();
    run(rig, 1, { mode: 'relay' });
    expect(rig.placements.some((p) => p.part === 'antenna')).toBe(true);
    const r2 = new HarrowRig();
    run(r2, 1, { mode: 'repair' });
    expect(r2.plateOpen).toBe(1);
    expect(r2.placements.some((p) => p.part === 'core')).toBe(true);
  });

  it('fires three jets when thrusting and one horizontal jet when dashing', () => {
    const rig = new HarrowRig();
    run(rig, 0.1, { grounded: false, thrust: 1, vy: -100 });
    expect(rig.jets).toHaveLength(3);
    run(rig, 0.1, { dashing: true, dashDir: -1 });
    expect(rig.jets).toHaveLength(1);
    expect(rig.jets[0].dx).toBe(1);
  });

  it('recoils the cannon barrel and settles', () => {
    const rig = new HarrowRig();
    run(rig, 0.5);
    rig.fireCannon();
    run(rig, 0.05);
    expect(rig.recoilS.x).toBeLessThan(-1);
    run(rig, 1);
    expect(Math.abs(rig.recoilS.x)).toBeLessThan(0.1);
  });
});
