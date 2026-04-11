import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Drone } from './Drone';
import type { DroneScaling } from '../systems/DroneSpawner';
import { GAME_W } from '../constants';

type BossState = 'DRIFT' | 'CHARGE' | 'FIRE' | 'TELEGRAPH' | 'BLAST' | 'HURT' | 'DEATH';

const HP             = 24;
const SCALE          = 5.0;
const DRIFT_SPEED    = 55;
const CHARGE_MS      = 1200;
const DRIFT_MS       = 1800;
const BULLET_SPEED   = 340;
const SPREAD_ANGLES  = [-12, 0, 12] as const;
const ESCORT_RESPAWN = 20000;
const TELEGRAPH_MS   = 3000; // ms of warning before orbital blast fires

export class NexusBoss extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private bossState: BossState = 'DRIFT';
  private hp: number;
  private driftDir = -1;
  private phaseTimer = DRIFT_MS;
  private attackCycle = 0; // increments each CHARGE; every 3rd → orbital blast
  private telegraphSide: 'left' | 'right' = 'left';
  private escortSlots: Array<{ drone: Drone | null; colliders: Phaser.Physics.Arcade.Collider[] }> = [
    { drone: null, colliders: [] },
    { drone: null, colliders: [] },
  ];
  private scaling: DroneScaling;
  private glowAura: Phaser.GameObjects.Graphics | null = null;
  private glowTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: GameScene, x: number, y: number, scaling: DroneScaling) {
    super(scene, x, y, 'sentinel');
    this.scene   = scene;
    this.scaling = scaling;

    this.hp = HP;
    this.setOrigin(0.5, 0.5);
    this.setScale(SCALE);
    this.setDepth(10);
    this.play('sentinel-hover');

    // Pulsing glow aura — additive blend so it blooms over dark backgrounds
    const gfx = scene.add.graphics();
    gfx.setBlendMode(Phaser.BlendModes.ADD);
    gfx.setDepth(9);
    gfx.fillStyle(0xff2200, 0.22);
    gfx.fillCircle(0, 0, 110);
    gfx.fillStyle(0xff4400, 0.18);
    gfx.fillCircle(0, 0, 78);
    gfx.fillStyle(0xff8800, 0.14);
    gfx.fillCircle(0, 0, 50);
    gfx.setPosition(x, y);
    this.glowAura = gfx;
    this.glowTween = scene.tweens.add({
      targets: gfx,
      alpha: { from: 0.55, to: 1.0 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    scene.time.delayedCall(500, () => this.spawnEscort(0));
    scene.time.delayedCall(800, () => this.spawnEscort(1));
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(28, 22, true);
    body.setCollideWorldBounds(true);
  }

  private spawnEscort(slot: number): void {
    if (this.bossState === 'DEATH') return;
    if (!this.active) return;

    for (const col of this.escortSlots[slot].colliders) col.destroy();
    this.escortSlots[slot].colliders = [];

    const dx = slot === 0 ? -120 : 120;
    const escort = new Drone(
      this.scene, this.x + dx, this.y,
      'drone-red', this.scaling, 'normal',
    );
    this.scene.add.existing(escort);
    this.scene.physics.add.existing(escort);
    this.scene.drones.add(escort);

    const body = escort.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    escort.startPatrol(-1);

    const c1 = this.scene.physics.add.overlap(
      this.scene.playerBullets, escort,
      (e, bullet) => {
        const b = bullet as Phaser.Physics.Arcade.Image;
        b.setActive(false).setVisible(false);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
        (e as unknown as Drone).takeDamage(1);
        this.scene.audio.play('hit');
        this.scene.spawnFloatingText((e as Phaser.GameObjects.Sprite).x, (e as Phaser.GameObjects.Sprite).y - 20, '-1', '#ffffff');
      },
    );
    const c2 = this.scene.physics.add.overlap(
      this.scene.missiles, escort,
      (e, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnExplosion(m.x, m.y);
        (e as unknown as Drone).takeDamage(3);
        this.scene.cameras.main.shake(150, 0.01);
        this.scene.audio.play('explosion');
        this.scene.spawnFloatingText((e as Phaser.GameObjects.Sprite).x, (e as Phaser.GameObjects.Sprite).y - 20, '-3', '#ffff00');
      },
    );
    this.escortSlots[slot].colliders = [c1, c2];
    this.escortSlots[slot].drone = escort;

    const checkRespawn = () => {
      if (this.bossState === 'DEATH' || !this.active) return;
      if (!escort.active) {
        this.escortSlots[slot].drone = null;
        this.scene.time.delayedCall(ESCORT_RESPAWN, () => {
          if (this.bossState !== 'DEATH' && this.active) this.spawnEscort(slot);
        });
      } else {
        this.scene.time.delayedCall(1000, checkRespawn);
      }
    };
    this.scene.time.delayedCall(1000, checkRespawn);
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.bossState === 'DEATH') return;
    this.glowAura?.setPosition(this.x, this.y);

    const body = this.body as Phaser.Physics.Arcade.Body;

    switch (this.bossState) {
      case 'DRIFT': {
        body.setVelocityX(this.driftDir * DRIFT_SPEED);
        const camCentreX = this.scene.cameras.main.scrollX + GAME_W / 2;
        if (this.x < camCentreX - 500) this.driftDir = 1;
        if (this.x > camCentreX + 500) this.driftDir = -1;
        this.setFlipX(this.driftDir > 0);

        this.phaseTimer -= delta;
        if (this.phaseTimer <= 0) this.setBossState('CHARGE');
        break;
      }

      case 'CHARGE': {
        body.setVelocityX(0);
        this.phaseTimer -= delta;
        if (this.phaseTimer <= 0) {
          // Every 3rd charge cycle → orbital blast instead of spread fire
          if (this.attackCycle % 3 === 0) {
            this.setBossState('TELEGRAPH');
          } else {
            this.fire();
            this.setBossState('FIRE');
          }
        }
        break;
      }

      case 'FIRE':
      case 'TELEGRAPH':
      case 'BLAST':
        // Transitions handled via delayedCall in setBossState
        break;
    }
  }

  private fire(): void {
    const target = this.scene.getPilotOrPlayer();
    const targetBody = (target as unknown as { body: Phaser.Physics.Arcade.Body }).body;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const travelTime = dist / BULLET_SPEED;
    const vx = targetBody?.velocity?.x ?? 0;
    const vy = targetBody?.velocity?.y ?? 0;
    const predictedX = target.x + vx * travelTime * 0.6;
    const predictedY = target.y + vy * travelTime * 0.3;
    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, predictedX, predictedY);

    for (const offsetDeg of SPREAD_ANGLES) {
      const angle = baseAngle + Phaser.Math.DegToRad(offsetDeg);
      const b = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image;
      if (!b) continue;
      b.setActive(true).setVisible(true).setDepth(14);
      b.setBlendMode(Phaser.BlendModes.ADD);
      const body = b.body as Phaser.Physics.Arcade.Body;
      if (body) {
        body.enable = true;
      }
      b.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
    }

    this.scene.audio.playAt('drone-shoot', { rate: 0.65, detune: -300, volume: 0.55 });
    this.scene.cameras.main.shake(80, 0.005);

    this.scene.time.delayedCall(600, () => {
      if (this.bossState !== 'DEATH') this.setBossState('DRIFT');
    });
  }

  getState(): 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DEATH' {
    if (this.bossState === 'CHARGE' || this.bossState === 'FIRE' ||
        this.bossState === 'TELEGRAPH' || this.bossState === 'BLAST') return 'ATTACK';
    if (this.bossState === 'HURT')  return 'HURT';
    if (this.bossState === 'DEATH') return 'DEATH';
    return 'HOVER';
  }

  takeDamage(amount: number): void {
    if (this.bossState === 'DEATH' || this.bossState === 'HURT') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.setBossState('DEATH');
      return;
    }
    // Don't interrupt telegraph/blast with full hurt stun — just flash
    if (this.bossState === 'TELEGRAPH' || this.bossState === 'BLAST') {
      this.setTint(0xff8888);
      this.scene.time.delayedCall(120, () => this.clearTint());
      return;
    }
    this.setBossState('HURT');
  }

  private setBossState(newState: BossState): void {
    if (this.bossState === 'DEATH') return;
    this.bossState = newState;

    switch (newState) {
      case 'DRIFT':
        this.play('sentinel-hover');
        this.phaseTimer = DRIFT_MS;
        break;

      case 'CHARGE':
        this.play('sentinel-attack');
        this.phaseTimer = CHARGE_MS;
        this.attackCycle++;
        this.scene.audio.playAt('hurt', { rate: 0.5, detune: -200, volume: 0.5 });
        break;

      case 'FIRE':
        this.play('sentinel-attack');
        break;

      case 'TELEGRAPH': {
        this.play('sentinel-attack');
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

        const target = this.scene.getPilotOrPlayer();
        const camMid = this.scene.cameras.main.scrollX + GAME_W / 2;
        this.telegraphSide = target.x < camMid ? 'left' : 'right';

        // UIScene listens for this to show the warning overlay
        this.scene.events.emit('bossTelegraph', { side: this.telegraphSide, duration: TELEGRAPH_MS });

        this.scene.time.delayedCall(TELEGRAPH_MS, () => {
          if (this.bossState === 'TELEGRAPH') this.setBossState('BLAST');
        });
        break;
      }

      case 'BLAST': {
        const camScrollX = this.scene.cameras.main.scrollX;

        // Use the side locked in at telegraph time — recalculating here made escape impossible
        this.scene.events.emit('bossBlastFired', { side: this.telegraphSide, camScrollX });
        this.scene.audio.playAt('explosion', { rate: 0.35, detune: -700, volume: 1.0 });
        this.scene.cameras.main.shake(400, 0.025);

        this.scene.time.delayedCall(700, () => {
          if (this.bossState !== 'DEATH') this.setBossState('DRIFT');
        });
        break;
      }

      case 'HURT':
        this.play('sentinel-hurt');
        this.setTint(0xff8888);
        this.scene.audio.playAt('hurt', { rate: 0.6, detune: -400, volume: 0.85 });
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.clearTint();
          if (this.bossState === 'HURT') this.setBossState('DRIFT');
        });
        break;

      case 'DEATH': {
        this.play('sentinel-death');
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        (this.body as Phaser.Physics.Arcade.Body).enable = false;

        this.glowTween?.stop();
        this.glowAura?.destroy();
        this.glowTween = null;
        this.glowAura = null;

        for (const slot of this.escortSlots) {
          for (const col of slot.colliders) col.destroy();
          slot.colliders = [];
        }

        // Clear any active telegraph
        this.scene.events.emit('bossTelegraphCancel');

        const offsets = [{ x: 0, y: 0 }, { x: -40, y: 20 }, { x: 35, y: -15 }];
        offsets.forEach((off, i) => {
          this.scene.time.delayedCall(i * 150, () => {
            this.scene.spawnExplosion(this.x + off.x, this.y + off.y);
            this.scene.audio.playAt('explosion', { rate: 0.5, detune: -200 - i * 200, volume: 0.9 });
          });
        });
        this.scene.time.delayedCall(400, () => {
          this.scene.audio.playAt('death', { rate: 0.4, detune: -400, volume: 0.7 });
        });

        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('bossKilled', this.x, this.y);
          this.destroy();
        });
        break;
      }
    }
  }
}
