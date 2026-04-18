import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { playJuggernautDeath } from './effects/juggernautDeath';
import { PPCRound } from './PPCRound';

const HP_MAX       = 10;
const FIRE_CADENCE = 2500;   // ms between shots (measured from last fire to next charge start)
const CHARGE_MS    = 800;    // muzzle charge-up before round fires
const ROUND_SPEED  = 160;    // px/s — slow enough to sidestep, punishing if you don't
const ROUND_LIFE   = 6000;   // ms before the round auto-detonates
const BARREL_LEN   = 42;
const TINT_BASE    = 0xaa88cc;
const TINT_HURT    = 0xffccee;

// Stationary floating platform with a tracking cannon that fires slow,
// particle-heavy PPC rounds. Shares the Juggernaut death signature on kill.
export class PPCPlatform extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private hp = HP_MAX;
  private isDead = false;
  private fireTimer = 1200;           // initial delay before first shot
  private charging = false;
  private aimAngle = 0;

  private barrel!: Phaser.GameObjects.Graphics;
  private chargeGlow!: Phaser.GameObjects.Graphics;
  private chargeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, 'juggernaut');
    this.scene = scene;

    this.setScale(0.85);
    this.setDepth(10);
    this.setTint(TINT_BASE);
    this.play('juggernaut-hover');

    this.barrel = scene.add.graphics().setDepth(11);
    this.drawBarrel();

    this.chargeGlow = scene.add.graphics()
      .setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(62, 44, true);
  }

  private drawBarrel(): void {
    this.barrel.clear();
    this.barrel.fillStyle(0x554477, 1);
    this.barrel.fillRect(-4, -5, BARREL_LEN, 10);
    this.barrel.lineStyle(1, 0x2a1f44, 1);
    this.barrel.strokeRect(-4, -5, BARREL_LEN, 10);
    this.barrel.fillStyle(0x332244, 1);
    this.barrel.fillRect(BARREL_LEN - 8, -6, 6, 12);
  }

  getState(): 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DEATH' {
    if (this.isDead) return 'DEATH';
    return this.charging ? 'ATTACK' : 'HOVER';
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.isDead) return;

    const target = this.scene.getPlayerPos();
    this.aimAngle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    this.barrel.setPosition(this.x, this.y + 4);
    this.barrel.setRotation(this.aimAngle);
    this.setFlipX(Math.cos(this.aimAngle) < 0);

    if (this.charging) {
      const muzzleX = this.x + Math.cos(this.aimAngle) * BARREL_LEN;
      const muzzleY = this.y + 4 + Math.sin(this.aimAngle) * BARREL_LEN;
      this.chargeGlow.setPosition(muzzleX, muzzleY);
      return;
    }

    this.fireTimer -= delta;
    if (this.fireTimer <= 0) this.startCharge();
  }

  private startCharge(): void {
    if (!this.active || this.isDead) return;
    this.charging = true;

    this.chargeGlow.setVisible(true);
    this.chargeGlow.clear();
    this.chargeGlow.fillStyle(0xcc55ff, 0.85);
    this.chargeGlow.fillCircle(0, 0, 10);
    this.chargeGlow.fillStyle(0xffffff, 0.6);
    this.chargeGlow.fillCircle(0, 0, 5);

    this.chargeTween = this.scene.tweens.add({
      targets: this.chargeGlow,
      alpha: { from: 0.45, to: 1 },
      scale: { from: 0.8, to: 1.4 },
      duration: 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.scene.audio.playAt('hurt', { rate: 0.4, detune: -550, volume: 0.38 });

    this.scene.time.delayedCall(CHARGE_MS, () => {
      if (!this.active || this.isDead) return;
      this.fire();
    });
  }

  private fire(): void {
    const muzzleX = this.x + Math.cos(this.aimAngle) * BARREL_LEN;
    const muzzleY = this.y + 4 + Math.sin(this.aimAngle) * BARREL_LEN;

    const round = new PPCRound(this.scene, muzzleX, muzzleY, this.aimAngle, ROUND_SPEED, ROUND_LIFE);
    this.scene.ppcRounds.add(round);
    this.scene.audio.playAt('explosion', { rate: 0.95, detune: 150, volume: 0.5 });
    this.scene.cameras.main.shake(110, 0.007);

    this.chargeTween?.stop(); this.chargeTween = null;
    this.chargeGlow.setScale(1).setAlpha(1).setVisible(false);
    this.charging = false;
    this.fireTimer = FIRE_CADENCE;
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.die();
      return;
    }
    this.setTint(TINT_HURT);
    this.scene.time.delayedCall(120, () => { if (!this.isDead) this.setTint(TINT_BASE); });
  }

  private die(): void {
    this.isDead = true;
    this.chargeTween?.stop(); this.chargeTween = null;
    this.chargeGlow.destroy();
    this.barrel.destroy();
    this.scene.events.emit('droneKilled', this.x, this.y);
    playJuggernautDeath(this.scene, this, { scale: 0.6 });
  }
}
