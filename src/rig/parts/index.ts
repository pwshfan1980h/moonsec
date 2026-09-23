import { HARROW_PARTS } from './harrow';
import { FOE_PARTS } from './foes';
import { FOE_GROUND_PARTS } from './foesGround';
import { FOE_BOSS_PARTS } from './foesBoss';
import type { PartSet } from './types';

/**
 * Every rig's parts. The build tool (tools/rig/build.ts) rasterises all of them into
 * one atlas (public/assets/rig.png + rig.json) so every rig batches on one texture.
 */
export const RIG_PARTS: Record<string, PartSet> = {
  harrow: HARROW_PARTS,
  foe: { ...FOE_PARTS, ...FOE_GROUND_PARTS, ...FOE_BOSS_PARTS },
};

export const RIG_ATLAS_KEY = 'rig';
