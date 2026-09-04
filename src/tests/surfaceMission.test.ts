import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { EncounterSchedule, SURFACE_ENCOUNTERS, wardenDamage } from '../data/surfaceMission';

const state = vi.hoisted(() => ({ units: [] as any[] }));
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { F: 70 } } }, Math: { Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(v, max)) }, GameObjects: { Events: { DESTROY: 'destroy' } } } }));
vi.mock('../entities/SurfaceEnemy', () => ({ SurfaceEnemy: class {
  active = true;
  constructor(_scene: unknown, public x: number, public y: number, public role: string, public acquire: any, public release: any, public defeated: any) { state.units.push(this); }
  once() { return this; }
  kill() { if (this.active) { this.active = false; this.release(this); this.defeated(); } }
} }));
vi.mock('../entities/SurfaceWarden', () => ({ SurfaceWarden: class { once() { return this; } } }));
import { SurfaceMission } from '../systems/SurfaceMission';

function sceneFixture() {
  const graphics = () => {
    const g: any = {};
    for (const key of ['setDepth', 'clear', 'fillStyle', 'fillRect', 'lineStyle', 'strokeRect', 'lineBetween', 'strokeCircle', 'strokeEllipse', 'destroy']) g[key] = () => g;
    return g;
  };
  const label = () => { const t: any = {}; for (const k of ['setOrigin', 'setDepth', 'setText', 'setColor', 'destroy']) t[k] = () => t; return t; };
  const key = { isDown: false };
  const events = new EventEmitter();
  const player = { x: 300, y: 950, jetpackMaxFuel: 2200, heal: vi.fn(), refillRapidAmmo: vi.fn(), restoreJetpackFuel: vi.fn(), setPosition: vi.fn() };
  const scene: any = {
    player, events, input: { keyboard: { addKey: () => key } },
    add: { graphics, text: label }, audio: { play: vi.fn() },
    physics: { add: { overlap: () => ({ destroy: vi.fn() }) }, world: { setBounds: vi.fn() } },
    cameras: { main: { setBounds: vi.fn() } },
  };
  return { scene, events, player, key };
}

describe('encounter pressure budget', () => {
  it('caps active enemies and waits for all scheduled deaths before completing', () => {
    const s = new EncounterSchedule(5, 2);
    expect(s.update(600)).toBe(true);
    expect(s.update(1500)).toBe(true);
    expect(s.update(90000)).toBe(false);
    expect(s.alive).toBe(2);
    s.killed();
    expect(s.update(0)).toBe(true);
    expect(s.complete).toBe(false);
    s.killed(); s.killed();
    expect(s.complete).toBe(false); // Two enemies have not spawned yet.
    s.update(1500); s.killed(); s.update(1500); s.killed();
    expect(s.complete).toBe(true);
    expect(s.update(90000)).toBe(false);
  });
  it('rejects damage against a closed Warden core', () => {
    expect(wardenDamage(4, false)).toBe(0);
    expect(wardenDamage(4, true)).toBe(4);
  });
});

describe('Surface Ops mission sequence', () => {
  it('requires training, three cleared encounters and relay interactions before the boss; awards one specialization', () => {
    state.units = [];
    const { scene, events, player, key } = sceneFixture();
    const mission = new SurfaceMission(scene);
    let upgrades = 0, completed = 0;
    events.on('fieldUpgrade', () => upgrades++);
    events.on('levelComplete', () => completed++);
    player.x = 6000;
    mission.update(0, 16);
    expect(mission.phase).toBe('training'); // Running ahead cannot skip it.
    events.emit('pilotAction', 'jump'); events.emit('pilotAction', 'dash');
    state.units[0].kill();
    mission.update(16, 16);
    expect(mission.phase).toBe('travel');
    for (let index = 0; index < 3; index++) {
      const e = SURFACE_ENCOUNTERS[index];
      player.x = e.x;
      mission.update(0, 16);
      expect(mission.phase).toBe('combat');
      for (let n = 0; n < e.roles.length; n++) {
        mission.update(0, 1500);
        state.units.filter(u => u.active).forEach(u => u.kill());
      }
      mission.update(0, 16);
      expect(mission.phase).toBe('relay');
      player.x = e.relayX;
      mission.update(0, 2000);
      expect(mission.phase).toBe('relay'); // Proximity alone does not activate it.
      key.isDown = true;
      mission.update(0, 2000);
      key.isDown = false;
      if (index === 0) {
        expect(mission.phase).toBe('upgrade');
        events.emit('upgradeChosen', 'capacitor');
      }
    }
    expect(upgrades).toBe(1);
    expect(scene.player.heal).toHaveBeenCalledTimes(3);
    expect(mission.phase).toBe('boss-travel');
    player.x = 5200; mission.update(0, 16);
    expect(mission.phase).toBe('boss');
    events.emit('bossKilled'); events.emit('bossKilled');
    expect(completed).toBe(1);
    expect(mission.phase).toBe('complete');
    mission.destroy();
    expect(events.listenerCount('pilotAction')).toBe(0);
    expect(events.listenerCount('upgradeChosen')).toBe(0);
    expect(events.listenerCount('bossKilled')).toBe(0);
  });
});
