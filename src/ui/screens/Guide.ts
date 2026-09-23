import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../constants';
import { HarrowRig } from '../../rig/bodies/harrow';
import { RigView } from '../../rig/view/RigView';
import type { IconName } from '../icons';
import { DEPTH, tc, type Role } from '../theme';
import { IconButton, Keycap, icon, label, panel } from '../kit/widgets';
import { Layer } from './overlays';

interface Callout { keys: string[]; icon: IconName; text: string; role: Role; socket: string }

// ordered top-to-bottom by where each socket sits on the mech, so leaders don't cross
const CALLOUTS: Callout[] = [
  { keys: ['E'], icon: 'missile', text: 'MISSILE', role: 'warn', socket: 'podTube' },
  { keys: ['F'], icon: 'relay', text: 'RELAY', role: 'repair', socket: 'antennaTip' },
  { keys: ['RMB'], icon: 'gatling', text: 'GATLING', role: 'accent', socket: 'muzzleRapid' },
  { keys: ['LMB'], icon: 'turret', text: 'CANNON', role: 'accent', socket: 'muzzleMain' },
  { keys: ['Q'], icon: 'repair', text: 'REPAIR', role: 'repair', socket: 'chest' },
  { keys: ['SPACE'], icon: 'jump', text: 'JUMP / JETS', role: 'accent', socket: 'jetBack' },
  { keys: ['SHIFT'], icon: 'surge', text: 'SURGE', role: 'accent', socket: 'calfNear' },
  { keys: ['A', 'D'], icon: 'move', text: 'WALK', role: 'accent', socket: 'toeNear' },
];

const SCALE = 6;
const ORIGIN = { x: 520, y: 820 };

/**
 * Pilot guide: a live HARROW portrait with key-caps wired by leader lines to the part
 * each control drives. Minimal words; the mech is the manual.
 */
export class PilotGuide {
  private layer: Layer;
  private rig = new HarrowRig();
  private view: RigView;
  private lines: Phaser.GameObjects.Graphics;
  private dots: Phaser.GameObjects.Graphics;
  private anchors: { x: number; y: number; socket: string; role: Role }[] = [];
  private t = 0;

  constructor(scene: Phaser.Scene, returnsToPause: boolean, close: () => void) {
    const L = this.layer = new Layer(scene);
    const D = DEPTH.modal;
    L.add(scene.add.rectangle(0, 0, GAME_W, GAME_H, tc('well')).setOrigin(0).setDepth(D));
    L.add(panel(scene, 64, 64, GAME_W - 128, GAME_H - 128, 'panel').setDepth(D));
    L.add(icon(scene, 112, 112, 'controls', 4, 'accent').setDepth(D + 1));
    L.add(label(scene, 152, 112, 'HARROW', 'display', 'ink').setOrigin(0, 0.5).setDepth(D + 1));

    // ground line + portrait
    const floor = L.add(scene.add.graphics().setDepth(D + 1));
    floor.fillStyle(tc('edgeDim'), 1).fillRect(160, ORIGIN.y, 720, 4);
    for (let x = 160; x < 880; x += 24) floor.fillRect(x, ORIGIN.y + 8, 12, 2);
    this.lines = L.add(scene.add.graphics().setDepth(D + 1));
    this.view = new RigView(scene, 'harrow', D + 2);
    L.add(this.view.container);
    this.dots = L.add(scene.add.graphics().setDepth(D + 3));

    // callout column
    const cx = 1100, top = 200, rowH = 80;
    CALLOUTS.forEach((c, i) => {
      const y = top + i * rowH;
      let x = cx;
      for (const k of c.keys) {
        const cap = L.add(new Keycap(scene, 0, 0, k, 'ink').setDepth(D + 2));
        cap.setPosition(x + cap.capW / 2, y);
        x += cap.capW + 8;
      }
      L.add(icon(scene, cx + 200, y, c.icon, 4, c.role).setDepth(D + 2));
      L.add(label(scene, cx + 248, y, c.text, 'title', c.role).setOrigin(0, 0.5).setDepth(D + 2));
      this.anchors.push({ x: cx - 16, y, socket: c.socket, role: c.role });
    });

    const btn = L.add(new IconButton(scene, GAME_W - 64 - 32 - 360, GAME_H - 64 - 32 - 64, {
      icon: 'play', text: returnsToPause ? 'BACK' : 'DEPLOY', key: 'ENTER', w: 360, h: 64, iconScale: 2, onClick: close,
    }).setDepth(D + 2).setFocused(true));
    void btn;
    L.key('keydown-ENTER', close);
    L.key('keydown-SPACE', close);
    this.tick(0);
  }

  /** Idle the portrait, sweep the guns, redraw leader lines to the live sockets. */
  tick(deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.t += dt;
    const t = this.t;
    this.rig.update({
      dt, dx: 0, vx: 0, vy: 0, grounded: true, facing: 1,
      aimDx: 70 + Math.cos(t * 0.9) * 30, aimDy: -46 + Math.sin(t * 1.3) * 30,
      moving: false, dashing: false, dashDir: 1, thrust: 0, sputter: false, mode: 'normal',
      modeRemaining: 0, modeTime: t, hp: 100, time: t,
    });
    this.view.sync(ORIGIN.x, ORIGIN.y, 1, this.rig, {}, SCALE);
    const g = this.lines.clear();
    const dots = this.dots.clear();
    for (const a of this.anchors) {
      const s = this.rig.sockets[a.socket];
      if (!s) continue;
      const px = Math.round((ORIGIN.x + s.x * SCALE) / 2) * 2, py = Math.round((ORIGIN.y + s.y * SCALE) / 2) * 2;
      // elbowed leader: horizontal from the callout, then diagonal to the part
      const elbow = 960;
      g.fillStyle(tc(a.role === 'accent' ? 'accentDim' : a.role === 'warn' ? 'warnDim' : 'repairDim'), 1);
      g.fillRect(elbow, a.y - 1, a.x - elbow, 2);
      stepLine(g, elbow, a.y, px, py);
      dots.fillStyle(tc('well'), 1).fillRect(px - 6, py - 6, 12, 12);
      dots.fillStyle(tc(a.role), 1).fillRect(px - 4, py - 4, 8, 8);
    }
  }

  destroy(): void { this.layer.destroy(); }
}

/** A stair-stepped 2px line (pixel-art leader). */
function stepLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2));
  for (let i = 0; i <= n; i++) {
    const x = Math.round((x0 + ((x1 - x0) * i) / n) / 2) * 2;
    const y = Math.round((y0 + ((y1 - y0) * i) / n) / 2) * 2;
    g.fillRect(x - 1, y - 1, 2, 2);
  }
}
