import type { PaletteName } from '../render/palette';

export interface FogLayer {
  color: PaletteName;
  /** Peak opacity of the densest wisps. */
  alpha: number;
  /** Horizontal parallax 0 (fixed to screen) .. 1 (fixed to world). */
  parallax: number;
  /** Drift in world units per second. */
  drift: number;
  /** Band centre as world units above the level floor (negative = below). */
  height: number;
  /** Band thickness in world units. */
  thickness: number;
  seed: number;
}

export interface ShaftRecipe {
  /** 'ceiling' hangs lamps under the ceiling row; 'sky' angles sunbeams from above the view. */
  from: 'ceiling' | 'sky';
  /** World units between shafts. */
  spacing: number;
  color: PaletteName;
  alpha: number;
  /** Lean in radians (0 = straight down). */
  lean: number;
  length: number;
}

export interface AtmosphereRecipe {
  dust: PaletteName;
  /** Ambient wind (world units/s) the dust drifts with. */
  wind: number;
  /** How much dust each footfall / landing raises (0..2). */
  kick: number;
  fog: FogLayer[];
  shafts?: ShaftRecipe;
  /** Background motes rising near the floor per second. */
  motes: number;
}

/** Per-mission atmosphere, indexed by level node. */
export const ATMOSPHERE: Record<number, AtmosphereRecipe> = {
  // Surface Ops: open regolith, low haze on the horizon, slanted sunbeams
  0: {
    dust: 'regolith2', wind: 10, kick: 1.2, motes: 6,
    fog: [
      { color: 'regolith0', alpha: 0.45, parallax: 0.25, drift: 6, height: 150, thickness: 260, seed: 11 },
      { color: 'regolith1', alpha: 0.3, parallax: 0.6, drift: 12, height: 40, thickness: 120, seed: 12 },
    ],
    shafts: { from: 'sky', spacing: 900, color: 'hull5', alpha: 0.12, lean: 0.35, length: 900 },
  },
  // Trade Lanes: freight exhaust streaks in cold blue, strong crosswind, no floor to kick
  1: {
    dust: 'cold2', wind: 40, kick: 0.6, motes: 3,
    fog: [
      { color: 'cold1', alpha: 0.4, parallax: 0.2, drift: 30, height: 320, thickness: 420, seed: 21 },
      { color: 'cold2', alpha: 0.18, parallax: 0.5, drift: 55, height: 120, thickness: 160, seed: 22 },
    ],
  },
  // Deep Facility: floor-hugging dust, ceiling lamps cutting shafts through it
  2: {
    dust: 'regolith1', wind: 4, kick: 1.6, motes: 10,
    fog: [
      { color: 'regolith0', alpha: 0.5, parallax: 0.5, drift: 4, height: 30, thickness: 110, seed: 31 },
      { color: 'hull2', alpha: 0.35, parallax: 0.3, drift: 2, height: 260, thickness: 300, seed: 32 },
    ],
    shafts: { from: 'ceiling', spacing: 640, color: 'amber1', alpha: 0.14, lean: 0.08, length: 520 },
  },
  // Orbital Station: vacuum — almost clean, faint glints
  3: {
    dust: 'hull4', wind: 0, kick: 0.3, motes: 1,
    fog: [
      { color: 'cold0', alpha: 0.25, parallax: 0.1, drift: 3, height: 300, thickness: 500, seed: 41 },
    ],
  },
  // Nexus Core: hostile spores in the air, red-lit shafts from the ceiling
  4: {
    dust: 'hull4', wind: -8, kick: 1.3, motes: 12,
    fog: [
      { color: 'hostile0', alpha: 0.35, parallax: 0.3, drift: -10, height: 200, thickness: 360, seed: 51 },
      { color: 'hull2', alpha: 0.4, parallax: 0.55, drift: -4, height: 30, thickness: 120, seed: 52 },
    ],
    shafts: { from: 'ceiling', spacing: 720, color: 'hostile1', alpha: 0.1, lean: -0.1, length: 560 },
  },
};

export function atmosphereFor(node: number): AtmosphereRecipe {
  return ATMOSPHERE[node] ?? ATMOSPHERE[0];
}
