import { describe, expect, it } from 'vitest';
import { ARMOR_BASE, ARMOR_SCALE, DAMAGE, HEAL, damageStage, displayArmor } from '../balance/armor';

describe('armor scale', () => {
  it('keeps hits-to-destroy identical to the 5-point model', () => {
    expect(ARMOR_BASE).toBe(100);
    expect(Math.ceil(ARMOR_BASE / DAMAGE.droneBullet)).toBe(5);
    expect(Math.ceil(ARMOR_BASE / DAMAGE.ppcRound)).toBe(2);
    // single hits are whole legacy points; burst/strafe rounds are fractions of one
    for (const [k, v] of Object.entries(DAMAGE)) if (!k.endsWith('Round')) expect(v % ARMOR_SCALE).toBe(0);
    for (const v of Object.values(HEAL)) expect(v % ARMOR_SCALE).toBe(0);
    expect(DAMAGE.burstRound * 2).toBeLessThanOrEqual(DAMAGE.droneBullet);
  });

  it('grades damage stages at 50 / 25 / 10 inclusive', () => {
    expect(damageStage(100)).toBe('healthy');
    expect(damageStage(51)).toBe('healthy');
    expect(damageStage(50)).toBe('light');
    expect(damageStage(26)).toBe('light');
    expect(damageStage(25)).toBe('sparks');
    expect(damageStage(11)).toBe('sparks');
    expect(damageStage(10)).toBe('critical');
    expect(damageStage(0.4)).toBe('critical');
  });

  it('shows whole armor points and never 0 while alive', () => {
    expect(displayArmor(100)).toBe(100);
    expect(displayArmor(37.2)).toBe(38);
    expect(displayArmor(0.2)).toBe(1);
    expect(displayArmor(0)).toBe(0);
  });
});
