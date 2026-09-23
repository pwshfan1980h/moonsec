/**
 * Player armor runs on a 100-point scale. Every value here is a legacy value × ARMOR_SCALE,
 * so the number of hits needed to destroy the mech is unchanged from the 5-point days;
 * the finer scale exists for graded damage states (smoke → sparks → critical limp).
 */
export const ARMOR_SCALE = 20;
export const ARMOR_BASE = 5 * ARMOR_SCALE;

/** Damage dealt to the player, in armor points. */
export const DAMAGE = {
  droneBullet: 1 * ARMOR_SCALE,
  sniperBullet: 1 * ARMOR_SCALE,
  bossProjectile: 1 * ARMOR_SCALE,
  swarmling: 1 * ARMOR_SCALE,
  charger: 1 * ARMOR_SCALE,
  wardenSweep: 1 * ARMOR_SCALE,
  bomber: 2 * ARMOR_SCALE,
  mine: 2 * ARMOR_SCALE,
  tankShell: 2 * ARMOR_SCALE,
  ppcRound: 3 * ARMOR_SCALE,
  nexusBlast: 3 * ARMOR_SCALE,
} as const;

/** Repairs, in armor points. */
export const HEAL = {
  pickup: 1 * ARMOR_SCALE,
  relay: 1 * ARMOR_SCALE,
  nanite: 1 * ARMOR_SCALE,
  naniteRepairCore: 2 * ARMOR_SCALE,
  repairCoreUpgrade: 1 * ARMOR_SCALE,
  armorUpgradeMax: 1 * ARMOR_SCALE,
} as const;

/** One HUD segment per legacy armor point. */
export const ARMOR_PER_SEGMENT = ARMOR_SCALE;

export type DamageStage = 'healthy' | 'light' | 'sparks' | 'critical';

/** Absolute thresholds (armor points, inclusive): ≤50 light smoke, ≤25 sparks, ≤10 critical limp + fire. */
export const DAMAGE_STAGES: readonly { at: number; stage: Exclude<DamageStage, 'healthy'> }[] = [
  { at: 10, stage: 'critical' },
  { at: 25, stage: 'sparks' },
  { at: 50, stage: 'light' },
];

export function damageStage(hp: number): DamageStage {
  if (hp <= 0) return 'critical';
  for (const s of DAMAGE_STAGES) if (hp <= s.at) return s.stage;
  return 'healthy';
}

/** Armor shown in the HUD: whole points, never shows 0 while the mech is alive. */
export function displayArmor(hp: number): number {
  return hp <= 0 ? 0 : Math.max(1, Math.ceil(hp - 1e-6));
}
