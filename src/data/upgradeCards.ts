import type { Player } from '../entities/Player';

export interface UpgradeCard {
  id: string;
  name: string;
  category: 'offense' | 'defense' | 'mobility';
  icon: string;
  desc: string;
  statLine: string;
  oneTime: boolean;
  apply: (player: Player) => void;
}

export const CARD_POOL: UpgradeCard[] = [
  // Offense
  {
    id: 'overclock', name: 'OVERCLOCK', category: 'offense', icon: '⚡',
    desc: 'Rapid-fire rate increased for this run',
    statLine: '+25% FIRE RATE', oneTime: false,
    apply: (p) => { p.rapidMinInterval = Math.max(20, Math.round(p.rapidMinInterval * 0.75)); },
  },
  {
    id: 'heavy-round', name: 'HEAVY ROUND', category: 'offense', icon: '🔴',
    desc: 'Turret shots hit harder',
    statLine: '+50% TURRET IMPACT', oneTime: false,
    apply: (p) => { p.turretCooldownMs = Math.max(200, Math.round(p.turretCooldownMs * 0.85)); },
  },
  {
    id: 'dual-missile', name: 'DUAL MISSILE', category: 'offense', icon: '🚀',
    desc: 'Two additional missile slots',
    statLine: '+2 MISSILE SLOTS', oneTime: true,
    apply: (p) => { p.missileSlots += 2; },
  },
  // Defense
  {
    id: 'plating', name: 'PLATING', category: 'defense', icon: '🛡️',
    desc: 'Emergency hull reinforcement',
    statLine: '+1 MAX HP', oneTime: false,
    apply: (p) => { p.maxHp += 1; p.hp = Math.min(p.hp + 1, p.maxHp); },
  },
  {
    id: 'nanite-cd', name: 'NANITE CD-', category: 'defense', icon: '💉',
    desc: 'Nanite cooldown reduced',
    statLine: '-5s NANITE COOLDOWN', oneTime: false,
    apply: (p) => { p.naniteCooldownMs = Math.max(5000, p.naniteCooldownMs - 5000); },
  },
  {
    id: 'reactive-armor', name: 'REACTIVE ARMOR', category: 'defense', icon: '🔰',
    desc: 'Absorbs your next hit this wave',
    statLine: 'ABSORB 1 HIT', oneTime: true,
    apply: (p) => { (p as any).damageShield = true; },
  },
  {
    id: 'regen-boost', name: 'REGEN BOOST', category: 'defense', icon: '➕',
    desc: 'Nanite heal restores more HP',
    statLine: '+1 NANITE HEAL', oneTime: true,
    apply: (p) => { p.naniteHealAmount = Math.min(p.naniteHealAmount + 1, 3); },
  },
  // Mobility
  {
    id: 'afterburn', name: 'AFTERBURN', category: 'mobility', icon: '🔥',
    desc: 'Expanded jetpack fuel capacity',
    statLine: '+40% FUEL CAP', oneTime: false,
    apply: (p) => { p.jetpackMaxFuel = Math.round(p.jetpackMaxFuel * 1.4); },
  },
  {
    id: 'thrust', name: 'THRUST+', category: 'mobility', icon: '💨',
    desc: 'Jetpack acceleration increased',
    statLine: '+30% JETPACK ACCEL', oneTime: false,
    apply: (p) => { p.jetpackAccel = Math.round(p.jetpackAccel * 1.3); },
  },
  {
    id: 'stabiliser', name: 'STABILISER', category: 'mobility', icon: '⬆️',
    desc: 'Jump height increased',
    statLine: '+15% JUMP HEIGHT', oneTime: true,
    apply: (p) => { p.jumpVelocity = Math.round(p.jumpVelocity * 1.15); },
  },
];
