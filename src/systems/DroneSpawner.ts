import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Drone } from '../entities/Drone';
import { Crawler } from '../entities/Crawler';
import { NexusBoss } from '../entities/NexusBoss';
import type { DroneVariant, DroneType } from '../entities/Drone';
import { GROUND_Y, WORLD_WIDTH, WAVE_BRACKETS, BOSS_WAVE_L1, BOSS_WAVE_L2, L2_SPEED_MULT, L2_INTERVAL_MULT } from '../constants';

export interface DroneScaling {
  attackSpeed: number;
  shootInterval: number;
  extraHp: number;
  bulletSpeedMult: number;
}

const WAVE_DELAY    = 15000; // ms between waves
const SPAWN_STAGGER = 700;   // ms between drones in a wave
// Patrol Y positions — 100–260px above GROUND_Y=640 (same relative zone as before resize)
const PATROL_LANES  = [380, 420, 460, 500, 540];

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
      const camCentreX = this.scene.cameras.main.scrollX + 640;
      const spawnY     = currentLevel === 2 ? 200 : 180;
      const boss = new NexusBoss(this.scene, camCentreX, spawnY, bracket, currentLevel);
      this.scene.add.existing(boss);
      this.scene.physics.add.existing(boss);
      boss.initBody();
      this.scene.drones.add(boss);

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

    // Normal wave — spawn drones
    const count = 3 + (this.waveIndex - 1) * 2;
    let spawned = 0;

    const spawnNext = () => {
      if (spawned >= count) {
        this.spawning = false;
        // Check if wave cleared immediately (shouldn't happen but guard anyway)
        if (this.dronesAlive === 0 && this.waveIndex > 0) {
          this.scene.events.emit('waveCleared', this.waveIndex);
        }
        return;
      }

      const i        = spawned;
      const camRight = this.scene.cameras.main.scrollX + 1380;
      const spawnX   = Math.min(camRight + 60 + Math.random() * 200, WORLD_WIDTH - 50);
      const lane     = PATROL_LANES[i % PATROL_LANES.length];
      const spawnY   = Math.min(lane, GROUND_Y - 40);

      // Sentinel: every 4th drone from wave 7+
      const isSentinel = this.waveIndex >= 7 && i % 4 === 3;
      // Sniper: every 3rd drone from wave 5+ (only if not sentinel slot)
      const isSniper   = !isSentinel && this.waveIndex >= 5 && i % 3 === 2;
      const variant: DroneVariant = isSniper ? 'sniper' : 'normal';
      const type: DroneType       = isSentinel ? 'sentinel'
                                  : (isSniper || i % 2 === 0 ? 'drone-red' : 'drone-green');

      const forceHp = isSentinel ? 3 : undefined;
      const drone   = new Drone(this.scene, spawnX, spawnY, type, bracket, variant, forceHp);
      this.scene.add.existing(drone);
      this.scene.physics.add.existing(drone);
      this.scene.drones.add(drone);

      this.dronesAlive++;
      this.scene.events.emit('dronesRemaining', this.dronesAlive);

      (drone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      drone.startPatrol(i % 2 === 0 ? -1 : 1);

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

    // Crawlers from wave 3 — 1 at wave 3, +1 every 2 waves, capped at 4
    if (this.waveIndex >= 3) {
      const crawlerCount = Math.min(4, Math.floor((this.waveIndex - 2) / 2) + 1);
      const camRight = this.scene.cameras.main.scrollX + 1380;

      for (let c = 0; c < crawlerCount; c++) {
        const cx = Math.min(camRight + 80 + Math.random() * 200, WORLD_WIDTH - 100);
        const crawler = new Crawler(this.scene, cx, GROUND_Y - 5, -1);
        this.scene.add.existing(crawler);
        this.scene.physics.add.existing(crawler);
        crawler.initBody();
        this.scene.crawlers.add(crawler);

        this.scene.physics.add.overlap(
          this.scene.playerBullets,
          crawler,
          (cr, bullet) => {
            const b = bullet as Phaser.Physics.Arcade.Image;
            b.setActive(false).setVisible(false);
            if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
            (cr as unknown as Crawler).takeDamage(1);
            this.scene.audio.play('hit');
            this.scene.spawnFloatingText(
              (cr as Phaser.GameObjects.Sprite).x,
              (cr as Phaser.GameObjects.Sprite).y - 40, '-1', '#ffffff',
            );
          },
        );

        this.scene.physics.add.overlap(
          this.scene.missiles,
          crawler,
          (cr, missile) => {
            const m = missile as Phaser.Physics.Arcade.Image;
            m.setData('hitTarget', true);
            m.setActive(false).setVisible(false);
            if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
            this.scene.spawnExplosion(m.x, m.y);
            (cr as unknown as Crawler).takeDamage(3);
            this.scene.cameras.main.shake(150, 0.01);
            this.scene.audio.play('explosion');
            this.scene.spawnFloatingText(
              (cr as Phaser.GameObjects.Sprite).x,
              (cr as Phaser.GameObjects.Sprite).y - 40, '-3', '#ffff00',
            );
          },
        );

        this.dronesAlive++;
        this.scene.events.emit('dronesRemaining', this.dronesAlive);
      }
    }
  }
}
