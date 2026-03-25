import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

type CrawlerState = 'PATROL' | 'ATTACK' | 'HURT' | 'DEATH';

const HP             = 5;
const MOVE_SPEED     = 70;
const ATTACK_RANGE_H = 420;
const ATTACK_RANGE_V = 300;
const SHOOT_INTERVAL = 2500;
const BULLET_SPEED   = 250;
const PATROL_HALF    = 350;
const RETURN_DIST    = 500;

export class Crawler extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private crawlerState: CrawlerState = 'PATROL';
  private hp = HP;
  private spawnX: number;
  private patrolDir: number;
  private shootTimer = SHOOT_INTERVAL;

  constructor(scene: GameScene, x: number, y: number, dir = -1) {
    super(scene, x, y, 'kodiak');
    this.scene     = scene;
    this.spawnX    = x;
    this.patrolDir = dir;
    this.setOrigin(0.5, 1);
    this.setScale(2.8);
    this.setDepth(8);
    this.play('kodiak-hover');
  }

  // Must be called after physics.add.existing(this)
  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setGravityY(800);
    body.setSize(28, 22, false);
    body.setOffset(5, 8);
    body.setCollideWorldBounds(true);
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.crawlerState === 'DEATH') return;

    const body   = this.body as Phaser.Physics.Arcade.Body;
    const target = this.scene.getPilotOrPlayer();
    const dx     = target.x - this.x;
    const dy     = target.y - this.y;
    const dist   = Math.sqrt(dx * dx + dy * dy);

    switch (this.crawlerState) {
      case 'PATROL': {
        body.setVelocityX(this.patrolDir * MOVE_SPEED);
        this.setFlipX(this.patrolDir > 0);
        if (this.x < this.spawnX - PATROL_HALF) this.patrolDir = 1;
        else if (this.x > this.spawnX + PATROL_HALF) this.patrolDir = -1;
        if (Math.abs(dx) < ATTACK_RANGE_H && Math.abs(dy) < ATTACK_RANGE_V) {
          this.setCrawlerState('ATTACK');
        }
        break;
      }
      case 'ATTACK': {
        body.setVelocityX(0);
        this.setFlipX(dx > 0);
        if (dist > RETURN_DIST) { this.setCrawlerState('PATROL'); break; }
        this.shootTimer -= delta;
        if (this.shootTimer <= 0) {
          this.shootTimer = SHOOT_INTERVAL + Math.random() * 600;
          this.shoot();
        }
        break;
      }
    }
  }

  private shoot(): void {
    const target = this.scene.getPilotOrPlayer();
    const angle  = Phaser.Math.Angle.Between(this.x, this.y - 30, target.x, target.y);
    const b = this.scene.droneBullets.get(this.x, this.y - 30, 'bullet-drone') as Phaser.Physics.Arcade.Image;
    if (!b) return;
    b.setActive(true).setVisible(true).setDepth(14);
    b.setBlendMode(Phaser.BlendModes.ADD);
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
    b.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
    this.scene.audio.play('drone-shoot');
  }

  takeDamage(amount: number): void {
    if (this.crawlerState === 'DEATH' || this.crawlerState === 'HURT') return;
    this.hp -= amount;
    if (this.hp <= 0) this.setCrawlerState('DEATH');
    else this.setCrawlerState('HURT');
  }

  private setCrawlerState(newState: CrawlerState): void {
    if (this.crawlerState === 'DEATH') return;
    this.crawlerState = newState;

    switch (newState) {
      case 'PATROL':
        this.play('kodiak-hover');
        break;
      case 'ATTACK':
        this.play('kodiak-attack');
        break;
      case 'HURT':
        this.play('kodiak-hurt');
        this.setTint(0xff8888);
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.clearTint();
          if (this.crawlerState === 'HURT') this.setCrawlerState('PATROL');
        });
        break;
      case 'DEATH': {
        this.play('kodiak-death');
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.enable = false;
        const emitter = this.scene.add.particles(this.x, this.y - 20, 'pixel', {
          speed: { min: 60, max: 160 }, angle: { min: 0, max: 360 },
          scale: { start: 2.5, end: 0 }, alpha: { start: 1, end: 0 },
          tint: [0xffaa00, 0xff4400, 0xffffff, 0xff6600],
          lifespan: 500, quantity: 10, blendMode: 'ADD',
        });
        emitter.setDepth(20);
        this.scene.time.delayedCall(500, () => emitter.destroy());
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('droneKilled', this.x, this.y);
          this.destroy();
        });
        break;
      }
    }
  }
}
