import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { EncounterSchedule, SURFACE_ENCOUNTERS, wardenDamage } from '../data/surfaceMission';

const state = vi.hoisted(() => ({ units: [] as any[] }));
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { F: 70 } } }, Math: { Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(v, max)) }, GameObjects: { Events: { DESTROY: 'destroy' } } } }));
vi.mock('../entities/foes/surface', () => {
  class Unit {
    active = true;
    onKilled?: () => void;
    constructor(_scene: unknown, public x: number, public y: number) { state.units.push(this); }
    kill() { if (this.active) { this.active = false; this.onKilled?.(); } }
  }
  return { Prowler: Unit, Spotter: Unit, Ram: Unit, Stilt: Unit, Burrower: Unit, TrainingTarget: Unit };
});
vi.mock('../entities/foes/bosses', () => ({ Warden: class {} }));
import { SurfaceMission } from '../systems/SurfaceMission';

function sceneFixture() {
  const graphics = () => {
    const g: any = {};
    for (const key of ['setDepth', 'clear', 'fillStyle', 'fillRect', 'lineStyle', 'strokeRect', 'lineBetween', 'strokeCircle', 'strokeEllipse', 'destroy']) g[key] = () => g;
    return g;
  };
  const label = () => { const t: any = { body: { enable: true } }; for (const k of ['setVisible', 'setOrigin', 'setDepth', 'setText', 'setColor', 'setTint', 'setScale', 'setFrame', 'setLetterSpacing', 'setLineSpacing', 'destroy']) t[k] = () => t; return t; };
  const key = { isDown: false };
  const events = new EventEmitter();
  const player = { body: { right: 1712 }, x: 300, y: 950, jetpackMaxFuel: 2200, heal: vi.fn(), refillRapidAmmo: vi.fn(), restoreJetpackFuel: vi.fn(), setPosition: vi.fn(), socketWorld: () => ({ x: 0, y: 0 }) };
  const scene: any = {
    player, events, input: { keyboard: { addKey: () => key } },
    add: { zone: label, rectangle: label, graphics, text: label, image: label, bitmapText: label }, audio: { play: vi.fn(), startLoop: vi.fn(), stopLoop: vi.fn() },
    radio: { say: vi.fn(() => true), once: vi.fn(() => true), isQuiet: vi.fn(() => true) },
    physics: { add: { existing: vi.fn(), collider: vi.fn(() => ({ destroy: vi.fn() })), overlap: () => ({ destroy: vi.fn() }) }, world: { setBounds: vi.fn() } },
    cameras: { main: { setBounds: vi.fn() } },
    hostileCombat: { register: vi.fn() },
    time: { now: 0 },
    spawnFloatingText: vi.fn(),
    getApproxGroundY: () => 960,
    levelTemplate: {},
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
    events.emit('pilotAction', 'jump');
    mission.update(8, 16);
    expect(scene.radio.say).toHaveBeenLastCalledWith('tut-dash', { priority: 'critical', tag: 'tut', interrupt: true });
    events.emit('pilotAction', 'dash');
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
      mission.update(0, 1000);
      mission.update(0, 1000);
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
    // training and every objective change are voiced, in order
    const said = scene.radio.say.mock.calls.map((c: unknown[]) => c[0]);
    const order = ['sys-online', 'tut-intro', 'tut-jump', 'tut-complete', 'surf-contact-1', 'surf-clear', 'surf-relay-1', 'sys-module',
      'surf-contact-2', 'surf-relay-2', 'surf-contact-3', 'surf-relay-3', 'surf-boss'];
    let at = -1;
    for (const id of order) { const next = said.indexOf(id, at + 1); expect(next, id).toBeGreaterThan(at); at = next; }
    expect(scene.audio.startLoop).toHaveBeenCalledWith('uplink');
    mission.destroy();
    expect(events.listenerCount('pilotAction')).toBe(0);
    expect(events.listenerCount('upgradeChosen')).toBe(0);
    expect(events.listenerCount('bossKilled')).toBe(0);
  });
});


describe('opening range gate', () => {
  it('holds the camera and gives one contextual hint per contact visit, then releases on all checks', () => {
    state.units = [];
    const { scene, player, events } = sceneFixture();
    const mission = new SurfaceMission(scene);
    expect(scene.physics.add.collider).toHaveBeenCalledTimes(1);
    expect(mission.cameraTargetX(1700, 1920, 1)).toBe(960);
    expect(mission.cameraTargetX(1700, 1920, 1.5)).toBe(1184);
    player.x = 1600;
    mission.update(0, 16);
    expect(scene.spawnFloatingText).not.toHaveBeenCalled();
    const contact = scene.physics.add.collider.mock.calls[0][2];
    contact();
    mission.update(1, 16);
    expect(scene.spawnFloatingText.mock.calls[0][2]).toContain('SPACE');
    expect(scene.radio.say).toHaveBeenCalledWith('tut-gate-1', { tag: 'gate' });
    player.body.right = 1320; mission.update(1000, 16);
    player.body.right = 1712; contact(); mission.update(2000, 16);
    expect(scene.spawnFloatingText).toHaveBeenCalledTimes(1);
    contact();
    mission.update(20000, 16);
    expect(scene.spawnFloatingText).toHaveBeenCalledTimes(1);
    events.emit('pilotAction', 'jump');
    player.x = 1300; player.body.right = 1320; mission.update(21000, 16);
    player.x = 1692; player.body.right = 1712; contact(); mission.update(22000, 16);
    expect(scene.spawnFloatingText.mock.calls[1][2]).toContain('SHIFT');
    expect(scene.spawnFloatingText.mock.calls[1][2]).not.toContain('SPACE');
    events.emit('pilotAction', 'dash');
    mission.update(23000, 16);
    expect(mission.phase).toBe('training');
    state.units[0].kill();
    mission.update(24000, 16);
    expect(mission.phase).toBe('travel');
    expect(mission.cameraTargetX(1700, 1920, 1)).toBe(1700);
    expect(scene.physics.add.collider.mock.results[0].value.destroy).toHaveBeenCalledTimes(1);
    mission.destroy();
    expect(scene.physics.add.collider.mock.results[0].value.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not restrict encounter or boss debug starts', () => {
    for (const boss of [false, true]) {
      const { scene } = sceneFixture();
      const mission = new SurfaceMission(scene, boss, boss ? undefined : 1);
      expect(scene.physics.add.collider).not.toHaveBeenCalled();
      expect(mission.cameraTargetX(5200, 1920, 1)).toBe(5200);
      mission.destroy();
    }
  });
});
