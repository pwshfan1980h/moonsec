import Phaser from 'phaser';
import { markDevReady } from '../dev/ready';
import { GAME_W, GAME_H } from '../constants';
import { NODE_GRAPH } from '../data/levelConfigs';
import { installPipeline } from '../render/RenderPipeline';
import { PALETTE_RGB, pal, palCss, palIndex, type PaletteName } from '../render/palette';
import { rampPick } from '../render/ditherMath';
import { tileableNoise } from '../fx/noise';
import type { IconName } from '../ui/icons';
import { tc, type Role } from '../ui/theme';
import { pad } from '../ui/kit/logic';
import { Keycap, icon, label, panel, setLabel, setPanelLook, type Label } from '../ui/kit/widgets';
import type { PanelLook } from '../ui/kit/uiTextures';

interface NodeDef {
  x: number;
  y: number;
  label: string;
  glyph: IconName;
  nextNodes: number[];
  requiredNodes: number[];
}

const MOON_X = 960;
const MOON_Y = 610;
const MOON_R = 306;

const NODES: NodeDef[] = [
  { x: 776, y: 790, label: 'SURFACE OPS', glyph: 'relay', ...NODE_GRAPH[0] },
  { x: 790, y: 510, label: 'TRADE LANES', glyph: 'surge', ...NODE_GRAPH[1] },
  { x: 966, y: 760, label: 'DEEP FACILITY', glyph: 'hazard', ...NODE_GRAPH[2] },
  { x: 1130, y: 490, label: 'ORBITAL STATION', glyph: 'view', ...NODE_GRAPH[3] },
  { x: 1156, y: 730, label: 'NEXUS CORE', glyph: 'boss', ...NODE_GRAPH[4] },
];

const EDGES: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];

type NodeState = 'done' | 'open' | 'locked';

/**
 * Mission select over a pre-rendered pixel moon. Nodes are icon plates, paths are
 * stepped pixel lines, the cursor is a bracket reticle; the header is icons + numbers.
 */
export class OverworldScene extends Phaser.Scene {
  private currentNode = 0;
  private completedNodes: number[] = [];
  private totalScore = 0;
  private selectableNodes: number[] = [];
  private selectIdx = 0;
  private reticle!: Phaser.GameObjects.Graphics;
  private info!: { name: Label; glyph: Phaser.GameObjects.Image; num: Label };
  private plates: Phaser.GameObjects.NineSlice[] = [];
  private keyboardEventUnsubs: Array<() => void> = [];
  private launching = false;

  constructor() { super('Overworld'); }

  init(data: { currentNode?: number; completedNodes?: number[]; totalScore?: number }): void {
    this.currentNode = data.currentNode ?? 0;
    this.completedNodes = data.completedNodes ?? [];
    this.totalScore = data.totalScore ?? ((this.registry.get('totalScore') as number) ?? 0);
    // campaign progress for the title screen's MISSIONS entry
    this.registry.set('completedNodes', this.completedNodes);
    this.registry.set('totalScore', this.totalScore);
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.keyboardEventUnsubs = [];
    this.plates = [];
    this.launching = false;
    this.cameras.main.setBackgroundColor(palCss('void'));
    installPipeline(this, this.cameras.main, 'ui');

    this.selectableNodes = this.getSelectableNodes();
    this.selectIdx = Math.max(0, this.selectableNodes.indexOf(this.currentNode));

    this.buildStarfield();
    this.buildMoon();
    this.buildPaths();
    this.buildNodes();
    this.buildHeader();
    this.buildInfo();
    this.reticle = this.add.graphics().setDepth(8);
    this.placeReticle(false);
    this.setupInput();
    this.cameras.main.fadeIn(700, 0, 0, 0);
    markDevReady(this);
  }

  // ── availability ─────────────────────────────────────────────────────────
  private getAvailableNodes(): number[] {
    return NODES.map((_, i) => i).filter((i) => {
      const { requiredNodes } = NODES[i];
      return requiredNodes.length === 0 || requiredNodes.some((r) => this.completedNodes.includes(r));
    });
  }

  private getSelectableNodes(): number[] {
    return this.getAvailableNodes().filter((i) => !this.completedNodes.includes(i));
  }

  private stateOf(i: number): NodeState {
    if (this.completedNodes.includes(i)) return 'done';
    return this.getAvailableNodes().includes(i) ? 'open' : 'locked';
  }

  // ── backdrop ─────────────────────────────────────────────────────────────
  private buildStarfield(): void {
    const g = this.add.graphics().setDepth(0);
    const rng = new Phaser.Math.RandomDataGenerator(['overworld-stars']);
    for (let i = 0; i < 300; i++) {
      const x = rng.between(0, GAME_W / 2 - 1) * 2, y = rng.between(0, GAME_H / 2 - 1) * 2;
      if (Phaser.Math.Distance.Between(x, y, MOON_X, MOON_Y) < MOON_R + 8) continue;
      const r = rng.frac();
      g.fillStyle(pal(r > 0.96 ? 'hull6' : r > 0.8 ? 'hull5' : r > 0.45 ? 'hull3' : 'hull2'), 1).fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 24; i++) {
      const x = rng.between(0, GAME_W / 2 - 1) * 2, y = rng.between(0, GAME_H / 2 - 1) * 2;
      if (Phaser.Math.Distance.Between(x, y, MOON_X, MOON_Y) < MOON_R + 8) continue;
      const s = this.add.rectangle(x, y, 2, 2, pal('hull6')).setOrigin(0).setDepth(1);
      this.tweens.add({ targets: s, alpha: { from: 0, to: 1 }, duration: rng.between(600, 2400), yoyo: true, repeat: -1, delay: rng.between(0, 2000) });
    }
  }

  /** Pre-rendered pixel moon: dithered terminator, craters, grid, colony lights. */
  private buildMoon(): void {
    const R = MOON_R / 2, S = 2 * R + 4;
    const key = 'overworld-moon';
    if (!this.textures.exists(key)) {
      const n = tileableNoise(128, 64, 31, 5, 5), cr = tileableNoise(128, 64, 47, 3, 10);
      const tex = this.textures.createCanvas(key, S, S)!;
      const ctx = tex.getContext();
      const img = ctx.createImageData(S, S);
      const L = [-0.7, -0.35, 0.62];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = (x - S / 2 + 0.5) / R, dy = (y - S / 2 + 0.5) / R;
        const rr = dx * dx + dy * dy;
        if (rr > 1) continue;
        const nz = Math.sqrt(1 - rr);
        const d = Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]);
        const u = Math.floor((Math.atan2(dx, nz) / Math.PI * 0.5 + 0.5) * 127);
        const v = Math.floor((Math.asin(Math.max(-1, Math.min(1, dy))) / Math.PI + 0.5) * 63);
        const albedo = 0.75 + (n[v * 128 + u] - 0.5) * 0.5 - (cr[v * 128 + u] > 0.7 ? 0.25 : 0);
        let c: PaletteName = rampPick(['void', 'hull1', 'hull2', 'hull3', 'hull4', 'hull5', 'regolith2'] as PaletteName[], d * albedo, x, y);
        // survey grid on the lit side, colony lights on the night side
        if ((u % 32 === 0 || v % 16 === 0) && (x + y) % 2 === 0 && d > 0.35 && c !== 'void') c = 'cold2';
        if (d < 0.04 && rr < 0.85 && (u * 5 + v * 11) % 89 === 0) c = 'amber1';
        const [r, g, b] = PALETTE_RGB[palIndex(c)];
        const o = (y * S + x) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
    }
    this.add.image(MOON_X, MOON_Y, key).setScale(2).setDepth(2);
    // lit limb ring in stepped pixels
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(pal('cold1'), 1);
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      if (Math.cos(a + 0.5) > -0.2) g.fillRect(Math.round((MOON_X + Math.cos(a) * (MOON_R + 8)) / 2) * 2, Math.round((MOON_Y + Math.sin(a) * (MOON_R + 8)) / 2) * 2, 2, 2);
    }
  }

  private buildPaths(): void {
    const g = this.add.graphics().setDepth(4);
    const available = this.getAvailableNodes();
    for (const [a, b] of EDGES) {
      const A = NODES[a], B = NODES[b];
      const done = this.completedNodes.includes(a) && this.completedNodes.includes(b);
      const lit = available.includes(a) && available.includes(b);
      g.fillStyle(pal(done ? 'amber1' : lit ? 'cyan1' : 'hull2'), 1);
      const n = Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / 4);
      for (let i = 4; i < n - 4; i++) {
        if (i % 4 === 3) continue; // dashes
        const x = Math.round((A.x + ((B.x - A.x) * i) / n) / 2) * 2, y = Math.round((A.y + ((B.y - A.y) * i) / n) / 2) * 2;
        g.fillRect(x - 2, y - 2, 4, 4);
      }
    }
  }

  private buildNodes(): void {
    NODES.forEach((node, i) => {
      const state = this.stateOf(i);
      const look: PanelLook = state === 'done' ? 'warn' : state === 'open' ? 'panel-hot' : 'button-off';
      const role: Role = state === 'done' ? 'warn' : state === 'open' ? 'accent' : 'inkFaint';
      this.plates[i] = panel(this, node.x - 28, node.y - 28, 56, 56, look).setDepth(5);
      icon(this, node.x, node.y, state === 'locked' ? 'lock' : state === 'done' ? 'check' : node.glyph, 2, role).setDepth(6);
      label(this, node.x, node.y + 44, node.label, 'small', state === 'locked' ? 'inkFaint' : role).setOrigin(0.5).setDepth(6);
    });
  }

  private buildHeader(): void {
    icon(this, 64, 60, 'map', 4, 'accent');
    label(this, 104, 60, 'MOONBASE THETA', 'title', 'ink').setOrigin(0, 0.5);
    const done = this.completedNodes.length;
    const score = label(this, GAME_W - 48, 60, pad(this.totalScore, 7), 'body', 'ink').setOrigin(1, 0.5);
    icon(this, score.x - score.width - 24, 60, 'score', 2, 'warn');
    const prog = label(this, GAME_W - 48, 104, `${done}/${NODES.length}`, 'body', 'warn').setOrigin(1, 0.5);
    icon(this, prog.x - prog.width - 24, 104, 'check', 2, 'warn');
    // corner brackets frame the map
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(tc('accentDim'), 1);
    const b = 24, s = 40;
    for (const [x, y, dx, dy] of [[b, b, 1, 1], [GAME_W - b, b, -1, 1], [b, GAME_H - b, 1, -1], [GAME_W - b, GAME_H - b, -1, -1]] as const) {
      g.fillRect(dx > 0 ? x : x - s, dy > 0 ? y : y - 4, s, 4);
      g.fillRect(dx > 0 ? x : x - 4, dy > 0 ? y : y - s, 4, s);
    }
  }

  /** Bottom strip: the selected mission and key hints. */
  private buildInfo(): void {
    const y = GAME_H - 76;
    panel(this, GAME_W / 2 - 360, y - 32, 720, 64, 'panel').setDepth(9);
    const glyph = icon(this, GAME_W / 2 - 320, y, 'target', 2, 'accent').setDepth(10);
    const num = label(this, GAME_W / 2 - 290, y, '01', 'body', 'accentDim').setOrigin(0, 0.5).setDepth(10);
    const name = label(this, GAME_W / 2 - 220, y, '', 'title', 'ink').setOrigin(0, 0.5).setDepth(10);
    this.info = { name, glyph, num };
    const hasChoice = this.selectableNodes.length > 1;
    let x = GAME_W / 2 + 350;
    const cap = (k: string) => { const c = new Keycap(this, 0, y, k, 'inkDim').setDepth(10); x -= c.capW; c.setX(x + c.capW / 2); x -= 8; return c; };
    cap('ENTER');
    icon(this, x - 12, y, 'play', 2, 'accent').setDepth(10);
    x -= 36;
    if (hasChoice) { cap('D'); cap('A'); }
    this.refreshInfo();
  }

  private refreshInfo(): void {
    const i = this.selectableNodes[this.selectIdx];
    if (i === undefined) { setLabel(this.info.name, 'ALL CLEAR', 'warn'); this.info.glyph.setFrame('check'); return; }
    setLabel(this.info.name, NODES[i].label);
    setLabel(this.info.num, pad(i + 1, 2));
    this.info.glyph.setFrame(NODES[i].glyph);
  }

  private placeReticle(animate: boolean): void {
    const i = this.selectableNodes[this.selectIdx];
    if (i === undefined) { this.reticle.setVisible(false); return; }
    const { x, y } = NODES[i];
    this.plates.forEach((p, k) => { if (this.stateOf(k) === 'open') setPanelLook(p, k === i ? 'button-hot' : 'panel-hot'); });
    const draw = () => {
      const g = this.reticle.clear();
      g.fillStyle(tc('ink'), 1);
      const s = 40, l = 12;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = sx * s, cy = sy * s;
        g.fillRect(sx < 0 ? cx : cx - l, sy < 0 ? cy : cy - 4, l, 4);
        g.fillRect(sx < 0 ? cx : cx - 4, sy < 0 ? cy : cy - l, 4, l);
      }
    };
    draw();
    this.tweens.killTweensOf(this.reticle);
    if (animate) this.tweens.add({ targets: this.reticle, x, y, duration: 160, ease: 'Quad.easeOut' });
    else this.reticle.setPosition(x, y);
    this.tweens.add({ targets: this.reticle, scale: { from: 1, to: 1.12 }, duration: 520, yoyo: true, repeat: -1, delay: animate ? 160 : 0 });
    this.refreshInfo();
  }

  // ── input ────────────────────────────────────────────────────────────────
  private setupInput(): void {
    const kb = this.input.keyboard!;
    const bind = (ev: string, fn: () => void) => { kb.on(ev, fn); this.keyboardEventUnsubs.push(() => kb.off(ev, fn)); };
    bind('keydown-ENTER', () => this.launchLevel());
    bind('keydown-SPACE', () => this.launchLevel());
    bind('keydown-LEFT', () => this.shiftCursor(-1));
    bind('keydown-RIGHT', () => this.shiftCursor(1));
    bind('keydown-A', () => this.shiftCursor(-1));
    bind('keydown-D', () => this.shiftCursor(1));
    bind('keydown-ESC', () => { if (!this.launching) this.scene.start('Title'); });

    for (const nodeIdx of this.selectableNodes) {
      const { x, y } = NODES[nodeIdx];
      const zone = this.add.zone(x, y, 96, 96).setInteractive({ useHandCursor: true }).setDepth(9);
      zone.on('pointerover', () => {
        const si = this.selectableNodes.indexOf(nodeIdx);
        if (si !== -1 && si !== this.selectIdx) { this.selectIdx = si; this.placeReticle(true); }
      });
      zone.on('pointerup', () => this.launchLevel());
    }
  }

  private shiftCursor(dir: -1 | 1): void {
    if (this.selectableNodes.length <= 1) return;
    this.selectIdx = (this.selectIdx + dir + this.selectableNodes.length) % this.selectableNodes.length;
    this.placeReticle(true);
    if (this.cache.audio.exists('ui-nav')) this.sound.play('ui-nav');
  }

  private launchLevel(): void {
    if (this.selectableNodes.length === 0 || this.launching) return;
    this.launching = true;
    const chosen = this.selectableNodes[this.selectIdx];
    this.registry.set('totalScore', this.totalScore);
    if (this.cache.audio.exists('ui-confirm')) this.sound.play('ui-confirm');
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Game', { level: chosen, totalScore: this.totalScore, completedNodes: this.completedNodes });
      this.scene.launch('UI');
    });
  }

  shutdown(): void {
    for (const unsub of this.keyboardEventUnsubs.splice(0)) unsub();
    this.tweens.killTweensOf(this.reticle);
  }
}
