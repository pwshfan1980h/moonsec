import { HARROW_PARTS } from './harrow';
import type { PartSet } from './types';

/**
 * Every rig's parts. The build tool (tools/rig/build.ts) rasterises all of them into
 * one atlas (public/assets/rig.png + rig.json) so every rig batches on one texture.
 */
export const RIG_PARTS: Record<string, PartSet> = {
  harrow: HARROW_PARTS,
};

export const RIG_ATLAS_KEY = 'rig';
