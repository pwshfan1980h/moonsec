import type { LevelTemplate } from './levelData';
import {
  TMPL_SURFACE_OPS, TMPL_TRADE_LANES, TMPL_DEEP_FACILITY,
  TMPL_ORBITAL, TMPL_NEXUS_CORE,
} from './levelData';
import type { BossType } from '../entities/NexusBoss';

export type MusicTheme  = 'surface' | 'trade-lanes' | 'deep-facility' | 'orbital' | 'nexus-core';
export type EnemyMix    = 'balanced' | 'aerial' | 'ground-heavy' | 'elite' | 'boss-rush';

export type MovingPlatformSpec = {
  x: number;
  y: number;
  width: number;
  axis: 'x' | 'y';
  travel: number;
  speed: number;
  startForward?: boolean;
};

export type LevelConfig = {
  nodeIndex:       number;
  label:           string;
  tilesetKey:      string;   // texture key loaded in BootScene
  bgSkyColor:      number;   // hex — sky rect fill color
  bgTerrainTint:   number;   // hex — tint applied to terrain parallax layer
  template:        LevelTemplate;
  waveCount:       number;   // normal waves before boss phase
  bossType:        BossType; // per-node boss reskin
  musicTheme:      MusicTheme;
  enemyMix:        EnemyMix;
  voidBottom:      boolean;  // true = falling is lethal (no ground)
  movingPlatforms: MovingPlatformSpec[];
  spawnCol?:       number;   // tile column for player spawn (default 9)
  spawnRow?:       number;   // tile row (feet); default uses GROUND_Y constant
  trainEffect?:    boolean;  // BG parallax auto-drift to fake lateral motion
  radioLines:      string[]; // mission-control texture between waves
  bossWarning:     string;
};

export const LEVEL_CONFIGS: LevelConfig[] = [
  // ── Node 0: Surface Ops ───────────────────────────────────────────────────
  {
    nodeIndex:     0,
    label:         'SURFACE OPS',
    tilesetKey:    'industrial-tileset',
    bgSkyColor:    0x030318,
    bgTerrainTint: 0xffffff,
    template:      TMPL_SURFACE_OPS,
    waveCount:     5,
    bossType:      'nexus-red',
    musicTheme:    'surface',
    enemyMix:      'balanced',
    voidBottom:    false,
    movingPlatforms: [],
    radioLines: [
      'Survey crews are still transmitting. Keep this corridor open.',
      'Habitat lights are coming back online behind you.',
      'Maintenance drones report movement beneath the regolith.',
      'Civilian crawlers are clear. You are weapons-free.',
      'Surface array is tracking one very large contact.',
    ],
    bossWarning: 'Seismic return is moving against the fault line. Brace.',
  },
  // ── Node 1: Trade Lanes ───────────────────────────────────────────────────
  {
    nodeIndex:     1,
    label:         'TRADE LANES',
    tilesetKey:    'industrial-tileset-blue',
    bgSkyColor:    0x020a18,
    bgTerrainTint: 0x4488ff,
    template:      TMPL_TRADE_LANES,
    waveCount:     5,
    bossType:      'nexus-blue',
    musicTheme:    'trade-lanes',
    enemyMix:      'aerial',
    voidBottom:    true,
    movingPlatforms: [
      { x: 1024, y: 690, width: 128, axis: 'y', travel: -176, speed: 88 },
      { x: 4224, y: 690, width: 128, axis: 'y', travel: -176, speed: 88, startForward: false },
    ],
    spawnCol:      8,
    spawnRow:      21,
    trainEffect:   true,
    radioLines: [
      'Cargo traffic is diverting around your firing lane.',
      'Convoy Seven is trapped ahead. Break the blockade.',
      'Dock crews have killed the lights. Watch for engine flare.',
      'Rail control reports unauthorized launches on every vector.',
      'The carrier signal just swallowed the whole band.',
    ],
    bossWarning: 'Heavy carrier emerging from the traffic shadow.',
  },
  // ── Node 2: Deep Facility ─────────────────────────────────────────────────
  {
    nodeIndex:     2,
    label:         'DEEP FACILITY',
    tilesetKey:    'industrial-tileset-violet',
    bgSkyColor:    0x08020f,
    bgTerrainTint: 0xaa44ff,
    template:      TMPL_DEEP_FACILITY,
    waveCount:     5,
    bossType:      'nexus-violet',
    musicTheme:    'deep-facility',
    enemyMix:      'ground-heavy',
    voidBottom:    false,
    movingPlatforms: [
      { x: 3520, y: 800, width: 128, axis: 'y', travel: -280, speed: 84 },
    ],
    spawnCol:      9,
    spawnRow:      25,
    radioLines: [
      'Life-support telemetry is faint, but it is not zero.',
      'Excavation lifts are cycling without operators.',
      'The lower galleries were sealed for a reason.',
      'Heat blooms ahead. Something is feeding on the grid.',
      'All surviving crews are behind pressure doors. Push on.',
    ],
    bossWarning: 'Massive contact in the bore chamber. No valid transponder.',
  },
  // ── Node 3: Orbital Station ───────────────────────────────────────────────
  {
    nodeIndex:     3,
    label:         'ORBITAL STATION',
    tilesetKey:    'industrial-tileset-blue',
    bgSkyColor:    0x000008,
    bgTerrainTint: 0x88ccff,
    template:      TMPL_ORBITAL,
    waveCount:     5,
    bossType:      'nexus-cyan',
    musicTheme:    'orbital',
    enemyMix:      'elite',
    voidBottom:    true,
    movingPlatforms: [
      { x: 1632, y: 680, width: 144, axis: 'x', travel: 160, speed: 92 },
      { x: 4896, y: 650, width: 144, axis: 'x', travel: 160, speed: 92, startForward: false },
    ],
    spawnCol:      9,
    spawnRow:      22,
    radioLines: [
      'Station-keeping thrusters are firing in the wrong sequence.',
      'Rescue pods are crossing below. Check your fire.',
      'Telemetry ghosts are multiplying across the hull.',
      'The ring habitat has twenty minutes of reserve atmosphere.',
      'Orbital control is gone. You are the control tower now.',
    ],
    bossWarning: 'Docking spine is opening. That is not a ship.',
  },
  // ── Node 4: Nexus Core ────────────────────────────────────────────────────
  {
    nodeIndex:     4,
    label:         'NEXUS CORE',
    tilesetKey:    'industrial-tileset',
    bgSkyColor:    0x120003,
    bgTerrainTint: 0xff2200,
    template:      TMPL_NEXUS_CORE,
    waveCount:     5,
    bossType:      'nexus-core',
    musicTheme:    'nexus-core',
    enemyMix:      'boss-rush',
    voidBottom:    false,
    movingPlatforms: [],
    radioLines: [
      'The colony network is speaking with one voice now.',
      'Every service drone on the Moon just turned toward you.',
      'Core temperature is rising. This may be deliberate.',
      'We can hear old crew messages inside the carrier wave.',
      'No extraction route remains. Finish it.',
    ],
    bossWarning: 'NEXUS CORE UNBOUND. ALL CHANNELS ARE YOURS.',
  },
];

// ── Node graph ─────────────────────────────────────────────────────────────
// nextNodes: nodes unlocked on completion
// requiredNodes: any one must be completed to unlock this node (OR logic)
export const NODE_GRAPH: { nextNodes: number[]; requiredNodes: number[] }[] = [
  { nextNodes: [1, 2], requiredNodes: []    }, // 0 — Surface Ops
  { nextNodes: [3],    requiredNodes: [0]   }, // 1 — Trade Lanes
  { nextNodes: [3],    requiredNodes: [0]   }, // 2 — Deep Facility
  { nextNodes: [4],    requiredNodes: [1, 2] }, // 3 — Orbital Station (either branch)
  { nextNodes: [],     requiredNodes: [3]   }, // 4 — Nexus Core
];

// Labels shown below node name on overworld (randomly picked per visit)
export const NODE_SUBTITLES: string[][] = [
  ['HOSTILE TERRITORY',  'SCAN ANOMALY DETECTED', 'FIRST CONTACT ZONE'],
  ['CARGO INTERCEPT',    'CONVOY DISRUPTION',      'HIGH-SPEED TRANSIT'],
  ['EXCAVATION BREACH',  'SUBSURFACE CONFLICT',    'TUNNEL WARFARE'],
  ['ZERO-G ENGAGEMENT',  'STATION BREACH',         'ORBITAL INSERTION'],
  ['CORE ASSAULT',       'FINAL RECKONING',         'NEXUS ELIMINATION'],
];
