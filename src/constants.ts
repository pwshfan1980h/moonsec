export const WORLD_WIDTH = 6400;
export const WORLD_HEIGHT = 720;
export const GROUND_Y = 640;       // top surface of ground
export const GROUND_HEIGHT = 80;
export const MECH_SCALE = 0.75;
export const DRONE_SCALE_RED = 2.2;   // Viper 34x24 → ~75x53
export const DRONE_SCALE_GREEN = 2.2; // Hornet 30x25 → ~66x55

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

// Must stay in sync with the non-exported SEEK_RANGE const in src/weapons/HomingMissile.ts
export const MISSILE_SEEK_RANGE = 650;

// Pilot (on-foot) movement
export const PILOT_WALK_SPEED       = 90;    // px/s horizontal
export const PILOT_JUMP_VEL         = -280;  // px/s, applied once on jump keydown
export const PILOT_JETPACK_ACCEL    = -1200; // px/s² via setAccelerationY; net with gravity 600 = -600 upward
export const PILOT_JETPACK_MAX_FUEL = 3000;  // ms; ~3 seconds at 60fps
