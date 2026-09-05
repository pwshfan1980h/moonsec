import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../entities/effects/enemyPresentation', () => ({ presentEnemyArrival: vi.fn(), flashEnemyHit: vi.fn(), presentEnemyBreakup: vi.fn() }));
vi.mock('phaser', () => {
  class Sprite {
    active = true;
    body = { velocity: { x: 0, y: 0 }, setVelocity: (x: number, y: number) => { this.body.velocity = { x, y }; }, stop: () => { this.body.velocity = { x: 0, y: 0 }; } };
    constructor(public scene: any, public x: number, public y: number) {}
    setScale() { return this; } setDepth() { return this; } setFlipX() { return this; } play() { return this; }
  }
  return { default: { Physics: { Arcade: { Sprite } }, Math: { Between: (min: number, max: number) => (min + max) / 2 } } };
});
import { Drone } from '../entities/Drone';
import { FlightNavigation } from '../systems/FlightNavigation';
import { TMPL_TRADE_LANES, buildMap } from '../data/levelData';

function fixture(x: number, y: number) {
  const scene: any = {
    flightNavigation: new FlightNavigation(buildMap(TMPL_TRADE_LANES, 0)),
    player: { x: 1520, y: 704, hp: 5 }, getPlayerPos: () => scene.player, isGameOverActive: () => false,
  };
  const drone = new Drone(scene, x, y, 'drone-red', { attackSpeed: 216, shootInterval: 100000, bulletSpeedMult: 1, extraHp: 0 });
  // Keep this movement test independent of randomized firing cadence.
  (drone as any).shootTimer = 100000;
  return { scene, drone, body: drone.body as any };
}

afterEach(() => vi.restoreAllMocks());

describe('Drone integration with Trade Lanes navigation', () => {
  it.each([0.01, 0.25, 0.6, 0.95])('pursues around a cargo deck with personality seed %s', (seed) => {
    vi.spyOn(Math, 'random').mockReturnValue(seed);
    const { scene, drone, body } = fixture(1520, 848);
    for (let time = 0; time < 24000; time += 16) {
      drone.update(time, 16);
      drone.x += body.velocity.x * 0.016;
      drone.y += body.velocity.y * 0.016;
      expect(scene.flightNavigation.isOpen(drone)).toBe(true);
    }
    expect(drone.y).toBeLessThan(664);
    expect(drone.getState()).toBe('ATTACK');
    expect(scene.flightNavigation.lineClear(drone, { x: 1520, y: 644 }, 3, 3)).toBe(true);
  });
  it('stops its route when the player dies', () => {
    const { scene, drone, body } = fixture(1520, 848);
    drone.update(0, 16);
    expect(Math.hypot(body.velocity.x, body.velocity.y)).toBeGreaterThan(0);
    scene.player.hp = 0;
    drone.update(16, 16);
    expect(body.velocity).toEqual({ x: 0, y: 0 });
  });
});
