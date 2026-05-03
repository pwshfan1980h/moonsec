import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Drone } from '../entities/Drone';
import {
  RADAR_WORLD_RADIUS,
  RADAR_SCREEN_RADIUS,
  RADAR_X,
  RADAR_Y,
  MISSILE_SEEK_RANGE,
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
    gfx.fillStyle(0x02111e, 0.88);
    gfx.fillCircle(RADAR_X, RADAR_Y, R);

    // Grid crosshairs
    gfx.lineStyle(1, 0x18456e, 0.35);
    gfx.lineBetween(RADAR_X - R, RADAR_Y, RADAR_X + R, RADAR_Y);
    gfx.lineBetween(RADAR_X, RADAR_Y - R, RADAR_X, RADAR_Y + R);

    // Concentric rings
    gfx.lineStyle(1, 0x1e5a7a, 0.4);
    gfx.strokeCircle(RADAR_X, RADAR_Y, R * 0.33);
    gfx.lineStyle(1, 0x1e5a7a, 0.5);
    gfx.strokeCircle(RADAR_X, RADAR_Y, R * 0.66);

    gfx.lineStyle(1, 0x2b8cb4, 0.85);
    gfx.strokeCircle(RADAR_X, RADAR_Y, R);

    // ── 2. Ground line (clipped to circle) ────────────────────────
    const groundProj = proj(px, game.getApproxGroundY());
    const ghw = chordHW(groundProj.y);
    if (ghw > 0) {
      gfx.lineStyle(2, 0x3a7a96, 0.65);
      gfx.lineBetween(RADAR_X - ghw, groundProj.y, RADAR_X + ghw, groundProj.y);
    }

    // ── 3. Platform blips (clipped to circle) ─────────────────────
    for (const plat of game.platformData) {
      const pp = proj(plat.x, plat.y);
      const dy = pp.y - RADAR_Y;
      if (Math.abs(dy) >= R) continue;
      const phw = chordHW(pp.y);
      if (phw <= 0) continue;
      // Clamp bar endpoints to the circle boundary (chord centered at RADAR_X)
      const barLeft  = Math.max(pp.x - (plat.w * scale) / 2, RADAR_X - phw);
      const barRight = Math.min(pp.x + (plat.w * scale) / 2, RADAR_X + phw);
      if (barRight <= barLeft) continue;
      gfx.lineStyle(2, 0x3a7a96, 0.75);
      gfx.lineBetween(barLeft, pp.y, barRight, pp.y);
    }

    // ── 4. Sweep line (gradient trail) ────────────────────────────
    this.sweepAngle += 0.04;
    for (let k = 0; k < 6; k++) {
      const a = this.sweepAngle - k * 0.06;
      gfx.lineStyle(1, 0x6de3ff, 0.32 - k * 0.045);
      gfx.lineBetween(
        RADAR_X,
        RADAR_Y,
        RADAR_X + Math.cos(a) * R,
        RADAR_Y + Math.sin(a) * R,
      );
    }

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
      if (typeof drone.getState !== 'function') return;

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

      const state = drone.getState();

      if ((drone as unknown as { isBoss?: boolean }).isBoss) {
        const r = 9 + Math.sin(time * 0.008) * 3;
        gfx.lineStyle(2.5, 0xff3a4a, 0.95);
        gfx.strokeCircle(dp.x, dp.y, r);
        gfx.lineStyle(1.5, 0xff3a4a, 0.55);
        gfx.strokeCircle(dp.x, dp.y, r + 8);
        gfx.lineStyle(1, 0xff3a4a, 0.25);
        gfx.strokeCircle(dp.x, dp.y, r + 16);
      } else {
        const dotR = state === 'ATTACK'
          ? 4 + Math.sin(time * 0.012) * 2
          : 4;
        const color = drone.texture.key === 'drone-red' ? 0xff3a4a : 0x56e39f;
        gfx.fillStyle(color, 1);
        gfx.fillCircle(dp.x, dp.y, dotR);
        gfx.fillStyle(color, 0.25);
        gfx.fillCircle(dp.x, dp.y, dotR + 2);
      }

      if (drone === lockTarget) {
        const s = 9;
        gfx.lineStyle(1.5, 0x6de3ff, 1);
        gfx.strokePoints(
          [
            new Phaser.Math.Vector2(dp.x,     dp.y - s),
            new Phaser.Math.Vector2(dp.x + s, dp.y),
            new Phaser.Math.Vector2(dp.x,     dp.y + s),
            new Phaser.Math.Vector2(dp.x - s, dp.y),
          ],
          true, // closeShape — draws back to first point
        );
      }
    });

    this.prevInRange = currentInRange;

    // ── 6. Incoming drone bullet blips ────────────────────────────
    gfx.fillStyle(0xff3a4a, 0.9);
    game.droneBullets.getChildren().forEach((go) => {
      const b = go as Phaser.Physics.Arcade.Image;
      if (!b.active) return;
      const d = Phaser.Math.Distance.Between(px, py, b.x, b.y);
      if (d > RADAR_WORLD_RADIUS) return;
      const bp = proj(b.x, b.y);
      if (Phaser.Math.Distance.Between(bp.x, bp.y, RADAR_X, RADAR_Y) > R) return;
      gfx.fillCircle(bp.x, bp.y, 2);
    });

    // ── 7. Player dot + facing arrow ──────────────────────────────
    gfx.fillStyle(0x6de3ff, 0.35);
    gfx.fillCircle(RADAR_X, RADAR_Y, 9);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(RADAR_X, RADAR_Y, 5);

    const facing = game.player;
    const arrowAngle = facing.flipX ? Math.PI : 0;
    gfx.lineStyle(2.5, 0x6de3ff, 1);
    gfx.lineBetween(
      RADAR_X,
      RADAR_Y,
      RADAR_X + Math.cos(arrowAngle) * 14,
      RADAR_Y + Math.sin(arrowAngle) * 14,
    );

    // ── 8. Ping ripples ───────────────────────────────────────────
    this.pings = this.pings.filter((ping) => {
      if (ping.alpha <= 0) return false;
      gfx.lineStyle(1.5, 0x6de3ff, ping.alpha);
      gfx.strokeCircle(ping.x, ping.y, ping.r);
      ping.r     += 1.4;
      ping.alpha -= 0.035;
      return true;
    });
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
