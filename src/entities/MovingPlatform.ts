import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

export class MovingPlatform extends Phaser.Physics.Arcade.Image {
  declare scene: GameScene;

  private readonly startX: number;
  private readonly endX:   number;
  private readonly speed:  number;
  private dir = 1;

  constructor(
    scene: GameScene,
    x: number,
    y: number,
    width:      number = 128,
    travelDist: number = 280,
    speed:      number = 110,
    startRight: boolean = true,
  ) {
    // Draw a platform texture once, reuse key 'moving-platform'
    super(scene, x, y, 'moving-platform');
    this.scene    = scene;
    this.startX   = x;
    this.endX     = x + travelDist;
    this.speed    = speed;
    this.dir      = startRight ? 1 : -1;
    this.x        = startRight ? x : x + travelDist;

    this.setDisplaySize(width, 16).setDepth(4);

    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.setSize(width, 10);
    body.setOffset(0, 3);
  }

  update(_t: number, delta: number): void {
    this.x += this.speed * this.dir * (delta / 1000);
    // Bounce at travel limits
    if (this.x >= this.endX)   this.dir = -1;
    if (this.x <= this.startX) this.dir  =  1;
    // Keep physics body in sync (immovable bodies don't auto-update position)
    (this.body as Phaser.Physics.Arcade.Body).reset(this.x, this.y);
  }
}
