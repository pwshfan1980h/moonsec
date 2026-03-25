export const WORLD_WIDTH = 6400;
export const WORLD_HEIGHT = 720;
export const GROUND_Y = 640;       // top surface of ground
export const GROUND_HEIGHT = 80;

// Platform height bands (world Y — lower Y = higher on screen)
export const PLATFORM_BANDS = [
  { yMin: 448, yMax: 512 }, // low   — one jump from ground
  { yMin: 320, yMax: 400 }, // mid   — requires jetpack assist
  { yMin: 208, yMax: 288 }, // high  — full jetpack required
] as const;

// Radar minimap
export const RADAR_WORLD_RADIUS = 320;  // world units visible around player
export const RADAR_SCREEN_RADIUS = 65;  // px radius of drawn circle (right edge = 1205+65=1270, 10px from 1280px canvas)
export const RADAR_X = 1205;            // screen-space center X
export const RADAR_Y = 592;             // screen-space center Y

export const MISSILE_SEEK_RANGE = 650;

// Drone difficulty scaling — one bracket per wave tier
export const WAVE_BRACKETS: {
  minWave: number; attackSpeed: number; shootInterval: number;
  extraHp: number; bulletSpeedMult: number;
}[] = [
  { minWave: 1,  attackSpeed: 160, shootInterval: 2200, extraHp: 0, bulletSpeedMult: 1.0 },
  { minWave: 4,  attackSpeed: 200, shootInterval: 1800, extraHp: 0, bulletSpeedMult: 1.0 },
  { minWave: 7,  attackSpeed: 240, shootInterval: 1500, extraHp: 1, bulletSpeedMult: 1.0 },
  { minWave: 10, attackSpeed: 280, shootInterval: 1200, extraHp: 1, bulletSpeedMult: 1.2 },
];

// Pilot (on-foot) movement
export const PILOT_WALK_SPEED       = 90;    // px/s horizontal
export const PILOT_JUMP_VEL         = -280;  // px/s, applied once on jump keydown
export const PILOT_JETPACK_ACCEL    = -1200; // px/s² via setAccelerationY; net with gravity 600 = -600 upward
export const PILOT_JETPACK_MAX_FUEL = 3000;  // ms; ~3 seconds at 60fps

export const MAX_WAVES_L1     = 10;
export const BOSS_WAVE_L1     = 10;
export const MAX_WAVES_L2     = 12;
export const BOSS_WAVE_L2     = 12;
export const L2_SPEED_MULT    = 1.2;
export const L2_INTERVAL_MULT = 0.85;
