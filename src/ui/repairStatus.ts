export type RepairPhase = 'ready' | 'active' | 'cooldown';

/** Repair is actionable at any amount of damage, not only at critical health. */
export function repairStatus(hp: number, maxHp: number, phase: RepairPhase, progress: number, cooldownMs: number) {
  const ratio = Math.max(0, Math.min(1, progress));
  if (phase === 'active') return { usable: false, label: 'REPAIRING', fill: ratio };
  if (phase === 'cooldown') {
    const seconds = Math.ceil((1 - ratio) * cooldownMs / 1000);
    return { usable: false, label: `RECHARGE · ${seconds}s`, fill: ratio };
  }
  const usable = hp > 0 && hp < maxHp;
  return { usable, label: usable ? 'READY · PRESS Q' : hp <= 0 ? 'OFFLINE' : 'ARMOR FULL', fill: 1 };
}
