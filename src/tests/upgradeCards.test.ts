import { describe, it, expect } from 'vitest';
import { CARD_POOL } from '../data/upgradeCards';

describe('CARD_POOL', () => {
  it('has 10 cards', () => {
    expect(CARD_POOL).toHaveLength(10);
  });

  it('has at least 3 cards per category', () => {
    const cats = ['offense', 'defense', 'mobility'] as const;
    for (const cat of cats) {
      expect(CARD_POOL.filter(c => c.category === cat).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all cards have non-empty id, name, desc, statLine', () => {
    for (const card of CARD_POOL) {
      expect(card.id.length).toBeGreaterThan(0);
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.desc.length).toBeGreaterThan(0);
      expect(card.statLine.length).toBeGreaterThan(0);
    }
  });

  it('plating card increases maxHp and hp', () => {
    const card = CARD_POOL.find(c => c.id === 'plating')!;
    const player = { maxHp: 3, hp: 3 } as any;
    card.apply(player);
    expect(player.maxHp).toBe(4);
    expect(player.hp).toBe(4);
  });

  it('afterburn card increases jetpackMaxFuel by 40%', () => {
    const card = CARD_POOL.find(c => c.id === 'afterburn')!;
    const player = { jetpackMaxFuel: 2200 } as any;
    card.apply(player);
    expect(player.jetpackMaxFuel).toBeCloseTo(3080);
  });
});
