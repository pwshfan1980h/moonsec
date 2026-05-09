import { describe, expect, it, vi } from 'vitest';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';

function createSceneMock({ withGroundLayer = false } = {}) {
  const collider = vi.fn();
  const overlap = vi.fn();
  const existing = vi.fn();
  const rectangle = vi.fn(() => ({ kind: 'voidSensor' }));
  const scene = {
    player: { kind: 'player', takeDamage: vi.fn() },
    ground: { kind: 'ground' },
    groundLayer: withGroundLayer ? { kind: 'groundLayer' } : undefined,
    tanks: { kind: 'tanks' },
    pickups: { kind: 'pickups' },
    drones: { kind: 'drones' },
    playerBullets: { kind: 'playerBullets' },
    droneBullets: { kind: 'droneBullets' },
    bossProjectiles: { kind: 'bossProjectiles' },
    missiles: { kind: 'missiles' },
    ppcRounds: { kind: 'ppcRounds' },
    movingPlatforms: { kind: 'movingPlatforms' },
    physics: { add: { collider, overlap, existing } },
    add: { rectangle },
    audio: { play: vi.fn() },
    cameras: { main: { shake: vi.fn() } },
    spawnBulletImpact: vi.fn(),
    spawnMissileBlast: vi.fn(),
    isGameOverActive: vi.fn(() => false),
    triggerGameOver: vi.fn(),
  };
  return { scene: scene as any, collider, overlap, existing, rectangle };
}

function projectileMock() {
  return {
    active: true,
    x: 10,
    y: 20,
    body: { enable: true },
    setActive: vi.fn(function (this: unknown) { return this; }),
    setVisible: vi.fn(function (this: unknown) { return this; }),
    setData: vi.fn(function (this: unknown) { return this; }),
    getData: vi.fn(() => 1),
  };
}

async function loadCollisionRegistry() {
  vi.stubGlobal('HTMLVideoElement', class HTMLVideoElement {});
  vi.stubGlobal('HTMLCanvasElement', class HTMLCanvasElement {});
  return import('../collisions/CollisionRegistry');
}

describe('CollisionRegistry', () => {
  it('registers the expected core colliders and overlaps without tilemap layer', async () => {
    const { CollisionRegistry } = await loadCollisionRegistry();
    const { scene, collider, overlap, existing, rectangle } = createSceneMock();

    new CollisionRegistry(scene).registerCore();

    expect(collider).toHaveBeenCalledTimes(4);
    expect(overlap).toHaveBeenCalledTimes(12);
    expect(existing).toHaveBeenCalledTimes(1);
    expect(rectangle).toHaveBeenCalledWith(WORLD_WIDTH / 2, WORLD_HEIGHT + 80, WORLD_WIDTH, 40, 0xff0000, 0);
  });

  it('adds tile-layer collision hooks when a ground layer exists', async () => {
    const { CollisionRegistry } = await loadCollisionRegistry();
    const { scene, collider, overlap } = createSceneMock({ withGroundLayer: true });

    new CollisionRegistry(scene).registerCore();

    expect(collider).toHaveBeenCalledTimes(8);
    expect(overlap).toHaveBeenCalledTimes(17);
  });

  it('registers moving platform collision separately', async () => {
    const { CollisionRegistry } = await loadCollisionRegistry();
    const { scene, collider, overlap } = createSceneMock();

    new CollisionRegistry(scene).registerMovingPlatforms();

    expect(collider).toHaveBeenCalledWith(scene.player, scene.movingPlatforms);
    expect(overlap).not.toHaveBeenCalled();
  });

  it('void death callback triggers game over only when gate allows it', async () => {
    const { CollisionRegistry } = await loadCollisionRegistry();
    const { scene, overlap } = createSceneMock();

    new CollisionRegistry(scene).registerCore();
    const voidOverlap = overlap.mock.calls[overlap.mock.calls.length - 1];
    const callback = voidOverlap?.[2] as () => void;

    callback();
    expect(scene.triggerGameOver).toHaveBeenCalledTimes(1);

    scene.isGameOverActive.mockReturnValue(true);
    callback();
    expect(scene.triggerGameOver).toHaveBeenCalledTimes(1);
  });

  it('drone bullet overlap disables the bullet and damages the player', async () => {
    const { CollisionRegistry } = await loadCollisionRegistry();
    const { scene, overlap } = createSceneMock();

    new CollisionRegistry(scene).registerCore();
    const call = overlap.mock.calls.find(([a, b]) => a === scene.droneBullets && b === scene.player);
    const callback = call?.[2] as (player: unknown, bullet: unknown) => void;
    const bullet = projectileMock();

    callback(scene.player, bullet);

    expect(bullet.setActive).toHaveBeenCalledWith(false);
    expect(bullet.setVisible).toHaveBeenCalledWith(false);
    expect(bullet.body.enable).toBe(false);
    expect(scene.player.takeDamage).toHaveBeenCalledWith(1);
  });

  it('projectile interception disables both player shot and boss projectile', async () => {
    const { CollisionRegistry } = await loadCollisionRegistry();
    const { scene, overlap } = createSceneMock();

    new CollisionRegistry(scene).registerCore();
    const call = overlap.mock.calls.find(([a, b]) => a === scene.playerBullets && b === scene.bossProjectiles);
    const callback = call?.[2] as (bullet: unknown, projectile: unknown) => void;
    const bullet = projectileMock();
    const bossProjectile = projectileMock();

    callback(bullet, bossProjectile);

    expect(bullet.setActive).toHaveBeenCalledWith(false);
    expect(bossProjectile.setActive).toHaveBeenCalledWith(false);
    expect(scene.spawnBulletImpact).toHaveBeenCalledWith(10, 20, 'enemy');
  });
});
