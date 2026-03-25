import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

const FIRE_INTERVAL = 650; // ms between shots
const SPEED = 700;

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

    const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
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

    // Screen shake on fire
    this.scene.cameras.main.shake(80, 0.006);
    this.scene.audio.play('turret');
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
}
