import Phaser from 'phaser';
import { FlightRoute } from '../systems/FlightNavigation';
import type { GameScene } from '../scenes/GameScene';
import { Drone } from './Drone';
import type { DroneType, DroneVariant } from './Drone';
import type { DroneScaling } from '../systems/DroneSpawner';
import { GAME_W } from '../constants';
import { playJuggernautDeath } from './effects/juggernautDeath';
import type { DamageProfile, Hostile } from '../collisions/HostileCombat';

type BossState = 'DRIFT' | 'CHARGE' | 'FIRE' | 'TELEGRAPH' | 'BLAST' | 'HURT' | 'DEATH';

export type BossType = 'nexus-red' | 'nexus-blue' | 'nexus-violet' | 'nexus-cyan' | 'nexus-core';

export interface BossVariantConfig {
  auraColors: [number, number, number]; // outer / mid / inner fills, additive
  escortType:    DroneType;
  escortVariant: DroneVariant;
  lifeHp: number;   // HP drained per "down" cycle
  scale:  number;
  maxLives?: number;
  escortCount?: number; // default 2
}

export const BOSS_VARIANTS: Record<BossType, BossVariantConfig> = {
  'nexus-red': {
    auraColors: [0xff2200, 0xff4400, 0xff8800],
    escortType: 'drone-red', escortVariant: 'normal',
    lifeHp: 6, scale: 3.0,
  },
  'nexus-blue': {
    auraColors: [0x2244ff, 0x4488ff, 0x88bbff],
    escortType: 'drone-red', escortVariant: 'sniper',
    lifeHp: 6, scale: 3.0,
  },
  'nexus-violet': {
    auraColors: [0x8800ff, 0xaa44ff, 0xcc88ff],
    escortType: 'sentinel', escortVariant: 'normal',
    lifeHp: 8, scale: 3.1,
  },
  'nexus-cyan': {
    auraColors: [0x00aaff, 0x44ccff, 0x88eeff],
    escortType: 'drone-green', escortVariant: 'sniper',
    lifeHp: 8, scale: 3.1,
  },
  'nexus-core': {
    auraColors: [0xff0033, 0xff4400, 0xffaa22],
    escortType: 'drone-red', escortVariant: 'sniper',
    lifeHp: 10, scale: 3.75, maxLives: 4, escortCount: 3,
  },
};

const DEFAULT_MAX_LIVES = 3;
const DRIFT_SPEED    = 33;
const CHARGE_MS      = 1620;
const DRIFT_MS       = 2430;
const BULLET_SPEED   = 204;
const SPREAD_ANGLES  = [-12, 0, 12] as const;
const ESCORT_RESPAWN = 20000;
const TELEGRAPH_MS   = 4050; // ms of warning before orbital blast fires

export class NexusBoss extends Phaser.Physics.Arcade.Sprite implements Hostile {
  declare scene: GameScene;

  // Rapid fire is heavily nerfed against the boss — missiles are primary, turret chips.
  readonly damageProfile: DamageProfile = {
    fromRapid: 0.33, fromTurret: 1, fromMissile: 3,
    chunkTint: 0xff6633, chunkChance: 0.7, chunkCount: 4,
    showDamageText: true, impactAudio: true,
  };

  private bossState: BossState = 'DRIFT';
  private lifeHpMax: number;
  private lifeHp: number;
  private lives: number;
  private flightRoute?: FlightRoute;
  private driftDir = -1;
  private phaseTimer = DRIFT_MS;
  private attackCycle = 0; // increments each CHARGE; every 3rd → orbital blast
  private telegraphSide: 'left' | 'right' = 'left';
  private escortSlots: Array<{ drone: Drone | null; colliders: Phaser.Physics.Arcade.Collider[] }> = [];
  private variant: BossVariantConfig;
  private scaling: DroneScaling;
  private glowAura: Phaser.GameObjects.Graphics | null = null;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private blastRect: Phaser.Geom.Rectangle | null = null;
  private blastOverlay: Phaser.GameObjects.Rectangle | null = null;
  private blastPulse: Phaser.Tweens.Tween | null = null;
  private hurtBorder: Phaser.GameObjects.Graphics | null = null;
  private hurtBorderTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: GameScene, x: number, y: number, scaling: DroneScaling, variant: BossVariantConfig) {
    super(scene, x, y, 'juggernaut');
    this.scene   = scene;
    if (scene.flightNavigation) this.flightRoute = new FlightRoute(scene.flightNavigation, 100, 72);
    this.scaling = scaling;
    this.variant = variant;

    this.lifeHpMax = variant.lifeHp;
    this.lifeHp    = variant.lifeHp;
    this.lives     = variant.maxLives ?? DEFAULT_MAX_LIVES;
    this.setOrigin(0.5, 0.5);
    this.setScale(variant.scale);
    this.setDepth(10);
    this.play('juggernaut-hover');

    const escortCount = variant.escortCount ?? 2;
    for (let i = 0; i < escortCount; i++) {
      this.escortSlots.push({ drone: null, colliders: [] });
    }

    // Pulsing glow aura — additive blend so it blooms over dark backgrounds
    const [c0, c1, c2] = variant.auraColors;
    const gfx = scene.add.graphics();
    gfx.setBlendMode(Phaser.BlendModes.ADD);
    gfx.setDepth(9);
    gfx.fillStyle(c0, 0.22);
    gfx.fillCircle(0, 0, 150);
    gfx.fillStyle(c1, 0.18);
    gfx.fillCircle(0, 0, 108);
    gfx.fillStyle(c2, 0.14);
    gfx.fillCircle(0, 0, 70);
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

    for (let i = 0; i < escortCount; i++) {
      scene.time.delayedCall(500 + i * 300, () => this.spawnEscort(i));
    }
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(60, 40, true);
    body.setCollideWorldBounds(true);
  }

  private spawnEscort(slot: number): void {
    if (this.bossState === 'DEATH') return;
    if (!this.active) return;

    for (const col of this.escortSlots[slot].colliders) col.destroy();
    this.escortSlots[slot].colliders = [];

    // Spread escorts symmetrically around the boss: -120, +120 for 2; -160, 0, +160 for 3.
    const count = this.escortSlots.length;
    const spacing = count >= 3 ? 160 : 120;
    const dx = (slot - (count - 1) / 2) * spacing;
    const safe = this.scene.flightNavigation?.nearestOpen({ x: this.x + dx, y: this.y });
    const escort = new Drone(
      this.scene, safe?.x ?? this.x + dx, safe?.y ?? this.y,
      this.variant.escortType, this.scaling, this.variant.escortVariant,
    );
    this.scene.add.existing(escort);
    this.scene.physics.add.existing(escort);
    this.scene.drones.add(escort);

    const body = escort.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    escort.startPatrol(-1);

    // Escort hit resolution is owned by HostileCombat (reads the escort Drone's profile).
    this.escortSlots[slot].colliders = this.scene.hostileCombat.register(escort);
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
    this.hurtBorder?.setPosition(this.x, this.y);

    const body = this.body as Phaser.Physics.Arcade.Body;

    switch (this.bossState) {
      case 'DRIFT': {
        body.setVelocityX(this.driftDir * DRIFT_SPEED);
        const camCentreX = this.scene.cameras.main.scrollX + GAME_W / 2;
        if (this.x < camCentreX - 500) this.driftDir = 1;
        if (this.x > camCentreX + 500) this.driftDir = -1;
        this.setFlipX(this.driftDir > 0);
        if (this.flightRoute && this.scene.flightNavigation) {
          const player = this.scene.getPlayerPos();
          const goal = this.scene.flightNavigation.firingPosition(this, { x: player.x, y: player.y - 60 }, 350, 100, 72);
          const v = this.flightRoute.steer(this, goal, 120, _time);
          body.setVelocity(v.x, v.y);
        }

        this.phaseTimer -= delta;
        if (this.phaseTimer <= 0) this.setBossState('CHARGE');
        break;
      }

      case 'CHARGE': {
        body.setVelocity(0, 0);
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
    const target = this.scene.getPlayerPos();
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
    this.lifeHp -= amount;

    // Chip damage — just flash, do not enter HURT
    if (this.lifeHp > 0) {
      this.setTint(0xff8888);
      this.scene.time.delayedCall(120, () => this.clearTint());
      return;
    }

    // Life depleted — burn a life or die
    this.lives--;
    if (this.lives <= 0) {
      this.setBossState('DEATH');
      return;
    }
    this.lifeHp = this.lifeHpMax;

    // During TELEGRAPH/BLAST, can't enter HURT mid-sequence — flash instead
    if (this.bossState === 'TELEGRAPH' || this.bossState === 'BLAST') {
      this.setTint(0xff8888);
      this.scene.time.delayedCall(120, () => this.clearTint());
      return;
    }
    this.setBossState('HURT');
  }

  private showHurtBorder(): void {
    this.hideHurtBorder();
    // Border shrinks as lives drop: 3 lives = big, 2 = mid, 1 = tight
    const tierRadius: Record<number, number> = { 3: 155, 2: 115, 1: 80 };
    const r = tierRadius[this.lives] ?? 80;

    const g = this.scene.add.graphics();
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.setDepth(11);
    g.lineStyle(6, 0xffaa22, 1.0);
    g.strokeCircle(0, 0, r);
    g.lineStyle(2, 0xffffff, 0.8);
    g.strokeCircle(0, 0, r + 4);
    g.setPosition(this.x, this.y);
    this.hurtBorder = g;
    this.hurtBorderTween = this.scene.tweens.add({
      targets: g, alpha: { from: 1.0, to: 0.35 },
      duration: 120, yoyo: true, repeat: -1,
    });
  }

  private hideHurtBorder(): void {
    this.hurtBorderTween?.stop(); this.hurtBorderTween = null;
    this.hurtBorder?.destroy();   this.hurtBorder = null;
  }

  private setBossState(newState: BossState): void {
    if (this.bossState === 'DEATH') return;
    this.bossState = newState;

    switch (newState) {
      case 'DRIFT':
        this.play('juggernaut-hover');
        this.phaseTimer = DRIFT_MS;
        break;

      case 'CHARGE':
        this.play('juggernaut-attack');
        this.phaseTimer = CHARGE_MS;
        this.attackCycle++;
        this.scene.audio.playAt('hurt', { rate: 0.5, detune: -200, volume: 0.5 });
        break;

      case 'FIRE':
        this.play('juggernaut-attack');
        break;

      case 'TELEGRAPH': {
        this.play('juggernaut-attack');
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

        // Lock a world-space danger zone from the current camera view.
        // 45% of the view width (10% thinner than a raw half), anchored to
        // the side the player is on at telegraph start. The rectangle does
        // not move with the player after this frame.
        const view = this.scene.cameras.main.worldView;
        const target = this.scene.getPlayerPos();
        this.telegraphSide = target.x < view.centerX ? 'left' : 'right';

        const rectW = view.width * 0.45;
        const rectX = this.telegraphSide === 'left' ? view.x : view.right - rectW;
        this.blastRect = new Phaser.Geom.Rectangle(rectX, view.y, rectW, view.height);

        const overlay = this.scene.add.rectangle(
          rectX + rectW / 2, view.y + view.height / 2,
          rectW, view.height, 0xff0000, 0.28,
        ).setDepth(55);
        this.blastOverlay = overlay;
        this.blastPulse = this.scene.tweens.add({
          targets: overlay,
          alpha: { from: 0.12, to: 0.38 },
          duration: 350, yoyo: true, repeat: -1,
        });

        this.scene.events.emit('bossTelegraph', { side: this.telegraphSide, duration: TELEGRAPH_MS });

        this.scene.time.delayedCall(TELEGRAPH_MS, () => {
          if (this.bossState === 'TELEGRAPH') this.setBossState('BLAST');
        });
        break;
      }

      case 'BLAST': {
        const rect = this.blastRect;
        if (rect) {
          const px = this.scene.getPlayerPos().x;
          if (px >= rect.x && px <= rect.right) {
            this.scene.player.takeDamage(3, this.x);
          }
        }

        this.blastPulse?.stop(); this.blastPulse = null;
        if (this.blastOverlay) {
          const ov = this.blastOverlay;
          ov.setFillStyle(0xff3300, 0.85);
          this.scene.tweens.add({
            targets: ov, alpha: 0, duration: 700, ease: 'Power2',
            onComplete: () => ov.destroy(),
          });
          this.blastOverlay = null;
        }
        this.blastRect = null;

        this.scene.events.emit('bossBlastFired', { side: this.telegraphSide });
        this.scene.audio.playAt('explosion', { rate: 0.35, detune: -700, volume: 1.0 });
        this.scene.cameras.main.shake(400, 0.025);

        this.scene.time.delayedCall(700, () => {
          if (this.bossState !== 'DEATH') this.setBossState('DRIFT');
        });
        break;
      }

      case 'HURT':
        this.play('juggernaut-hurt');
        this.setTint(0xff8888);
        this.showHurtBorder();
        this.scene.audio.playAt('hurt', { rate: 0.6, detune: -400, volume: 0.85 });
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.clearTint();
          this.hideHurtBorder();
          if (this.bossState === 'HURT') this.setBossState('DRIFT');
        });
        break;

      case 'DEATH': {
        this.glowTween?.stop();
        this.glowAura?.destroy();
        this.glowTween = null;
        this.glowAura = null;

        this.blastPulse?.stop(); this.blastPulse = null;
        this.blastOverlay?.destroy(); this.blastOverlay = null;
        this.blastRect = null;

        this.hideHurtBorder();

        for (const slot of this.escortSlots) {
          for (const col of slot.colliders) col.destroy();
          slot.colliders = [];
        }

        this.scene.events.emit('bossTelegraphCancel');

        playJuggernautDeath(this.scene, this, { deathEvent: 'bossKilled' });
        break;
      }
    }
  }
}
