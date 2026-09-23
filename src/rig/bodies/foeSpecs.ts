import { RIG_PARTS } from '../parts';
import type { EnemyRigSpec } from './enemyRig';

/** Skeletons for every enemy, as data for EnemyRig. Parts live in rig/parts/foes*.ts. */
const parts = RIG_PARTS.foe;
const base = { rig: 'foe', parts } as const;

export const WASP: EnemyRigSpec = {
  ...base, core: 'wasp_body',
  pods: [
    { part: 'wasp_pod', mount: 'podTop', far: true, nozzle: 'nozzle' },
    { part: 'wasp_pod', mount: 'podBottom', nozzle: 'nozzle' },
  ],
  aimers: [{ name: 'gun', part: 'wasp_gun', mount: 'gun', arc: [-1.2, 1.4], muzzle: 'muzzle' }],
  tail: { part: 'wasp_tail', mount: 'tail', segments: 3, length: 4 },
  publish: ['eye'],
};

export const HORNET: EnemyRigSpec = {
  ...base, core: 'hornet_body',
  wings: [
    { part: 'hornet_wing', mount: 'wingFar', far: true, fold: -0.5 },
    { part: 'hornet_wing', mount: 'wing', fold: 0.5 },
  ],
  aimers: [{ name: 'gun', part: 'hornet_gun', mount: 'gun', arc: [-0.6, 0.9], muzzle: 'muzzle' }],
  publish: ['exhaust'],
};

export const HERON: EnemyRigSpec = {
  ...base, core: 'heron_body',
  pods: [
    { part: 'heron_pod', mount: 'podL', far: true, nozzle: 'nozzle' },
    { part: 'heron_pod', mount: 'podR', nozzle: 'nozzle' },
  ],
  aimers: [{ name: 'gun', part: 'heron_boom', mount: 'gun', arc: [-1.4, 1.3], muzzle: 'muzzle', omega: 4 }],
  publish: ['lens'],
};

export const JACKAL: EnemyRigSpec = {
  ...base, core: 'jackal_body',
  wings: [
    { part: 'jackal_fin', mount: 'finFar', far: true, fold: -0.4 },
    { part: 'jackal_fin', mount: 'fin', fold: 0.4 },
  ],
  publish: ['nose'],
};

export const MITE: EnemyRigSpec = {
  ...base, core: 'mite_body',
  wings: [{ part: 'mite_wing', mount: 'wing', fold: 0.8 }],
};

export const BROODMOTHER: EnemyRigSpec = {
  ...base, core: 'brood_hull',
  pods: [
    { part: 'brood_pod', mount: 'podFF', far: true, nozzle: 'nozzle' },
    { part: 'brood_pod', mount: 'podBF', far: true, nozzle: 'nozzle' },
    { part: 'brood_pod', mount: 'podFN', nozzle: 'nozzle' },
    { part: 'brood_pod', mount: 'podBN', nozzle: 'nozzle' },
  ],
  extras: [{ part: 'brood_door', mount: 'door', openRot: 1.2, id: 'door' }],
  publish: ['bay', 'eye'],
};

export const MANTA: EnemyRigSpec = {
  ...base, core: 'manta_body',
  wings: [
    { part: 'manta_wing', mount: 'wingFar', far: true, fold: -0.9 },
    { part: 'manta_wing', mount: 'wing', fold: 0.9 },
  ],
  publish: ['bay', 'eye'],
};

export const TICK: EnemyRigSpec = {
  ...base, core: 'tick_body', hipHeight: 5,
  gait: { cycle: 10, stance: 0.5, lift: 2, bob: 0.5, legs: [{ rest: 6, phase: 0 }, { rest: -5, phase: 0.5 }, { rest: 5, phase: 0.5 }, { rest: -4, phase: 0 }] },
  legs: [
    { hip: 'legFN', thigh: 'tick_leg_a', shin: 'tick_leg_b', l1: 4, l2: 5, bend: -1 },
    { hip: 'legBN', thigh: 'tick_leg_a', shin: 'tick_leg_b', l1: 4, l2: 5, bend: 1 },
    { hip: 'legFF', thigh: 'tick_leg_a', shin: 'tick_leg_b', l1: 4, l2: 5, bend: -1, far: true },
    { hip: 'legBF', thigh: 'tick_leg_a', shin: 'tick_leg_b', l1: 4, l2: 5, bend: 1, far: true },
  ],
  publish: ['light', 'nub'],
};

export const LONGLEG: EnemyRigSpec = {
  ...base, core: 'long_hull', hipHeight: 20,
  gait: {
    cycle: 34, stance: 0.55, lift: 5, bob: 1,
    legs: [
      { rest: -14, phase: 0 }, { rest: 2, phase: 0.5 }, { rest: 18, phase: 0 },
      { rest: -10, phase: 0.5 }, { rest: 4, phase: 0 }, { rest: 16, phase: 0.5 },
    ],
  },
  legs: [
    { hip: 'h0', thigh: 'long_thigh', shin: 'long_shin', l1: 13, l2: 17, bend: 1 },
    { hip: 'h1', thigh: 'long_thigh', shin: 'long_shin', l1: 13, l2: 17, bend: -1 },
    { hip: 'h2', thigh: 'long_thigh', shin: 'long_shin', l1: 13, l2: 17, bend: -1 },
    { hip: 'h3', thigh: 'long_thigh', shin: 'long_shin', l1: 13, l2: 17, bend: 1, far: true },
    { hip: 'h4', thigh: 'long_thigh', shin: 'long_shin', l1: 13, l2: 17, bend: -1, far: true },
    { hip: 'h5', thigh: 'long_thigh', shin: 'long_shin', l1: 13, l2: 17, bend: -1, far: true },
  ],
  aimers: [{ name: 'gun', part: 'long_gun', mount: 'gun', arc: [-1.4, 0.4], muzzle: 'muzzle', omega: 5 }],
  publish: ['coil'],
};

export const BULWARK: EnemyRigSpec = {
  ...base, core: 'bul_hull', hipHeight: 22,
  gait: { cycle: 30, stance: 0.55, lift: 4, bob: 2, legs: [{ rest: -3, phase: 0.5 }, { rest: 4, phase: 0 }] },
  legs: [
    { hip: 'hipF', thigh: 'bul_thigh', shin: 'bul_shin', foot: 'bul_foot', l1: 12, l2: 14, bend: 1, far: true },
    { hip: 'hipN', thigh: 'bul_thigh', shin: 'bul_shin', foot: 'bul_foot', l1: 12, l2: 14, bend: 1 },
  ],
  aimers: [{ name: 'gun', part: 'bul_mortar', mount: 'gun', arc: [-1.5, -0.2], muzzle: 'muzzle', behind: true }],
  extras: [{ part: 'bul_shield', mount: 'shield', openDy: 6, openRot: -0.15, id: 'shield' }],
  publish: ['eye'],
};

export const PROWLER: EnemyRigSpec = {
  ...base, core: 'prow_hull', hipHeight: 16,
  gait: { cycle: 22, stance: 0.5, lift: 4, bob: 1, legs: [{ rest: -2, phase: 0.5 }, { rest: 2, phase: 0 }] },
  legs: [
    { hip: 'hipF', thigh: 'prow_thigh', shin: 'prow_shin', foot: 'prow_foot', l1: 8, l2: 10, bend: 1, far: true },
    { hip: 'hipN', thigh: 'prow_thigh', shin: 'prow_shin', foot: 'prow_foot', l1: 8, l2: 10, bend: 1 },
  ],
  aimers: [{ name: 'gun', part: 'prow_gun', mount: 'gun', arc: [-1.2, 0.9], muzzle: 'muzzle' }],
  publish: ['eye'],
};

export const SPOTTER: EnemyRigSpec = {
  ...base, core: 'spot_body', hipHeight: 22,
  gait: { cycle: 20, stance: 0.66, lift: 3, bob: 1, legs: [{ rest: -8, phase: 0 }, { rest: 1, phase: 0.33 }, { rest: 9, phase: 0.66 }] },
  legs: [
    { hip: 'l0', thigh: 'spot_leg', shin: 'spot_leg2', l1: 12, l2: 14, bend: 1, far: true },
    { hip: 'l1', thigh: 'spot_leg', shin: 'spot_leg2', l1: 12, l2: 14, bend: -1 },
    { hip: 'l2', thigh: 'spot_leg', shin: 'spot_leg2', l1: 12, l2: 14, bend: -1 },
  ],
  aimers: [{ name: 'gun', part: 'spot_gun', mount: 'gun', arc: [-1.3, 1.0], muzzle: 'muzzle', omega: 4 }],
  publish: ['lens'],
};

export const RAM: EnemyRigSpec = {
  ...base, core: 'ram_hull', hipHeight: 15,
  gait: { cycle: 26, stance: 0.5, lift: 4, bob: 1.5, legs: [{ rest: 9, phase: 0 }, { rest: -7, phase: 0.5 }, { rest: 8, phase: 0.5 }, { rest: -6, phase: 0 }] },
  legs: [
    { hip: 'hFN', thigh: 'ram_thigh', shin: 'ram_shin', l1: 8, l2: 10, bend: -1 },
    { hip: 'hBN', thigh: 'ram_thigh', shin: 'ram_shin', l1: 8, l2: 10, bend: 1 },
    { hip: 'hFF', thigh: 'ram_thigh', shin: 'ram_shin', l1: 8, l2: 10, bend: -1, far: true },
    { hip: 'hBF', thigh: 'ram_thigh', shin: 'ram_shin', l1: 8, l2: 10, bend: 1, far: true },
  ],
  publish: ['head', 'back'],
};

export const STILT: EnemyRigSpec = {
  ...base, core: 'stilt_gondola', hipHeight: 58,
  gait: { cycle: 70, stance: 0.5, lift: 10, bob: 3, legs: [{ rest: -12, phase: 0.5 }, { rest: 12, phase: 0 }] },
  legs: [
    { hip: 'hipF', thigh: 'stilt_thigh', shin: 'stilt_shin', foot: 'stilt_foot', l1: 31, l2: 35, bend: 1, far: true },
    { hip: 'hipN', thigh: 'stilt_thigh', shin: 'stilt_shin', foot: 'stilt_foot', l1: 31, l2: 35, bend: 1 },
  ],
  aimers: [{ name: 'gun', part: 'stilt_gun', mount: 'gun', arc: [0.2, 2.9], muzzle: 'muzzle' }],
  publish: ['eye'],
};

export const BURROWER: EnemyRigSpec = {
  ...base, core: 'burr_body',
  extras: [{ part: 'burr_drill', mount: 'drill', openDy: -4 }],
  publish: ['ring'],
};

export const WARDEN: EnemyRigSpec = {
  ...base, core: 'ward_hull', hipHeight: 34,
  gait: { cycle: 50, stance: 0.6, lift: 6, bob: 3, legs: [{ rest: 30, phase: 0 }, { rest: -30, phase: 0.5 }, { rest: 24, phase: 0.5 }, { rest: -24, phase: 0 }] },
  legs: [
    { hip: 'h0', thigh: 'ward_thigh', shin: 'ward_shin', foot: 'ward_foot', l1: 19, l2: 21, bend: -1 },
    { hip: 'h1', thigh: 'ward_thigh', shin: 'ward_shin', foot: 'ward_foot', l1: 19, l2: 21, bend: 1 },
    { hip: 'h2', thigh: 'ward_thigh', shin: 'ward_shin', foot: 'ward_foot', l1: 19, l2: 21, bend: -1, far: true },
    { hip: 'h3', thigh: 'ward_thigh', shin: 'ward_shin', foot: 'ward_foot', l1: 19, l2: 21, bend: 1, far: true },
  ],
  aimers: [
    { name: 'armN', part: 'ward_arm', mount: 'armN', arc: [-0.9, 1.2], muzzle: 'muzzle' },
    { name: 'armF', part: 'ward_arm', mount: 'armF', arc: [-0.9, 1.2], muzzle: 'muzzle', far: true },
  ],
  extras: [
    { part: 'ward_dish', mount: 'dish', id: 'dish' },
    { part: 'ward_shutter', mount: 'core', openDy: 14, id: 'shutter' },
  ],
  publish: ['core', 'dish'],
};

export const NEXUS: EnemyRigSpec = {
  ...base, core: 'nexus_hull',
  pods: [
    { part: 'nexus_pod', mount: 'pFF', far: true, nozzle: 'nozzle' },
    { part: 'nexus_pod', mount: 'pBF', far: true, nozzle: 'nozzle' },
    { part: 'nexus_pod', mount: 'pFN', nozzle: 'nozzle' },
    { part: 'nexus_pod', mount: 'pBN', nozzle: 'nozzle' },
  ],
  aimers: [{ name: 'head', part: 'nexus_head', mount: 'head', arc: [-1.2, 1.4], muzzle: 'muzzle', omega: 8 }],
  publish: ['core'],
};
