// ── Screen / viewport dimensions ────────────────────────────────────────────
export const GAME_W = 1920;
export const GAME_H = 1080;

export const WORLD_WIDTH = 6400;
export const WORLD_HEIGHT = 1080;
export const GROUND_Y = 960;       // top surface of ground
export const GROUND_HEIGHT = 120;

// Platform height bands (world Y — lower Y = higher on screen)
export const PLATFORM_BANDS = [
  { yMin: 672, yMax: 768 }, // low   — one jump from ground
  { yMin: 480, yMax: 600 }, // mid   — requires jetpack assist
  { yMin: 312, yMax: 432 }, // high  — full jetpack required
] as const;

// Radar minimap
export const RADAR_WORLD_RADIUS = 320;  // world units visible around player
export const RADAR_SCREEN_RADIUS = 65;  // px radius of drawn circle (right edge = 1830+65=1895, 25px from 1920px canvas)
export const RADAR_X = 1830;            // screen-space center X
export const RADAR_Y = 880;             // screen-space center Y

export const MISSILE_SEEK_RANGE = 650;

// Drone difficulty scaling — one bracket per wave tier
export const WAVE_BRACKETS: {
  minWave: number; attackSpeed: number; shootInterval: number;
  extraHp: number; bulletSpeedMult: number;
}[] = [
  { minWave: 0,  attackSpeed: 270, shootInterval: 1800, extraHp: 0, bulletSpeedMult: 1.2  },
  { minWave: 1,  attackSpeed: 360, shootInterval: 1400, extraHp: 0, bulletSpeedMult: 1.3  },
  { minWave: 2,  attackSpeed: 460, shootInterval: 1050, extraHp: 1, bulletSpeedMult: 1.45 },
  { minWave: 3,  attackSpeed: 580, shootInterval: 800,  extraHp: 2, bulletSpeedMult: 1.65 },
];

// Pilot (on-foot) movement
export const PILOT_WALK_SPEED       = 90;    // px/s horizontal
export const PILOT_JUMP_VEL         = -280;  // px/s, applied once on jump keydown
export const PILOT_JETPACK_ACCEL    = -1200; // px/s² via setAccelerationY; net with gravity 600 = -600 upward
export const PILOT_JETPACK_MAX_FUEL = 3000;  // ms; ~3 seconds at 60fps

export const PATROL_LANES = [570, 630, 690, 750, 810];

export const BOSS_WAVE_L1     = 3;

export const MECH_STATS: Record<string, {
  maxHp: number;
  walkSpeed: number;
  runSpeed: number;
  jumpVelocity: number;
  jetpackAccel: number;
  jetpackMaxFuel: number;
}> = {
  mech: {   // STRIDER — speed archetype: fast, high fuel, low HP
    maxHp: 3,
    walkSpeed: 440,
    runSpeed: 700,
    jumpVelocity: -510,
    jetpackAccel: -1840,
    jetpackMaxFuel: 4400,
  },
  mech4: {  // SCOUT — balanced baseline
    maxHp: 5,
    walkSpeed: 220,
    runSpeed: 350,
    jumpVelocity: -510,
    jetpackAccel: -920,
    jetpackMaxFuel: 2200,
  },
};
