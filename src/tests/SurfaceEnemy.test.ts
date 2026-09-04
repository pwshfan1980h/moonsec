import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Sprite {
    body: any;
    active = true;
    displayHeight = 64;
    displayWidth = 64;
    width = 32;
    height = 32;
    constructor(public scene: any, public x: number, public y: number) {
      this.body = { enable: true, velocity: { x: 0, y: 0 },
        setAllowGravity: () => this.body, setSize: () => this.body,
        setCollideWorldBounds: vi.fn(() => this.body),
        setVelocity: (x: number, y: number) => { this.body.velocity = { x, y }; return this.body; },
        stop: () => { this.body.velocity = { x: 0, y: 0 }; },
      };
    }
    setScale() { return this; } setDepth() { return this; } play() { return this; }
    setFlipX() { return this; } destroy() { this.active = false; }
  }
  return { default: { Physics: { Arcade: { Sprite } }, Math: {
    Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(v, max)),
    Distance: { Between: (x: number, y: number, a: number, b: number) => Math.hypot(a - x, b - y) },
    Angle: { Between: (x: number, y: number, a: number, b: number) => Math.atan2(b - y, a - x) },
  } } };
});
import { SurfaceEnemy } from '../entities/SurfaceEnemy';

function fixture() {
  const fluent = () => {
    const obj: any = {};
    for (const key of ['clear', 'lineStyle', 'lineBetween', 'strokeCircle', 'setPosition', 'setColor', 'setDepth', 'setOrigin', 'setText', 'destroy']) obj[key] = vi.fn(() => obj);
    return obj;
  };
  const scene: any = { add: { existing: vi.fn(), graphics: fluent, text: fluent }, drones: { add: vi.fn() },
    player: { x: 450, y: 500, hp: 5, takeDamage: vi.fn() },
    spawnFloatingText: vi.fn(), isGameOverActive: () => false };
  const acquire = vi.fn(() => true), release = vi.fn();
  const enemy = new SurfaceEnemy(scene, 800, 400, 'charger', acquire, release, vi.fn());
  return { scene, enemy, acquire, release, body: enemy.body as any };
}

describe('Surface charger movement', () => {
  it('waits for an attack slot and a full warning before charging', () => {
    const { enemy, acquire, body } = fixture();
    acquire.mockReturnValue(false);
    enemy.update(0, 2000);
    expect(enemy.getState()).toBe('HOVER');
    acquire.mockReturnValue(true);
    enemy.update(0, 16);
    expect(enemy.getState()).toBe('ATTACK');
    expect(body.velocity).toEqual({ x: 0, y: 0 });
    enemy.update(0, 899);
    expect(body.velocity).toEqual({ x: 0, y: 0 });
    enemy.update(0, 1);
    expect(Math.hypot(body.velocity.x, body.velocity.y)).toBeCloseTo(480);
  });
  it('stops a live charge after player death and remains bounded to the world', () => {
    const { scene, enemy, body, release } = fixture();
    expect(body.setCollideWorldBounds).toHaveBeenCalledWith(true);
    enemy.update(0, 1200); enemy.update(0, 900);
    expect(body.velocity.x).not.toBe(0);
    scene.player.hp = 0;
    enemy.update(0, 16);
    expect(body.velocity).toEqual({ x: 0, y: 0 });
    expect(release).toHaveBeenCalledWith(enemy);
    expect(scene.player.takeDamage).not.toHaveBeenCalled();
  });
});
