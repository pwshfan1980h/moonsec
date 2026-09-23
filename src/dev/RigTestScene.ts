import Phaser from 'phaser';
import { HarrowRig, type HarrowInput, type RigMode } from '../rig/bodies/harrow';
import { RigView } from '../rig/view/RigView';
import { installPipeline } from '../render/RenderPipeline';
import { pal, palCss } from '../render/palette';
import { VPX } from '../render/GraphicsSettings';
import { markDevReady } from './ready';
import { devParams } from './devParams';

interface Demo {
  label: string;
  rig: HarrowRig;
  view: RigView;
  x: number;
  y: number;
  drive: (t: number) => Partial<HarrowInput> & { walkSpeed?: number };
  bones: Phaser.GameObjects.Graphics;
}

/**
 * Dev-only rig gallery (`?rigtest=all`): HARROW in every major state on one screen,
 * with bones drawn, for screenshots and eyeballing the rig without the game around it.
 */
export class RigTestScene extends Phaser.Scene {
  private demos: Demo[] = [];
  private t = 0;

  constructor() { super({ key: 'RigTest' }); }

  create(): void {
    this.cameras.main.setBackgroundColor(pal('void'));
    installPipeline(this, this.cameras.main, 'world');
    const rows = [300, 620, 940];
    const cols = [240, 720, 1200, 1680];
    for (const y of rows) this.add.rectangle(960, y + 16, 1920, 32, pal('hull3')).setOrigin(0.5, 0);
    const mk = (label: string, col: number, row: number, drive: Demo['drive']) => {
      const rig = new HarrowRig();
      const view = new RigView(this, 'harrow', 10);
      const bones = this.add.graphics().setDepth(20);
      this.add.text(cols[col] - 100, rows[row] + 40, label, { fontFamily: 'monospace', fontSize: '22px', color: palCss('cyan2') });
      this.demos.push({ label, rig, view, x: cols[col], y: rows[row] + 16, drive, bones });
    };
    const mode = (m: RigMode) => ({ mode: m });
    mk('idle / aim sweep', 0, 0, (t) => ({ aimDx: Math.cos(t * 1.5) * 140, aimDy: -40 + Math.sin(t * 1.5) * 90 }));
    mk('walk', 1, 0, () => ({ walkSpeed: 66 }));
    mk('backpedal', 2, 0, () => ({ walkSpeed: -66 }));
    mk('limp (armor 8)', 3, 0, () => ({ walkSpeed: 66, hp: 8 }));
    mk('jump jets', 0, 1, (t) => ({ grounded: false, thrust: 1, vy: -120 + Math.sin(t) * 40 }));
    mk('falling / reach', 1, 1, () => ({ grounded: false, vy: 220 }));
    mk('surge dash', 2, 1, () => ({ dashing: true, dashDir: 1 }));
    mk('repair', 3, 1, () => mode('repair'));
    mk('relay uplink', 0, 2, () => mode('relay'));
    mk('EMP', 1, 2, () => ({ mode: 'emp', modeRemaining: 2 }));
    mk('destroyed', 2, 2, () => ({ mode: 'dead', hp: 0 }));
    mk('sparks (armor 20)', 3, 2, (t) => ({ hp: 20, aimDx: 140, aimDy: -80 + Math.sin(t * 2) * 40 }));
    markDevReady(this);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.t += dt;
    for (const d of this.demos) {
      const { walkSpeed = 0, ...over } = d.drive(this.t);
      d.rig.update({
        dt, dx: walkSpeed * dt, vx: walkSpeed, vy: 0, grounded: true, facing: 1, aimDx: 140, aimDy: -40,
        moving: walkSpeed !== 0, dashing: false, dashDir: 1, thrust: 0, sputter: false, mode: 'normal',
        modeRemaining: 0, modeTime: this.t, hp: 100, time: this.t, ...over,
      });
      if (this.t > 1 && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2) && d.label === 'idle / aim sweep') d.rig.fireCannon();
      d.view.sync(d.x, d.y, 1, d.rig);
      const g = d.bones.clear();
      if (devParams().rigtest !== 'bones') continue;
      g.lineStyle(2, pal('hostile1'), 1);
      for (const leg of d.rig.bones) {
        g.beginPath();
        g.moveTo(d.x + leg[0][0] * VPX, d.y + leg[0][1] * VPX);
        for (const [bx, by] of leg.slice(1)) g.lineTo(d.x + bx * VPX, d.y + by * VPX);
        g.strokePath();
      }
    }
  }
}
