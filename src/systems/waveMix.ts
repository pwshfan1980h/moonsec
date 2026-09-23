import type { EnemyMix } from '../data/levelConfigs';

export type FoeType =
  | 'wasp' | 'hornet' | 'heron' | 'jackal' | 'brood' | 'manta'
  | 'tick' | 'longleg' | 'bulwark' | 'prowler' | 'spotter' | 'ram'
  | 'stilt' | 'scuttler' | 'burrower';

/** What the level geometry allows. */
export interface LevelCaps {
  /** A continuous floor (bombing runs, burrowing). */
  ground: boolean;
  /** Walkable spans anywhere (walkers, ticks). */
  floors: boolean;
  /** A ceiling to crawl on. */
  ceiling: boolean;
}

export interface SpawnGroup { type: FoeType; count: number }

interface Rule { weight: number; minWave: number; needs?: (keyof LevelCaps)[]; group?: number; cost?: number }

/** Per-type needs and costs (a squad costs its size). */
const RULES: Record<FoeType, Omit<Rule, 'weight'>> = {
  wasp: { minWave: 1, group: 3, cost: 1 },
  hornet: { minWave: 1, cost: 2 },
  heron: { minWave: 1, cost: 2 },
  jackal: { minWave: 2, group: 3, cost: 1 },
  brood: { minWave: 3, cost: 5 },
  manta: { minWave: 1, needs: ['ground'], cost: 3 },
  tick: { minWave: 2, needs: ['floors'], group: 2, cost: 1 },
  longleg: { minWave: 3, needs: ['floors'], cost: 5 },
  bulwark: { minWave: 2, needs: ['floors'], cost: 4 },
  prowler: { minWave: 1, needs: ['floors'], cost: 2 },
  spotter: { minWave: 2, needs: ['floors'], cost: 2 },
  ram: { minWave: 2, needs: ['floors'], cost: 3 },
  stilt: { minWave: 3, needs: ['ground'], cost: 5 },
  scuttler: { minWave: 2, needs: ['floors', 'ceiling'], cost: 3 },
  burrower: { minWave: 2, needs: ['ground'], cost: 3 },
};

/** Relative weights per mission mix. */
const MIXES: Record<EnemyMix, Partial<Record<FoeType, number>>> = {
  balanced: { wasp: 4, hornet: 2, heron: 1, jackal: 1, prowler: 2, manta: 1, tick: 1, bulwark: 1 },
  aerial: { wasp: 4, hornet: 3, heron: 2, jackal: 2, brood: 1 },
  'ground-heavy': { wasp: 2, heron: 1, prowler: 3, spotter: 2, ram: 2, scuttler: 2, burrower: 1, tick: 2, longleg: 1, bulwark: 1, stilt: 1, manta: 1 },
  elite: { heron: 3, hornet: 3, jackal: 2, wasp: 2, brood: 1, tick: 1 },
  'boss-rush': { wasp: 2, hornet: 2, heron: 2, jackal: 2, brood: 1, manta: 1, tick: 1, longleg: 1, bulwark: 1, prowler: 2, spotter: 1, ram: 1, stilt: 1, scuttler: 1, burrower: 1 },
};

/** Threat budget for a wave (sum of unit costs). */
export function waveBudget(wave: number): number {
  return 12 + (wave - 1) * 5;
}

export function allowed(type: FoeType, wave: number, caps: LevelCaps): boolean {
  const r = RULES[type];
  return wave >= r.minWave && (r.needs ?? []).every((n) => caps[n]);
}

/**
 * Picks a wave's enemies by weighted draw until the threat budget is spent. Squads and
 * packs come as groups. Pure: pass a seeded rng for tests.
 */
export function composeWave(wave: number, mix: EnemyMix, caps: LevelCaps, rng: () => number = Math.random): SpawnGroup[] {
  const table = Object.entries(MIXES[mix]).filter(([t]) => allowed(t as FoeType, wave, caps)) as [FoeType, number][];
  const out: SpawnGroup[] = [];
  if (!table.length) return out;
  const total = table.reduce((a, [, w]) => a + w, 0);
  let budget = waveBudget(wave);
  let guard = 0;
  while (budget > 0 && guard++ < 100) {
    let r = rng() * total;
    let pick = table[0][0];
    for (const [t, w] of table) { r -= w; if (r <= 0) { pick = t; break; } }
    const rule = RULES[pick];
    const count = rule.group ?? 1;
    const cost = (rule.cost ?? 1) * count;
    if (cost > budget + 2) { if (budget <= 1) break; continue; }
    out.push({ type: pick, count });
    budget -= cost;
  }
  return out;
}

export function unitCount(groups: readonly SpawnGroup[]): number {
  return groups.reduce((a, g) => a + g.count, 0);
}

export function isFlyer(type: FoeType): boolean {
  return type === 'wasp' || type === 'hornet' || type === 'heron' || type === 'jackal' || type === 'brood' || type === 'manta';
}
