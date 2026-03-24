import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Drone } from '../entities/Drone';
import { GROUND_Y, WORLD_WIDTH } from '../constants';

const WAVE_DELAY = 15000;    // ms between waves
const SPAWN_STAGGER = 700;   // ms between drones in a wave
const PATROL_LANES = [140, 180, 220, 260, 300]; // Y positions for drones

export class DroneSpawner {
  private scene: GameScene;
  private waveIndex = 0;
  private nextWaveTime = 3000; // first wave after 3s
  private spawning = false;

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  update(time: number, _delta: number): void {
    if (this.spawning) return;
    if (time < this.nextWaveTime) return;

    this.nextWaveTime = time + WAVE_DELAY;
    this.spawnWave();
  }

  private spawnWave(): void {
    this.spawning = true;
    this.waveIndex++;
    this.scene.events.emit('waveStart', this.waveIndex);
    const count = 3 + (this.waveIndex - 1) * 2;
    let spawned = 0;

    const spawnNext = () => {
      if (spawned >= count) {
        this.spawning = false;
        return;
      }

      const i = spawned;
      const camRight = this.scene.cameras.main.scrollX + 900;
      const spawnX = Math.min(camRight + 60 + Math.random() * 200, WORLD_WIDTH - 50);
      const lane = PATROL_LANES[i % PATROL_LANES.length];
      const spawnY = Math.min(lane, GROUND_Y - 40);

      const type = i % 2 === 0 ? 'drone-red' : 'drone-green';

      const drone = new Drone(this.scene, spawnX, spawnY, type as 'drone-red' | 'drone-green');
      this.scene.add.existing(drone);
      this.scene.physics.add.existing(drone);
      this.scene.drones.add(drone);

      // No gravity on drones
      (drone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      drone.startPatrol(i % 2 === 0 ? -1 : 1);

      // Register collision with bullets
      this.scene.physics.add.overlap(
        this.scene.playerBullets,
        drone,
        (d, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          (d as unknown as Drone).takeDamage(1);
          this.scene.audio.play('hit');
        },
      );

      this.scene.physics.add.overlap(
        this.scene.missiles,
        drone,
        (d, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true); // signal HomingMissile.update() to play impact
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          (d as unknown as Drone).takeDamage(3);
          this.scene.cameras.main.shake(150, 0.01);
          this.scene.audio.play('explosion');
        },
      );

      spawned++;
      this.scene.time.delayedCall(SPAWN_STAGGER, spawnNext);
    };

    spawnNext();
  }
}
