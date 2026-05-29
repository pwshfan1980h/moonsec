import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

/**
 * The small bundle of per-enemy combat data a {@link Hostile} exposes so that hit
 * resolution can be uniform. Lives on the entity instance, so variant-specific values
 * — a Drone's chunk colour, a Carrier's rapid-fire resistance — travel with it.
 */
export interface DamageProfile {
  /** HP removed by a rapid-gun bullet (`bullet-rapid`). */
  fromRapid: number;
  /** HP removed by any other player bullet (turret, etc.). */
  fromTurret: number;
  /** HP removed by a missile. */
  fromMissile: number;
  /** Tint of the debris chunks shed on a bullet hit. */
  chunkTint: number;
  /** Probability [0..1] of shedding debris per bullet hit. 0 ⇒ sheds none. */
  chunkChance: number;
  /** Number of debris chunks shed when it does. */
  chunkCount: number;
  /** Whether a floating damage number is shown (still gated on whole-number damage). */
  showDamageText: boolean;
  /** Whether the generic impact SFX plays. Off for hostiles that voice their own (Mine). */
  impactAudio: boolean;
}

/**
 * The enemy-facing combat interface, per CONTEXT.md: the minimum HostileCombat needs to
 * resolve a hit. Every shootable entity implements it.
 */
export interface Hostile {
  readonly damageProfile: DamageProfile;
  takeDamage(amount: number): void;
}

/** A Hostile that is also a positioned sprite — what the overlap callbacks actually receive. */
export type HostileSprite = Phaser.GameObjects.Sprite & Hostile;

/**
 * Owns hit resolution between player weapons and {@link Hostile}s: disabling the spent
 * projectile, reading the {@link DamageProfile}, applying `takeDamage`, and triggering
 * impact feedback (spark, debris, audio, damage number). Concentrates the recipe that was
 * previously copy-pasted across every spawn site.
 *
 * Counterpart to CollisionRegistry, which owns player-facing collisions; HostileCombat
 * owns enemy-facing ones.
 */
export class HostileCombat {
  constructor(private readonly scene: GameScene) {}

  /**
   * Wire player-bullet and missile overlaps for a single Hostile. Returns the colliders
   * so callers that recycle entities (boss escorts) can tear them down.
   */
  register(hostile: HostileSprite): Phaser.Physics.Arcade.Collider[] {
    const bulletCol = this.scene.physics.add.overlap(
      this.scene.playerBullets, hostile,
      (h, bullet) => this.resolveBullet(h as HostileSprite, bullet as Phaser.Physics.Arcade.Image),
    );
    const missileCol = this.scene.physics.add.overlap(
      this.scene.missiles, hostile,
      (h, missile) => this.resolveMissile(h as HostileSprite, missile as Phaser.Physics.Arcade.Image),
    );
    return [bulletCol, missileCol];
  }

  /** Resolve a player bullet striking a Hostile. */
  resolveBullet(hostile: HostileSprite, bullet: Phaser.Physics.Arcade.Image): void {
    const ix = bullet.x, iy = bullet.y;
    this.disable(bullet);

    const p   = hostile.damageProfile;
    const dmg = bullet.texture.key === 'bullet-rapid' ? p.fromRapid : p.fromTurret;
    hostile.takeDamage(dmg);

    this.scene.spawnBulletImpact(ix, iy, 'enemy');
    if (p.impactAudio) this.scene.audio.play('hit');
    if (p.chunkChance > 0 && Math.random() < p.chunkChance) {
      this.scene.spawnEnemyChunks(ix, iy, p.chunkTint, p.chunkCount);
    }
    if (p.showDamageText && dmg >= 1) {
      this.scene.spawnFloatingText(hostile.x, hostile.y - 24, `-${dmg}`, '#ffffff');
    }
  }

  /** Resolve a missile striking a Hostile. */
  resolveMissile(hostile: HostileSprite, missile: Phaser.Physics.Arcade.Image): void {
    missile.setData('hitTarget', true);
    this.disable(missile);

    const p = hostile.damageProfile;
    hostile.takeDamage(p.fromMissile);

    this.scene.spawnMissileBlast(missile.x, missile.y, { primary: hostile });
    if (p.impactAudio) this.scene.audio.play('explosion');
    if (p.showDamageText) {
      this.scene.spawnFloatingText(hostile.x, hostile.y - 24, `-${p.fromMissile}`, '#ffff00');
    }
  }

  private disable(proj: Phaser.Physics.Arcade.Image): void {
    proj.setActive(false).setVisible(false);
    if (proj.body) (proj.body as Phaser.Physics.Arcade.Body).enable = false;
  }
}
