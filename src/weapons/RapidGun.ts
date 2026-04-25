import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

const FIRE_INTERVAL = 60; // ms between shots
const SPEED = 580; // suppression — slow enough that the player has to lead targets
const SPREAD = 0.06; // radians

export class RapidGun {
  private scene: GameScene;
  private lastFire = 0;
  private lastDryClick = 0;

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  update(time: number, facingRight: boolean): void {
    if (!this.scene.input.mousePointer.rightButtonDown()) return;
    if (time - this.lastFire < this.scene.player.rapidMinInterval) return;

    if (!this.scene.player.consumeRapidAmmo()) {
      // Dry-fire: soft click, rate-limited so holding RMB doesn't machine-gun the sfx
      if (time - this.lastDryClick > 450) {
        this.lastDryClick = time;
        this.scene.audio.playAt('hit', { rate: 0.7, detune: -900, volume: 0.25 });
      }
      return;
    }
    this.lastFire = time;

    const player = this.scene.player;
    const pointer = this.scene.input.mousePointer;
    const worldPt = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const spawnX = player.x + (facingRight ? 45 : -45);
    const spawnY = player.y - 78;
    const baseAngle = Phaser.Math.Angle.Between(spawnX, spawnY, worldPt.x, worldPt.y);
    const angle = baseAngle + (Math.random() - 0.5) * SPREAD;
    const vx = Math.cos(angle) * SPEED;
    const vy = Math.sin(angle) * SPEED;

    const b = this.scene.playerBullets.get(spawnX, spawnY, 'bullet-rapid') as Phaser.Physics.Arcade.Image;
    if (!b) { console.warn('[RapidGun] pool exhausted — no bullet returned'); return; }

    b.setActive(true).setVisible(true).setDepth(15);
    b.setBlendMode(Phaser.BlendModes.ADD);
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
    b.setVelocity(vx, vy);

    // Attach glow trail
    this.spawnTrail(b, 0x00ffff);

    this.scene.audio.play('rapid');
  }

  private spawnTrail(bullet: Phaser.Physics.Arcade.Image, tint: number): void {
    const emitter = this.scene.add.particles(0, 0, 'pixel', {
      follow: bullet,
      speed: { min: 0, max: 20 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint,
      lifespan: 80,
      frequency: 12,
      blendMode: 'ADD',
      quantity: 1,
    });
    emitter.setDepth(14);

    // Clean up emitter when bullet goes inactive
    const cleanup = () => {
      if (!bullet.active) {
        emitter.destroy();
        this.scene.events.off('postupdate', cleanup);
      }
    };
    this.scene.events.on('postupdate', cleanup);
  }
}
