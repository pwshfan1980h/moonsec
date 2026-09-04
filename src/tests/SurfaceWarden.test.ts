import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Sprite {
    body: any;
    constructor(public scene: any, public x: number, public y: number) {
      this.body = { enable: true, setAllowGravity: () => this.body, setImmovable: () => this.body, setSize: () => this.body };
    }
    active = true;
    setScale() { return this; } setDepth() { return this; } play() { return this; }
    destroy() { this.active = false; }
  }
  return { default: { Physics: { Arcade: { Sprite } }, Math: { Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(v, max)) } } };
});
vi.mock('../entities/effects/juggernautDeath', () => ({ playJuggernautDeath: vi.fn() }));
import { SurfaceWarden } from '../entities/SurfaceWarden';
import { playJuggernautDeath } from '../entities/effects/juggernautDeath';

function fixture() {
  const fluent = () => {
    const obj: any = {};
    for (const key of ['clear', 'fillStyle', 'fillCircle', 'lineStyle', 'strokeEllipse', 'strokeCircle', 'fillRect', 'strokeRect', 'lineBetween', 'setDepth', 'setOrigin', 'setText', 'destroy']) obj[key] = vi.fn(() => obj);
    return obj;
  };
  const scene: any = {
    add: { existing: vi.fn(), graphics: fluent, text: fluent }, drones: { add: vi.fn() },
    player: { x: 5600, y: 960, takeDamage: vi.fn() }, time: { now: 5000 },
    events: { emit: vi.fn() }, audio: { playAt: vi.fn(), play: vi.fn() },
    spawnExplosion: vi.fn(), spawnFloatingText: vi.fn(), isGameOverActive: () => false,
    getApproxGroundY: () => 960,
  };
  return { scene, boss: new SurfaceWarden(scene) };
}

describe('Warden attack cycle', () => {
  it('warns before a ground sweep and exposes its core only after firing', () => {
    const { scene, boss } = fixture();
    boss.takeDamage(20);
    expect(boss.hp).toBe(32);
    boss.update(0, 2000);
    expect(boss.phase).toBe('warning');
    expect(scene.player.takeDamage).not.toHaveBeenCalled();
    boss.update(0, 1700);
    expect(scene.player.takeDamage).toHaveBeenCalledWith(1, boss.x);
    expect(boss.phase).toBe('exposed');
    boss.takeDamage(4);
    expect(boss.hp).toBe(28);
    boss.update(0, 4200);
    expect(boss.phase).toBe('shielded');
    boss.takeDamage(4);
    expect(boss.hp).toBe(28);
  });
  it('lets jumping evade the sweep and moving evade the locked orbital column', () => {
    const { scene, boss } = fixture();
    boss.update(0, 2000);
    scene.player.y = 880;
    boss.update(0, 1700);
    expect(scene.player.takeDamage).not.toHaveBeenCalled();
    boss.update(0, 4200);
    scene.player.y = 960;
    boss.update(0, 1800); // Orbital strike locks the old x.
    scene.player.x = 6100;
    boss.update(0, 1700);
    expect(scene.player.takeDamage).not.toHaveBeenCalled();
    expect(boss.phase).toBe('exposed');
  });
  it('starts the death sequence once and disables further attacks', () => {
    vi.mocked(playJuggernautDeath).mockClear();
    const { scene, boss } = fixture();
    boss.update(0, 2000); boss.update(0, 1700);
    boss.takeDamage(100); boss.takeDamage(100);
    expect(boss.phase).toBe('dead');
    expect(boss.body!.enable).toBe(false);
    expect(playJuggernautDeath).toHaveBeenCalledTimes(1);
    scene.player.takeDamage.mockClear();
    boss.update(0, 90000);
    expect(scene.player.takeDamage).not.toHaveBeenCalled();
  });
});
