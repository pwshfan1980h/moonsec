import type { LevelTemplate } from './levelData';
import {
  TMPL_SURFACE_OPS, TMPL_TRADE_LANES, TMPL_DEEP_FACILITY,
  TMPL_ORBITAL, TMPL_NEXUS_CORE,
} from './levelData';
import type { BossType } from '../entities/NexusBoss';

export type MusicTheme  = 'surface' | 'trade-lanes' | 'deep-facility' | 'orbital' | 'nexus-core';
export type EnemyMix    = 'balanced' | 'aerial' | 'ground-heavy' | 'elite' | 'boss-rush';

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
  movingPlatforms: boolean;  // spawn horizontal moving platforms
  spawnCol?:       number;   // tile column for player spawn (default 9)
  spawnRow?:       number;   // tile row (feet); default uses GROUND_Y constant
  trainEffect?:    boolean;  // BG parallax auto-drift to fake lateral motion
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
    movingPlatforms: false,
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
    movingPlatforms: false,
    spawnCol:      8,
    spawnRow:      21,
    trainEffect:   true,
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
    movingPlatforms: false,
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
    movingPlatforms: false,
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
    movingPlatforms: false,
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
