import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

type TankState = 'PATROL' | 'ATTACK' | 'SHIELD_BREAK' | 'EXPOSED_ATTACK' | 'HURT' | 'DEATH';

const SHIELD_HP        = 3;
const HULL_HP          = 5;
const MOVE_SPEED       = 50;
const PATROL_HALF      = 350;
const ATTACK_RANGE_H   = 420;
const ATTACK_RANGE_V   = 300;
const RETURN_DIST      = 500;
const SHELL_SPEED      = 180;
const SHELL_RADIUS     = 100; // blast radius for damage check
const TELEGRAPH_MS     = 1200;
const FIRE_INTERVAL_1  = 3500; // ms while shielded
const FIRE_INTERVAL_2  = 2200; // ms once exposed
const RETICLE_COLOR    = 0xff4400;

export class ShieldedTank extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private tankState: TankState = 'PATROL';
  private shieldHp  = SHIELD_HP;
  private hullHp    = HULL_HP;
  private spawnX: number;
  private patrolDir: number;
  private fireTimer = FIRE_INTERVAL_1;
  private shieldGfx: Phaser.GameObjects.Graphics | null;
  private reticleGfx: Phaser.GameObjects.Graphics | null = null;
  private telegraphing = false;

  constructor(scene: GameScene, x: number, y: number, dir = -1) {
    super(scene, x, y, 'kodiak');
    this.scene     = scene;
    this.spawnX    = x;
    this.patrolDir = dir;
    this.setOrigin(0.5, 1);
    this.setScale(3.0);
    this.setDepth(8);
    this.setTint(0x8888ff); // blue-tinted hull
    this.play('kodiak-hover');

    // Shield visual — rendered above tank
    this.shieldGfx = scene.add.graphics();
    this.shieldGfx.setDepth(9);
    this.drawShield(1.0);
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setGravityY(800);
    body.setSize(28, 22, false);
    body.setOffset(5, 8);
    body.setCollideWorldBounds(true);
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.tankState === 'DEATH') return;

    // Keep shield graphic centred on tank
    if (this.shieldHp > 0) this.drawShield(1.0);

    const body   = this.body as Phaser.Physics.Arcade.Body;
    const target = this.scene.getPilotOrPlayer();
    const dx     = target.x - this.x;
    const dy     = target.y - this.y;
    const dist   = Math.sqrt(dx * dx + dy * dy);

    switch (this.tankState) {
      case 'PATROL': {
        body.setVelocityX(this.patrolDir * MOVE_SPEED);
        this.setFlipX(this.patrolDir > 0);
        if (this.x < this.spawnX - PATROL_HALF) this.patrolDir = 1;
        else if (this.x > this.spawnX + PATROL_HALF) this.patrolDir = -1;
        if (Math.abs(dx) < ATTACK_RANGE_H && Math.abs(dy) < ATTACK_RANGE_V) {
          this.setTankState('ATTACK');
        }
        break;
      }
      case 'ATTACK': {
        body.setVelocityX(this.patrolDir * MOVE_SPEED * 0.5); // slower while attacking
        this.setFlipX(dx > 0);
        if (dist > RETURN_DIST) { this.setTankState('PATROL'); break; }
        if (!this.telegraphing) {
          this.fireTimer -= delta;
          if (this.fireTimer <= 0) {
            this.fireTimer = FIRE_INTERVAL_1 + Math.random() * 500;
            this.startArtilleryTelegraph(target.x, target.y);
          }
        }
        break;
      }
      case 'EXPOSED_ATTACK': {
        body.setVelocityX(0);
        this.setFlipX(dx > 0);
        if (!this.telegraphing) {
          this.fireTimer -= delta;
          if (this.fireTimer <= 0) {
            this.fireTimer = FIRE_INTERVAL_2 + Math.random() * 400;
            this.startArtilleryTelegraph(target.x, target.y);
          }
        }
        break;
      }
    }
  }

  private startArtilleryTelegraph(targetX: number, targetY: number): void {
    this.telegraphing = true;
    this.reticleGfx   = this.scene.add.graphics();
    this.reticleGfx.setDepth(15);

    // Animate reticle tracking the player for TELEGRAPH_MS
    let elapsed = 0;
    const event = this.scene.time.addEvent({
      delay: 50,
      repeat: -1,
      callback: () => {
        elapsed += 50;
        if (!this.reticleGfx) { event.remove(); return; }
        const target = this.scene.getPilotOrPlayer();
        this.drawReticle(target.x, target.y, elapsed / TELEGRAPH_MS);
        if (elapsed >= TELEGRAPH_MS) {
          event.remove();
          this.fireArtillery(target.x, target.y);
        }
      },
    });
  }

  private drawReticle(cx: number, cy: number, progress: number): void {
    if (!this.reticleGfx) return;
    this.reticleGfx.clear();
    const alpha = 0.4 + progress * 0.6;
    this.reticleGfx.lineStyle(2, RETICLE_COLOR, alpha);
    this.reticleGfx.strokeCircle(cx, cy, SHELL_RADIUS);
    const ext = SHELL_RADIUS + 12;
    this.reticleGfx.lineBetween(cx - ext, cy, cx + ext, cy);
    this.reticleGfx.lineBetween(cx, cy - ext, cx, cy + ext);
  }

  private fireArtillery(targetX: number, targetY: number): void {
    if (this.reticleGfx) { this.reticleGfx.destroy(); this.reticleGfx = null; }
    this.telegraphing = false;

    const b = this.scene.droneBullets.get(this.x, this.y - 40, 'bullet-drone') as Phaser.Physics.Arcade.Image;
    if (!b) return;
    b.setActive(true).setVisible(true).setDepth(15);
    b.setBlendMode(Phaser.BlendModes.ADD);
    b.setScale(3.0);
    b.setTint(0xff6600);
    b.setData('damage', 2); // artillery deals 2 HP
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;

    const angle = Phaser.Math.Angle.Between(this.x, this.y - 40, targetX, targetY);
    b.setVelocity(Math.cos(angle) * SHELL_SPEED, Math.sin(angle) * SHELL_SPEED);

    this.scene.audio.play('drone-shoot');
  }

  takeDamage(amount: number): void {
    if (this.tankState === 'DEATH' || this.tankState === 'HURT') return;

    if (this.shieldHp > 0) {
      // Damage hits shield only
      this.shieldHp -= amount;
      this.scene.cameras.main.shake(40, 0.003);
      this.flashShield();
      if (this.shieldHp <= 0) {
        this.shieldHp = 0;
        this.setTankState('SHIELD_BREAK');
      }
      return;
    }

    // Shield is gone — hull takes damage
    this.hullHp -= amount;
    if (this.hullHp <= 0) this.setTankState('DEATH');
    else this.setTankState('HURT');
  }

  private flashShield(): void {
    if (!this.shieldGfx) return;
    this.shieldGfx.setAlpha(1);
    this.scene.tweens.add({
      targets: this.shieldGfx,
      alpha: { from: 1, to: 0.2 },
      duration: 80,
      yoyo: true,
      repeat: 1,
    });
  }

  private drawShield(alpha: number): void {
    if (!this.shieldGfx) return;
    this.shieldGfx.clear();
    const cx = this.x;
    const cy = this.y - 30;
    this.shieldGfx.fillStyle(0x4488ff, alpha * 0.18);
    this.shieldGfx.fillCircle(cx, cy, 52);
    this.shieldGfx.lineStyle(3, 0x88bbff, alpha * 0.9);
    this.shieldGfx.strokeCircle(cx, cy, 52);
  }

  private setTankState(newState: TankState): void {
    if (this.tankState === 'DEATH') return;
    this.tankState = newState;

    switch (newState) {
      case 'PATROL':
        this.play('kodiak-hover');
        break;

      case 'ATTACK':
        this.play('kodiak-attack');
        break;

      case 'SHIELD_BREAK': {
        // Pop shield with a flash burst
        this.shieldGfx?.destroy();
        this.shieldGfx = null;
        this.scene.spawnExplosion(this.x, this.y - 30);
        this.scene.cameras.main.shake(180, 0.012);
        this.scene.audio.play('explosion');
        this.clearTint();
        this.fireTimer = FIRE_INTERVAL_2;
        this.scene.time.delayedCall(300, () => {
          if (this.active) this.setTankState('EXPOSED_ATTACK');
        });
        break;
      }

      case 'EXPOSED_ATTACK':
        this.play('kodiak-attack');
        break;

      case 'HURT':
        this.setTint(0xff8888);
        this.scene.time.delayedCall(250, () => {
          if (this.active && this.tankState === 'HURT') {
            this.clearTint();
            const next = this.shieldHp > 0 ? 'ATTACK' : 'EXPOSED_ATTACK';
            this.setTankState(next);
          }
        });
        break;

      case 'DEATH': {
        if (this.reticleGfx) { this.reticleGfx.destroy(); this.reticleGfx = null; }
        if (this.shieldGfx) { this.shieldGfx.destroy(); this.shieldGfx = null; }
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.enable = false;
        // Large explosion for tank
        this.scene.spawnExplosion(this.x, this.y - 20);
        this.scene.time.delayedCall(120, () => {
          if (this.scene?.sys.isActive()) this.scene.spawnExplosion(this.x + 20, this.y - 10);
        });
        this.play('kodiak-death');
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('droneKilled', this.x, this.y);
          this.destroy();
        });
        break;
      }
    }
  }
}
