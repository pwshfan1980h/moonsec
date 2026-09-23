import Phaser from 'phaser';
import { EnemyRig, type EnemyRigSpec } from '../rig/bodies/enemyRig';
import * as SPECS from '../rig/bodies/foeSpecs';
import { RigView } from '../rig/view/RigView';
import { installPipeline } from '../render/RenderPipeline';
import { pal, palCss } from '../render/palette';
import { markDevReady } from './ready';

/** Dev gallery of every enemy body (`?rigtest=foes`): walkers walk, flyers bob and aim. */
export class FoeGallery extends Phaser.Scene {
  private items: { rig: EnemyRig; view: RigView; x: number; y: number; walker: boolean; open: boolean }[] = [];
  private t = 0;

  constructor() { super({ key: 'FoeGallery' }); }

  create(): void {
    this.cameras.main.setBackgroundColor(pal('void'));
    installPipeline(this, this.cameras.main, 'world');
    const entries = Object.entries(SPECS) as [string, EnemyRigSpec][];
    const cols = 6;
    entries.forEach(([name, spec], i) => {
      const x = 170 + (i % cols) * 300;
      const y = 300 + Math.floor(i / cols) * 330;
      const walker = spec.hipHeight !== undefined;
      this.add.rectangle(x, y + 2, 260, 6, pal('hull2')).setOrigin(0.5, 0);
      this.add.text(x - 120, y + 16, name, { fontFamily: 'monospace', fontSize: '20px', color: palCss('cyan2') });
      const rig = new EnemyRig(spec);
      const view = new RigView(this, 'foe', 10);
      this.items.push({ rig, view, x, y: walker ? y : y - 110, walker, open: i % 2 === 0 });
    });
    markDevReady(this);
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.t += dt;
    for (const it of this.items) {
      const speed = it.walker ? 40 : 0;
      const aim: Record<string, number> = {};
      for (const a of it.rig.spec.aimers ?? []) aim[a.name] = Math.sin(this.t * 1.3) * 0.6 + (a.arc[0] + a.arc[1]) / 2;
      it.rig.update({
        dt, dx: speed * dt, vx: speed, vy: it.walker ? 0 : Math.sin(this.t * 2) * 60, grounded: it.walker, facing: 1,
        moving: it.walker, aim, time: this.t, open: it.open ? (Math.sin(this.t) + 1) / 2 : 0,
        ax: Math.cos(this.t * 2) * 400, fold: it.walker ? 0 : (Math.sin(this.t * 0.7) + 1) / 2,
      });
      it.view.sync(it.x, it.y, 1, it.rig);
    }
  }
}
