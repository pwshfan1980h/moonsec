import { pal } from '../render/palette';
import { WORLD_TILES_KEY } from '../world/worldTextures';
import type { LevelTemplate } from './levelData';
import {
  TMPL_SURFACE_OPS, TMPL_TRADE_LANES, TMPL_DEEP_FACILITY,
  TMPL_ORBITAL, TMPL_NEXUS_CORE,
} from './levelData';
import type { BossType } from '../entities/foes/bosses';
import type { RadioLineId } from './radioScript';

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
  radioLines:      RadioLineId[]; // voiced mission-control traffic, one per wave
  bossWarning:     RadioLineId;
  introLine:       RadioLineId;   // heard as the mission starts
  winLine:         RadioLineId;   // heard when the boss falls
};

export const LEVEL_CONFIGS: LevelConfig[] = [
  // ── Node 0: Surface Ops ───────────────────────────────────────────────────
  {
    nodeIndex:     0,
    label:         'SURFACE OPS',
    tilesetKey:    WORLD_TILES_KEY,
    bgSkyColor:    pal('void'),
    bgTerrainTint: pal('cyan3'),
    template:      TMPL_SURFACE_OPS,
    waveCount:     3,
    bossType:      'nexus-red',
    musicTheme:    'surface',
    enemyMix:      'balanced',
    voidBottom:    false,
    movingPlatforms: [],
    radioLines: ['chat-survey-1', 'chat-dock-1', 'chat-control-1', 'chat-habitat-1', 'chat-survey-2'],
    bossWarning: 'surf-boss',
    introLine: 'tut-intro',
    winLine: 'surf-win',
  },
  // ── Node 1: Trade Lanes ───────────────────────────────────────────────────
  {
    nodeIndex:     1,
    label:         'TRADE LANES',
    tilesetKey:    'industrial-tileset-blue',
    bgSkyColor:    pal('void'),
    bgTerrainTint: pal('hull5'),
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
    radioLines: ['lanes-w1', 'lanes-w2', 'lanes-w3', 'lanes-w4', 'lanes-w5'],
    bossWarning: 'lanes-boss',
    introLine: 'lanes-intro',
    winLine: 'lanes-win',
  },
  // ── Node 2: Deep Facility ─────────────────────────────────────────────────
  {
    nodeIndex:     2,
    label:         'DEEP FACILITY',
    tilesetKey:    'industrial-tileset-violet',
    bgSkyColor:    pal('void'),
    bgTerrainTint: pal('hull5'),
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
    radioLines: ['deep-w1', 'deep-w2', 'deep-w3', 'deep-w4', 'deep-w5'],
    bossWarning: 'deep-boss',
    introLine: 'deep-intro',
    winLine: 'deep-win',
  },
  // ── Node 3: Orbital Station ───────────────────────────────────────────────
  {
    nodeIndex:     3,
    label:         'ORBITAL STATION',
    tilesetKey:    'industrial-tileset-blue',
    bgSkyColor:    pal('void'),
    bgTerrainTint: pal('cyan2'),
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
    radioLines: ['orbit-w1', 'orbit-w2', 'orbit-w3', 'orbit-w4', 'orbit-w5'],
    bossWarning: 'orbit-boss',
    introLine: 'orbit-intro',
    winLine: 'orbit-win',
  },
  // ── Node 4: Nexus Core ────────────────────────────────────────────────────
  {
    nodeIndex:     4,
    label:         'NEXUS CORE',
    tilesetKey:    'industrial-tileset',
    bgSkyColor:    pal('void'),
    bgTerrainTint: pal('hostile1'),
    template:      TMPL_NEXUS_CORE,
    waveCount:     5,
    bossType:      'nexus-core',
    musicTheme:    'nexus-core',
    enemyMix:      'boss-rush',
    voidBottom:    false,
    movingPlatforms: [],
    radioLines: ['nexus-w1', 'nexus-w2', 'nexus-w3', 'nexus-w4', 'nexus-w5'],
    bossWarning: 'nexus-boss',
    introLine: 'nexus-intro',
    winLine: 'nexus-win',
  },
];

/**
 * Player spawn in world units (feet position; origin 0.5, 1). Text-map levels use their `S`
 * cell (feet on the cell's floor); legacy templates use spawnCol/spawnRow or the default ground.
 */
export function spawnPoint(config: LevelConfig, defaultGroundY: number): { x: number; y: number } {
  const s = config.template.map?.spawn;
  if (s) return { x: s.col * 32 + 16, y: (s.row + 1) * 32 - 5 };
  return {
    x: config.spawnCol !== undefined ? config.spawnCol * 32 : 300,
    y: config.spawnRow !== undefined ? config.spawnRow * 32 - 4 : defaultGroundY - 5,
  };
}

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

