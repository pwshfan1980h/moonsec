import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

// Slow, bright particle projectile fired by the PPC Platform. Dodgeable
// laterally; hits hard (3 HP). Manages its own particle trail and cleanup.
export class PPCRound extends Phaser.Physics.Arcade.Image {
  declare scene: GameScene;
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private lifespanMs: number;
  private age = 0;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: GameScene, x: number, y: number, angle: number, speed: number, lifespanMs = 6000) {
    super(scene, x, y, 'flare');
    this.scene = scene;
    this.lifespanMs = lifespanMs;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(14);
    this.setScale(0.75);
    this.setTint(0xcc55ff);
    this.setBlendMode(Phaser.BlendModes.ADD);
    this.setRotation(angle);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCircle(14, -14, -14);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    this.emitter = scene.add.particles(0, 0, 'flare', {
      follow: this,
      tint: [0xaa22ff, 0xcc66ff, 0xffffff, 0x8844cc],
      speed: { min: 10, max: 50 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: 360,
      frequency: 14,
      quantity: 2,
      blendMode: 'ADD',
    }).setDepth(13);

    this.pulseTween = scene.tweens.add({
      targets: this,
      scale: 0.95,
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  tick(delta: number): void {
    if (!this.active) return;
    this.age += delta;
    if (this.age >= this.lifespanMs) {
      this.detonate(false);
    }
  }

  detonate(bigShake: boolean): void {
    if (!this.active) return;
    this.scene.spawnExplosion(this.x, this.y);
    this.scene.audio.playAt('explosion', { rate: 0.55, detune: -200, volume: bigShake ? 0.8 : 0.5 });
    if (bigShake) this.scene.cameras.main.shake(180, 0.014);
    this.pulseTween?.stop(); this.pulseTween = null;
    this.emitter.stop();
    this.scene.time.delayedCall(400, () => this.emitter.destroy());
    this.setActive(false).setVisible(false);
    if (this.body) (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.destroy();
  }
}
