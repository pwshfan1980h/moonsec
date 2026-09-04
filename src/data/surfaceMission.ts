export type SurfaceEnemyRole = 'skirmisher' | 'sniper' | 'charger' | 'target';

export const SURFACE_ENCOUNTERS: { x: number; relayX: number; name: string; roles: SurfaceEnemyRole[] }[] = [
  { x: 1700, relayX: 2100, name: 'SURVEY RELAY', roles: ['skirmisher', 'skirmisher', 'sniper'] },
  { x: 3000, relayX: 3500, name: 'HABITAT RELAY', roles: ['skirmisher', 'charger', 'sniper', 'skirmisher'] },
  { x: 4300, relayX: 4800, name: 'UPLINK RELAY', roles: ['charger', 'skirmisher', 'sniper', 'charger', 'skirmisher'] },
];
export const SURFACE_BOSS_X = 5650;
export const SURFACE_MAX_ACTIVE = 4;
export const SURFACE_MAX_ATTACKERS = 2;

/** Encounter progression cannot advance until all scheduled enemies are defeated. */
export class EncounterSchedule {
  spawned = 0;
  defeated = 0;
  private untilNext = 600;
  constructor(readonly total: number, readonly maxActive = SURFACE_MAX_ACTIVE) {}
  get alive(): number { return this.spawned - this.defeated; }
  get complete(): boolean { return this.spawned === this.total && this.alive === 0; }
  update(delta: number): boolean {
    this.untilNext -= delta;
    if (this.spawned >= this.total || this.alive >= this.maxActive || this.untilNext > 0) return false;
    this.spawned++;
    this.untilNext = 1500;
    return true;
  }
  killed(): void { this.defeated = Math.min(this.spawned, this.defeated + 1); }
}

export function wardenDamage(amount: number, exposed: boolean): number {
  return exposed ? Math.max(0, amount) : 0;
}
