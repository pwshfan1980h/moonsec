import { describe, it, expect } from 'vitest';

// Pure resilience state machine logic — mirrors Drone.takeDamage() behaviour
type DroneState = 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DOWNED' | 'DEATH';

function applyDroneDamage(
  hp: number, amount: number, resilience: number, currentState: DroneState,
): { hp: number; resilience: number; nextState: DroneState } {
  if (currentState === 'DEATH' || currentState === 'HURT' || currentState === 'DOWNED') {
    return { hp, resilience, nextState: currentState };
  }
  const nextHp = hp - amount;
  if (nextHp > 0) return { hp: nextHp, resilience, nextState: 'HURT' };
  if (resilience > 0) return { hp: 0, resilience: resilience - 1, nextState: 'DOWNED' };
  return { hp: 0, resilience: 0, nextState: 'DEATH' };
}

function applyDownedDamage(
  hp: number, _maxHp: number, amount: number, resilience: number,
): { hp: number; resilience: number; nextState: DroneState } {
  const nextHp = hp - amount;
  if (nextHp <= 0) return { hp: 0, resilience, nextState: 'DEATH' };
  return { hp: nextHp, resilience, nextState: 'DOWNED' };
}

describe('Drone resilience', () => {
  it('transitions to DOWNED when HP hits 0 and resilience > 0', () => {
    const r = applyDroneDamage(1, 1, 2, 'HOVER');
    expect(r.nextState).toBe('DOWNED');
    expect(r.resilience).toBe(1);
  });

  it('transitions to DEATH when HP hits 0 and resilience is 0', () => {
    const r = applyDroneDamage(1, 1, 0, 'HOVER');
    expect(r.nextState).toBe('DEATH');
  });

  it('shooting downed enemy to 0 HP kills permanently', () => {
    const r = applyDownedDamage(1, 3, 1, 1);
    expect(r.nextState).toBe('DEATH');
  });

  it('downed enemy with HP remaining stays DOWNED', () => {
    const r = applyDownedDamage(3, 3, 1, 1);
    expect(r.nextState).toBe('DOWNED');
  });

  it('ignores damage while already DOWNED from normal takeDamage path', () => {
    const r = applyDroneDamage(2, 1, 1, 'DOWNED');
    expect(r.nextState).toBe('DOWNED');
    expect(r.hp).toBe(2);
  });
});
