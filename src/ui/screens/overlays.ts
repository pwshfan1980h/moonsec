import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../constants';
import type { IconName } from '../icons';
import { DEPTH, tc, type Role } from '../theme';
import { MenuFocus, pad } from '../kit/logic';
import { IconButton, Keycap, brackets, dim, icon, label, panel, type Label } from '../kit/widgets';
import type { PanelLook } from '../kit/uiTextures';

type Obj = Phaser.GameObjects.GameObject;

/** A disposable group of objects, tweens and key bindings. */
export class Layer {
  private objs: Obj[] = [];
  private keys: [string, () => void][] = [];
  constructor(readonly scene: Phaser.Scene) {}

  add<T extends Obj>(o: T): T { this.objs.push(o); return o; }

  key(ev: string, fn: () => void): void {
    this.scene.input.keyboard?.on(ev, fn);
    this.keys.push([ev, fn]);
  }

  destroy(): void {
    for (const [ev, fn] of this.keys.splice(0)) this.scene.input.keyboard?.off(ev, fn);
    for (const o of this.objs.splice(0)) { this.scene.tweens.killTweensOf(o); o.destroy(); }
  }
}

/** A vertical menu of icon buttons with keyboard focus (↑/↓/W/S, Enter/Space). */
export function buttonColumn(layer: Layer, x: number, y: number, w: number, items: { icon: IconName; text: string; key?: string; onClick: () => void; enabled?: boolean }[], depth: number, rowH = 64): IconButton[] {
  const buttons = items.map((it, i) => layer.add(new IconButton(layer.scene, x, y + i * (rowH + 8), {
    icon: it.icon, text: it.text, key: it.key, w, h: rowH, iconScale: 2, onClick: it.onClick,
  }).setDepth(depth).setEnabled(it.enabled ?? true)));
  const focus = new MenuFocus(() => buttons.map((b) => b.enabled));
  const show = () => buttons.forEach((b, i) => b.setFocused(i === focus.index));
  buttons.forEach((b, i) => b.on('hover', () => { focus.set(i); show(); }));
  const move = (d: 1 | -1) => () => { focus.move(d); show(); };
  layer.key('keydown-UP', move(-1)); layer.key('keydown-W', move(-1));
  layer.key('keydown-DOWN', move(1)); layer.key('keydown-S', move(1));
  const go = () => buttons[focus.index]?.press();
  layer.key('keydown-ENTER', go); layer.key('keydown-SPACE', go);
  show();
  return buttons;
}

// ── Pause ───────────────────────────────────────────────────────────────────

export interface PauseActions {
  resume: () => void;
  controls: () => void;
  cyclePreset: () => void;
  toggleView: () => void;
  toggleAudio: () => void;
  exitToMap: () => void;
  state: () => { preset: string; view: string; muted: boolean };
}

export class PauseMenu {
  private layer: Layer;
  private buttons: IconButton[] = [];

  constructor(scene: Phaser.Scene, private readonly a: PauseActions) {
    this.layer = new Layer(scene);
    const L = this.layer;
    L.add(dim(scene, DEPTH.pause));
    const w = 520, h = 560, x = (GAME_W - w) / 2, y = (GAME_H - h) / 2;
    L.add(panel(scene, x, y, w, h, 'panel-hot').setDepth(DEPTH.pause));
    L.add(icon(scene, x + 48, y + 52, 'pause', 4, 'accent').setDepth(DEPTH.pause + 1));
    L.add(label(scene, x + 88, y + 52, 'PAUSED', 'title', 'ink').setOrigin(0, 0.5).setDepth(DEPTH.pause + 1));
    const s = a.state();
    this.buttons = buttonColumn(L, x + 32, y + 104, w - 64, [
      { icon: 'play', text: 'RESUME', key: 'ESC', onClick: a.resume },
      { icon: 'controls', text: 'CONTROLS', key: 'H', onClick: a.controls },
      { icon: 'graphics', text: s.preset, key: 'G', onClick: () => { a.cyclePreset(); this.refresh(); } },
      { icon: 'view', text: s.view, key: 'V', onClick: () => { a.toggleView(); this.refresh(); } },
      { icon: s.muted ? 'mute' : 'audio', text: s.muted ? 'MUTED' : 'SOUND', key: 'M', onClick: () => { a.toggleAudio(); this.refresh(); } },
      { icon: 'map', text: 'MAP', onClick: a.exitToMap },
    ], DEPTH.pause + 1);
  }

  refresh(): void {
    const s = this.a.state();
    this.buttons[2]?.setText(s.preset);
    this.buttons[3]?.setText(s.view);
    this.buttons[4]?.setIcon(s.muted ? 'mute' : 'audio').setText(s.muted ? 'MUTED' : 'SOUND');
  }

  destroy(): void { this.layer.destroy(); }
}

// ── Upgrade picker ──────────────────────────────────────────────────────────

export interface UpgradeCard {
  id: string;
  icon: IconName;
  title: string;
  role: Role;
  /** Stat rows: up (buff) or down (cost), with an icon and a short delta. */
  rows: { icon: IconName; text: string; up: boolean }[];
}

export class UpgradePicker {
  private layer: Layer;

  constructor(scene: Phaser.Scene, header: { icon: IconName; text: string }, cards: UpgradeCard[], choose: (i: number) => void) {
    const L = this.layer = new Layer(scene);
    const D = DEPTH.modal + 2;
    L.add(dim(scene, D));
    const head = L.add(label(scene, GAME_W / 2 + 32, 236, header.text, 'title', 'ink').setOrigin(0.5).setDepth(D + 1));
    L.add(icon(scene, head.x - head.width / 2 - 36, 236, header.icon, 4, 'repair').setDepth(D + 1));
    const cw = 368, ch = 400, gap = 40;
    const x0 = (GAME_W - (cards.length * cw + (cards.length - 1) * gap)) / 2;
    const y0 = 300;
    cards.forEach((c, i) => {
      const x = x0 + i * (cw + gap);
      const look: PanelLook = c.role === 'repair' ? 'repair' : c.role === 'warn' ? 'warn' : 'panel-hot';
      const bg = L.add(panel(scene, x, y0, cw, ch, look).setDepth(D + 1));
      L.add(icon(scene, x + cw / 2, y0 + 88, c.icon, 8, c.role).setDepth(D + 2));
      L.add(label(scene, x + cw / 2, y0 + 176, c.title, 'title', c.role).setOrigin(0.5).setDepth(D + 2));
      c.rows.forEach((r, k) => {
        const ry = y0 + 232 + k * 44;
        L.add(icon(scene, x + 56, ry, r.up ? 'arrowU' : 'arrowU', 2, r.up ? 'repair' : 'danger').setFlipY(!r.up).setDepth(D + 2));
        L.add(icon(scene, x + 92, ry, r.icon, 2, 'inkDim').setDepth(D + 2));
        L.add(label(scene, x + 116, ry, r.text, 'body', 'ink').setOrigin(0, 0.5).setDepth(D + 2));
      });
      L.add(new Keycap(scene, x + cw / 2, y0 + ch - 34, String(i + 1), 'ink').setDepth(D + 2));
      const hit = L.add(scene.add.zone(x, y0, cw, ch).setOrigin(0).setDepth(D + 3).setInteractive({ useHandCursor: true }));
      hit.on('pointerover', () => bg.setTexture(`ui-panel-button-hot`));
      hit.on('pointerout', () => bg.setTexture(`ui-panel-${look}`));
      hit.on('pointerup', () => choose(i));
    });
    const keys = ['ONE', 'TWO', 'THREE'];
    cards.forEach((_, i) => L.key(`keydown-${keys[i]}`, () => choose(i)));
  }

  destroy(): void { this.layer.destroy(); }
}

// ── Results (game over / mission complete) ──────────────────────────────────

export interface ResultStats { score: number; wave: number; kills: number }

export class ResultScreen {
  private layer: Layer;

  constructor(scene: Phaser.Scene, kind: 'lost' | 'won', stats: ResultStats, actions: { icon: IconName; text: string; key: string; onClick: () => void }[]) {
    const L = this.layer = new Layer(scene);
    const D = DEPTH.modal;
    L.add(dim(scene, D));
    const w = 640, h = 520, x = (GAME_W - w) / 2, y = (GAME_H - h) / 2;
    const role: Role = kind === 'lost' ? 'danger' : 'repair';
    L.add(panel(scene, x, y, w, h, kind === 'lost' ? 'alert' : 'repair').setDepth(D));
    L.add(icon(scene, GAME_W / 2, y + 88, kind === 'lost' ? 'cross' : 'check', 8, role).setDepth(D + 1));
    L.add(label(scene, GAME_W / 2, y + 170, kind === 'lost' ? 'DESTROYED' : 'SECTOR CLEAR', 'title', role).setOrigin(0.5).setDepth(D + 1));
    const rows: [IconName, Role, string][] = [
      ['score', 'warn', pad(stats.score, 7)],
      ['wave', 'accent', pad(stats.wave, 2)],
      ['hostile', 'danger', pad(stats.kills, 3)],
    ];
    rows.forEach(([ic, r, v], i) => {
      const ry = y + 226 + i * 48;
      L.add(icon(scene, x + 200, ry, ic, 2, r).setDepth(D + 1));
      L.add(label(scene, x + w - 200, ry, v, 'body', 'ink').setOrigin(1, 0.5).setDepth(D + 1));
    });
    const bw = (w - 64 - (actions.length - 1) * 16) / actions.length;
    const buttons = actions.map((a, i) => L.add(new IconButton(scene, x + 32 + i * (bw + 16), y + h - 96, {
      icon: a.icon, text: a.text, key: a.key, w: bw, h: 64, iconScale: 2, onClick: a.onClick,
    }).setDepth(D + 1)));
    const focus = new MenuFocus(() => buttons.map(() => true));
    const show = () => buttons.forEach((b, i) => b.setFocused(i === focus.index));
    buttons.forEach((b, i) => b.on('hover', () => { focus.set(i); show(); }));
    L.key('keydown-LEFT', () => { focus.move(-1); show(); });
    L.key('keydown-RIGHT', () => { focus.move(1); show(); });
    L.key('keydown-ENTER', () => buttons[focus.index]?.press());
    show();
  }

  destroy(): void { this.layer.destroy(); }
}

// ── Transient callouts ──────────────────────────────────────────────────────

/** Big centre banner: icon + short text; fades out. */
export function announce(scene: Phaser.Scene, ic: IconName, text: string, role: Role, holdMs = 1400): void {
  const t = label(scene, 0, 0, text, 'display', role).setOrigin(0, 0.5);
  const g = icon(scene, 0, 0, ic, 6, role);
  const total = 72 + 24 + t.width;
  const x0 = Math.round((GAME_W - total) / 2);
  g.setPosition(x0 + 36, GAME_H / 2 - 60);
  t.setPosition(x0 + 96, GAME_H / 2 - 60);
  const c = scene.add.container(0, 0, [g, t]).setDepth(DEPTH.announce);
  scene.tweens.add({ targets: c, alpha: 0, delay: holdMs, duration: 500, onComplete: () => c.destroy() });
}

/** Small rising callout (kill streak, pickups). */
export function callout(scene: Phaser.Scene, x: number, y: number, ic: IconName, text: string, role: Role): void {
  const t = label(scene, 16, 0, text, 'title', role).setOrigin(0, 0.5);
  const g = icon(scene, 0, 0, ic, 2, role);
  const c = scene.add.container(Math.round(x - (t.width + 16) / 2), y, [g, t]).setDepth(DEPTH.announce);
  scene.tweens.add({ targets: c, y: y - 60, alpha: 0, duration: 1500, ease: 'Power2', onComplete: () => c.destroy() });
}

/** Boss blast warning: hazard glyph on the danger side with an evade arrow. */
export class Telegraph {
  private c: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, side: 'left' | 'right') {
    const cx = side === 'left' ? GAME_W * 0.25 : GAME_W * 0.75;
    const w = 240, h = 136;
    const box = panel(scene, -w / 2, -h / 2, w, h, 'alert');
    const hz = icon(scene, -40, 0, 'hazard', 6, 'danger');
    const arrow = icon(scene, 56, 0, side === 'left' ? 'arrowR' : 'arrowL', 4, 'warn');
    this.c = scene.add.container(Math.round(cx), GAME_H / 2, [box, hz, arrow]).setDepth(DEPTH.telegraph);
    scene.tweens.add({ targets: [hz, arrow], alpha: { from: 0.3, to: 1 }, duration: 200, yoyo: true, repeat: -1 });
  }
  destroy(): void { this.c.scene?.tweens.killTweensOf(this.c.list); this.c.destroy(); }
}

/** Radio: speaker tag + message. The one place longer text is allowed. */
export class RadioPanel {
  private c?: Phaser.GameObjects.Container;
  constructor(private readonly scene: Phaser.Scene) {}

  show(speaker: string, message: string, warning: boolean): void {
    this.clear();
    const s = this.scene;
    const w = 760;
    const body = label(s, 60, 44, wrap(message, 46), 'small', 'ink').setLineSpacing(4);
    const h = Math.max(88, body.height + 64);
    const role: Role = warning ? 'warn' : 'accent';
    const bg = panel(s, 0, 0, w, h, warning ? 'warn' : 'panel');
    const ic = icon(s, 32, 32, 'relay', 2, role);
    const tag = label(s, 60, 24, speaker, 'small', role);
    this.c = s.add.container(Math.round((GAME_W - w) / 2), 208, [bg, ic, tag, body]).setDepth(DEPTH.radio).setAlpha(0);
    const c = this.c;
    s.tweens.add({ targets: c, alpha: 1, duration: 200, hold: 4600, yoyo: true, onComplete: () => { if (this.c === c) this.c = undefined; c.destroy(); } });
  }

  clear(): void {
    if (!this.c) return;
    this.scene.tweens.killTweensOf(this.c);
    this.c.destroy();
    this.c = undefined;
  }
}

/** Screen-edge damage flash plus a bitmap number that drifts away from the hit. */
export function damageFlash(scene: Phaser.Scene, amount: number, direction: -1 | 1, x: number, y: number): void {
  const edge = scene.add.graphics().setDepth(DEPTH.damage);
  const ex = direction < 0 ? 0 : GAME_W - 16;
  edge.fillStyle(tc('danger'), 1).fillRect(ex, 0, 16, GAME_H);
  edge.fillStyle(tc('dangerDim'), 1).fillRect(direction < 0 ? 16 : GAME_W - 32, 0, 16, GAME_H);
  scene.tweens.add({ targets: edge, alpha: 0, duration: 260, onComplete: () => edge.destroy() });
  const n = label(scene, x, y, `-${Math.round(amount)}`, 'body', 'danger').setOrigin(0.5).setDepth(DEPTH.damage + 1);
  scene.tweens.add({ targets: n, x: x + direction * 38, y: y - 28, alpha: 0, duration: 620, ease: 'Cubic.Out', onComplete: () => n.destroy() });
}

/** Greedy word wrap for the fixed-width radio text. */
export function wrap(text: string, cols: number): string {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (line && line.length + 1 + word.length > cols) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out.join('\n');
}

export { brackets, type Label };
