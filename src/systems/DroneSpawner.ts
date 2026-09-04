import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Drone } from '../entities/Drone';
import { ShieldedTank } from '../entities/ShieldedTank';
import { NexusBoss, BOSS_VARIANTS } from '../entities/NexusBoss';
import type { BossType } from '../entities/NexusBoss';
import { StunDart } from '../entities/StunDart';
import { BomberDrone } from '../entities/BomberDrone';
import { Mine } from '../entities/Mine';
import { PPCPlatform } from '../entities/PPCPlatform';
import { Carrier } from '../entities/Carrier';
import type { DroneVariant, DroneType } from '../entities/Drone';
import type { EnemyMix } from '../data/levelConfigs';
import { WORLD_WIDTH, WAVE_BRACKETS, GAME_W, GAME_H, PATROL_LANES } from '../constants';
import { WaveHostileCounter } from './WaveHostileCounter';

export interface DroneScaling {
  attackSpeed: number;
  shootInterval: number;
  extraHp: number;
  bulletSpeedMult: number;
}

const WAVE_DELAY    = 20250;
const SPAWN_STAGGER = 945;

export class DroneSpawner {
  private scene: GameScene;
  waveIndex    = 0;
  private nextWaveTime = 4050;
  private spawning    = false;
  private readonly hostileCounter = new WaveHostileCounter();
  private isBossDead  = false;

  private readonly waveCount: number;
  private readonly bossType:  BossType;
  private readonly enemyMix:  EnemyMix;
  private bossActive = false;
  private readonly onHostileSpawned: (count?: number) => void;
  private readonly onDroneKilled: () => void;
  private readonly onBossKilled: () => void;

  constructor(
    scene:     GameScene,
    waveCount: number,
    bossType:  BossType,
    enemyMix:  EnemyMix,
    startAtBoss = false,
  ) {
    this.scene     = scene;
    this.waveCount = waveCount;
    this.bossType  = bossType;
    this.enemyMix  = enemyMix;
    if (startAtBoss) {
      this.waveIndex = waveCount;
      this.nextWaveTime = 0;
    }

    this.onHostileSpawned = (count = 1) => {
      scene.events.emit('dronesRemaining', this.hostileCounter.add(count));
    };

    this.onDroneKilled = () => {
      const remaining = this.hostileCounter.remove();
      scene.events.emit('hostileKilled');
      scene.events.emit('dronesRemaining', remaining);
      if (remaining === 0 && !this.spawning && this.waveIndex > 0) {
        scene.events.emit('waveCleared', this.waveIndex);
      }
    };

    this.onBossKilled = () => {
      const remaining = this.hostileCounter.remove();
      scene.events.emit('hostileKilled');
      scene.events.emit('dronesRemaining', remaining);
      this.isBossDead = true;
      if (remaining === 0) {
        scene.events.emit('levelComplete');
      }
    };

    scene.events.on('hostileSpawned', this.onHostileSpawned);
    scene.events.on('droneKilled', this.onDroneKilled);
    scene.events.on('bossKilled', this.onBossKilled);
  }

  isBossWave(): boolean { return this.waveIndex > this.waveCount; }

  destroy(): void {
    this.scene.events.off('hostileSpawned', this.onHostileSpawned);
    this.scene.events.off('droneKilled', this.onDroneKilled);
    this.scene.events.off('bossKilled', this.onBossKilled);
  }

  update(time: number, _delta: number): void {
    if (this.spawning || this.isBossDead) return;
    if (this.bossActive) return;   // hold once boss phase begins
    if (this.isBossWave()) return;
    if (time < this.nextWaveTime) return;

    this.nextWaveTime = time + WAVE_DELAY;
    this.spawnWave();
  }

  private spawnWave(): void {
    this.spawning = true;
    this.waveIndex++;
    this.scene.debugLog?.log('[WAVE] Wave ' + this.waveIndex + ' start');

    let bracket = WAVE_BRACKETS[0];
    for (const b of WAVE_BRACKETS) if (this.waveIndex >= b.minWave) bracket = b;

    // After the configured normal waves, trigger the boss phase.
    if (this.waveIndex > this.waveCount) {
      this.scene.events.emit('waveStart', this.waveIndex, this.waveCount, 1);
      this.spawning   = false;
      this.bossActive = true;
      this.spawnBoss();
      return;
    }

    this.spawnNormalWave(bracket);
  }

  // ── Boss spawn ─────────────────────────────────────────────────────────────

  private spawnBoss(): void {
    let bracket = WAVE_BRACKETS[0];
    for (const b of WAVE_BRACKETS) if (this.waveIndex >= b.minWave) bracket = b;

    const camera  = this.scene.cameras.main;
    const camX    = camera.scrollX + GAME_W / 2;
    const camY    = Phaser.Math.Clamp(
      camera.worldView.top + 220,
      180,
      this.scene.getApproxGroundY() - 220,
    );
    const variant = BOSS_VARIANTS[this.bossType];

    const boss = new NexusBoss(this.scene, camX, camY, bracket, variant);
    this.scene.add.existing(boss);
    this.scene.physics.add.existing(boss);
    this.scene.drones.add(boss);
    boss.initBody();
    this.scene.debugLog?.log(`[BOSS] ${this.bossType} spawned`);

    this.scene.hostileCombat.register(boss);

    this.scene.events.emit('dronesRemaining', this.hostileCounter.add());
  }

  // ── Normal wave ────────────────────────────────────────────────────────────

  private spawnNormalWave(bracket: DroneScaling): void {
    const count  = 25 + (this.waveIndex - 1) * 10;
    const MARGIN = 150;
    let spawned  = 0;

    // Pre-roll all per-wave additions so the total drone count is known up front
    // (the UI's wave progress bar uses this as a stable denominator).
    const groundY              = this.scene.getApproxGroundY();
    const hasGround            = groundY < GAME_H;
    const canHaveGroundUnits   = this.enemyMix !== 'aerial';
    const wantsBomber          = this.enemyMix !== 'aerial';
    const plannedMineCount     = (canHaveGroundUnits && this.waveIndex >= 2 && hasGround)
      ? (Math.random() < 0.5 ? 1 : 2)
      : 0;
    const wantsCarrier         = this.waveIndex >= 3 && Math.random() < 0.6;
    const wantsPpc             = this.waveIndex >= 4 && Math.random() < 0.75;
    const tankMixesAllowed: EnemyMix[] = ['balanced', 'ground-heavy', 'elite', 'boss-rush'];
    const plannedTankCount     = (tankMixesAllowed.includes(this.enemyMix) && hasGround)
      ? Math.min(3, 1 + Math.floor((this.waveIndex - 1) / 2))
      : 0;

    const totalDrones = count
      + (wantsBomber ? 1 : 0)
      + plannedMineCount
      + (wantsCarrier ? 1 : 0)
      + (wantsPpc ? 1 : 0)
      + plannedTankCount;

    this.scene.events.emit('waveStart', this.waveIndex, this.waveCount, totalDrones);

    const spawnNext = () => {
      if (spawned >= count) {
        this.spawning = false;
        if (this.hostileCounter.count === 0 && this.waveIndex > 0) {
          this.scene.events.emit('waveCleared', this.waveIndex);
        }
        return;
      }

      const i    = spawned;
      const lane = PATROL_LANES[i % PATROL_LANES.length];
      const cam  = this.scene.cameras.main;
      const vx   = cam.scrollX;
      const vy   = cam.scrollY;

      const roll = Math.random();
      const side = roll < 0.40 ? 0 : roll < 0.80 ? 1 : 2;

      let spawnX: number, spawnY: number;
      if (side === 0) {
        spawnX = Phaser.Math.Clamp(vx - MARGIN, 0, WORLD_WIDTH);
        spawnY = Phaser.Math.Between(vy, vy + GAME_H - 200);
      } else if (side === 1) {
        spawnX = Phaser.Math.Clamp(vx + GAME_W + MARGIN, 0, WORLD_WIDTH);
        spawnY = Phaser.Math.Between(vy, vy + GAME_H - 200);
      } else {
        spawnX = Phaser.Math.Clamp(Phaser.Math.Between(vx, vx + GAME_W), 0, WORLD_WIDTH);
        spawnY = vy - MARGIN;
      }
      spawnY = Phaser.Math.Clamp(spawnY, -200, this.scene.getApproxGroundY() - 50);

      // Enemy mix: aerial suppresses sentinels/stundarts in favour of more drones
      const mix = this.enemyMix;
      const isSentinel = mix !== 'aerial' && this.waveIndex >= 2 && i % 4 === 3;
      const isStunDart = !isSentinel && mix !== 'ground-heavy' && this.waveIndex >= 2 && i % 6 === 5;
      const isSniper   = !isSentinel && !isStunDart && this.waveIndex >= 2 && i % 3 === 2;
      const variant: DroneVariant = (mix === 'elite' || isSniper) ? 'sniper' : 'normal';
      const type: DroneType = isSentinel ? 'sentinel'
        : (i % 2 === 0 ? 'drone-red' : 'drone-green');

      const patrolY      = Math.min(lane, this.scene.getApproxGroundY() - 40);
      const finalSpawnY  = side === 2 ? spawnY : patrolY;

      if (isStunDart) {
        const dart = new StunDart(this.scene, spawnX, finalSpawnY);
        this.scene.add.existing(dart);
        this.scene.physics.add.existing(dart);
        this.scene.drones.add(dart);
        (dart.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.scene.events.emit('dronesRemaining', this.hostileCounter.add());

        this.scene.hostileCombat.register(dart);

        spawned++;
        this.scene.time.delayedCall(SPAWN_STAGGER, spawnNext);
        return;
      }

      const forceHp = isSentinel ? 3 : undefined;
      const drone   = new Drone(this.scene, spawnX, finalSpawnY, type, bracket, variant, forceHp);
      this.scene.add.existing(drone);
      this.scene.physics.add.existing(drone);
      this.scene.drones.add(drone);
      this.scene.events.emit('dronesRemaining', this.hostileCounter.add());

      (drone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      drone.startPatrol(i % 2 === 0 ? -1 : 1);
      if (side === 2) (drone.body as Phaser.Physics.Arcade.Body).setVelocityY(60);

      this.scene.hostileCombat.register(drone);

      spawned++;
      this.scene.time.delayedCall(SPAWN_STAGGER, spawnNext);
    };

    spawnNext();

    // Bomber — skip for aerial-only levels (no bomb zone)
    if (wantsBomber) {
      const cam  = this.scene.cameras.main;
      const dir  = Math.random() < 0.5 ? 1 : -1;
      const bx   = dir > 0
        ? Phaser.Math.Clamp(cam.scrollX - 120, 0, WORLD_WIDTH)
        : Phaser.Math.Clamp(cam.scrollX + GAME_W + 120, 0, WORLD_WIDTH);
      const by   = cam.scrollY + Phaser.Math.Between(Math.round(GAME_H * 0.25), Math.round(GAME_H * 0.55));
      const bomber = new BomberDrone(this.scene, bx, by, dir);
      this.scene.add.existing(bomber);
      this.scene.physics.add.existing(bomber);
      this.scene.drones.add(bomber);
      (bomber.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      this.scene.events.emit('dronesRemaining', this.hostileCounter.add());

      this.scene.hostileCombat.register(bomber);
    }

    // Mines — skip for aerial and void-floor levels (config controls this via groundY)
    if (plannedMineCount > 0) {
      for (let m = 0; m < plannedMineCount; m++) {
          const cam   = this.scene.cameras.main;
          const mineX = Phaser.Math.Between(cam.scrollX + 200, cam.scrollX + GAME_W - 200);
          const mine  = new Mine(this.scene, mineX, groundY);
          this.scene.add.existing(mine);
          this.scene.physics.add.existing(mine);
          this.scene.drones.add(mine);
          mine.initBody();
          this.scene.events.emit('dronesRemaining', this.hostileCounter.add());

          this.scene.hostileCombat.register(mine);
      }
    }

    // Carrier — wave 3+, mothership that deploys swarmlings periodically
    if (wantsCarrier) {
      const cam = this.scene.cameras.main;
      const cx  = Phaser.Math.Clamp(cam.scrollX + GAME_W * 0.65, 300, WORLD_WIDTH - 300);
      const groundY = this.scene.getApproxGroundY();
      const cy  = Phaser.Math.Clamp(groundY - 260, 160, groundY - 180);
      const carrier = new Carrier(this.scene, cx, cy);
      this.scene.add.existing(carrier);
      this.scene.physics.add.existing(carrier);
      this.scene.drones.add(carrier);
      carrier.initBody();
      this.scene.events.emit('dronesRemaining', this.hostileCounter.add());

      this.scene.hostileCombat.register(carrier);
    }

    // PPC Platform — wave 4+, single floating turret at mid-air altitude
    if (wantsPpc) {
      const cam = this.scene.cameras.main;
      const px  = Phaser.Math.Clamp(cam.scrollX + GAME_W * 0.7, 200, WORLD_WIDTH - 200);
      const groundY = this.scene.getApproxGroundY();
      const py  = Phaser.Math.Clamp(groundY - 340, 120, groundY - 200);
      const platform = new PPCPlatform(this.scene, px, py);
      this.scene.add.existing(platform);
      this.scene.physics.add.existing(platform);
      this.scene.drones.add(platform);
      platform.initBody();
      this.scene.events.emit('dronesRemaining', this.hostileCounter.add());

      this.scene.hostileCombat.register(platform);
    }

    // Tanks — ground only
    if (plannedTankCount > 0) {
      const tankCam = this.scene.cameras.main;
      for (let c = 0; c < plannedTankCount; c++) {
          const side   = Math.random() < 0.5 ? -1 : 1;
          const spawnX = side < 0
            ? Phaser.Math.Clamp(tankCam.scrollX - MARGIN, 0, WORLD_WIDTH)
            : Phaser.Math.Clamp(tankCam.scrollX + GAME_W + MARGIN, 0, WORLD_WIDTH);
          const tank = new ShieldedTank(this.scene, spawnX, groundY, side < 0 ? 1 : -1);
          this.scene.add.existing(tank);
          this.scene.physics.add.existing(tank);
          this.scene.tanks.add(tank);
          tank.initBody();
          this.scene.events.emit('dronesRemaining', this.hostileCounter.add());

          this.scene.hostileCombat.register(tank);
      }
    }
  }
}
