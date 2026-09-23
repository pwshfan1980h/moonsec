import { describe, expect, it } from 'vitest';
import { AttackTokens, flankSlot } from '../ai/AttackTokens';
import { CoverMap } from '../ai/CoverMap';
import { GroundNav } from '../ai/GroundNav';
import { Perception } from '../ai/Perception';
import { leadTarget, predictLanding } from '../ai/Predict';
import { arrive, flock, orbit, seek } from '../ai/Steering';
import { UtilityBrain, type BrainAction } from '../ai/UtilityBrain';
import { TerrainProbe } from '../fx/terrain';

const E = -1, S = 1;
// 20 cols × 12 rows: floor on row 10, a 2-tile wall at col 8, a raised ledge cols 14-17 on row 6
function level(): TerrainProbe {
  const rows = Array.from({ length: 12 }, () => Array<number>(20).fill(E));
  for (let c = 0; c < 20; c++) rows[11][c] = S;
  rows[10][8] = S; rows[9][8] = S;
  for (let c = 14; c < 18; c++) rows[7][c] = S;
  return new TerrainProbe(rows, E);
}

describe('Perception', () => {
  it('sees within range and field of view with a clear line, and remembers after losing sight', () => {
    const p = new Perception({ range: 500, fov: Math.PI, memory: 2 });
    p.update(0.1, { x: 0, y: 0 }, 1, { x: 200, y: 0 }, () => true);
    expect(p.sees).toBe(true);
    p.update(0.1, { x: 0, y: 0 }, 1, { x: -200, y: 0 }, () => true); // behind, outside the 180° cone
    expect(p.sees).toBe(false);
    expect(p.lastKnown).toEqual({ x: 200, y: 0 });
    p.update(2.1, { x: 0, y: 0 }, 1, { x: -200, y: 0 }, () => true);
    expect(p.lastKnown).toBeNull();
    expect(p.aware).toBe(false);
  });

  it('does not see through walls but hears gunfire', () => {
    const p = new Perception({ range: 800, fov: Math.PI * 2, memory: 3, hearing: 400 });
    p.update(0.1, { x: 0, y: 0 }, 1, { x: 300, y: 0 }, () => false, [{ x: 300, y: 0, loudness: 1 }]);
    expect(p.sees).toBe(false);
    expect(p.heard).toBe(true);
    expect(p.lastKnown).toEqual({ x: 300, y: 0 });
  });
});

describe('UtilityBrain', () => {
  interface Ctx { want: 'a' | 'b'; log: string[] }
  const act = (name: 'a' | 'b', extra: Partial<BrainAction<Ctx>> = {}): BrainAction<Ctx> => ({
    name, score: (c) => (c.want === name ? 1 : 0.5), update: (c) => { c.log.push(name); return 'running'; }, ...extra,
  });

  it('picks the best action and commits before switching', () => {
    const ctx: Ctx = { want: 'a', log: [] };
    const brain = new UtilityBrain<Ctx>([act('a', { minCommit: 0.5 }), act('b')], 0.1);
    brain.tick(ctx, 0.05);
    expect(brain.current?.name).toBe('a');
    ctx.want = 'b';
    brain.tick(ctx, 0.2);
    expect(brain.current?.name).toBe('a'); // still committed
    brain.tick(ctx, 0.4);
    expect(brain.current?.name).toBe('b');
  });

  it('keeps the current action through small score changes (hysteresis)', () => {
    const ctx = { want: 'a' as const, log: [] as string[] };
    const brain = new UtilityBrain([
      { name: 'a', score: () => 0.5, update: () => 'running' as const },
      { name: 'b', score: () => 0.6, update: () => 'running' as const },
    ], 0.1, 0, 0.2);
    brain.tick(ctx, 0.05);
    expect(brain.current?.name).toBe('b');
  });

  it('respects cooldowns after an action finishes', () => {
    const ctx: Ctx = { want: 'a', log: [] };
    let calls = 0;
    const once: BrainAction<Ctx> = { name: 'a', score: () => 1, update: () => (++calls ? 'done' : 'running'), cooldown: 1 };
    const brain = new UtilityBrain<Ctx>([once, act('b')], 0.1);
    brain.tick(ctx, 0.05);
    expect(brain.current?.name).toBe('b');
    brain.tick(ctx, 1.2);
    brain.tick(ctx, 0.2);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe('Steering', () => {
  it('seeks, arrives and orbits', () => {
    expect(seek({ x: 0, y: 0 }, { x: 10, y: 0 }, 5)).toEqual({ x: 5, y: 0 });
    expect(arrive({ x: 0, y: 0 }, { x: 10, y: 0 }, 100, 100).x).toBeCloseTo(10, 6);
    const v = orbit({ x: 100, y: 0 }, { x: 0, y: 0 }, 100, 50, 1);
    expect(Math.abs(v.x)).toBeLessThan(1e-6); // tangential at radius
    expect(Math.abs(v.y)).toBeCloseTo(50, 6);
  });

  it('separates crowded flock members', () => {
    const a = { x: 0, y: 0, vx: 0, vy: 0 }, b = { x: 5, y: 0, vx: 0, vy: 0 };
    const f = flock(a, [a, b], { separation: 1, alignment: 0, cohesion: 0, radius: 40 });
    expect(f.x).toBeLessThan(0);
  });
});

describe('Predict', () => {
  it('leads a moving target so the shot meets it', () => {
    const aim = leadTarget({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 100 }, 300);
    const t = Math.hypot(aim.x, aim.y) / 300;
    expect(aim.y).toBeCloseTo(100 * t, 3);
  });

  it('predicts a landing on the ground below an arc', () => {
    const land = predictLanding({ x: 0, y: 0 }, { x: 100, y: -200 }, 600, () => 300);
    expect(land.y).toBe(300);
    expect(land.x).toBeGreaterThan(80);
  });
});

describe('CoverMap and GroundNav', () => {
  const t = level();
  it('finds cover tucked against a two-tile wall', () => {
    const cm = new CoverMap(t);
    const left = cm.cover.find((p) => Math.floor(p.x / 32) === 7 && p.protects === 1);
    expect(left).toBeDefined();
    const best = cm.bestCover({ x: 600, y: 330 }, { x: 100, y: 352 });
    expect(best?.protects).toBe(1);
    expect(best!.x).toBeLessThan(8 * 32);
  });

  it('finds perches on the raised ledge', () => {
    const cm = new CoverMap(t);
    expect(cm.perches.some((p) => p.y === 7 * 32)).toBe(true);
  });

  it('links the floor to the ledge and routes between them', () => {
    const nav = new GroundNav(t, { climb: 4, drop: 10, gap: 3 });
    const floor = nav.spanAt(16, 352)!;
    const ledge = nav.spanAt(15 * 32, 224)!;
    expect(floor).not.toBeNull();
    expect(ledge).not.toBeNull();
    const route = nav.route(floor.id, ledge.id);
    expect(route).not.toBeNull();
    expect(route![route!.length - 1].to).toBe(ledge.id);
    const back = nav.route(ledge.id, floor.id);
    expect(back).not.toBeNull();
    expect(back![0].kind).toBe('drop');
    expect(back![0].from.y).toBe(ledge.y);
  });
});

describe('AttackTokens', () => {
  it('caps attackers per kind, preempts weaker holders and expires stale ones', () => {
    const tokens = new AttackTokens({ melee: 1, ranged: 2, artillery: 1, bomb: 1 }, 3);
    const a = {}, b = {}, c = {}, d = {};
    expect(tokens.acquire(a, 'ranged', 0)).toBe(true);
    expect(tokens.acquire(b, 'ranged', 0)).toBe(true);
    expect(tokens.acquire(c, 'ranged', 0)).toBe(false);
    expect(tokens.acquire(d, 'ranged', 0, 5)).toBe(true);
    expect(tokens.count('ranged')).toBe(2);
    tokens.update(10);
    expect(tokens.count('ranged')).toBe(0);
  });

  it('keeps a released slot closed for the recovery time', () => {
    const tokens = new AttackTokens({ melee: 1, ranged: 1, artillery: 1, bomb: 1 }, 5, { ranged: 1 });
    const a = {}, b = {};
    expect(tokens.acquire(a, 'ranged', 0)).toBe(true);
    tokens.update(0.5);
    tokens.release(a);
    expect(tokens.acquire(b, 'ranged', 1.2)).toBe(false);
    expect(tokens.acquire(b, 'ranged', 1.6)).toBe(true);
  });

  it('puts flank slots behind the player, above the floor', () => {
    const p = { x: 1000, y: 800 };
    for (let i = 0; i < 3; i++) {
      const s = flankSlot(i, 3, p, 1, 300);
      expect(s.x).toBeLessThan(p.x);
      expect(s.y).toBeLessThan(p.y);
    }
  });
});
