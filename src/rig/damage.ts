import type { DamageStage } from '../balance/armor';

/** What a rig should show for a damage stage. Rates are per second. */
export interface DamageFx {
  smoke: number;
  sparks: number;
  fire: boolean;
  debris: number;
  /** Chance per frame the visor/lights drop out. */
  flicker: number;
  limp: boolean;
}

const FX: Record<DamageStage, DamageFx> = {
  healthy: { smoke: 0, sparks: 0, fire: false, debris: 0, flicker: 0, limp: false },
  light: { smoke: 3, sparks: 0, fire: false, debris: 0, flicker: 0, limp: false },
  sparks: { smoke: 5, sparks: 2.5, fire: false, debris: 0, flicker: 0.05, limp: false },
  critical: { smoke: 9, sparks: 5, fire: true, debris: 1.5, flicker: 0.1, limp: true },
};

export function damageFx(stage: DamageStage): DamageFx {
  return FX[stage];
}

/** Seconds for the limp to fully set in (and to recover after repair). */
export const LIMP_EASE_SECONDS = 0.4;
