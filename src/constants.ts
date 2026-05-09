// ── Screen / viewport dimensions ────────────────────────────────────────────
export const GAME_W = 1920;
export const GAME_H = 1080;

export const WORLD_WIDTH = 6400;
export const WORLD_HEIGHT = 1080;
export const GROUND_Y = 960;       // top surface of ground
export const GROUND_HEIGHT = 120;

// Radar minimap — upgraded to a readable tactical scope
export const RADAR_WORLD_RADIUS = 460;   // world units visible around player (widened with bigger radar)
export const RADAR_SCREEN_RADIUS = 115;  // px radius of drawn circle
export const RADAR_X = 1770;             // screen-space center X — leaves room for the +28 cardinal "E" glyph at x=1913
export const RADAR_Y = 830;              // screen-space center Y

export const MISSILE_SEEK_RANGE = 650;
export const PICKUP_LIFETIME_MS = 10000;

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

export const PATROL_LANES = [300, 420, 540, 660, 780, 900];


export const MECH_STATS: Record<string, {
  maxHp: number;
  walkSpeed: number;
  runSpeed: number;
  jumpVelocity: number;
  jetpackAccel: number;
  jetpackMaxFuel: number;
  rapidAmmoMax: number;
}> = {
  mech: {   // STRIDER — speed archetype: fast, high fuel, low HP
    maxHp: 3,
    walkSpeed: 440,
    runSpeed: 700,
    jumpVelocity: -510,
    jetpackAccel: -1840,
    jetpackMaxFuel: 4400,
    rapidAmmoMax: 220,
  },
  mech4: {  // SCOUT — balanced baseline
    maxHp: 5,
    walkSpeed: 220,
    runSpeed: 350,
    jumpVelocity: -510,
    jetpackAccel: -920,
    jetpackMaxFuel: 2200,
    rapidAmmoMax: 150,
  },
};

export const RAPID_AMMO_PER_PICKUP = 25;
