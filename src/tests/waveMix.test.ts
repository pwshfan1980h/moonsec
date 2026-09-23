import { describe, expect, it } from 'vitest';
import { allowed, composeWave, unitCount, waveBudget, isFlyer, type FoeType } from '../systems/waveMix';
import { mulberry32 } from '../rig/math';
import type { EnemyMix } from '../data/levelConfigs';

const VOID = { ground: false, floors: false, ceiling: false };
const HULL_PLATES = { ground: false, floors: true, ceiling: false };
const FACILITY = { ground: true, floors: true, ceiling: true };
const GROUND_ONLY: FoeType[] = ['manta', 'tick', 'longleg', 'bulwark', 'prowler', 'spotter', 'ram', 'stilt', 'scuttler', 'burrower'];

describe('composeWave', () => {
  it('never puts ground units in a void-only arena', () => {
    for (const mix of ['balanced', 'aerial', 'ground-heavy', 'elite', 'boss-rush'] as EnemyMix[]) {
      for (let w = 1; w <= 5; w++) {
        const groups = composeWave(w, mix, VOID, mulberry32(w * 7 + mix.length));
        for (const g of groups) expect(isFlyer(g.type), `${mix} w${w}: ${g.type}`).toBe(true);
        expect(groups.some((g) => GROUND_ONLY.includes(g.type))).toBe(false);
      }
    }
  });

  it('keeps bombers and burrowers off hull plates without continuous ground', () => {
    expect(allowed('manta', 3, HULL_PLATES)).toBe(false);
    expect(allowed('burrower', 3, HULL_PLATES)).toBe(false);
    expect(allowed('tick', 3, HULL_PLATES)).toBe(true);
    expect(allowed('scuttler', 3, HULL_PLATES)).toBe(false);
    expect(allowed('scuttler', 3, FACILITY)).toBe(true);
  });

  it('respects minimum waves', () => {
    expect(allowed('brood', 2, FACILITY)).toBe(false);
    expect(allowed('brood', 3, FACILITY)).toBe(true);
  });

  it('spends roughly the wave budget and grows with the wave', () => {
    const w1 = unitCount(composeWave(1, 'balanced', FACILITY, mulberry32(1)));
    const w5 = unitCount(composeWave(5, 'balanced', FACILITY, mulberry32(1)));
    expect(w1).toBeGreaterThan(3);
    expect(w5).toBeGreaterThan(w1);
    expect(waveBudget(5)).toBeGreaterThan(waveBudget(1));
  });

  it('spawns squads and packs as groups', () => {
    const groups = composeWave(3, 'aerial', VOID, mulberry32(42));
    for (const g of groups) if (g.type === 'wasp' || g.type === 'jackal') expect(g.count).toBe(3);
  });
});
