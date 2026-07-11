import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { DroneScaling } from '../systems/DroneSpawner';
import { flashEnemyHit, presentEnemyArrival, presentEnemyBreakup } from './effects/enemyPresentation';

type DroneState = 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DOWNED' | 'DEATH';
export type DroneType = 'drone-red' | 'drone-green' | 'sentinel';
export type DroneVariant = 'normal' | 'sniper';
type Personality = 'charger' | 'strafer' | 'kiter';

const BASE_HOVER_SPEED      = 110;
const BASE_ATTACK_RANGE     = 320;
const BASE_BULLET_SPEED     = 300;
const HP_MAP                = { 'drone-red': 2, 'drone-green': 3, 'sentinel': 3 };

// Engagement tuning — keep drones mobile instead of parking directly overhead
const STANDOFF_MIN          = 140;   // px: reverse patrol if closer than this on X
const STANDOFF_STRAFE       = 220;   // px: preferred strafer orbit distance
const KITER_BACKOFF         = 260;   // px: kiter retreats when closer than this
const ALTITUDE_MIN_OFFSET   = -120;  // px above player (negative = above)
const ALTITUDE_MAX_OFFSET   =   60;  // px below player
const ALTITUDE_SEEK_SPEED   = 90;    // px/s Y-seek toward preferred altitude
const PERSONALITY_REROLL_MS = 2600;  // how often to re-pick a personality mid-fight

const SNIPER_HP             = 1;
const SNIPER_SCALE          = 1.54;
const SNIPER_HOVER_SPEED    = 40;
const SNIPER_ATTACK_SPEED   = 80;
const SNIPER_ATTACK_RANGE   = 520;
const SNIPER_SHOOT_INTERVAL = 4000;
const SNIPER_BULLET_SPEED   = 480;
const SNIPER_FLEE_RANGE     = 200;

export class Drone extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private droneState: DroneState = 'HOVER';
  private hp: number;
  private droneType: DroneType;
  private droneVariant: DroneVariant;
  private sinOffset: number;
  private shootTimer = 0;
  private patrolDir = -1;

  resilience: number;
  private maxHp = 0;
  private reviveTimer?: Phaser.Time.TimerEvent;
  private reviveIndicator?: Phaser.GameObjects.Text;

  // Instance stats (set per-variant in constructor)
  private attackSpeed: number;
  private shootInterval: number;
  private bulletSpeed: number;
  private attackRange: number;
  private hoverSpeed: number;

  // Behaviour personality — re-rolled periodically during ATTACK
  private personality: Personality = 'charger';
  private altitudeOffset = 0;        // preferred Y relative to player (negative = above)
  private personalityTimer = 0;
  private firingTelegraph = false;

  constructor(
    scene: GameScene,
    x: number,
    y: number,
    type: DroneType,
    scaling: DroneScaling,
    variant: DroneVariant = 'normal',
    forceHp?: number,
    resilience = 0,
  ) {
    super(scene, x, y, type);
    this.scene = scene;
    this.droneType = type;
    this.droneVariant = variant;

    if (variant === 'sniper') {
      this.hp             = SNIPER_HP;
      this.attackSpeed    = SNIPER_ATTACK_SPEED;
      this.shootInterval  = SNIPER_SHOOT_INTERVAL;
      this.bulletSpeed    = SNIPER_BULLET_SPEED;
      this.attackRange    = SNIPER_ATTACK_RANGE;
      this.hoverSpeed     = SNIPER_HOVER_SPEED;
      this.setScale(SNIPER_SCALE);
    } else {
      this.hp             = forceHp !== undefined ? forceHp : HP_MAP[type] + scaling.extraHp;
      this.attackSpeed    = scaling.attackSpeed;
      this.shootInterval  = scaling.shootInterval;
      this.bulletSpeed    = BASE_BULLET_SPEED * scaling.bulletSpeedMult;
      this.attackRange    = BASE_ATTACK_RANGE;
      this.hoverSpeed     = BASE_HOVER_SPEED;
      this.setScale(2.42);
    }

    this.maxHp = this.hp;
    this.resilience = resilience;

    this.sinOffset = Math.random() * Math.PI * 2;
    this.setDepth(8);
    this.play(`${type}-hover`);
    presentEnemyArrival(scene, this, variant === 'sniper' ? 0x44ffee : type === 'drone-green' ? 0x77dd88 : 0xff6655, variant === 'sniper' ? 'sniper' : 'air');

    // Stagger first shot so a spawned wave doesn't fire in unison
    this.shootTimer = Math.random() * this.shootInterval;
    this.rollPersonality();
  }

  private rollPersonality(): void {
    const r = Math.random();
    this.personality = r < 0.5 ? 'charger' : r < 0.82 ? 'strafer' : 'kiter';
    this.altitudeOffset = Phaser.Math.Between(ALTITUDE_MIN_OFFSET, ALTITUDE_MAX_OFFSET);
    this.personalityTimer = PERSONALITY_REROLL_MS + Math.random() * 800;
  }

  startPatrol(dir: number): void {
    this.patrolDir = dir;
  }

  getState(): DroneState {
    return this.droneState;
  }

  update(time: number, delta: number): void {
    if (this.reviveIndicator) {
      this.reviveIndicator.setPosition(this.x, this.y - 50);
    }
    if (!this.active || this.droneState === 'DEATH' || this.droneState === 'DOWNED') return;

    const body   = this.body as Phaser.Physics.Arcade.Body;
    const target = this.scene.getPlayerPos();
    const dist   = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

    switch (this.droneState) {
      case 'HOVER': {
        body.setVelocityX(this.patrolDir * this.hoverSpeed);
        body.setVelocityY(Math.sin(time * 0.002 + this.sinOffset) * 40);

        if (dist < this.attackRange) {
          this.setDroneState('ATTACK');
        }
        break;
      }

      case 'ATTACK': {
        const dx = target.x - this.x;
        const absDx = Math.abs(dx);

        if (this.droneVariant === 'sniper') {
          // Flee if player closes in
          if (dist < SNIPER_FLEE_RANGE) {
            this.setDroneState('FLEE');
            break;
          }
          // Hover in place and shoot from a distance
          body.setVelocityX(0);
          body.setVelocityY(Math.sin(time * 0.002 + this.sinOffset) * 20);
          if (dist > this.attackRange * 1.2) {
            this.setDroneState('HOVER');
            break;
          }
        } else {
          // Periodically re-roll personality so a drone caught directly overhead shifts behaviour
          this.personalityTimer -= delta;
          if (this.personalityTimer <= 0) this.rollPersonality();

          // Horizontal: each personality picks a different engagement style
          let vx = 0;
          switch (this.personality) {
            case 'charger':
              // Close to the player, but if directly overhead peel off laterally
              if (absDx < STANDOFF_MIN) {
                vx = this.patrolDir * this.attackSpeed;
              } else {
                vx = Math.sign(dx) * this.attackSpeed;
              }
              break;
            case 'strafer': {
              // Orbit at STANDOFF_STRAFE — push out if too close, pull in if too far
              const err = absDx - STANDOFF_STRAFE;
              const inward = Math.sign(dx);
              vx = (err > 0 ? inward : -inward) * this.attackSpeed * 0.9;
              // Add lateral drift for side-to-side weave
              vx += this.patrolDir * this.attackSpeed * 0.3;
              break;
            }
            case 'kiter':
              // Retreat if player is close, hold ground otherwise
              if (absDx < KITER_BACKOFF) {
                vx = -Math.sign(dx) * this.attackSpeed;
              } else {
                vx = this.patrolDir * this.attackSpeed * 0.4;
              }
              break;
          }
          body.setVelocityX(vx);

          // Reverse patrol on screen edges (ground / ceiling kept out of it — drones fly)
          if ((this.x < 180 && this.patrolDir < 0) || (this.x > this.scene.physics.world.bounds.width - 180 && this.patrolDir > 0)) {
            this.patrolDir *= -1;
          }

          // Vertical: seek preferred altitude relative to player so they aren't all at one height
          const targetY   = target.y + this.altitudeOffset;
          const vyOffset  = Math.sin(time * 0.003 + this.sinOffset) * 40;
          const vySeek    = Phaser.Math.Clamp((targetY - this.y) * 1.6, -ALTITUDE_SEEK_SPEED, ALTITUDE_SEEK_SPEED);
          body.setVelocityY(vySeek + vyOffset);

          if (dist > this.attackRange * 1.4) {
            this.setDroneState('HOVER');
            break;
          }
        }

        // Face player and shoot
        this.setFlipX(dx > 0);
        this.shootTimer -= delta;
        if (this.shootTimer <= 0) {
          this.shootTimer = this.shootInterval + Math.random() * 600;
          this.shoot();
        }
        break;
      }

      case 'FLEE': {
        // Move away from player
        const dx = this.x - target.x;
        body.setVelocityX(Math.sign(dx) * this.attackSpeed * 1.5);
        body.setVelocityY(Math.sin(time * 0.003 + this.sinOffset) * 30);

        // Shoot while fleeing
        this.shootTimer -= delta;
        if (this.shootTimer <= 0) {
          this.shootTimer = this.shootInterval + Math.random() * 1000;
          this.shoot();
        }

        // Return to attack once safe distance regained
        if (dist > SNIPER_FLEE_RANGE * 1.5) {
          this.setDroneState('ATTACK');
        }
        break;
      }

      case 'HURT': {
        body.setVelocity(body.velocity.x * 0.7, body.velocity.y * 0.7);
        break;
      }
    }
  }

  private shoot(): void {
    const target = this.scene.getPlayerPos();
    const angle  = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);

    if (this.firingTelegraph) return;
    this.firingTelegraph = true;

    const aimLine = this.scene.add.graphics()
      .setDepth(13)
      .setBlendMode(Phaser.BlendModes.ADD);
    aimLine.lineStyle(this.droneVariant === 'sniper' ? 3 : 2, this.droneVariant === 'sniper' ? 0xffcc44 : 0xff5533, 0.72);
    aimLine.lineBetween(this.x, this.y, target.x, target.y);
    aimLine.fillStyle(0xffffff, 0.75);
    aimLine.fillCircle(this.x, this.y, this.droneVariant === 'sniper' ? 6 : 4);

    this.scene.tweens.add({
      targets: aimLine,
      alpha: { from: 0.2, to: 1 },
      duration: 90,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });

    this.scene.time.delayedCall(this.droneVariant === 'sniper' ? 360 : 240, () => {
      this.firingTelegraph = false;
      aimLine.destroy();
      if (!this.active || this.droneState === 'DEATH' || this.droneState === 'DOWNED') return;
      this.fireBullet(angle);
    });
  }

  private fireBullet(angle: number): void {
    const b = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image;
    if (!b) return;

    b.setActive(true).setVisible(true).setDepth(14);
    b.setBlendMode(Phaser.BlendModes.ADD);
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
    b.setVelocity(Math.cos(angle) * this.bulletSpeed, Math.sin(angle) * this.bulletSpeed);

    if (this.droneType === 'sentinel') {
      this.scene.audio.playAt('drone-shoot', { rate: 1.3, detune: 200, volume: 0.3 });
    } else {
      this.scene.audio.play('drone-shoot');
    }
  }

  takeDamage(amount: number): void {
    if (this.droneState === 'DEATH' || this.droneState === 'HURT') return;

    // Downed — shooting a downed enemy directly kills it
    if (this.droneState === 'DOWNED') {
      this.hp -= amount;
      if (this.hp <= 0) this.setDroneState('DEATH');
      return;
    }

    this.hp -= amount;
    if (this.hp <= 0) {
      if (this.resilience > 0) {
        this.resilience--;
        this.setDroneState('DOWNED');
      } else {
        this.setDroneState('DEATH');
      }
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
      case 'FLEE':
        this.play(`${this.droneType}-attack`);
        if (newState === 'ATTACK') {
          this.scene.debugLog?.log('[DRONE] ' + this.droneType + (this.droneVariant === 'sniper' ? '/sniper' : '') + ' → ATTACK');
        }
        break;
      case 'HURT': {
        this.play(`${this.droneType}-hurt`);
        flashEnemyHit(this.scene, this);
        this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.clearTint();
          this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
          if (this.droneState === 'HURT') this.setDroneState('HOVER');
        });
        break;
      }
      case 'DOWNED': {
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        this.setTint(0x888888);

        // Revive indicator dots above enemy (shows remaining revivals)
        const dots = '●'.repeat(this.resilience) + '○';
        this.reviveIndicator = this.scene.add.text(this.x, this.y - 50, dots, {
          fontFamily: 'monospace', fontSize: '10px', color: '#ffaa00',
        }).setDepth(25).setOrigin(0.5);

        // Revive after 4s unless shot dead first
        this.reviveTimer = this.scene.time.delayedCall(4000, () => {
          if (!this.active || this.droneState !== 'DOWNED') return;
          this.reviveIndicator?.destroy();
          this.reviveIndicator = undefined;
          this.hp = Math.ceil(this.maxHp * 0.5);
          this.clearTint();
          this.setTint(0xffffff);
          this.scene.time.delayedCall(200, () => { if (this.active) this.clearTint(); });
          this.setDroneState('HOVER');
        });
        break;
      }
      case 'DEATH': {
        this.play(`${this.droneType}-death`);
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        (this.body as Phaser.Physics.Arcade.Body).enable = false;

        this.reviveTimer?.remove();
        this.reviveIndicator?.destroy();
        this.reviveIndicator = undefined;

        this.scene.spawnExplosion(this.x, this.y);
        presentEnemyBreakup(this.scene, this, this.droneVariant === 'sniper' ? 0x44ffee : 0xff6655, 3);

        this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('droneKilled', this.x, this.y);
          this.setActive(false).setVisible(false);
        });
        break;
      }
    }
  }
}
