import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

export class MovingPlatform extends Phaser.Physics.Arcade.Image {
  declare scene: GameScene;

  private readonly axis: 'x' | 'y';
  private readonly minPos: number;
  private readonly maxPos: number;
  private readonly speed:  number;
  private dir = 1;

  constructor(
    scene: GameScene,
    x: number,
    y: number,
    width:      number = 128,
    travelDist: number = 280,
    speed:      number = 110,
    startForward: boolean = true,
    axis:       'x' | 'y' = 'x',
  ) {
    // Draw a platform texture once, reuse key 'moving-platform'
    super(scene, x, y, 'moving-platform');
    this.scene    = scene;
    this.axis     = axis;
    const startPos = axis === 'x' ? x : y;
    const endPos   = startPos + travelDist;
    this.minPos   = Math.min(startPos, endPos);
    this.maxPos   = Math.max(startPos, endPos);
    this.speed    = speed;
    const forwardDir = travelDist >= 0 ? 1 : -1;
    this.dir      = startForward ? forwardDir : -forwardDir;
    if (!startForward) {
      if (axis === 'x') this.x = endPos;
      else this.y = endPos;
    }

    this.setDisplaySize(width, 16).setDepth(4);

    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.setSize(width, 10);
    body.setOffset(0, 3);
  }

  update(_t: number, delta: number): void {
    const next = (this.axis === 'x' ? this.x : this.y) + this.speed * this.dir * (delta / 1000);
    const clamped = Phaser.Math.Clamp(next, this.minPos, this.maxPos);

    if (this.axis === 'x') this.x = clamped;
    else this.y = clamped;

    // Bounce at travel limits.
    if (clamped >= this.maxPos) this.dir = -1;
    if (clamped <= this.minPos) this.dir = 1;
    // Keep physics body in sync (immovable bodies don't auto-update position)
    (this.body as Phaser.Physics.Arcade.Body).reset(this.x, this.y);
  }
}
