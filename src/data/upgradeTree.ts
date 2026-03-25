import type { Player } from '../entities/Player';

export type TreeEffect =
  | { type: 'rapidInterval';   delta: number }
  | { type: 'turretCooldown';  delta: number }
  | { type: 'missileSlots';    delta: number }
  | { type: 'maxHp';           delta: number }
  | { type: 'naniteCooldown';  delta: number }
  | { type: 'naniteBurst' }
  | { type: 'regenField' }
  | { type: 'jetpackFuel';     mult: number }
  | { type: 'jetpackAccel';    mult: number }
  | { type: 'airDash' }
  | { type: 'gravBoost' }
  | { type: 'overload' };

export interface TreeNode {
  id: string;
  col: 'offense' | 'defense' | 'mobility';
  tier: 0 | 1 | 2 | 3;
  name: string;
  desc: string;
  cost: number;
  effect: TreeEffect;
}

export const TREE_NODES: TreeNode[] = [
  // Offense
  { id: 'rapid-plus',    col: 'offense', tier: 0, name: 'RAPID+',       desc: 'Increases rapid-fire rate',        cost: 500,  effect: { type: 'rapidInterval',  delta: 15 } },
  { id: 'turret-plus',   col: 'offense', tier: 1, name: 'TURRET+',      desc: 'Reduces turret cooldown',          cost: 800,  effect: { type: 'turretCooldown', delta: 100 } },
  { id: 'dual-missile',  col: 'offense', tier: 2, name: 'DUAL MISSILE', desc: 'Two additional missile slots',     cost: 1500, effect: { type: 'missileSlots',   delta: 2 } },
  { id: 'overload',      col: 'offense', tier: 3, name: 'OVERLOAD',     desc: 'Brief invincibility on 10-streak', cost: 3000, effect: { type: 'overload' } },
  // Defense
  { id: 'hp-plus',       col: 'defense', tier: 0, name: 'HP+1',         desc: 'Increases max hull integrity',     cost: 500,  effect: { type: 'maxHp',          delta: 1 } },
  { id: 'nanite-cd',     col: 'defense', tier: 1, name: 'NANITE CD-',   desc: 'Reduces nanite cooldown by 5s',   cost: 600,  effect: { type: 'naniteCooldown', delta: 5000 } },
  { id: 'nanite-burst',  col: 'defense', tier: 2, name: 'NANITE BURST', desc: '1s invulnerability on Q activate', cost: 1500, effect: { type: 'naniteBurst' } },
  { id: 'regen-field',   col: 'defense', tier: 3, name: 'REGEN FIELD',  desc: '+1 HP every 2 waves cleared',     cost: 2400, effect: { type: 'regenField' } },
  // Mobility
  { id: 'fuel-plus',     col: 'mobility', tier: 0, name: 'FUEL+',       desc: 'Expands jetpack fuel capacity',   cost: 400,  effect: { type: 'jetpackFuel',  mult: 1.3 } },
  { id: 'thrust-plus',   col: 'mobility', tier: 1, name: 'THRUST+',     desc: 'Increases jetpack acceleration',  cost: 900,  effect: { type: 'jetpackAccel', mult: 1.2 } },
  { id: 'air-dash',      col: 'mobility', tier: 2, name: 'AIR DASH',    desc: 'Double-tap to dash mid-air',      cost: 1600, effect: { type: 'airDash' } },
  { id: 'grav-boost',    col: 'mobility', tier: 3, name: 'GRAV BOOST',  desc: 'Reduced gravity while jetting',   cost: 3000, effect: { type: 'gravBoost' } },
];

export function applyTreeEffect(player: Player, effect: TreeEffect): void {
  switch (effect.type) {
    case 'rapidInterval':
      player.rapidMinInterval  = Math.max(20, (player.rapidMinInterval ?? 60) - effect.delta);
      break;
    case 'turretCooldown':
      player.turretCooldownMs  = Math.max(200, (player.turretCooldownMs ?? 650) - effect.delta);
      break;
    case 'missileSlots':
      player.missileSlots      = (player.missileSlots ?? 6) + effect.delta;
      break;
    case 'maxHp':
      player.maxHp            += effect.delta;
      break;
    case 'naniteCooldown':
      player.naniteCooldownMs  = Math.max(5000, (player.naniteCooldownMs ?? 20000) - effect.delta);
      break;
    case 'naniteBurst':
      player.hasNaniteBurst    = true;
      break;
    case 'regenField':
      player.hasRegenField     = true;
      break;
    case 'jetpackFuel':
      player.jetpackMaxFuel   *= effect.mult;
      break;
    case 'jetpackAccel':
      player.jetpackAccel     *= effect.mult;
      break;
    case 'airDash':
      player.hasAirDash        = true;
      break;
    case 'gravBoost':
      player.hasGravBoost      = true;
      break;
    case 'overload':
      player.hasOverload       = true;
      break;
  }
}
