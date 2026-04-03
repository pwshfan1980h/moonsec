import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { GAME_W } from '../constants';

export class LineDrone extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;
  // MinimapRenderer checks this flag — false = render as normal red dot
  readonly isBoss = false;

  private colliders: Phaser.Physics.Arcade.Collider[] = [];

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, 'drone-red');
    this.scene = scene;
    this.setScale(2.42);
    this.setDepth(8);
    this.play('drone-red-hover');
  }

  registerColliders(c1: Phaser.Physics.Arcade.Collider, c2: Phaser.Physics.Arcade.Collider): void {
    this.colliders = [c1, c2];
  }

  private destroyColliders(): void {
    this.colliders.forEach(c => c.destroy());
    this.colliders = [];
  }

  initBody(velocityX: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(18, 14, true);
    body.setVelocityX(velocityX);
    this.setFlipX(velocityX > 0);
  }

  /** Deactivates without emitting droneKilled — does not affect dronesAlive counter. */
  die(): void {
    if (!this.active) return;
    this.destroyColliders();
    const emitter = this.scene.add.particles(this.x, this.y, 'pixel', {
      speed:     { min: 40, max: 100 },
      scale:     { start: 1.5, end: 0 },
      tint:      [0xffaa00, 0xff4400],
      lifespan:  300,
      quantity:  5,
      blendMode: 'ADD',
    });
    this.scene.time.delayedCall(300, () => emitter.destroy());
    this.setActive(false).setVisible(false);
    if (this.body) (this.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  /** Required by MinimapRenderer — always HOVER so it renders as a plain red dot. */
  getState(): 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DEATH' {
    return 'HOVER';
  }

  // game.drones has runChildUpdate: true — this is called every frame
  update(): void {
    if (!this.active) return;
    const cam = this.scene.cameras.main;
    if (this.x < cam.scrollX - 200 || this.x > cam.scrollX + GAME_W + 200) {
      // Off-screen — deactivate silently (no droneKilled, no dronesAlive change)
      this.destroyColliders();
      this.setActive(false).setVisible(false);
      if (this.body) (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }
}
