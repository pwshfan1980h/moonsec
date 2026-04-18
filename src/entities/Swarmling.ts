import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Carrier } from './Carrier';

type SwarmState = 'HARASS' | 'RECALL' | 'DOCKED' | 'DEATH';

const HARASS_SPEED  = 180;
const RECALL_SPEED  = 240;
const DOCK_RADIUS   = 24;   // px from carrier to dock
const SIN_AMP       = 50;   // vertical weave amplitude
const COLLIDE_DAMAGE = 1;

// Small darting enemy deployed by the Carrier. Weaves toward the player,
// damages on contact, recalls home when the Carrier signals, and docks
// invisibly until the next deploy cycle.
export class Swarmling extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private swarmState: SwarmState = 'HARASS';
  private hp = 1;
  private sinOffset = Math.random() * Math.PI * 2;
  private carrier: Carrier | null;
  private hasHit = false;

  constructor(scene: GameScene, x: number, y: number, carrier: Carrier) {
    super(scene, x, y, 'drone-red');
    this.scene = scene;
    this.carrier = carrier;

    this.setScale(1.1);
    this.setTint(0xffaa55);
    this.setDepth(9);
    this.play('drone-red-attack');
  }

  getCarrier(): Carrier | null { return this.carrier; }

  onCarrierDeath(): void {
    // Released — carrier ref nulled so we continue harassing until shot down
    this.carrier = null;
    if (this.swarmState === 'DOCKED') {
      this.setVisible(true).setActive(true);
      if (this.body) (this.body as Phaser.Physics.Arcade.Body).enable = true;
      this.swarmState = 'HARASS';
    } else if (this.swarmState === 'RECALL') {
      this.swarmState = 'HARASS';
    }
  }

  recall(): void {
    if (this.swarmState === 'HARASS') this.swarmState = 'RECALL';
  }

  isDocked(): boolean { return this.swarmState === 'DOCKED'; }
  isDead():   boolean { return this.swarmState === 'DEATH'; }

  deployFrom(x: number, y: number): void {
    this.setPosition(x, y);
    this.setVisible(true).setActive(true);
    if (this.body) (this.body as Phaser.Physics.Arcade.Body).enable = true;
    this.swarmState = 'HARASS';
    this.hasHit = false;
  }

  update(time: number, _delta: number): void {
    if (!this.active || this.swarmState === 'DEATH') return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    if (this.swarmState === 'DOCKED') {
      // Stay pinned to carrier
      if (this.carrier && this.carrier.active) {
        this.setPosition(this.carrier.x, this.carrier.y);
      }
      body.setVelocity(0, 0);
      return;
    }

    if (this.swarmState === 'RECALL') {
      if (!this.carrier || !this.carrier.active) {
        this.swarmState = 'HARASS';
      } else {
        const dx = this.carrier.x - this.x;
        const dy = this.carrier.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < DOCK_RADIUS) {
          this.swarmState = 'DOCKED';
          this.setVisible(false);
          body.setVelocity(0, 0);
          this.carrier.notifyDocked(this);
          return;
        }
        const angle = Math.atan2(dy, dx);
        body.setVelocity(Math.cos(angle) * RECALL_SPEED, Math.sin(angle) * RECALL_SPEED);
        this.setFlipX(dx < 0);
        return;
      }
    }

    // HARASS: weave toward player
    const target = this.scene.getPlayerPos();
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const angle = Math.atan2(dy, dx);
    const vx = Math.cos(angle) * HARASS_SPEED;
    const vy = Math.sin(angle) * HARASS_SPEED + Math.sin(time * 0.006 + this.sinOffset) * SIN_AMP;
    body.setVelocity(vx, vy);
    this.setFlipX(dx < 0);
  }

  onHitPlayer(player: Phaser.Physics.Arcade.Sprite & { takeDamage: (n: number) => void }): void {
    if (this.hasHit || this.swarmState !== 'HARASS') return;
    this.hasHit = true;
    player.takeDamage(COLLIDE_DAMAGE);
    this.scene.cameras.main.shake(60, 0.004);
    // Swarmling dies on contact (kamikaze) — adds pressure on player to shoot them first
    this.die();
  }

  takeDamage(amount: number): void {
    if (this.swarmState === 'DEATH') return;
    this.hp -= amount;
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.swarmState = 'DEATH';
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) { body.setVelocity(0, 0); body.enable = false; }

    this.scene.spawnExplosion(this.x, this.y);
    this.scene.audio.playAt('hit', { rate: 1.4, detune: 300, volume: 0.3 });

    if (this.carrier && this.carrier.active) {
      this.carrier.notifyLost(this);
    }

    this.scene.events.emit('droneKilled', this.x, this.y);
    this.setActive(false).setVisible(false);
    this.scene.time.delayedCall(80, () => this.destroy());
  }
}
