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
import { GROUND_Y, WORLD_WIDTH, WAVE_BRACKETS, GAME_W, GAME_H, PATROL_LANES } from '../constants';

export interface DroneScaling {
  attackSpeed: number;
  shootInterval: number;
  extraHp: number;
  bulletSpeedMult: number;
}

const WAVE_DELAY    = 15000;
const SPAWN_STAGGER = 700;

export class DroneSpawner {
  private scene: GameScene;
  waveIndex    = 0;
  private nextWaveTime = 3000;
  private spawning    = false;
  private dronesAlive = 0;
  private isBossDead  = false;

  private readonly waveCount: number;
  private readonly bossType:  BossType;
  private readonly enemyMix:  EnemyMix;
  private bossActive = false;

  constructor(
    scene:     GameScene,
    waveCount: number,
    bossType:  BossType,
    enemyMix:  EnemyMix,
  ) {
    this.scene     = scene;
    this.waveCount = waveCount;
    this.bossType  = bossType;
    this.enemyMix  = enemyMix;

    scene.events.on('droneKilled', () => {
      this.dronesAlive = Math.max(0, this.dronesAlive - 1);
      scene.events.emit('dronesRemaining', this.dronesAlive);
      if (this.dronesAlive === 0 && !this.spawning && this.waveIndex > 0) {
        scene.events.emit('waveCleared', this.waveIndex);
      }
    });

    scene.events.on('bossKilled', () => {
      this.dronesAlive = Math.max(0, this.dronesAlive - 1);
      scene.events.emit('dronesRemaining', this.dronesAlive);
      this.isBossDead = true;
      if (this.dronesAlive === 0) {
        scene.events.emit('levelComplete');
      }
    });
  }

  isBossWave(): boolean { return this.waveIndex >= this.waveCount; }

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
    this.scene.events.emit('waveStart', this.waveIndex, this.waveCount);
    this.scene.debugLog?.log('[WAVE] Wave ' + this.waveIndex + ' start');

    let bracket = WAVE_BRACKETS[0];
    for (const b of WAVE_BRACKETS) if (this.waveIndex >= b.minWave) bracket = b;

    // Final wave — trigger boss phase
    if (this.waveIndex >= this.waveCount) {
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

    const camX    = this.scene.cameras.main.scrollX + GAME_W / 2;
    const variant = BOSS_VARIANTS[this.bossType];

    const boss = new NexusBoss(this.scene, camX, 180, bracket, variant);
    this.scene.add.existing(boss);
    this.scene.physics.add.existing(boss);
    this.scene.drones.add(boss);
    boss.initBody();
    this.scene.debugLog?.log(`[BOSS] ${this.bossType} spawned`);

    this.scene.physics.add.overlap(
      this.scene.playerBullets, boss,
      (b, bullet) => {
        const blt = bullet as Phaser.Physics.Arcade.Image;
        const ix = blt.x, iy = blt.y;
        blt.setActive(false).setVisible(false);
        if (blt.body) (blt.body as Phaser.Physics.Arcade.Body).enable = false;
        // Rapid gun heavily nerfed against the boss — missiles are primary,
        // turret still does chip damage, rapid just whittles.
        const dmg = blt.texture.key === 'bullet-rapid' ? 0.33 : 1;
        (b as unknown as NexusBoss).takeDamage(dmg);
        this.scene.spawnBulletImpact(ix, iy, 'enemy');
        this.scene.audio.play('hit');
        if (Math.random() < 0.7) this.scene.spawnEnemyChunks(ix, iy, 0xff6633, 4);
        if (dmg >= 1) {
          this.scene.spawnFloatingText((b as Phaser.GameObjects.Sprite).x, (b as Phaser.GameObjects.Sprite).y - 30, `-${dmg}`, '#ffffff');
        }
      },
    );
    this.scene.physics.add.overlap(
      this.scene.missiles, boss,
      (b, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnExplosion(m.x, m.y);
        (b as unknown as NexusBoss).takeDamage(3);
        this.scene.cameras.main.shake(150, 0.01);
        this.scene.audio.play('explosion');
        this.scene.spawnFloatingText((b as Phaser.GameObjects.Sprite).x, (b as Phaser.GameObjects.Sprite).y - 30, '-3', '#ffff00');
      },
    );

    this.dronesAlive++;
    this.scene.events.emit('dronesRemaining', this.dronesAlive);
  }

  // ── Normal wave ────────────────────────────────────────────────────────────

  private spawnNormalWave(bracket: DroneScaling): void {
    const count  = 25 + (this.waveIndex - 1) * 10;
    const MARGIN = 150;
    let spawned  = 0;

    const spawnNext = () => {
      if (spawned >= count) {
        this.spawning = false;
        if (this.dronesAlive === 0 && this.waveIndex > 0) {
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
      spawnY = Phaser.Math.Clamp(spawnY, -200, GROUND_Y - 50);

      // Enemy mix: aerial suppresses sentinels/stundarts in favour of more drones
      const mix = this.enemyMix;
      const isSentinel = mix !== 'aerial' && this.waveIndex >= 2 && i % 4 === 3;
      const isStunDart = !isSentinel && mix !== 'ground-heavy' && this.waveIndex >= 2 && i % 6 === 5;
      const isSniper   = !isSentinel && !isStunDart && this.waveIndex >= 2 && i % 3 === 2;
      const variant: DroneVariant = (mix === 'elite' || isSniper) ? 'sniper' : 'normal';
      const type: DroneType = isSentinel ? 'sentinel'
        : (i % 2 === 0 ? 'drone-red' : 'drone-green');

      const patrolY      = Math.min(lane, GROUND_Y - 40);
      const finalSpawnY  = side === 2 ? spawnY : patrolY;

      if (isStunDart) {
        const dart = new StunDart(this.scene, spawnX, finalSpawnY);
        this.scene.add.existing(dart);
        this.scene.physics.add.existing(dart);
        this.scene.drones.add(dart);
        (dart.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.dronesAlive++;
        this.scene.events.emit('dronesRemaining', this.dronesAlive);

        this.scene.physics.add.overlap(this.scene.playerBullets, dart,
          (_d, bullet) => {
            const b = bullet as Phaser.Physics.Arcade.Image;
            const ix = b.x, iy = b.y;
            b.setActive(false).setVisible(false);
            if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
            (_d as unknown as StunDart).takeDamage(1);
            this.scene.spawnBulletImpact(ix, iy, 'enemy');
            this.scene.audio.play('hit');
            if (Math.random() < 0.4) this.scene.spawnEnemyChunks(ix, iy, 0x66aaff, 2);
          });
        this.scene.physics.add.overlap(this.scene.missiles, dart,
          (_d, missile) => {
            const m = missile as Phaser.Physics.Arcade.Image;
            m.setData('hitTarget', true);
            m.setActive(false).setVisible(false);
            if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
            this.scene.spawnExplosion(m.x, m.y);
            (_d as unknown as StunDart).takeDamage(3);
            this.scene.cameras.main.shake(150, 0.01);
            this.scene.audio.play('explosion');
          });

        spawned++;
        this.scene.time.delayedCall(SPAWN_STAGGER, spawnNext);
        return;
      }

      const forceHp = isSentinel ? 3 : undefined;
      const drone   = new Drone(this.scene, spawnX, finalSpawnY, type, bracket, variant, forceHp);
      this.scene.add.existing(drone);
      this.scene.physics.add.existing(drone);
      this.scene.drones.add(drone);
      this.dronesAlive++;
      this.scene.events.emit('dronesRemaining', this.dronesAlive);

      (drone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      drone.startPatrol(i % 2 === 0 ? -1 : 1);
      if (side === 2) (drone.body as Phaser.Physics.Arcade.Body).setVelocityY(100);

      this.scene.physics.add.overlap(this.scene.playerBullets, drone,
        (d, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          const ix = b.x, iy = b.y;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          const dr = d as unknown as Drone;
          dr.takeDamage(1);
          this.scene.spawnBulletImpact(ix, iy, 'enemy');
          this.scene.audio.play('hit');
          // Drones are small — ~40% chance to shed a chunk per hit, tinted by variant
          if (Math.random() < 0.4) {
            const chunkTint = type === 'drone-red' ? 0xcc3322
              : type === 'drone-green' ? 0x33cc66
              : type === 'sentinel' ? 0xaaaacc : 0x99aabb;
            this.scene.spawnEnemyChunks(ix, iy, chunkTint, 2);
          }
          this.scene.spawnFloatingText(dr.x, dr.y - 20, '-1', '#ffffff');
        });
      this.scene.physics.add.overlap(this.scene.missiles, drone,
        (d, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true);
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          (d as unknown as Drone).takeDamage(3);
          this.scene.cameras.main.shake(150, 0.01);
          this.scene.audio.play('explosion');
          this.scene.spawnFloatingText((d as unknown as Drone).x, (d as unknown as Drone).y - 20, '-3', '#ffff00');
        });

      spawned++;
      this.scene.time.delayedCall(SPAWN_STAGGER, spawnNext);
    };

    spawnNext();

    // Bomber — skip for aerial-only levels (no bomb zone)
    if (this.enemyMix !== 'aerial') {
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
      this.dronesAlive++;
      this.scene.events.emit('dronesRemaining', this.dronesAlive);

      this.scene.physics.add.overlap(this.scene.playerBullets, bomber,
        (_b, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          const ix = b.x, iy = b.y;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          (_b as unknown as BomberDrone).takeDamage(1);
          this.scene.spawnBulletImpact(ix, iy, 'enemy');
          this.scene.audio.play('hit');
          if (Math.random() < 0.5) this.scene.spawnEnemyChunks(ix, iy, 0xccaa55, 3);
        });
      this.scene.physics.add.overlap(this.scene.missiles, bomber,
        (_b, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true);
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          (_b as unknown as BomberDrone).takeDamage(3);
          this.scene.cameras.main.shake(150, 0.01);
          this.scene.audio.play('explosion');
        });
    }

    // Mines — skip for aerial and void-floor levels (config controls this via groundY)
    const canHaveGroundUnits = this.enemyMix !== 'aerial';
    if (canHaveGroundUnits && this.waveIndex >= 2) {
      const mineCount = Math.random() < 0.5 ? 1 : 2;
      const groundY   = this.scene.getApproxGroundY();
      if (groundY < GAME_H) {  // only if there is a real ground
        for (let m = 0; m < mineCount; m++) {
          const cam   = this.scene.cameras.main;
          const mineX = Phaser.Math.Between(cam.scrollX + 200, cam.scrollX + GAME_W - 200);
          const mine  = new Mine(this.scene, mineX, groundY);
          this.scene.add.existing(mine);
          this.scene.physics.add.existing(mine);
          this.scene.drones.add(mine);
          mine.initBody();
          this.dronesAlive++;
          this.scene.events.emit('dronesRemaining', this.dronesAlive);

          this.scene.physics.add.overlap(this.scene.playerBullets, mine,
            (_m, bullet) => {
              const b = bullet as Phaser.Physics.Arcade.Image;
              const ix = b.x, iy = b.y;
              b.setActive(false).setVisible(false);
              if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
              (_m as unknown as Mine).takeDamage(1);
              this.scene.spawnBulletImpact(ix, iy, 'enemy');
            });
          this.scene.physics.add.overlap(this.scene.missiles, mine,
            (_m, missile) => {
              const ms = missile as Phaser.Physics.Arcade.Image;
              ms.setData('hitTarget', true);
              ms.setActive(false).setVisible(false);
              if (ms.body) (ms.body as Phaser.Physics.Arcade.Body).enable = false;
              this.scene.spawnExplosion(ms.x, ms.y);
              (_m as unknown as Mine).takeDamage(1);
            });
        }
      }
    }

    // Carrier — wave 3+, mothership that deploys swarmlings periodically
    if (this.waveIndex >= 3 && Math.random() < 0.6) {
      const cam = this.scene.cameras.main;
      const cx  = Phaser.Math.Clamp(cam.scrollX + GAME_W * 0.65, 300, WORLD_WIDTH - 300);
      const cy  = Phaser.Math.Clamp(GROUND_Y - 260, 160, GROUND_Y - 180);
      const carrier = new Carrier(this.scene, cx, cy);
      this.scene.add.existing(carrier);
      this.scene.physics.add.existing(carrier);
      this.scene.drones.add(carrier);
      carrier.initBody();
      this.dronesAlive++;
      this.scene.events.emit('dronesRemaining', this.dronesAlive);

      this.scene.physics.add.overlap(this.scene.playerBullets, carrier,
        (_c, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          const ix = b.x, iy = b.y;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          const dmg = b.texture.key === 'bullet-rapid' ? 0.5 : 1;
          (_c as unknown as Carrier).takeDamage(dmg);
          this.scene.spawnBulletImpact(ix, iy, 'enemy');
          this.scene.audio.play('hit');
          if (Math.random() < 0.5) this.scene.spawnEnemyChunks(ix, iy, 0xdd7766, 3);
        });
      this.scene.physics.add.overlap(this.scene.missiles, carrier,
        (_c, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true);
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          (_c as unknown as Carrier).takeDamage(3);
          this.scene.cameras.main.shake(150, 0.01);
          this.scene.audio.play('explosion');
        });
    }

    // PPC Platform — wave 4+, single floating turret at mid-air altitude
    if (this.waveIndex >= 4 && Math.random() < 0.75) {
      const cam = this.scene.cameras.main;
      const px  = Phaser.Math.Clamp(cam.scrollX + GAME_W * 0.7, 200, WORLD_WIDTH - 200);
      const py  = Phaser.Math.Clamp(GROUND_Y - 340, 120, GROUND_Y - 200);
      const platform = new PPCPlatform(this.scene, px, py);
      this.scene.add.existing(platform);
      this.scene.physics.add.existing(platform);
      this.scene.drones.add(platform);
      platform.initBody();
      this.dronesAlive++;
      this.scene.events.emit('dronesRemaining', this.dronesAlive);

      this.scene.physics.add.overlap(this.scene.playerBullets, platform,
        (_p, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          const ix = b.x, iy = b.y;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          const dmg = b.texture.key === 'bullet-rapid' ? 0.5 : 1;
          (_p as unknown as PPCPlatform).takeDamage(dmg);
          this.scene.spawnBulletImpact(ix, iy, 'enemy');
          this.scene.audio.play('hit');
          if (Math.random() < 0.5) this.scene.spawnEnemyChunks(ix, iy, 0xaa88cc, 3);
        });
      this.scene.physics.add.overlap(this.scene.missiles, platform,
        (_p, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true);
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          (_p as unknown as PPCPlatform).takeDamage(3);
          this.scene.cameras.main.shake(150, 0.01);
          this.scene.audio.play('explosion');
        });
    }

    // Tanks — ground only
    const tankMixes: EnemyMix[] = ['balanced', 'ground-heavy', 'elite', 'boss-rush'];
    if (tankMixes.includes(this.enemyMix)) {
      const tankCount = Math.min(3, 1 + Math.floor((this.waveIndex - 1) / 2));
      const tankCam   = this.scene.cameras.main;
      const groundY   = this.scene.getApproxGroundY();
      if (groundY < GAME_H) {
        for (let c = 0; c < tankCount; c++) {
          const side   = Math.random() < 0.5 ? -1 : 1;
          const spawnX = side < 0
            ? Phaser.Math.Clamp(tankCam.scrollX - MARGIN, 0, WORLD_WIDTH)
            : Phaser.Math.Clamp(tankCam.scrollX + GAME_W + MARGIN, 0, WORLD_WIDTH);
          const tank = new ShieldedTank(this.scene, spawnX, groundY, side < 0 ? 1 : -1);
          this.scene.add.existing(tank);
          this.scene.physics.add.existing(tank);
          this.scene.tanks.add(tank);
          tank.initBody();
          this.dronesAlive++;
          this.scene.events.emit('dronesRemaining', this.dronesAlive);

          this.scene.physics.add.overlap(this.scene.playerBullets, tank,
            (_t, bullet) => {
              const b = bullet as Phaser.Physics.Arcade.Image;
              const ix = b.x, iy = b.y;
              b.setActive(false).setVisible(false);
              if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
              (_t as unknown as ShieldedTank).takeDamage(1);
              this.scene.spawnBulletImpact(ix, iy, 'enemy');
              this.scene.audio.play('hit');
              // Tanks are armoured — chunks more often, duller tint
              if (Math.random() < 0.55) this.scene.spawnEnemyChunks(ix, iy, 0x776655, 3);
            });
          this.scene.physics.add.overlap(this.scene.missiles, tank,
            (_t, missile) => {
              const m = missile as Phaser.Physics.Arcade.Image;
              m.setData('hitTarget', true);
              m.setActive(false).setVisible(false);
              if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
              this.scene.spawnExplosion(m.x, m.y);
              (_t as unknown as ShieldedTank).takeDamage(3);
              this.scene.cameras.main.shake(150, 0.01);
              this.scene.audio.play('explosion');
            });
        }
      }
    }
  }
}
