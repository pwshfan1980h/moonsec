import Phaser from 'phaser';
import type { IconName } from '../icons';
import { ICON_SIZE } from '../icons';
import { tc, type Role } from '../theme';
import { icon, label, panel, setLabel, setPanelLook, snapUp, type Label } from './draw';
export * from './draw';
import { buttonVisual, litTicks, ringTicks, segmentRects, type ButtonState } from './logic';

const KEY_ICONS: Record<string, IconName> = { LMB: 'mouseL', RMB: 'mouseR' };

/**
 * A key-cap: the key's name on a raised cap, or a mouse glyph for LMB/RMB.
 * Origin is the cap's centre. `width` reports the cap's width for layout.
 */
export class Keycap extends Phaser.GameObjects.Container {
  readonly capW: number;
  readonly capH = 28;
  private bg?: Phaser.GameObjects.NineSlice;
  private text?: Label;
  private glyph?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, key: string, role: Role = 'ink') {
    super(scene, Math.round(x), Math.round(y));
    const iconName = KEY_ICONS[key];
    if (iconName) {
      this.capW = 28;
      this.glyph = icon(scene, 0, 0, iconName, 2, role);
      this.add(this.glyph);
    } else {
      this.text = label(scene, 0, 0, key, 'small', role).setOrigin(0.5, 0.5);
      this.capW = Math.max(28, snapUp(this.text.width + 14));
      this.bg = panel(scene, -this.capW / 2, -this.capH / 2, this.capW, this.capH, 'key');
      this.text.setY(-1);
      this.add([this.bg, this.text]);
    }
    scene.add.existing(this);
  }

  setHot(hot: boolean): this {
    if (this.bg) setPanelLook(this.bg, hot ? 'key-hot' : 'key');
    return this;
  }

  setRole(role: Role): this {
    this.text?.setTint(tc(role));
    this.glyph?.setTint(tc(role));
    return this;
  }
}

/**
 * Segmented bar with a well, a partial last segment, a trailing "damage" ghost that
 * catches up after a hit, and an optional blink for critical states.
 */
export class SegBar {
  readonly g: Phaser.GameObjects.Graphics;
  private t = 1;
  private ghost = 1;
  private role: Role = 'accent';
  private blink = false;

  /** `trail`: show a damage ghost that drains after a drop (armor). */
  constructor(private readonly scene: Phaser.Scene, readonly x: number, readonly y: number, readonly w: number, readonly h: number, public segments: number, private readonly trail = false) {
    this.g = scene.add.graphics();
  }

  set(t: number, role: Role, blink = false): void {
    const v = Math.max(0, Math.min(1, t));
    if (v > this.t || !this.trail) this.ghost = v;
    this.t = v; this.role = role; this.blink = blink;
    this.draw(this.scene.time.now);
  }

  /** Advance the ghost and blink; call every frame. */
  tick(time: number, dt: number): void {
    if (this.ghost > this.t) this.ghost = Math.max(this.t, this.ghost - dt * 0.6);
    this.draw(time);
  }

  private draw(time: number): void {
    const g = this.g.clear();
    g.fillStyle(tc('well'), 1).fillRect(this.x, this.y, this.w, this.h);
    const inner = { x: this.x + 2, y: this.y + 2, w: this.w - 4, h: this.h - 4 };
    for (const s of segmentRects(inner.w, this.segments, 1)) g.fillStyle(tc('edgeDim'), 1).fillRect(inner.x + s.x, inner.y, s.w, inner.h);
    if (this.ghost > this.t) for (const s of segmentRects(inner.w, this.segments, this.ghost)) g.fillStyle(tc('dangerDim'), 1).fillRect(inner.x + s.x, inner.y, s.w, inner.h);
    const off = this.blink && Math.floor(time / 180) % 2 === 1;
    const role = off ? 'dangerDim' : this.role;
    for (const s of segmentRects(inner.w, this.segments, this.t)) g.fillStyle(tc(role), 1).fillRect(inner.x + s.x, inner.y, s.w, inner.h);
  }

  setDepth(d: number): this { this.g.setDepth(d); return this; }
  setVisible(v: boolean): this { this.g.setVisible(v); return this; }
  destroy(): void { this.g.destroy(); }
}

/** A ring of pixel ticks around an icon: a cooldown meter that reads at a glance. */
export class TickRing {
  readonly g: Phaser.GameObjects.Graphics;
  private readonly ticks: { x: number; y: number }[];

  constructor(scene: Phaser.Scene, readonly cx: number, readonly cy: number, radius: number, readonly n = 16, readonly size = 4) {
    this.g = scene.add.graphics();
    this.ticks = ringTicks(n, radius);
  }

  set(progress: number, on: Role, off: Role = 'edgeDim'): void {
    const lit = litTicks(progress, this.n);
    const g = this.g.clear();
    const hs = this.size / 2;
    this.ticks.forEach((p, i) => {
      g.fillStyle(tc(i < lit ? on : off), 1).fillRect(this.cx + p.x - hs, this.cy + p.y - hs, this.size, this.size);
    });
  }

  destroy(): void { this.g.destroy(); }
}

export interface IconButtonOptions {
  icon: IconName;
  /** Short label under/next to the icon (optional — icons first). */
  text?: string;
  /** Key-cap shown on the button. */
  key?: string;
  /** Hover-only tooltip. */
  tip?: string;
  w?: number;
  h?: number;
  iconScale?: number;
  onClick: () => void;
}

/**
 * Icon button: raised panel, big icon, optional short label and key-cap. Hover, press,
 * focus and disabled states come from `buttonVisual`. The tooltip appears on hover only.
 */
export class IconButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.NineSlice;
  private glyph: Phaser.GameObjects.Image;
  private text?: Label;
  private cap?: Keycap;
  private tipObj?: Phaser.GameObjects.Container;
  private btnState: ButtonState = 'idle';
  private focused = false;
  readonly bw: number;
  readonly bh: number;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly opt: IconButtonOptions) {
    super(scene, Math.round(x), Math.round(y));
    const scale = opt.iconScale ?? 4;
    this.bw = opt.w ?? (opt.text ? 280 : 16 + ICON_SIZE * scale + 16);
    this.bh = opt.h ?? 16 + ICON_SIZE * scale + 16;
    this.bg = panel(scene, 0, 0, this.bw, this.bh, 'button');
    const iconX = opt.text ? 16 + (ICON_SIZE * scale) / 2 : this.bw / 2;
    this.glyph = icon(scene, iconX, this.bh / 2, opt.icon, scale, 'accent');
    this.add([this.bg, this.glyph]);
    if (opt.text) {
      this.text = label(scene, 16 + ICON_SIZE * scale + 16, this.bh / 2, opt.text, 'title', 'accent').setOrigin(0, 0.5);
      this.add(this.text);
    }
    if (opt.key) {
      this.cap = new Keycap(scene, 0, 0, opt.key, 'inkDim');
      this.cap.setPosition(opt.text ? this.bw - this.cap.capW / 2 - 10 : this.bw / 2, opt.text ? this.bh / 2 : this.bh + 20);
      this.add(this.cap);
    }
    this.setSize(this.bw, this.bh);
    const hit = new Phaser.Geom.Rectangle(0, 0, this.bw, this.bh);
    this.setInteractive(hit, Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';
    this.on('pointerover', () => { if (this.btnState !== 'disabled') { this.btnState = 'hover'; this.showTip(true); this.refresh(); this.emit('hover'); } });
    this.on('pointerout', () => { if (this.btnState !== 'disabled') { this.btnState = 'idle'; this.showTip(false); this.refresh(); } });
    this.on('pointerdown', () => { if (this.btnState !== 'disabled') { this.btnState = 'down'; this.refresh(); } });
    this.on('pointerup', () => {
      if (this.btnState !== 'down') return;
      this.btnState = 'hover'; this.refresh();
      opt.onClick();
    });
    scene.add.existing(this);
    this.refresh();
  }

  get enabled(): boolean { return this.btnState !== 'disabled'; }

  setEnabled(on: boolean): this {
    this.btnState = on ? 'idle' : 'disabled';
    this.refresh();
    return this;
  }

  setFocused(on: boolean): this { this.focused = on; this.refresh(); return this; }

  setIcon(name: IconName): this { this.glyph.setFrame(name); return this; }
  setText(t: string): this { if (this.text) setLabel(this.text, t); return this; }

  /** Activate from the keyboard (flashes the pressed look). */
  press(): void {
    if (this.btnState === 'disabled') return;
    this.btnState = 'down'; this.refresh();
    this.scene.time.delayedCall(90, () => { if (this.btnState === 'down') { this.btnState = 'idle'; this.refresh(); } });
    this.opt.onClick();
  }

  private refresh(): void {
    const v = buttonVisual(this.btnState, this.focused);
    setPanelLook(this.bg, v.panel);
    this.glyph.setTint(tc(v.ink));
    this.text?.setTint(tc(v.ink));
    this.cap?.setHot(v.panel === 'button-hot' || v.panel === 'button-down');
    this.glyph.y = this.bh / 2 + v.dy;
    if (this.text) this.text.y = this.bh / 2 + v.dy;
  }

  private showTip(on: boolean): void {
    if (!this.opt.tip) return;
    if (!on) { this.tipObj?.destroy(); this.tipObj = undefined; return; }
    const t = label(this.scene, 10, 8, this.opt.tip, 'small', 'ink');
    const w = snapUp(t.width + 20), h = 30;
    const box = panel(this.scene, 0, 0, w, h, 'panel-hot');
    const c = this.scene.add.container(this.x + this.bw / 2 - w / 2, this.y - h - 8, [box, t]).setDepth(this.depth + 1);
    const m = this.parentContainer;
    if (m) { c.x += m.x; c.y += m.y; }
    this.tipObj = c;
  }

  destroy(fromScene?: boolean): void { this.tipObj?.destroy(); super.destroy(fromScene); }
}
