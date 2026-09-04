import { describe, expect, it, vi, afterEach } from 'vitest';
import type { DamageProfile } from '../collisions/HostileCombat';

function createSceneMock() {
  const overlap = vi.fn(() => ({ kind: 'collider' }));
  const scene = {
    playerBullets: { kind: 'playerBullets' },
    missiles: { kind: 'missiles' },
    physics: { add: { overlap } },
    audio: { play: vi.fn() },
    spawnBulletImpact: vi.fn(),
    spawnMissileBlast: vi.fn(),
    spawnEnemyChunks: vi.fn(),
    spawnFloatingText: vi.fn(),
  };
  return { scene: scene as any, overlap };
}

function projectileMock(textureKey = 'bullet-turret') {
  return {
    active: true,
    x: 10,
    y: 20,
    body: { enable: true },
    texture: { key: textureKey },
    setActive: vi.fn(function (this: { active: boolean }, active: boolean) { this.active = active; return this; }),
    setVisible: vi.fn(function (this: unknown) { return this; }),
    setData: vi.fn(function (this: unknown) { return this; }),
  };
}

function hostileMock(overrides: Partial<DamageProfile> = {}) {
  return {
    x: 100,
    y: 200,
    takeDamage: vi.fn(),
    damageProfile: {
      fromRapid: 1, fromTurret: 1, fromMissile: 3,
      chunkTint: 0xabcdef, chunkChance: 0.4, chunkCount: 2,
      showDamageText: true, impactAudio: true,
      ...overrides,
    },
  };
}

async function loadHostileCombat() {
  vi.stubGlobal('HTMLVideoElement', class HTMLVideoElement {});
  vi.stubGlobal('HTMLCanvasElement', class HTMLCanvasElement {});
  return import('../collisions/HostileCombat');
}

describe('HostileCombat', () => {
  afterEach(() => vi.restoreAllMocks());

  it('register() wires bullet + missile overlaps and returns both colliders', async () => {
    const { HostileCombat } = await loadHostileCombat();
    const { scene, overlap } = createSceneMock();
    const hostile = hostileMock();

    const colliders = new HostileCombat(scene).register(hostile as any);

    expect(overlap).toHaveBeenCalledTimes(2);
    expect(overlap).toHaveBeenNthCalledWith(1, scene.playerBullets, hostile, expect.any(Function));
    expect(overlap).toHaveBeenNthCalledWith(2, scene.missiles, hostile, expect.any(Function));
    expect(colliders).toHaveLength(2);
  });

  it('resolves overlaps in either callback order and consumes each projectile once', async () => {
    const { HostileCombat } = await loadHostileCombat();
    const { scene, overlap } = createSceneMock();
    const hostile = hostileMock();
    new HostileCombat(scene).register(hostile as any);
    const bulletHit = (overlap.mock.calls as unknown as Array<[unknown, unknown, (a: unknown, b: unknown) => void]>)[0][2];
    const missileHit = (overlap.mock.calls as unknown as Array<[unknown, unknown, (a: unknown, b: unknown) => void]>)[1][2];
    const bullet = projectileMock();
    bulletHit(bullet, hostile);
    bulletHit(hostile, bullet);
    const missile = projectileMock('bullet-missile');
    missileHit(hostile, missile);
    missileHit(missile, hostile);
    expect(hostile.takeDamage.mock.calls).toEqual([[1], [3]]);
  });

  it('rapid bullets apply fromRapid, other bullets apply fromTurret', async () => {
    const { HostileCombat } = await loadHostileCombat();
    const { scene } = createSceneMock();
    const combat = new HostileCombat(scene);

    const rapidTarget = hostileMock({ fromRapid: 0.5, fromTurret: 1 });
    combat.resolveBullet(rapidTarget as any, projectileMock('bullet-rapid') as any);
    expect(rapidTarget.takeDamage).toHaveBeenCalledWith(0.5);

    const turretTarget = hostileMock({ fromRapid: 0.5, fromTurret: 1 });
    combat.resolveBullet(turretTarget as any, projectileMock('bullet-turret') as any);
    expect(turretTarget.takeDamage).toHaveBeenCalledWith(1);
  });

  it('a bullet hit disables the bullet and plays the full feedback recipe', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // below chunkChance 0.4
    const { HostileCombat } = await loadHostileCombat();
    const { scene } = createSceneMock();
    const hostile = hostileMock();
    const bullet = projectileMock('bullet-turret');

    new HostileCombat(scene).resolveBullet(hostile as any, bullet as any);

    expect(bullet.setActive).toHaveBeenCalledWith(false);
    expect(bullet.body.enable).toBe(false);
    expect(scene.spawnBulletImpact).toHaveBeenCalledWith(10, 20, 'enemy');
    expect(scene.audio.play).toHaveBeenCalledWith('hit');
    expect(scene.spawnEnemyChunks).toHaveBeenCalledWith(10, 20, 0xabcdef, 2);
    expect(scene.spawnFloatingText).toHaveBeenCalledWith(100, 176, '-1', '#ffffff');
  });

  it('silent, chunkless profiles (Mine/Swarmling) skip audio and debris', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // would always pass a positive chance
    const { HostileCombat } = await loadHostileCombat();
    const { scene } = createSceneMock();
    const hostile = hostileMock({ impactAudio: false, chunkChance: 0, showDamageText: false });

    new HostileCombat(scene).resolveBullet(hostile as any, projectileMock() as any);

    expect(scene.audio.play).not.toHaveBeenCalled();
    expect(scene.spawnEnemyChunks).not.toHaveBeenCalled();
    expect(scene.spawnFloatingText).not.toHaveBeenCalled();
    expect(scene.spawnBulletImpact).toHaveBeenCalledTimes(1); // spark still shows
  });

  it('fractional chip damage shows no floating number even when text is enabled', async () => {
    const { HostileCombat } = await loadHostileCombat();
    const { scene } = createSceneMock();
    const boss = hostileMock({ fromRapid: 0.33, showDamageText: true });

    new HostileCombat(scene).resolveBullet(boss as any, projectileMock('bullet-rapid') as any);

    expect(boss.takeDamage).toHaveBeenCalledWith(0.33);
    expect(scene.spawnFloatingText).not.toHaveBeenCalled();
  });

  it('a missile hit flags the missile, applies fromMissile, and detonates with a blast', async () => {
    const { HostileCombat } = await loadHostileCombat();
    const { scene } = createSceneMock();
    const hostile = hostileMock({ fromMissile: 3 });
    const missile = projectileMock('bullet-missile');

    new HostileCombat(scene).resolveMissile(hostile as any, missile as any);

    expect(missile.setData).toHaveBeenCalledWith('hitTarget', true);
    expect(missile.body.enable).toBe(false);
    expect(hostile.takeDamage).toHaveBeenCalledWith(3);
    expect(scene.spawnMissileBlast).toHaveBeenCalledWith(10, 20, { primary: hostile });
    expect(scene.audio.play).toHaveBeenCalledWith('explosion');
    expect(scene.spawnFloatingText).toHaveBeenCalledWith(100, 176, '-3', '#ffff00');
  });
});
