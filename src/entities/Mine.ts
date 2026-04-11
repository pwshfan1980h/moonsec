import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

type MineState = 'IDLE' | 'ARMED' | 'DETONATING' | 'DEAD';

const ARM_RADIUS   = 120; // px — proximity arm distance
const FUSE_MS      = 800; // ms from arming to detonation
const BLAST_RADIUS = 90;  // px — damage zone

export class Mine extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private mineState: MineState = 'IDLE';
  private ledGfx: Phaser.GameObjects.Graphics;
  private ledPulse?: Phaser.Tweens.Tween;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, 'pixel');
    this.scene = scene;
    this.setOrigin(0.5, 1);
    this.setScale(6, 4);
    this.setTint(0x445566);
    this.setDepth(8);

    // LED indicator dot above mine
    this.ledGfx = scene.add.graphics();
    this.ledGfx.setDepth(9);
    this.drawLed(0x224433, 0.6); // idle: dim green
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 16, false);
    body.setOffset(0, 0);
    body.setImmovable(true);
  }

  update(_time: number, _delta: number): void {
    if (!this.active || this.mineState === 'DEAD' || this.mineState === 'DETONATING') return;

    // Keep LED centred
    this.drawLed(
      this.mineState === 'ARMED' ? 0xff2200 : 0x224433,
      this.mineState === 'ARMED' ? 1.0 : 0.6,
    );

    const target = this.scene.getPilotOrPlayer();
    const dist   = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

    if (this.mineState === 'IDLE' && dist < ARM_RADIUS) {
      this.setMineState('ARMED');
    }
  }

  /** Called from DroneSpawner bullet overlap — 1 hit destroys (or detonates if armed) */
  takeDamage(_amount: number): void {
    if (this.mineState === 'DEAD' || this.mineState === 'DETONATING') return;
    this.detonate();
  }

  private setMineState(state: MineState): void {
    this.mineState = state;
    switch (state) {
      case 'ARMED':
        // Pulse the LED red
        this.ledPulse = this.scene.tweens.add({
          targets: this.ledGfx,
          alpha: { from: 1, to: 0.2 },
          duration: 300,
          yoyo: true,
          repeat: -1,
        });
        // Detonate after fuse
        this.scene.time.delayedCall(FUSE_MS, () => {
          if (this.active && this.mineState === 'ARMED') this.detonate();
        });
        break;
    }
  }

  private detonate(): void {
    if (this.mineState === 'DEAD' || this.mineState === 'DETONATING') return;
    this.mineState = 'DETONATING';
    this.ledPulse?.destroy();
    this.ledGfx.destroy();

    // Disable body immediately
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;

    this.scene.spawnExplosion(this.x, this.y);
    this.scene.cameras.main.shake(200, 0.014);
    this.scene.audio.play('explosion');

    // Damage check
    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.scene.player.x, this.scene.player.y);
    if (dist < BLAST_RADIUS) {
      this.scene.player.takeDamage(2);
    }

    this.mineState = 'DEAD';
    this.scene.events.emit('droneKilled', this.x, this.y);
    this.setActive(false).setVisible(false);
    this.scene.time.delayedCall(100, () => {
      if (!this.scene?.sys.isActive()) return;
      this.destroy();
    });
  }

  destroy(fromScene?: boolean): void {
    this.ledPulse?.destroy();
    if (this.ledGfx?.active) this.ledGfx.destroy();
    super.destroy(fromScene);
  }

  private drawLed(color: number, alpha: number): void {
    this.ledGfx.clear();
    this.ledGfx.fillStyle(color, alpha);
    this.ledGfx.fillCircle(this.x, this.y - 20, 4);
  }
}
