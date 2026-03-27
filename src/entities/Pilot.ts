import Phaser from 'phaser';
import {
  PILOT_WALK_SPEED,
  PILOT_JUMP_VEL,
  PILOT_JETPACK_ACCEL,
  PILOT_JETPACK_MAX_FUEL,
} from '../constants';

export class Pilot extends Phaser.Physics.Arcade.Sprite {
  jetpackFuel = PILOT_JETPACK_MAX_FUEL; // ms remaining; public so UIScene can read it

  private keyA: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private fireCb: ((x: number, y: number, dirX: number) => void) | null = null;
  private gunCooldown = 0;

  setFireCallback(cb: (x: number, y: number, dirX: number) => void): void {
    this.fireCb = cb;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'pilot_sphere');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12);
    body.setCollideWorldBounds(true);
    this.setDepth(11); // Player is depth 10; pilot renders on top

    // A/D support — addKey deduplicates so safe alongside Player's captures
    const kb = scene.input.keyboard!;
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }

  update(
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    space: Phaser.Input.Keyboard.Key,
    delta: number,
  ): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down; // same pattern as Player.ts

    // Horizontal movement — accept both arrow keys and A/D
    const left  = cursors.left.isDown  || this.keyA.isDown;
    const right = cursors.right.isDown || this.keyD.isDown;
    if (left) {
      body.setVelocityX(-PILOT_WALK_SPEED);
      this.setFlipX(true);
    } else if (right) {
      body.setVelocityX(PILOT_WALK_SPEED);
      this.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    // Jump + jetpack — mirrors Player.ts pattern (outer space.isDown, inner JustDown for jump)
    if (space.isDown) {
      if (onGround && Phaser.Input.Keyboard.JustDown(space)) {
        body.setVelocityY(PILOT_JUMP_VEL);
      }
    }

    // Jetpack: acceleration-based to overcome gravity (600 px/s²).
    // Net acceleration = PILOT_JETPACK_ACCEL (-1200) + gravity (600) = -600 px/s² upward.
    const jetpackActive = space.isDown && !onGround && this.jetpackFuel > 0;
    if (jetpackActive) {
      body.setAccelerationY(PILOT_JETPACK_ACCEL);
      this.jetpackFuel = Math.max(0, this.jetpackFuel - delta);
    } else {
      body.setAccelerationY(0);
    }

    // Pilot gun — LMB fires a bullet (300 ms cooldown)
    this.gunCooldown = Math.max(0, this.gunCooldown - delta);
    if (this.scene.input.activePointer.leftButtonDown() && this.gunCooldown <= 0 && this.fireCb) {
      const dirX = this.flipX ? -1 : 1;
      this.fireCb(this.x + dirX * 12, this.y - 2, dirX);
      this.gunCooldown = 300;
    }
  }
}
