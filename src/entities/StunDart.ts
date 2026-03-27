import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from './Player';

type DartState = 'APPROACH' | 'CHARGE' | 'HURT' | 'DEATH';

const APPROACH_SPEED = 160;  // idle drift toward player
const CHARGE_SPEED   = 520;  // EMP ram speed
const CHARGE_RANGE   = 340;  // switch to full charge within this range
const EMP_DURATION   = 3000; // ms mech is stunned

export class StunDart extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private dartState: DartState = 'APPROACH';
  private hp = 2;
  private sinOffset: number;
  private chargeDir = { x: 0, y: 0 };

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, 'dart');
    this.scene      = scene;
    this.sinOffset  = Math.random() * Math.PI * 2;
    this.setScale(2.2);
    this.setDepth(8);
    this.setTint(0x44ffee); // cyan tint to distinguish from regular drones
    this.play('dart-hover');
  }

  update(time: number, delta: number): void {
    if (!this.active || this.dartState === 'DEATH') return;

    const body   = this.body as Phaser.Physics.Arcade.Body;
    const target = this.scene.getPilotOrPlayer();
    const dx     = target.x - this.x;
    const dy     = target.y - this.y;
    const dist   = Math.sqrt(dx * dx + dy * dy);

    switch (this.dartState) {
      case 'APPROACH': {
        // Float toward player with sinusoidal weave
        const nx = dx / dist;
        const ny = dy / dist;
        body.setVelocityX(nx * APPROACH_SPEED);
        body.setVelocityY(ny * APPROACH_SPEED + Math.sin(time * 0.003 + this.sinOffset) * 50);
        this.setFlipX(dx > 0);
        if (dist < CHARGE_RANGE) {
          // Lock charge direction and ram
          this.chargeDir = { x: nx, y: ny };
          this.setDartState('CHARGE');
        }
        break;
      }

      case 'CHARGE': {
        // Full-speed ram on locked vector — no course correction
        body.setVelocityX(this.chargeDir.x * CHARGE_SPEED);
        body.setVelocityY(this.chargeDir.y * CHARGE_SPEED);
        // Miss check: if overshot, re-approach
        if (dist > CHARGE_RANGE * 1.8) {
          this.setDartState('APPROACH');
        }
        break;
      }

      case 'HURT': {
        // Slow down during hurt flash
        body.setVelocity(body.velocity.x * 0.7, body.velocity.y * 0.7);
        break;
      }
    }
  }

  /** Called by GameScene overlap when dart hits the player body */
  onHitPlayer(player: Player): void {
    if (this.dartState === 'DEATH' || this.dartState === 'HURT') return;
    player.empStun(EMP_DURATION);
    this.setDartState('DEATH');
  }

  takeDamage(amount: number): void {
    if (this.dartState === 'DEATH' || this.dartState === 'HURT') return;
    this.hp -= amount;
    if (this.hp <= 0) this.setDartState('DEATH');
    else              this.setDartState('HURT');
  }

  private setDartState(newState: DartState): void {
    if (this.dartState === 'DEATH') return;
    this.dartState = newState;

    switch (newState) {
      case 'APPROACH':
        this.play('dart-hover');
        break;
      case 'CHARGE':
        this.play('dart-attack');
        break;
      case 'HURT': {
        this.play('dart-hurt');
        this.setTint(0xffffff);
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.setTint(0x44ffee);
          if (this.dartState === 'HURT') this.setDartState('APPROACH');
        });
        break;
      }
      case 'DEATH': {
        this.play('dart-death');
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        (this.body as Phaser.Physics.Arcade.Body).enable = false;

        // EMP burst particles — cyan/white
        const emitter = this.scene.add.particles(this.x, this.y, 'pixel', {
          speed:     { min: 80, max: 220 },
          angle:     { min: 0, max: 360 },
          scale:     { start: 2.5, end: 0 },
          alpha:     { start: 1, end: 0 },
          tint:      [0x44ffee, 0x0088ff, 0xffffff, 0x00ffcc],
          lifespan:  500,
          quantity:  14,
          blendMode: 'ADD',
        });
        emitter.setDepth(20);
        this.scene.time.delayedCall(500, () => emitter.destroy());

        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('droneKilled', this.x, this.y);
          this.setActive(false).setVisible(false);
        });
        break;
      }
    }
  }
}
