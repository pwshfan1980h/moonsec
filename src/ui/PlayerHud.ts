import Phaser from 'phaser';
import type { Player } from '../entities/Player';

const BAR_W       = 36;
const BAR_H       = 3;
const ROW_GAP     = 2;
const HEAD_OFFSET = 12;  // px above player.y - playerHeight to position the stack

const COL_HP_HI    = 0xff5566;  // crimson
const COL_HP_LO    = 0xffb347;  // amber when low
const COL_HP_CRIT  = 0xff2030;  // bright red below 25%
const COL_HP_HEAL  = 0x66ff99;  // green during nanite heal
const COL_FUEL_HI  = 0x7df0ff;  // electric cyan
const COL_FUEL_LO  = 0xff8a55;  // warm orange when low

const COL_BACKDROP = 0x000000;
const ALPHA_BACK   = 0.55;
const ALPHA_FRAME  = 0.45;
const ALPHA_FILL   = 0.95;

/**
 * Diegetic player HUD: tiny HP + thruster fuel bars stacked above the mech.
 * Replaces the upper-left INTEGRITY and THRUSTER FUEL readouts. Subtle, follows
 * the player every frame. HP turns green during a nanite heal cycle.
 */
export class PlayerHud {
  private scene: Phaser.Scene;
  private player: Player;
  private g: Phaser.GameObjects.Graphics;
  private hpRatio = 1;
  private fuelRatio = 1;
  private healActive = false;

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene;
    this.player = player;
    this.g = scene.add.graphics().setDepth(player.depth + 1);
    this.attachListeners();
    this.redraw();
  }

  /** Called from GameScene.update — repositions and redraws the bars to track the mech. */
  update(): void {
    this.redraw();
  }

  destroy(): void {
    const e = this.scene.events;
    e.off('healthChange', this.onHealth, this);
    e.off('jetpackFuel',  this.onFuel,   this);
    e.off('naniteChange', this.onNanite, this);
    this.g.destroy();
  }

  private attachListeners(): void {
    const e = this.scene.events;
    e.on('healthChange', this.onHealth, this);
    e.on('jetpackFuel',  this.onFuel,   this);
    e.on('naniteChange', this.onNanite, this);
  }

  private onHealth = (hp: number, max: number): void => {
    this.hpRatio = max > 0 ? Phaser.Math.Clamp(hp / max, 0, 1) : 0;
  };

  private onFuel = (fuel: number, max: number): void => {
    this.fuelRatio = max > 0 ? Phaser.Math.Clamp(fuel / max, 0, 1) : 0;
  };

  private onNanite = (state: string): void => {
    this.healActive = state === 'active';
  };

  private redraw(): void {
    const g = this.g;
    g.clear();

    // Head position — Player has origin (0.5, 1) so y is at feet; estimate head from displayHeight
    const headY = this.player.y - this.player.displayHeight - HEAD_OFFSET;
    const cx = this.player.x;
    const x0 = Math.round(cx - BAR_W / 2);
    const yHp   = Math.round(headY);
    const yFuel = yHp + BAR_H + ROW_GAP;

    const hpColor = this.healActive
      ? COL_HP_HEAL
      : this.hpRatio > 0.5 ? COL_HP_HI
      : this.hpRatio > 0.25 ? COL_HP_LO
      : COL_HP_CRIT;
    const fuelColor = this.fuelRatio > 0.3 ? COL_FUEL_HI : COL_FUEL_LO;

    this.drawBar(g, x0, yHp,   this.hpRatio,   hpColor);
    this.drawBar(g, x0, yFuel, this.fuelRatio, fuelColor);
  }

  private drawBar(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, ratio: number, color: number,
  ): void {
    // Backdrop (slightly larger for breathing room and contrast against bright fx)
    g.fillStyle(COL_BACKDROP, ALPHA_BACK);
    g.fillRect(x - 1, y - 1, BAR_W + 2, BAR_H + 2);

    // Frame
    g.lineStyle(1, color, ALPHA_FRAME);
    g.strokeRect(x - 0.5, y - 0.5, BAR_W + 1, BAR_H + 1);

    // Fill
    const fillW = Math.max(0, Math.round(BAR_W * ratio));
    if (fillW > 0) {
      g.fillStyle(color, ALPHA_FILL);
      g.fillRect(x, y, fillW, BAR_H);
    }
  }
}
