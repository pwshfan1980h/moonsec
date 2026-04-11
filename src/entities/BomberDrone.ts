import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { GAME_W } from '../constants';

const FLY_SPEED    = 240;  // px/s horizontal
const BOMB_RADIUS  = 85;   // px — damage zone radius
const WARN_MS      = 1800; // ms of red indicator before bomb drops

export class BomberDrone extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private flyState: 'FLY' | 'DEATH' = 'FLY';
  private direction: number;          // 1 = flying right, -1 = flying left
  private hasArmed   = false;
  private targetX    = 0;
  private marker: Phaser.GameObjects.Graphics | null = null;
  private hp = 3;
  private groundY = 0;

  constructor(scene: GameScene, x: number, y: number, direction: number) {
    super(scene, x, y, 'kodiak');
    this.scene     = scene;
    this.direction = direction;

    this.setScale(3.0);
    this.setDepth(9);
    this.setTint(0xff8800); // orange — distinct from red drones
    this.play('kodiak-hover');
    this.setFlipX(direction < 0);
  }

  /** Required by MinimapRenderer */
  getState(): 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DEATH' {
    return this.flyState === 'DEATH' ? 'DEATH' : 'HOVER';
  }

  update(_time: number, _delta: number): void {
    if (!this.active || this.flyState === 'DEATH') return;

    (this.body as Phaser.Physics.Arcade.Body).setVelocityX(this.direction * FLY_SPEED);

    // Arm when bomber crosses directly over the player's X position
    if (!this.hasArmed) {
      const target = this.scene.getPilotOrPlayer();
      const crossed = this.direction > 0 ? this.x >= target.x : this.x <= target.x;
      if (crossed) {
        this.hasArmed = true;
        this.targetX  = target.x;
        this.startTelegraph();
      }
    }

    // Despawn after flying well off-screen
    const cam = this.scene.cameras.main;
    if (this.x < cam.scrollX - 500 || this.x > cam.scrollX + GAME_W + 500) {
      this.despawn();
    }
  }

  private startTelegraph(): void {
    this.groundY = this.scene.getApproxGroundY();
    this.scene.debugLog?.log('[BOMB] armed @ x=' + Math.round(this.targetX));
    this.marker = this.scene.add.graphics();
    this.marker.setDepth(15);
    this.drawMarker(1.0);

    // Pulse the marker
    let alpha = 1.0;
    let alphaDir = -1;
    const pulse = this.scene.time.addEvent({
      delay: 75,
      repeat: -1,
      callback: () => {
        if (!this.marker) { pulse.remove(); return; }
        alpha = Phaser.Math.Clamp(alpha + alphaDir * 0.13, 0.25, 1.0);
        if (alpha <= 0.25 || alpha >= 1.0) alphaDir = -alphaDir;
        this.drawMarker(alpha);
      },
    });

    // Drop after warning period
    this.scene.time.delayedCall(WARN_MS, () => {
      pulse.remove();
      if (this.active && this.scene) this.drop();
    });
  }

  private drawMarker(alpha: number): void {
    if (!this.marker) return;
    this.marker.clear();

    const cx = this.targetX;
    const cy = this.groundY - 8;

    // Filled zone
    this.marker.fillStyle(0xff2200, alpha * 0.22);
    this.marker.fillCircle(cx, cy, BOMB_RADIUS);

    // Outer ring
    this.marker.lineStyle(3, 0xff2200, alpha);
    this.marker.strokeCircle(cx, cy, BOMB_RADIUS);

    // Inner ring
    this.marker.lineStyle(1, 0xff6600, alpha * 0.7);
    this.marker.strokeCircle(cx, cy, BOMB_RADIUS * 0.5);

    // Crosshair
    this.marker.lineStyle(2, 0xff4400, alpha * 0.65);
    const ext = BOMB_RADIUS + 18;
    this.marker.lineBetween(cx - ext, cy, cx + ext, cy);
    this.marker.lineBetween(cx, cy - ext, cx, cy + ext);
  }

  private drop(): void {
    this.cleanupMarker();
    const target2 = this.scene.getPilotOrPlayer();
    this.scene.debugLog?.log('[BOMB] drop — in range: ' + (Math.abs(target2.x - this.targetX) < BOMB_RADIUS));

    // Three staggered explosions at drop zone
    const offsets = [{ x: 0, y: -20 }, { x: -28, y: -45 }, { x: 28, y: -45 }];
    offsets.forEach((off, i) => {
      this.scene.time.delayedCall(i * 80, () => {
        if (this.scene?.sys.isActive()) {
          this.scene.spawnExplosion(this.targetX + off.x, this.groundY + off.y);
        }
      });
    });
    this.scene.cameras.main.shake(280, 0.018);
    this.scene.audio.playAt('explosion', { rate: 0.65, detune: -350, volume: 0.9 });

    // Damage if player is in the blast radius
    const dist = Math.abs(this.scene.player.x - this.targetX);
    if (dist < BOMB_RADIUS) {
      this.scene.player.takeDamage(2);
    }
  }

  takeDamage(amount: number): void {
    if (this.flyState === 'DEATH') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.flyState = 'DEATH';
      this.cleanupMarker();
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
      this.play('kodiak-death');
      this.scene.spawnExplosion(this.x, this.y);
      this.scene.audio.play('explosion');
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.scene.events.emit('droneKilled');
        this.setActive(false).setVisible(false);
        this.destroy();
      });
    } else {
      this.setTint(0xffffff);
      this.scene.time.delayedCall(100, () => {
        if (this.active) this.setTint(0xff8800);
      });
    }
  }

  private despawn(): void {
    this.cleanupMarker();
    this.scene.events.emit('droneKilled');
    this.setActive(false).setVisible(false);
    this.destroy();
  }

  private cleanupMarker(): void {
    if (this.marker) {
      this.marker.destroy();
      this.marker = null;
    }
  }
}
