import type Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import type { PPCRound } from '../entities/PPCRound';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';

export class CollisionRegistry {
  constructor(private readonly scene: GameScene) {}

  registerCore(): void {
    this.registerGroundContacts();
    this.registerProjectileGeometry();
    this.registerPlayerDamage();
    this.registerProjectileInterceptions();
    this.registerVoidDeathZone();
  }

  registerMovingPlatforms(): void {
    this.scene.physics.add.collider(this.scene.player, this.scene.movingPlatforms);
  }

  private registerGroundContacts(): void {
    const { physics } = this.scene;

    // Player lands on ground
    physics.add.collider(this.scene.player, this.scene.ground);
    if (this.scene.groundLayer) physics.add.collider(this.scene.player, this.scene.groundLayer);

    // Tanks land on ground
    physics.add.collider(this.scene.tanks, this.scene.ground);
    if (this.scene.groundLayer) physics.add.collider(this.scene.tanks, this.scene.groundLayer);

    // Pickups land on ground
    physics.add.collider(this.scene.pickups, this.scene.ground);
    if (this.scene.groundLayer) physics.add.collider(this.scene.pickups, this.scene.groundLayer);

    // Enemies blocked by geometry
    physics.add.collider(this.scene.drones, this.scene.ground);
    if (this.scene.groundLayer) physics.add.collider(this.scene.drones, this.scene.groundLayer);
  }

  private registerProjectileGeometry(): void {
    const killBullet = (b: unknown) => {
      const bullet = b as Phaser.Physics.Arcade.Image;
      if (!bullet.active) return;
      const ix = bullet.x, iy = bullet.y;
      bullet.setActive(false).setVisible(false);
      if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
      this.scene.spawnBulletImpact(ix, iy, 'geometry');
      this.scene.audio.play('eject');
    };

    const killMissile = (m: unknown) => {
      const missile = m as Phaser.Physics.Arcade.Image;
      if (!missile.active) return;
      missile.setData('hitTarget', true);
      missile.setActive(false).setVisible(false);
      if (missile.body) (missile.body as Phaser.Physics.Arcade.Body).enable = false;
      this.scene.spawnMissileBlast(missile.x, missile.y);
      this.scene.audio.play('explosion');
    };

    const killBulletOnTile = (b: unknown, tile: unknown) => {
      if (!(tile as Phaser.Tilemaps.Tile).collides) return;
      killBullet(b);
    };

    const killMissileOnTile = (m: unknown, tile: unknown) => {
      if (!(tile as Phaser.Tilemaps.Tile).collides) return;
      killMissile(m);
    };

    // Player bullets destroyed by geometry
    this.scene.physics.add.overlap(this.scene.playerBullets, this.scene.ground, killBullet);
    if (this.scene.groundLayer) this.scene.physics.add.overlap(this.scene.playerBullets, this.scene.groundLayer, killBulletOnTile);

    // Drone bullets destroyed by geometry
    this.scene.physics.add.overlap(this.scene.droneBullets, this.scene.ground, killBullet);
    if (this.scene.groundLayer) this.scene.physics.add.overlap(this.scene.droneBullets, this.scene.groundLayer, killBulletOnTile);

    // Boss projectiles destroyed by geometry
    this.scene.physics.add.overlap(this.scene.bossProjectiles, this.scene.ground, killBullet);
    if (this.scene.groundLayer) this.scene.physics.add.overlap(this.scene.bossProjectiles, this.scene.groundLayer, killBulletOnTile);

    // Missiles explode on geometry
    this.scene.physics.add.overlap(this.scene.missiles, this.scene.ground, (m) => killMissile(m));
    if (this.scene.groundLayer) this.scene.physics.add.overlap(this.scene.missiles, this.scene.groundLayer, killMissileOnTile);

    // PPC rounds detonate on geometry
    this.scene.physics.add.overlap(this.scene.ppcRounds, this.scene.ground, (r) => {
      const round = r as PPCRound;
      if (round.active) round.detonate(false);
    });
    if (this.scene.groundLayer) this.scene.physics.add.overlap(this.scene.ppcRounds, this.scene.groundLayer, (r, tile) => {
      if (!(tile as Phaser.Tilemaps.Tile).collides) return;
      const round = r as PPCRound;
      if (round.active) round.detonate(false);
    });
  }

  private registerPlayerDamage(): void {
    // Drone bullets hit player
    this.scene.physics.add.overlap(
      this.scene.droneBullets,
      this.scene.player,
      (playerObj, b) => {
        const bullet = b as Phaser.Physics.Arcade.Image;
        bullet.setActive(false).setVisible(false);
        if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
        const dmg = (bullet.getData('damage') as number | undefined) ?? 1;
        (playerObj as Player).takeDamage(dmg, bullet.x);
        this.scene.cameras.main.shake(80, 0.006);
      },
    );

    // StunDart rams player — EMP stun
    this.scene.physics.add.overlap(
      this.scene.drones,
      this.scene.player,
      (dartObj, playerObj) => {
        const dart = dartObj as { onHitPlayer?: (player: Player) => void };
        if (typeof dart.onHitPlayer !== 'function') return;
        dart.onHitPlayer(playerObj as Player);
      },
    );

    // Boss projectiles hit player
    this.scene.physics.add.overlap(
      this.scene.bossProjectiles,
      this.scene.player,
      (playerObj, projObj) => {
        const p = projObj as Phaser.Physics.Arcade.Image;
        if (!p.active) return;
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
        (playerObj as Player).takeDamage(1, p.x);
        this.scene.cameras.main.shake(100, 0.008);
      },
    );

    // PPC rounds hit player — high damage, big shake, detonate
    this.scene.physics.add.overlap(
      this.scene.ppcRounds,
      this.scene.player,
      (playerObj, roundObj) => {
        const r = roundObj as PPCRound;
        if (!r.active) return;
        (playerObj as Player).takeDamage(3, r.x);
        r.detonate(true);
      },
    );
  }

  private registerProjectileInterceptions(): void {
    // Player bullets destroy boss projectiles
    this.scene.physics.add.overlap(
      this.scene.playerBullets,
      this.scene.bossProjectiles,
      (bullet, proj) => {
        const b = bullet as Phaser.Physics.Arcade.Image;
        const ix = b.x, iy = b.y;
        b.setActive(false).setVisible(false);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
        const p = proj as Phaser.Physics.Arcade.Image;
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnBulletImpact(ix, iy, 'enemy');
        this.scene.audio.play('hit');
      },
    );

    // Missiles are intercepted by boss projectiles
    this.scene.physics.add.overlap(
      this.scene.missiles,
      this.scene.bossProjectiles,
      (missile, projObj) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        const p = projObj as Phaser.Physics.Arcade.Image;
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnMissileBlast(m.x, m.y);
        this.scene.audio.play('explosion');
      },
    );
  }

  private registerVoidDeathZone(): void {
    // All levels — pits and void bottoms both kill.
    const deathY = WORLD_HEIGHT + 80;
    const voidSensor = this.scene.add.rectangle(WORLD_WIDTH / 2, deathY, WORLD_WIDTH, 40, 0xff0000, 0);
    this.scene.physics.add.existing(voidSensor, true);
    this.scene.physics.add.overlap(this.scene.player, voidSensor, () => {
      if (!this.scene.isGameOverActive()) this.scene.triggerGameOver();
    });
  }
}
