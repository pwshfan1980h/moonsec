import { ARMOR_BASE } from './balance/armor';
// ── Screen / viewport dimensions ────────────────────────────────────────────
export const GAME_W = 1920;
export const GAME_H = 1080;

export const WORLD_WIDTH = 6400;
export const WORLD_HEIGHT = 1080;
export const GROUND_Y = 960;       // top surface of ground
export const GROUND_HEIGHT = 120;

// Compact radar with a safe inset for the bezel and cardinal labels.
export const RADAR_WORLD_RADIUS = 460;   // world units visible around player (widened with bigger radar)
export const RADAR_SCREEN_RADIUS = 72;   // px radius of drawn circle
export const RADAR_X = 1812;             // screen-space center X — top-right, under the score/help/pause cluster
export const RADAR_Y = 270;              // screen-space center Y — kept off the ground band the mech walks in

export const MISSILE_SEEK_RANGE = 650;
export const PICKUP_LIFETIME_MS = 10000;

// Drone difficulty scaling — one bracket per wave tier
export const WAVE_BRACKETS: {
  minWave: number; attackSpeed: number; shootInterval: number;
  extraHp: number; bulletSpeedMult: number;
}[] = [
  { minWave: 0,  attackSpeed: 162, shootInterval: 2430, extraHp: 0, bulletSpeedMult: 0.72 },
  { minWave: 1,  attackSpeed: 216, shootInterval: 1890, extraHp: 0, bulletSpeedMult: 0.78 },
  { minWave: 2,  attackSpeed: 276, shootInterval: 1418, extraHp: 1, bulletSpeedMult: 0.87 },
  { minWave: 3,  attackSpeed: 348, shootInterval: 1080, extraHp: 2, bulletSpeedMult: 0.99 },
];

export const PATROL_LANES = [300, 420, 540, 660, 780, 900];


/** HARROW's movement and weapon baseline. */
export const PLAYER_STATS: Readonly<Record<'maxHp' | 'walkSpeed' | 'runSpeed' | 'jumpVelocity' | 'jetpackAccel' | 'jetpackMaxFuel' | 'rapidAmmoMax', number>> = {
  maxHp: ARMOR_BASE,
  walkSpeed: 132,
  runSpeed: 210,
  jumpVelocity: -510,
  jetpackAccel: -920,
  jetpackMaxFuel: 2200,
  rapidAmmoMax: 150,
};

export const RAPID_AMMO_PER_PICKUP = 25;
