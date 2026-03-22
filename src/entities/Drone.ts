import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

type DroneState = 'HOVER' | 'ATTACK' | 'HURT' | 'DEATH';
type DroneType = 'drone-red' | 'drone-green';

const HOVER_SPEED = 70;
const ATTACK_SPEED = 160;
const ATTACK_RANGE = 320;
const SHOOT_INTERVAL = 2200;
const HP_MAP = { 'drone-red': 2, 'drone-green': 3 };
const DRONE_BULLET_SPEED = 300;

export class Drone extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private droneState: DroneState = 'HOVER';
  private hp: number;
  private droneType: DroneType;
  private sinOffset: number;
  private shootTimer = 0;
  private patrolDir = -1;

  constructor(scene: GameScene, x: number, y: number, type: DroneType) {
    super(scene, x, y, type);
    this.scene = scene;
    this.droneType = type;
    this.hp = HP_MAP[type];
    this.sinOffset = Math.random() * Math.PI * 2;
    this.setScale(2.2);
    this.setDepth(8);
    this.play(`${type}-hover`);
  }

  startPatrol(dir: number): void {
    this.patrolDir = dir;
  }

  getState(): DroneState {
    return this.droneState;
  }

  update(time: number, delta: number): void {
    if (!this.active || this.droneState === 'DEATH') return;

    const body = this.body as Phaser.Physics.Arcade.Body;
    const player = this.scene.player;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    switch (this.droneState) {
      case 'HOVER': {
        // Drift left, oscillate Y
        body.setVelocityX(this.patrolDir * HOVER_SPEED);
        body.setVelocityY(Math.sin(time * 0.002 + this.sinOffset) * 40);

        if (dist < ATTACK_RANGE) {
          this.setDroneState('ATTACK');
        }
        break;
      }

      case 'ATTACK': {
        // Charge toward player on X axis, oscillate Y
        const dx = player.x - this.x;
        body.setVelocityX(Math.sign(dx) * ATTACK_SPEED);
        body.setVelocityY(Math.sin(time * 0.003 + this.sinOffset) * 60);

        // Face player
        this.setFlipX(dx > 0);

        // Periodic shot
        this.shootTimer -= delta;
        if (this.shootTimer <= 0) {
          this.shootTimer = SHOOT_INTERVAL + Math.random() * 600;
          this.shoot();
        }

        // Back off if too close
        if (dist > ATTACK_RANGE * 1.4) {
          this.setDroneState('HOVER');
        }
        break;
      }

      case 'HURT': {
        // Handled by animation complete listener
        body.setVelocity(body.velocity.x * 0.7, body.velocity.y * 0.7);
        break;
      }
    }
  }

  private shoot(): void {
    const player = this.scene.player;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);

    const b = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image;
    if (!b) return;

    b.setActive(true).setVisible(true).setDepth(14);
    b.setBlendMode(Phaser.BlendModes.ADD);
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
    b.setVelocity(Math.cos(angle) * DRONE_BULLET_SPEED, Math.sin(angle) * DRONE_BULLET_SPEED);

    this.scene.audio.play('drone-shoot');
  }

  takeDamage(amount: number): void {
    if (this.droneState === 'DEATH' || this.droneState === 'HURT') return;
    this.hp -= amount;

    if (this.hp <= 0) {
      this.setDroneState('DEATH');
    } else {
      this.setDroneState('HURT');
    }
  }

  private setDroneState(newState: DroneState): void {
    if (this.droneState === 'DEATH') return;
    this.droneState = newState;

    switch (newState) {
      case 'HOVER':
        this.play(`${this.droneType}-hover`);
        break;
      case 'ATTACK':
        this.play(`${this.droneType}-attack`);
        break;
      case 'HURT': {
        this.play(`${this.droneType}-hurt`);
        this.setTint(0xff8888);
        // Return to hover/attack after hurt anim
        this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.clearTint();
          this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
          if (this.droneState === 'HURT') this.setDroneState('HOVER');
        });
        break;
      }
      case 'DEATH': {
        this.play(`${this.droneType}-death`);
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        (this.body as Phaser.Physics.Arcade.Body).enable = false;

        this.spawnDeathParticles();

        this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('droneKilled');
          this.setActive(false).setVisible(false);
        });
        break;
      }
    }
  }

  private spawnDeathParticles(): void {
    const emitter = this.scene.add.particles(this.x, this.y, 'pixel', {
      speed: { min: 60, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffaa00, 0xff4400, 0xffffff, 0xff0000],
      lifespan: 500,
      quantity: 10,
      blendMode: 'ADD',
    });
    emitter.setDepth(20);
    this.scene.time.delayedCall(500, () => emitter.destroy());
  }
}
