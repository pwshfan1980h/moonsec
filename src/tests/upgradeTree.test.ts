import { describe, it, expect } from 'vitest';
import { TREE_NODES, applyTreeEffect } from '../data/upgradeTree';

function mockPlayer(overrides = {}) {
  return {
    maxHp: 5,
    jetpackMaxFuel: 2200,
    jetpackAccel: -920,
    naniteCooldownMs: 20000,
    naniteHealAmount: 1,
    hasNaniteBurst: false,
    hasAirDash: false,
    hasGravBoost: false,
    hasOverload: false,
    hasRegenField: false,
    missileSlots: 6,
    rapidMinInterval: 60,
    turretCooldownMs: 650,
    ...overrides,
  };
}

describe('TREE_NODES', () => {
  it('has 12 nodes', () => {
    expect(TREE_NODES).toHaveLength(12);
  });

  it('has 4 tiers per column', () => {
    const cols = ['offense', 'defense', 'mobility'] as const;
    for (const col of cols) {
      const nodes = TREE_NODES.filter(n => n.col === col);
      expect(nodes).toHaveLength(4);
      expect(nodes.map(n => n.tier).sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('all nodes have positive cost', () => {
    expect(TREE_NODES.every(n => n.cost > 0)).toBe(true);
  });
});

describe('applyTreeEffect', () => {
  it('rapidInterval reduces rapidMinInterval', () => {
    const p = mockPlayer();
    applyTreeEffect(p as any, { type: 'rapidInterval', delta: 15 });
    expect(p.rapidMinInterval).toBe(45);
  });

  it('maxHp increases maxHp', () => {
    const p = mockPlayer();
    applyTreeEffect(p as any, { type: 'maxHp', delta: 1 });
    expect(p.maxHp).toBe(6);
  });

  it('jetpackFuel multiplies jetpackMaxFuel', () => {
    const p = mockPlayer();
    applyTreeEffect(p as any, { type: 'jetpackFuel', mult: 1.3 });
    expect(p.jetpackMaxFuel).toBeCloseTo(2860);
  });

  it('airDash sets hasAirDash flag', () => {
    const p = mockPlayer();
    applyTreeEffect(p as any, { type: 'airDash' });
    expect(p.hasAirDash).toBe(true);
  });
});
