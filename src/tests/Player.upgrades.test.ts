import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Physics: { Arcade: { Sprite: class {} } } } }));
import { Player } from '../entities/Player';

function playerFixture() {
  return {
    dead: false, turretDamage: 1, turretCooldownMs: 420, missileCooldownMs: 5000,
    rapidAmmo: 130, rapidAmmoMax: 150, naniteHealAmount: 1, naniteCooldownMs: 20000,
    heal: vi.fn(), scene: { events: { emit: vi.fn() } },
  };
}

describe('field specialization tradeoffs', () => {
  it('doubles precision damage while reducing its firing cadence', () => {
    const p = playerFixture();
    Player.prototype.applyUpgrade.call(p as never, 'capacitor');
    expect(p.turretDamage).toBe(2);
    expect(p.turretCooldownMs).toBe(650);
  });
  it('reduces missile cooldown while clamping ammunition to the smaller magazine', () => {
    const p = playerFixture();
    Player.prototype.applyUpgrade.call(p as never, 'missile-rack');
    expect(p.missileCooldownMs).toBe(3000);
    expect(p.rapidAmmoMax).toBe(100);
    expect(p.rapidAmmo).toBe(100);
    expect(p.scene.events.emit).toHaveBeenCalledWith('rapidAmmoChange', 100, 100);
  });
  it('increases repair amount but makes the recharge longer', () => {
    const p = playerFixture();
    Player.prototype.applyUpgrade.call(p as never, 'repair-core');
    expect(p.naniteHealAmount).toBe(2);
    expect(p.naniteCooldownMs).toBe(28000);
    expect(p.heal).toHaveBeenCalledWith(1);
  });
});
