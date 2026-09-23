import Phaser from 'phaser';
import { HARROW_BODY, type Player } from '../entities/Player';
import { damageStage } from '../balance/armor';
import { tc, type Role } from './theme';

const BAR_W = 40;
const BAR_H = 4;
const ROW_GAP = 2;
const HEAD_OFFSET = 12;

/**
 * Diegetic mini-bars over HARROW: armor (stage-coloured, green while repairing) and jet
 * fuel. Drawn in 2px blocks on palette colours so they sit on the world pixel grid.
 */
export class PlayerHud {
  private g: Phaser.GameObjects.Graphics;
  private hp = 100;
  private hpRatio = 1;
  private fuelRatio = 1;
  private healActive = false;

  constructor(private readonly scene: Phaser.Scene, private readonly player: Player) {
    this.g = scene.add.graphics().setDepth(player.depth + 1);
    const e = scene.events;
    e.on('healthChange', this.onHealth, this);
    e.on('jetpackFuel', this.onFuel, this);
    e.on('naniteChange', this.onNanite, this);
    this.redraw();
  }

  update(): void { this.redraw(); }

  destroy(): void {
    const e = this.scene.events;
    e.off('healthChange', this.onHealth, this);
    e.off('jetpackFuel', this.onFuel, this);
    e.off('naniteChange', this.onNanite, this);
    this.g.destroy();
  }

  private onHealth = (hp: number, max: number): void => {
    this.hp = hp;
    this.hpRatio = max > 0 ? Phaser.Math.Clamp(hp / max, 0, 1) : 0;
  };

  private onFuel = (fuel: number, max: number): void => {
    this.fuelRatio = max > 0 ? Phaser.Math.Clamp(fuel / max, 0, 1) : 0;
  };

  private onNanite = (state: string): void => { this.healActive = state === 'active'; };

  private redraw(): void {
    const g = this.g.clear();
    const x0 = Math.round((this.player.x - BAR_W / 2) / 2) * 2;
    const y0 = Math.round((this.player.y - HARROW_BODY.visualH - HEAD_OFFSET) / 2) * 2;
    const stage = damageStage(this.hp);
    const hpRole: Role = this.healActive ? 'repair' : stage === 'healthy' ? 'repair' : stage === 'light' ? 'warn' : 'danger';
    const blink = stage === 'critical' && !this.healActive && Math.floor(this.scene.time.now / 180) % 2 === 1;
    this.bar(g, x0, y0, this.hpRatio, blink ? 'dangerDim' : hpRole);
    this.bar(g, x0, y0 + BAR_H + ROW_GAP, this.fuelRatio, this.fuelRatio > 0.3 ? 'accent' : 'warn');
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, ratio: number, role: Role): void {
    g.fillStyle(tc('well'), 1).fillRect(x - 2, y - 2, BAR_W + 4, BAR_H + 4);
    const w = Math.round((BAR_W * ratio) / 2) * 2;
    if (w > 0) g.fillStyle(tc(role), 1).fillRect(x, y, w, BAR_H);
  }
}
