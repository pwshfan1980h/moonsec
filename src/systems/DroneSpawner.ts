import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Drone } from '../entities/Drone';
import { ShieldedTank } from '../entities/ShieldedTank';
import { NexusBoss } from '../entities/NexusBoss';
import { StunDart } from '../entities/StunDart';
import { BomberDrone } from '../entities/BomberDrone';
import type { DroneVariant, DroneType } from '../entities/Drone';
import { GROUND_Y, WORLD_WIDTH, WAVE_BRACKETS, BOSS_WAVE_L1, BOSS_WAVE_L2, L2_SPEED_MULT, L2_INTERVAL_MULT, GAME_W, GAME_H, PATROL_LANES } from '../constants';

export interface DroneScaling {
  attackSpeed: number;
  shootInterval: number;
  extraHp: number;
  bulletSpeedMult: number;
}

const WAVE_DELAY    = 15000; // ms between waves
const SPAWN_STAGGER = 700;   // ms between drones in a wave

export class DroneSpawner {
  private scene: GameScene;
  waveIndex  = 0;
  private nextWaveTime = 3000; // first wave after 3s
  private spawning   = false;
  private dronesAlive = 0;
  private isBossDead = false;

  constructor(scene: GameScene) {
    this.scene = scene;

    // Decrement alive count whenever any drone is killed
    scene.events.on('droneKilled', () => {
      this.dronesAlive = Math.max(0, this.dronesAlive - 1);
      scene.events.emit('dronesRemaining', this.dronesAlive);
      if (this.dronesAlive === 0 && !this.spawning && this.waveIndex > 0) {
        scene.events.emit('waveCleared', this.waveIndex);
      }
    });
    // bossKilled — boss doesn't emit droneKilled; handle decrement and isBossDead in one listener
    scene.events.on('bossKilled', () => {
      this.isBossDead = true;
      this.dronesAlive = Math.max(0, this.dronesAlive - 1);
      scene.events.emit('dronesRemaining', this.dronesAlive);
      if (this.dronesAlive === 0 && !this.spawning && this.waveIndex > 0) {
        scene.events.emit('waveCleared', this.waveIndex);
      }
    });
  }

  isBossWave(): boolean {
    const currentLevel = (this.scene.registry.get('currentLevel') as number) ?? 1;
    const bossWave = currentLevel === 2 ? BOSS_WAVE_L2 : BOSS_WAVE_L1;
    return this.waveIndex >= bossWave;
  }

  update(time: number, _delta: number): void {
    if (this.spawning || this.isBossDead) return;
    if (this.isBossWave()) return;   // hold spawner once boss wave begins
    if (time < this.nextWaveTime) return;

    this.nextWaveTime = time + WAVE_DELAY;
    this.spawnWave();
  }

  private spawnWave(): void {
    this.spawning = true;
    this.waveIndex++;
    this.scene.events.emit('waveStart', this.waveIndex);

    const currentLevel = (this.scene.registry.get('currentLevel') as number) ?? 1;
    const bossWave     = currentLevel === 2 ? BOSS_WAVE_L2 : BOSS_WAVE_L1;

    // Determine bracket
    let bracket = WAVE_BRACKETS[0];
    for (const b of WAVE_BRACKETS) {
      if (this.waveIndex >= b.minWave) bracket = b;
    }

    // Apply L2 difficulty multiplier
    if (currentLevel === 2) {
      bracket = {
        ...bracket,
        attackSpeed:   Math.round(bracket.attackSpeed   * L2_SPEED_MULT),
        shootInterval: Math.round(bracket.shootInterval * L2_INTERVAL_MULT),
      };
    }

    // Boss wave — spawn NexusBoss instead of regular drones
    if (this.waveIndex === bossWave) {
      this.spawning = false;
      const camCentreX = this.scene.cameras.main.scrollX + GAME_W / 2;
      const spawnY     = currentLevel === 2 ? 200 : 180;
      const boss = new NexusBoss(this.scene, camCentreX, spawnY, bracket, currentLevel);
      this.scene.add.existing(boss);
      this.scene.physics.add.existing(boss);
      this.scene.drones.add(boss);
      boss.initBody(); // must come after drones.add() — group.add() resets body defaults

      // Register bullet overlaps for boss
      this.scene.physics.add.overlap(
        this.scene.playerBullets,
        boss,
        (b, bullet) => {
          const blt = bullet as Phaser.Physics.Arcade.Image;
          blt.setActive(false).setVisible(false);
          if (blt.body) (blt.body as Phaser.Physics.Arcade.Body).enable = false;
          (b as unknown as NexusBoss).takeDamage(1);
          this.scene.audio.play('hit');
          this.scene.spawnFloatingText((b as Phaser.GameObjects.Sprite).x, (b as Phaser.GameObjects.Sprite).y - 30, '-1', '#ffffff');
        },
      );
      this.scene.physics.add.overlap(
        this.scene.missiles,
        boss,
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

      this.dronesAlive++;  // boss counts as one unit
      this.scene.events.emit('dronesRemaining', this.dronesAlive);
      return;
    }

    // Normal wave — drone count scales with wave
    const count = 10 + (this.waveIndex - 1) * 5;
    let spawned = 0;

    const MARGIN = 150;

    const spawnNext = () => {
      if (spawned >= count) {
        this.spawning = false;
        // Check if wave cleared immediately (shouldn't happen but guard anyway)
        if (this.dronesAlive === 0 && this.waveIndex > 0) {
          this.scene.events.emit('waveCleared', this.waveIndex);
        }
        return;
      }

      const i    = spawned;
      const lane = PATROL_LANES[i % PATROL_LANES.length];

      // ── Viewport-relative spawn ──────────────────────────────────────────────
      const cam   = this.scene.cameras.main;
      const vx    = cam.scrollX;
      const vy    = cam.scrollY;

      // Pick side: 0=left, 1=right, 2=top  (40%/40%/20%)
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
        spawnX = Phaser.Math.Clamp(
          Phaser.Math.Between(vx, vx + GAME_W), 0, WORLD_WIDTH
        );
        spawnY = vy - MARGIN;
      }

      // Clamp Y so drones don't spawn underground
      spawnY = Phaser.Math.Clamp(spawnY, -200, GROUND_Y - 50);

      // Sentinel: every 4th drone from wave 2+
      const isSentinel = this.waveIndex >= 2 && i % 4 === 3;
      // StunDart: every 6th drone from wave 2+ (not sentinel slot)
      const isStunDart = !isSentinel && this.waveIndex >= 2 && i % 6 === 5;
      // Sniper: every 3rd drone from wave 2+ (only if not sentinel/stundart slot)
      const isSniper   = !isSentinel && !isStunDart && this.waveIndex >= 2 && i % 3 === 2;
      const variant: DroneVariant = isSniper ? 'sniper' : 'normal';
      const type: DroneType       = isSentinel ? 'sentinel'
                                  : (isSniper || i % 2 === 0 ? 'drone-red' : 'drone-green');

      // Use patrol lane Y for the drone's patrol height (override viewport-random Y for non-top spawns)
      const patrolY = Math.min(lane, GROUND_Y - 40);
      const finalSpawnY = side === 2 ? spawnY : patrolY;

      // ── StunDart — EMP kamikaze ──────────────────────────────────
      if (isStunDart) {
        const dart = new StunDart(this.scene, spawnX, finalSpawnY);
        this.scene.add.existing(dart);
        this.scene.physics.add.existing(dart);
        this.scene.drones.add(dart);
        (dart.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

        this.dronesAlive++;
        this.scene.events.emit('dronesRemaining', this.dronesAlive);

        this.scene.physics.add.overlap(
          this.scene.playerBullets,
          dart,
          (_d, bullet) => {
            const b = bullet as Phaser.Physics.Arcade.Image;
            b.setActive(false).setVisible(false);
            if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
            (_d as unknown as StunDart).takeDamage(1);
            this.scene.audio.play('hit');
          },
        );
        this.scene.physics.add.overlap(
          this.scene.missiles,
          dart,
          (_d, missile) => {
            const m = missile as Phaser.Physics.Arcade.Image;
            m.setData('hitTarget', true);
            m.setActive(false).setVisible(false);
            if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
            this.scene.spawnExplosion(m.x, m.y);
            (_d as unknown as StunDart).takeDamage(3);
            this.scene.cameras.main.shake(150, 0.01);
            this.scene.audio.play('explosion');
          },
        );

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

      if (side === 2) {
        const droneBody = drone.body as Phaser.Physics.Arcade.Body;
        droneBody.setVelocityY(100);
      }

      // Player bullet overlap
      this.scene.physics.add.overlap(
        this.scene.playerBullets,
        drone,
        (d, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          (d as unknown as Drone).takeDamage(1);
          this.scene.audio.play('hit');
          this.scene.spawnFloatingText((d as unknown as Drone).x, (d as unknown as Drone).y - 20, '-1', '#ffffff');
        },
      );

      // Missile overlap
      this.scene.physics.add.overlap(
        this.scene.missiles,
        drone,
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
        },
      );

      spawned++;
      this.scene.time.delayedCall(SPAWN_STAGGER, spawnNext);
    };

    spawnNext();

    // Bombers from wave 1 — 1 per wave, drive-by with ground telegraph
    {
      const cam    = this.scene.cameras.main;
      const dir    = Math.random() < 0.5 ? 1 : -1;
      const bx     = dir > 0
        ? Phaser.Math.Clamp(cam.scrollX - 120, 0, WORLD_WIDTH)
        : Phaser.Math.Clamp(cam.scrollX + GAME_W + 120, 0, WORLD_WIDTH);
      const by     = cam.scrollY + Phaser.Math.Between(Math.round(GAME_H * 0.25), Math.round(GAME_H * 0.55));
      const bomber = new BomberDrone(this.scene, bx, by, dir);
      this.scene.add.existing(bomber);
      this.scene.physics.add.existing(bomber);
      this.scene.drones.add(bomber);
      (bomber.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

      this.dronesAlive++;
      this.scene.events.emit('dronesRemaining', this.dronesAlive);

      this.scene.physics.add.overlap(
        this.scene.playerBullets, bomber,
        (_b, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          (_b as unknown as BomberDrone).takeDamage(1);
          this.scene.audio.play('hit');
        },
      );
      this.scene.physics.add.overlap(
        this.scene.missiles, bomber,
        (_b, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true);
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          (_b as unknown as BomberDrone).takeDamage(3);
          this.scene.cameras.main.shake(150, 0.01);
          this.scene.audio.play('explosion');
        },
      );
    }

    // ShieldedTanks from wave 1 — 1 on first wave, +1 every 2 waves (max 3)
    const tankCount = Math.min(3, 1 + Math.floor((this.waveIndex - 1) / 2));
    const tankCam = this.scene.cameras.main;
    const tankVx  = tankCam.scrollX;
    for (let c = 0; c < tankCount; c++) {
      const side   = Math.random() < 0.5 ? -1 : 1;
      const spawnX = side < 0
        ? Phaser.Math.Clamp(tankVx - MARGIN, 0, WORLD_WIDTH)
        : Phaser.Math.Clamp(tankVx + GAME_W + MARGIN, 0, WORLD_WIDTH);
      const groundY = this.scene.getApproxGroundY();
      const tank = new ShieldedTank(this.scene, spawnX, groundY, side < 0 ? 1 : -1);
      this.scene.add.existing(tank);
      this.scene.physics.add.existing(tank);
      this.scene.crawlers.add(tank);
      tank.initBody();

      this.dronesAlive++;
      this.scene.events.emit('dronesRemaining', this.dronesAlive);

      this.scene.physics.add.overlap(
        this.scene.playerBullets,
        tank,
        (_t, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          (_t as unknown as ShieldedTank).takeDamage(1);
          this.scene.audio.play('hit');
        },
      );

      this.scene.physics.add.overlap(
        this.scene.missiles,
        tank,
        (_t, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true);
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          (_t as unknown as ShieldedTank).takeDamage(3);
          this.scene.cameras.main.shake(150, 0.01);
          this.scene.audio.play('explosion');
        },
      );
    }
  }
}
