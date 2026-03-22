import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Drone } from '../entities/Drone';
import {
  RADAR_WORLD_RADIUS,
  RADAR_SCREEN_RADIUS,
  RADAR_X,
  RADAR_Y,
  MISSILE_SEEK_RANGE,
  GROUND_Y,
} from '../constants';

interface Ping {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

export class MinimapRenderer {
  private gfx: Phaser.GameObjects.Graphics;
  private sweepAngle = 0;
  private pings: Ping[] = [];
  private prevInRange = new Set<object>();

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(100);
  }

  draw(time: number, game: GameScene): void {
    const gfx = this.gfx;
    gfx.clear();

    const player = game.player;
    const px = player.x;
    const py = player.y;
    const R  = RADAR_SCREEN_RADIUS;
    const scale = R / RADAR_WORLD_RADIUS;

    // Project a world coordinate to radar screen space
    const proj = (wx: number, wy: number) => ({
      x: RADAR_X + (wx - px) * scale,
      y: RADAR_Y + (wy - py) * scale,
    });

    // Chord half-width at a given screen Y (for clipping horizontal lines)
    const chordHW = (screenY: number): number => {
      const dy = screenY - RADAR_Y;
      return Math.sqrt(Math.max(0, R * R - dy * dy));
    };

    // ── 1. Background + concentric rings ──────────────────────────
    gfx.fillStyle(0x001122, 0.82);
    gfx.fillCircle(RADAR_X, RADAR_Y, R);

    gfx.lineStyle(1, 0x003344, 0.4);
    gfx.strokeCircle(RADAR_X, RADAR_Y, R * 0.5);

    gfx.lineStyle(1, 0x0088aa, 0.7);
    gfx.strokeCircle(RADAR_X, RADAR_Y, R);

    // ── 2. Ground line (clipped to circle) ────────────────────────
    const groundProj = proj(px, GROUND_Y);
    const ghw = chordHW(groundProj.y);
    if (ghw > 0) {
      gfx.lineStyle(1, 0x4444cc, 0.5);
      gfx.lineBetween(RADAR_X - ghw, groundProj.y, RADAR_X + ghw, groundProj.y);
    }

    // ── 3. Platform blips (clipped to circle) ─────────────────────
    for (const plat of game.platformData) {
      const pp = proj(plat.x, plat.y);
      const dy = pp.y - RADAR_Y;
      if (Math.abs(dy) >= R) continue;
      const phw = chordHW(pp.y);
      const half = Math.min((plat.w * scale) / 2, phw);
      if (half <= 0) continue;
      gfx.lineStyle(1, 0x5555dd, 0.6);
      gfx.lineBetween(pp.x - half, pp.y, pp.x + half, pp.y);
    }

    // ── 4. Sweep line ─────────────────────────────────────────────
    this.sweepAngle += 0.04; // ~0.38 full rotations/sec at 60fps
    gfx.lineStyle(1, 0x00ffaa, 0.35);
    gfx.lineBetween(
      RADAR_X,
      RADAR_Y,
      RADAR_X + Math.cos(this.sweepAngle) * R,
      RADAR_Y + Math.sin(this.sweepAngle) * R,
    );

    // ── 5. Enemy blips ────────────────────────────────────────────
    // Find missile lock candidate (nearest active drone within MISSILE_SEEK_RANGE of player)
    let lockTarget: Drone | null = null;
    let lockDist = MISSILE_SEEK_RANGE;

    game.drones.getChildren().forEach((go) => {
      const drone = go as unknown as Drone;
      if (!drone.active) return;
      const d = Phaser.Math.Distance.Between(px, py, drone.x, drone.y);
      if (d < lockDist) { lockDist = d; lockTarget = drone; }
    });

    const currentInRange = new Set<object>();

    game.drones.getChildren().forEach((go) => {
      const drone = go as unknown as Drone;
      if (!drone.active) return;

      const worldDist = Phaser.Math.Distance.Between(px, py, drone.x, drone.y);
      if (worldDist > RADAR_WORLD_RADIUS) return;

      currentInRange.add(drone);

      // Ping ripple when newly entering radar range
      if (!this.prevInRange.has(drone)) {
        const dp = proj(drone.x, drone.y);
        this.pings.push({ x: dp.x, y: dp.y, r: 3, alpha: 0.8 });
      }

      const dp = proj(drone.x, drone.y);
      const screenDist = Phaser.Math.Distance.Between(dp.x, dp.y, RADAR_X, RADAR_Y);
      if (screenDist > R) return;

      // Blip size pulses when attacking
      const state = drone.getState();
      const dotR = state === 'ATTACK'
        ? 2.5 + Math.sin(time * 0.012) * 1.5
        : 3;

      const color = drone.texture.key === 'drone-red' ? 0xff4444 : 0x44ff88;
      gfx.fillStyle(color, 1);
      gfx.fillCircle(dp.x, dp.y, dotR);

      // Missile lock: cyan diamond outline over the lock target
      if (drone === lockTarget) {
        const s = 6;
        gfx.lineStyle(1, 0x00ffff, 1);
        gfx.strokePoints(
          [
            { x: dp.x,     y: dp.y - s },
            { x: dp.x + s, y: dp.y     },
            { x: dp.x,     y: dp.y + s },
            { x: dp.x - s, y: dp.y     },
          ],
          true, // closeShape — draws back to first point
        );
      }
    });

    this.prevInRange = currentInRange;

    // ── 6. Incoming drone bullet blips ────────────────────────────
    gfx.fillStyle(0xff4444, 0.8);
    game.droneBullets.getChildren().forEach((go) => {
      const b = go as Phaser.Physics.Arcade.Image;
      if (!b.active) return;
      const d = Phaser.Math.Distance.Between(px, py, b.x, b.y);
      if (d > RADAR_WORLD_RADIUS) return;
      const bp = proj(b.x, b.y);
      if (Phaser.Math.Distance.Between(bp.x, bp.y, RADAR_X, RADAR_Y) > R) return;
      gfx.fillCircle(bp.x, bp.y, 1.5);
    });

    // ── 7. Player dot + facing arrow ──────────────────────────────
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(RADAR_X, RADAR_Y, 4);

    const arrowAngle = player.flipX ? Math.PI : 0;
    gfx.lineStyle(2, 0x4488ff, 1);
    gfx.lineBetween(
      RADAR_X,
      RADAR_Y,
      RADAR_X + Math.cos(arrowAngle) * 9,
      RADAR_Y + Math.sin(arrowAngle) * 9,
    );

    // ── 8. Ping ripples ───────────────────────────────────────────
    this.pings = this.pings.filter((ping) => {
      if (ping.alpha <= 0) return false;
      gfx.lineStyle(1, 0x00ffaa, ping.alpha);
      gfx.strokeCircle(ping.x, ping.y, ping.r);
      ping.r     += 1.2;
      ping.alpha -= 0.04;
      return true;
    });
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
