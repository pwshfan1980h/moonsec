import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { DroneScaling } from '../systems/DroneSpawner';
import { GAME_W } from '../constants';
import { LineDrone } from './LineDrone';

type MotherState = 'DRIFT' | 'SPAWN_LINE' | 'HURT' | 'REPOSITION' | 'DEATH';

const HP                 = 10;
const SCALE              = 4.0;
const DRIFT_SPEED        = 30;
const HURT_MS            = 400;
const REPOSITION_MS      = 600;
const REPOSITION_DIST    = 300;
const LINE_DRONE_SPEED   = 400;  // px/s — crosses 1920px screen in ~4.8s
const LINE_DRONE_SPACING = 90;
const LINE_Y_OFFSET      = 85;   // px below MotherDrone centre for line spawn row
const INTRO_DELAY_MS     = 1500; // ms before first line timer starts

interface LineConfig {
  spawnInterval:     number;
  maxActiveLines:    number;
  dronesPerLine:     number;
  projectileInterval: number | null;
}

const LINE_CONFIGS: LineConfig[] = [
  { spawnInterval: 3500, maxActiveLines: 1, dronesPerLine: 6, projectileInterval: null  },
  { spawnInterval: 2200, maxActiveLines: 2, dronesPerLine: 7, projectileInterval: null  },
  { spawnInterval: 1600, maxActiveLines: 2, dronesPerLine: 8, projectileInterval: 4000  },
  { spawnInterval: 1000, maxActiveLines: 3, dronesPerLine: 9, projectileInterval: 2000  },
];

export class MotherDrone extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;
  readonly isBoss = true;

  private bossState: MotherState = 'DRIFT';
  private hp = HP;
  private repositionDir: 1 | -1 = 1;
  private activeLines = 0;
  private lineDir: 1 | -1 = 1;
  private lineTimer: Phaser.Time.TimerEvent | null = null;
  private projectileTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: GameScene, x: number, y: number, _scaling: DroneScaling) {
    super(scene, x, y, 'sentinel');
    this.scene = scene;
    this.setScale(SCALE);
    this.setDepth(10);
    this.play('sentinel-hover');
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(28, 22, true);
    body.setCollideWorldBounds(true);
    // Caller must invoke initBody() after add.existing + physics.add.existing — timer starts from that point
    this.scene.time.delayedCall(INTRO_DELAY_MS, () => this.startLineTimer());
  }

  // ── Ramp-up ──────────────────────────────────────────────────────────────────

  private getLineConfig(): LineConfig {
    if (this.hp >= 8) return LINE_CONFIGS[0];
    if (this.hp >= 5) return LINE_CONFIGS[1];
    if (this.hp >= 2) return LINE_CONFIGS[2];
    return LINE_CONFIGS[3];
  }

  private startLineTimer(): void {
    this.lineTimer?.destroy();
    if (this.bossState === 'DEATH') return;
    const cfg = this.getLineConfig();
    this.lineTimer = this.scene.time.addEvent({
      delay: cfg.spawnInterval,
      callback: this.trySpawnLine,
      callbackScope: this,
      loop: true,
    });
  }

  private startProjectileTimer(): void {
    const cfg = this.getLineConfig();
    if (cfg.projectileInterval === null) return;
    this.projectileTimer?.destroy();
    this.projectileTimer = this.scene.time.addEvent({
      delay: cfg.projectileInterval,
      callback: this.fireProjectile,
      callbackScope: this,
      loop: true,
    });
  }

  // ── Line spawning ─────────────────────────────────────────────────────────────

  private trySpawnLine(): void {
    if (this.bossState === 'DEATH' || this.bossState === 'REPOSITION') return;
    const cfg = this.getLineConfig();
    if (this.activeLines >= cfg.maxActiveLines) return;
    this.setBossState('SPAWN_LINE');
  }

  private spawnLine(): void {
    const cfg = this.getLineConfig();
    const cam = this.scene.cameras.main;
    this.lineDir = (this.lineDir * -1) as 1 | -1;
    const dir = this.lineDir;
    const velX = dir * LINE_DRONE_SPEED;
    const startX = dir > 0
      ? cam.scrollX - LINE_DRONE_SPACING * cfg.dronesPerLine
      : cam.scrollX + GAME_W + LINE_DRONE_SPACING * cfg.dronesPerLine;
    const lineY = this.y + LINE_Y_OFFSET;

    this.activeLines++;

    for (let i = 0; i < cfg.dronesPerLine; i++) {
      const x = startX + dir * i * LINE_DRONE_SPACING;
      const ld = new LineDrone(this.scene, x, lineY);
      this.scene.add.existing(ld);
      this.scene.physics.add.existing(ld);
      this.scene.drones.add(ld);
      ld.initBody(velX);

      let c1: Phaser.Physics.Arcade.Collider;
      let c2: Phaser.Physics.Arcade.Collider;

      c1 = this.scene.physics.add.overlap(
        this.scene.playerBullets,
        ld,
        (_bullet_ld, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          ld.die();
        },
      );

      c2 = this.scene.physics.add.overlap(
        this.scene.missiles,
        ld,
        (_missile_ld, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true);
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          this.scene.audio.play('explosion');
          ld.die();
        },
      );

      ld.registerColliders(c1, c2);
    }

    // Decrement activeLines once the last drone has cleared the screen
    const traversalMs = (GAME_W + LINE_DRONE_SPACING * cfg.dronesPerLine * 2) / LINE_DRONE_SPEED * 1000;
    this.scene.time.delayedCall(traversalMs, () => {
      this.activeLines = Math.max(0, this.activeLines - 1);
    });
  }

  // ── Slow projectiles ──────────────────────────────────────────────────────────

  private fireProjectile(): void {
    if (this.bossState === 'DEATH') return;
    const target = this.scene.getPilotOrPlayer();
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const proj = this.scene.bossProjectiles.get(
      this.x, this.y + 30, 'boss-projectile',
    ) as Phaser.Physics.Arcade.Image | null;
    if (!proj) return;
    proj.setActive(true).setVisible(true).setDepth(12);
    const body = proj.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setAllowGravity(false);
      body.enable = true;
      body.setVelocity(Math.cos(angle) * 80, Math.sin(angle) * 80);
    }
    this.scene.time.delayedCall(15000, () => {
      if (proj.active) {
        proj.setActive(false).setVisible(false);
        if (proj.body) (proj.body as Phaser.Physics.Arcade.Body).enable = false;
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  getState(): 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DEATH' {
    if (this.bossState === 'SPAWN_LINE') return 'ATTACK';
    if (this.bossState === 'HURT')       return 'HURT';
    if (this.bossState === 'DEATH')      return 'DEATH';
    // DRIFT and REPOSITION both appear as HOVER on the minimap — no separate indicator needed
    return 'HOVER';
  }

  takeDamage(amount: number): void {
    if (this.bossState === 'DEATH' || this.bossState === 'HURT' || this.bossState === 'REPOSITION') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.setBossState('DEATH');
      return;
    }
    this.setBossState('HURT');
    this.startLineTimer();
    if (this.hp <= 4 && this.projectileTimer === null) {
      this.startProjectileTimer();
    }
  }

  // ── State machine ─────────────────────────────────────────────────────────────

  private setBossState(newState: MotherState): void {
    if (this.bossState === 'DEATH') return;
    this.bossState = newState;
    const body = this.body as Phaser.Physics.Arcade.Body;

    switch (newState) {
      case 'DRIFT':
        this.play('sentinel-hover');
        body.setVelocityX(DRIFT_SPEED * (Math.random() < 0.5 ? 1 : -1));
        break;

      case 'SPAWN_LINE':
        body.setVelocityX(0);
        this.spawnLine();
        this.scene.time.delayedCall(800, () => {
          if (this.bossState === 'SPAWN_LINE') this.setBossState('DRIFT');
        });
        break;

      case 'HURT':
        this.setTint(0xff8888);
        body.setVelocity(0, 0);
        this.scene.audio.playAt('hurt', { rate: 0.5, detune: -300, volume: 0.8 });
        this.scene.cameras.main.shake(200, 0.015);
        this.scene.time.delayedCall(HURT_MS, () => {
          this.clearTint();
          if (this.bossState === 'HURT') this.setBossState('REPOSITION');
        });
        break;

      case 'REPOSITION': {
        body.setVelocityX(0);
        this.repositionDir = (this.repositionDir * -1) as 1 | -1;
        const camX = this.scene.cameras.main.scrollX;
        const targetX = Phaser.Math.Clamp(
          this.x + this.repositionDir * REPOSITION_DIST,
          camX + 200,
          camX + GAME_W - 200,
        );
        this.scene.tweens.add({
          targets: this,
          x: targetX,
          duration: REPOSITION_MS,
          ease: 'Quad.easeOut',
          onComplete: () => {
            if (this.bossState !== 'DEATH') this.setBossState('SPAWN_LINE');
          },
        });
        break;
      }

      case 'DEATH': {
        body.setVelocity(0, 0);
        body.enable = false;
        this.lineTimer?.destroy();
        this.projectileTimer?.destroy();

        const offsets = [{ x: 0, y: 0 }, { x: -50, y: 25 }, { x: 45, y: -20 }];
        offsets.forEach((off, i) => {
          this.scene.time.delayedCall(i * 180, () => {
            this.scene.spawnExplosion(this.x + off.x, this.y + off.y);
            this.scene.audio.playAt('explosion', {
              rate: 0.5, detune: -200 - i * 200, volume: 0.9,
            });
          });
        });

        this.scene.time.delayedCall(540, () => {
          this.scene.events.emit('bossKilled', this.x, this.y);
          this.destroy();
        });
        break;
      }
    }
  }

  update(_time: number, _delta: number): void {
    if (!this.active || this.bossState === 'DEATH') return;
    if (this.bossState === 'DRIFT') {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const camX = this.scene.cameras.main.scrollX;
      if (this.x < camX + 150)          body.setVelocityX(DRIFT_SPEED);
      if (this.x > camX + GAME_W - 150) body.setVelocityX(-DRIFT_SPEED);
    }
  }
}
