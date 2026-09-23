import { radarColor, type RadarKind } from '../entities/RiggedHostile';
import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { RADAR_WORLD_RADIUS, RADAR_SCREEN_RADIUS, RADAR_X, RADAR_Y, MISSILE_SEEK_RANGE } from '../constants';
import { tc } from './theme';

interface Ping { x: number; y: number; r: number; life: number }

/** Snap to the 2px UI grid. */
const s2 = (v: number) => Math.round(v / 2) * 2;

/**
 * Radar: terrain chords, a stepped sweep, and glyph blips by `radar.kind` (flyers are
 * chevrons, walkers are bars with legs, heavies are hollow boxes, mines are dots, the
 * boss is a pulsing box). Everything is drawn in 2px blocks on palette colours.
 */
export class MinimapRenderer {
  private gfx: Phaser.GameObjects.Graphics;
  private sweepAngle = 0;
  private pings: Ping[] = [];
  private prevInRange = new Set<object>();

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(5);
  }

  draw(time: number, game: GameScene): void {
    const g = this.gfx.clear();
    const player = game.player;
    const px = player.x, py = player.y;
    const R = RADAR_SCREEN_RADIUS;
    const scale = R / RADAR_WORLD_RADIUS;
    const proj = (wx: number, wy: number) => ({ x: s2(RADAR_X + (wx - px) * scale), y: s2(RADAR_Y + (wy - py) * scale) });
    const chordHW = (sy: number) => Math.sqrt(Math.max(0, R * R - (sy - RADAR_Y) ** 2));
    const inside = (x: number, y: number) => (x - RADAR_X) ** 2 + (y - RADAR_Y) ** 2 <= R * R;

    // disc + crosshair
    g.fillStyle(tc('panel'), 1).fillCircle(RADAR_X, RADAR_Y, R);
    g.fillStyle(tc('edgeDim'), 1);
    g.fillRect(RADAR_X - R, RADAR_Y - 1, R * 2, 2);
    g.fillRect(RADAR_X - 1, RADAR_Y - R, 2, R * 2);
    for (const rr of [R / 3, (R * 2) / 3]) this.dottedRing(g, rr, 24);

    // terrain chords
    const chord = (y: number, x0: number, x1: number) => {
      const hw = chordHW(y);
      if (hw <= 0) return;
      const a = Math.max(x0, RADAR_X - hw), b = Math.min(x1, RADAR_X + hw);
      if (b > a) g.fillRect(s2(a), y - 1, s2(b - a), 2);
    };
    g.fillStyle(tc('edge'), 1);
    const ground = proj(px, game.getApproxGroundY());
    chord(ground.y, RADAR_X - R, RADAR_X + R);
    const moving = game.movingPlatforms?.getChildren().filter((c) => c.active).map((c) => {
      const p = c as Phaser.Physics.Arcade.Image;
      return { x: p.x, y: p.y, w: p.displayWidth };
    }) ?? [];
    for (const plat of [...game.platformData, ...moving]) {
      const pp = proj(plat.x, plat.y);
      if (Math.abs(pp.y - RADAR_Y) >= R) continue;
      chord(pp.y, pp.x - (plat.w * scale) / 2, pp.x + (plat.w * scale) / 2);
    }

    // stepped sweep: a line of 2px blocks with a short trailing fan
    this.sweepAngle += 0.04;
    for (let k = 0; k < 3; k++) {
      const a = this.sweepAngle - k * 0.08;
      g.fillStyle(tc(k === 0 ? 'accentDim' : 'accentDeep'), 1);
      for (let r = 6; r < R; r += 4) g.fillRect(s2(RADAR_X + Math.cos(a) * r) - 1, s2(RADAR_Y + Math.sin(a) * r) - 1, 2, 2);
    }

    // missile lock candidate: nearest hostile in seek range
    type Blip = Phaser.Physics.Arcade.Sprite & { getState?(): string; isBoss?: boolean; radar?: { kind: RadarKind } };
    let lock: Blip | null = null;
    let lockD = MISSILE_SEEK_RANGE;
    const hostiles = game.drones.getChildren() as unknown as Blip[];
    for (const d of hostiles) {
      if (!d.active) continue;
      const dist = Phaser.Math.Distance.Between(px, py, d.x, d.y);
      if (dist < lockD) { lockD = dist; lock = d; }
    }

    const inRange = new Set<object>();
    for (const d of hostiles) {
      if (!d.active || Phaser.Math.Distance.Between(px, py, d.x, d.y) > RADAR_WORLD_RADIUS) continue;
      const p = proj(d.x, d.y);
      if (!inside(p.x, p.y)) continue;
      inRange.add(d);
      if (!this.prevInRange.has(d)) this.pings.push({ x: p.x, y: p.y, r: 4, life: 1 });
      const kind: RadarKind = d.isBoss ? 'boss' : d.radar?.kind ?? 'flyer';
      const attacking = d.getState?.() === 'ATTACK' && Math.floor(time / 150) % 2 === 0;
      this.blip(g, p.x, p.y, kind, attacking ? tc('ink') : radarColor(kind), time);
      if (d === lock) this.lockBrackets(g, p.x, p.y);
    }
    this.prevInRange = inRange;

    // enemy rounds
    g.fillStyle(tc('danger'), 1);
    for (const go of game.droneBullets.getChildren()) {
      const b = go as Phaser.Physics.Arcade.Image;
      if (!b.active) continue;
      const p = proj(b.x, b.y);
      if (inside(p.x, p.y)) g.fillRect(p.x - 1, p.y - 1, 2, 2);
    }

    // player chevron pointing where HARROW faces
    const f = player.flipX ? -1 : 1;
    g.fillStyle(tc('ink'), 1).fillRect(RADAR_X - 3, RADAR_Y - 3, 6, 6);
    g.fillStyle(tc('accent'), 1);
    g.fillRect(RADAR_X + f * 5 - (f < 0 ? 4 : 0), RADAR_Y - 1, 4, 2);
    g.fillRect(RADAR_X + f * 9 - (f < 0 ? 2 : 0), RADAR_Y - 3, 2, 6);

    // entry pings (square ripples)
    this.pings = this.pings.filter((p) => {
      if (p.life <= 0) return false;
      const r = s2(p.r);
      g.fillStyle(tc(p.life > 0.5 ? 'accent' : 'accentDim'), 1);
      g.fillRect(p.x - r, p.y - r, r * 2, 2); g.fillRect(p.x - r, p.y + r - 2, r * 2, 2);
      g.fillRect(p.x - r, p.y - r, 2, r * 2); g.fillRect(p.x + r - 2, p.y - r, 2, r * 2);
      p.r += 1; p.life -= 0.05;
      return true;
    });
  }

  private dottedRing(g: Phaser.GameObjects.Graphics, r: number, n: number): void {
    g.fillStyle(tc('edgeDim'), 1);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.fillRect(s2(RADAR_X + Math.cos(a) * r) - 1, s2(RADAR_Y + Math.sin(a) * r) - 1, 2, 2);
    }
  }

  private blip(g: Phaser.GameObjects.Graphics, x: number, y: number, kind: RadarKind, color: number, time: number): void {
    g.fillStyle(color, 1);
    switch (kind) {
      case 'flyer': // chevron
        g.fillRect(x - 1, y - 3, 2, 2); g.fillRect(x - 3, y - 1, 6, 2); g.fillRect(x - 5, y + 1, 4, 2); g.fillRect(x + 1, y + 1, 4, 2);
        break;
      case 'swarm':
        g.fillRect(x - 1, y - 1, 2, 2);
        break;
      case 'walker': // bar on legs
        g.fillRect(x - 4, y - 3, 8, 4); g.fillRect(x - 4, y + 1, 2, 2); g.fillRect(x + 2, y + 1, 2, 2);
        break;
      case 'heavy': // hollow box
        g.fillRect(x - 4, y - 4, 8, 2); g.fillRect(x - 4, y + 2, 8, 2); g.fillRect(x - 4, y - 4, 2, 8); g.fillRect(x + 2, y - 4, 2, 8);
        break;
      case 'mine':
        g.fillRect(x - 2, y - 2, 4, 4);
        break;
      case 'boss': {
        const r = 6 + (Math.floor(time / 200) % 2) * 2;
        g.fillRect(x - r, y - r, r * 2, 2); g.fillRect(x - r, y + r - 2, r * 2, 2);
        g.fillRect(x - r, y - r, 2, r * 2); g.fillRect(x + r - 2, y - r, 2, r * 2);
        g.fillRect(x - 2, y - 2, 4, 4);
        break;
      }
    }
  }

  private lockBrackets(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(tc('accent'), 1);
    const s = 10, l = 4;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const cx = x + sx * s, cy = y + sy * s;
      g.fillRect(sx < 0 ? cx : cx - l, cy - 1, l, 2);
      g.fillRect(cx - 1, sy < 0 ? cy : cy - l, 2, l);
    }
  }

  destroy(): void { this.gfx.destroy(); }
}
