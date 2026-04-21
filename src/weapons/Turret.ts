import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

const SPEED = 700;
const SPREAD_DEG = 2.2;   // per-shot angular jitter to avoid laser-beam look
const HITSTOP_MS = 24;    // brief physics freeze for impact weight

export class Turret {
  private scene: GameScene;
  private lastFire = 0;

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  getCooldownProgress(time: number): number {
    const elapsed = time - this.lastFire;
    return Math.min(1, elapsed / this.scene.player.turretCooldownMs);
  }

  fire(fromX: number, fromY: number, toX: number, toY: number, time: number): void {
    if (time - this.lastFire < this.scene.player.turretCooldownMs) return;
    this.lastFire = time;

    const baseAngle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    const jitter = Phaser.Math.DegToRad(Phaser.Math.FloatBetween(-SPREAD_DEG, SPREAD_DEG));
    const angle = baseAngle + jitter;
    const vx = Math.cos(angle) * SPEED;
    const vy = Math.sin(angle) * SPEED;

    const b = this.scene.playerBullets.get(fromX, fromY - 100, 'bullet-turret') as Phaser.Physics.Arcade.Image;
    if (!b) return;

    b.setActive(true).setVisible(true).setDepth(15);
    b.setBlendMode(Phaser.BlendModes.ADD);
    b.setRotation(angle);
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
    b.setVelocity(vx, vy);

    this.spawnTrail(b, 0xff6600);
    this.spawnMuzzleFlash(fromX, fromY - 100, angle);

    this.scene.cameras.main.shake(80, 0.006);
    this.scene.audio.play('turret');
    this.applyHitStop();
  }

  private spawnTrail(bullet: Phaser.Physics.Arcade.Image, tint: number): void {
    const emitter = this.scene.add.particles(0, 0, 'pixel', {
      follow: bullet,
      speed: { min: 0, max: 30 },
      scale: { start: 2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint,
      lifespan: 150,
      frequency: 15,
      blendMode: 'ADD',
      quantity: 2,
    });
    emitter.setDepth(14);

    const cleanup = () => {
      if (!bullet.active) {
        emitter.destroy();
        this.scene.events.off('postupdate', cleanup);
      }
    };
    this.scene.events.on('postupdate', cleanup);
  }

  private spawnMuzzleFlash(x: number, y: number, angle: number): void {
    const emitter = this.scene.add.particles(x, y, 'pixel', {
      speed: { min: 120, max: 260 },
      angle: {
        min: Phaser.Math.RadToDeg(angle) - 18,
        max: Phaser.Math.RadToDeg(angle) + 18,
      },
      scale: { start: 3.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xfff0a0, 0xff9933, 0xff6600],
      lifespan: 110,
      blendMode: 'ADD',
      emitting: false,
    });
    emitter.setDepth(16);
    emitter.explode(10);
    this.scene.time.delayedCall(180, () => emitter.destroy());
  }

  private applyHitStop(): void {
    // Pause physics for a few frames so the shot lands with weight.
    // scene.time.delayedCall keeps ticking even while physics is paused.
    const world = this.scene.physics.world;
    if (world.isPaused) return;
    world.pause();
    this.scene.time.delayedCall(HITSTOP_MS, () => {
      if (this.scene.physics.world.isPaused) this.scene.physics.world.resume();
    });
  }
}
