import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Sprite { constructor(..._a: unknown[]) {} }
  return { default: { Physics: { Arcade: { Sprite, Image: Sprite } }, Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) } } };
});

const { JackalPack } = await import('../entities/foes/flyers');
const { tickNext } = await import('../entities/foes/ground');
const { WardenCycle } = await import('../entities/foes/bosses');

describe('JackalPack', () => {
  it('circles, feints with two members, then strikes with exactly one from the pack', () => {
    const pack = new JackalPack(3);
    const seen = new Set<string>();
    let strikers = 0;
    for (let t = 0; t < 12; t += 0.1) {
      pack.update(0.1, 3);
      seen.add(pack.phase);
      const roles = [0, 1, 2].map((i) => pack.roleOf(i));
      if (pack.phase === 'feint') expect(roles.filter((r) => r === 'feint')).toHaveLength(2);
      if (pack.phase === 'strike') { expect(roles.filter((r) => r === 'strike')).toHaveLength(1); strikers++; }
    }
    expect([...seen].sort()).toEqual(['circle', 'feint', 'scatter', 'strike']);
    expect(strikers).toBeGreaterThan(0);
  });

  it('a lone survivor skips the feint and strikes', () => {
    const pack = new JackalPack(3);
    for (let t = 0; t < 4; t += 0.1) pack.update(0.1, 1);
    expect(['strike', 'scatter', 'circle']).toContain(pack.phase);
    const phases = new Set<string>();
    for (let t = 0; t < 10; t += 0.1) { pack.update(0.1, 1); phases.add(pack.phase); }
    expect(phases.has('feint')).toBe(false);
  });
});

describe('tickNext', () => {
  it('stays buried until it senses the player close by', () => {
    expect(tickNext('burrowed', 800, true, true, 0)).toBe('burrowed');
    expect(tickNext('burrowed', 200, false, true, 0)).toBe('burrowed');
    expect(tickNext('burrowed', 200, true, true, 0)).toBe('emerge');
  });

  it('hops until close, arms, and only blows after the fuse', () => {
    expect(tickNext('emerge', 200, true, true, 0)).toBe('hop');
    expect(tickNext('hop', 200, true, true, 0)).toBe('hop');
    expect(tickNext('hop', 80, true, false, 0)).toBe('hop'); // mid-air: can be shot, won't arm
    expect(tickNext('hop', 80, true, true, 0)).toBe('arm');
    expect(tickNext('arm', 80, true, true, 0.3)).toBe('arm');
    expect(tickNext('arm', 80, true, true, 0.6)).toBe('boom');
  });
});

describe('WardenCycle', () => {
  const run = (c: InstanceType<typeof WardenCycle>, seconds: number) => {
    const strikes: string[] = [];
    for (let t = 0; t < seconds; t += 0.05) { const s = c.update(0.05, 1); if (s) strikes.push(s); }
    return strikes;
  };

  it('alternates sweep and column while the dish stands', () => {
    const strikes = run(new WardenCycle(), 40);
    expect(strikes.slice(0, 4)).toEqual(['sweep', 'column', 'sweep', 'column']);
  });

  it('only sweeps once the dish is destroyed', () => {
    const c = new WardenCycle(false);
    expect(new Set(run(c, 40))).toEqual(new Set(['sweep']));
  });

  it('exposes the core longer as arms are lost', () => {
    const full = new WardenCycle(true, 2), armless = new WardenCycle(true, 0);
    const exposure = (c: InstanceType<typeof WardenCycle>) => {
      let t = 0;
      while (c.phase !== 'exposed') c.update(0.05, 1);
      while (c.phase === 'exposed') { c.update(0.05, 1); t += 0.05; }
      return t;
    };
    expect(exposure(armless)).toBeGreaterThan(exposure(full) + 1);
  });
});
