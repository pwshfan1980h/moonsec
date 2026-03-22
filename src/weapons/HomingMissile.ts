import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from '../entities/Player';
import type { Drone } from '../entities/Drone';
import { WORLD_WIDTH } from '../constants';

const COOLDOWN = 5000; // ms
const SPEED = 480;
const TURN_RATE = 0.065; // radians per frame
const SEEK_RANGE = 650;

interface MissileState {
  obj: Phaser.Physics.Arcade.Image;
  angle: number;
  target: Drone | null;
  emitter: Phaser.GameObjects.Particles.ParticleEmitter;
}

export class HomingMissile {
  private scene: GameScene;
  private lastFire = -COOLDOWN; // ready immediately
  private active: MissileState[] = [];

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  getCooldownProgress(): number {
    const elapsed = this.scene.time.now - this.lastFire;
    return Math.min(1, elapsed / COOLDOWN);
  }

  fire(player: Player): void {
    const now = this.scene.time.now;
    if (now - this.lastFire < COOLDOWN) return;
    this.lastFire = now;

    const facingRight = !player.flipX;
    const dir = facingRight ? 1 : -1;

    const m = this.scene.missiles.get(player.x + dir * 35, player.y - 90, 'bullet-missile') as Phaser.Physics.Arcade.Image;
    if (!m) return;

    m.setActive(true).setVisible(true).setDepth(16);
    m.setBlendMode(Phaser.BlendModes.ADD);
    if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = true;

    const angle = facingRight ? 0 : Math.PI;
    m.setRotation(angle);
    m.setVelocity(Math.cos(angle) * SPEED, Math.sin(angle) * SPEED);

    const target = this.findNearestDrone(m.x, m.y);

    const emitter = this.scene.add.particles(0, 0, 'pixel', {
      follow: m,
      speed: { min: 0, max: 40 },
      scale: { start: 2.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffff00, 0xff8800, 0xffffff],
      lifespan: 200,
      frequency: 10,
      blendMode: 'ADD',
      quantity: 2,
    });
    emitter.setDepth(15);

    this.active.push({ obj: m, angle, target, emitter });
    this.scene.audio.play('missile');
  }

  update(_time: number, _delta: number): void {
    this.active = this.active.filter((state) => {
      const { obj, emitter } = state;

      if (!obj.active) {
        emitter.destroy();
        return false;
      }

      // Seek nearest drone if target is gone
      if (!state.target || !state.target.active) {
        state.target = this.findNearestDrone(obj.x, obj.y);
      }

      if (state.target && state.target.active) {
        const desired = Phaser.Math.Angle.Between(obj.x, obj.y, state.target.x, state.target.y);
        state.angle = Phaser.Math.Angle.RotateTo(state.angle, desired, TURN_RATE);
      }

      obj.setVelocity(Math.cos(state.angle) * SPEED, Math.sin(state.angle) * SPEED);
      obj.setRotation(state.angle);

      // Deactivate if off-world
      if (obj.x < -100 || obj.x > WORLD_WIDTH + 100 || obj.y < -100 || obj.y > 600) {
        obj.setActive(false).setVisible(false);
        if (obj.body) (obj.body as Phaser.Physics.Arcade.Body).enable = false;
        emitter.destroy();
        return false;
      }

      return true;
    });
  }

  private findNearestDrone(x: number, y: number): Drone | null {
    let nearest: Drone | null = null;
    let bestDist = SEEK_RANGE;

    this.scene.drones.getChildren().forEach((go) => {
      const drone = go as unknown as Drone;
      if (!drone.active) return;
      const dist = Phaser.Math.Distance.Between(x, y, drone.x, drone.y);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = drone;
      }
    });

    return nearest;
  }
}
