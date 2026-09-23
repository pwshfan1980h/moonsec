import Phaser from 'phaser';
import { markDevReady } from '../dev/ready';
import { GAME_W, GAME_H } from '../constants';
import { HarrowRig } from '../rig/bodies/harrow';
import { RigView } from '../rig/view/RigView';
import { RigFx } from '../rig/view/RigFx';
import { DustField } from '../fx/DustField';
import { ensureFogTexture, ensureShaftTexture } from '../fx/Atmosphere';
import { tileableNoise } from '../fx/noise';
import { PALETTE_RGB, pal, palCss, palIndex, type PaletteName } from '../render/palette';
import { rampPick } from '../render/ditherMath';
import { installPipeline, graphics, setGraphics, type CameraPipeline } from '../render/RenderPipeline';
import { nextPreset, saveGraphicsSettings } from '../render/GraphicsSettings';
import { saveMuted } from '../systems/audioPrefs';
import { icon, label } from '../ui/kit/widgets';
import { buttonColumn, Layer } from '../ui/screens/overlays';
import { PilotGuide } from '../ui/screens/Guide';
import type { IconButton } from '../ui/kit/widgets';

const GROUND_Y = 880;
const MECH_X = 600;
const MECH_SCALE = 4;
const CELL = 16;

/**
 * Start screen: HARROW idling on a regolith ridge under a dithered Earth, dust blowing
 * through a light shaft, the pixel MOONSEC logo, and an icon menu. HARROW tracks the
 * cursor; START fires its jets and launches into the campaign.
 */
export class TitleScene extends Phaser.Scene {
  private rig = new HarrowRig();
  private view!: RigView;
  private fx!: RigFx;
  private field!: DustField;
  private fieldTex!: Phaser.Textures.CanvasTexture;
  private pixels!: ImageData;
  private fog: Phaser.GameObjects.TileSprite[] = [];
  private shaft!: Phaser.GameObjects.Image;
  private pipeline?: CameraPipeline;
  private menu?: Layer;
  private buttons: IconButton[] = [];
  private guide?: PilotGuide;
  private t = 0;
  private acc = 0;
  private facing: 1 | -1 = 1;
  private launch = -1;
  private mechY = GROUND_Y;
  private pointerMoved = false;

  constructor() { super('Title'); }

  create(): void {
    this.t = 0; this.launch = -1; this.mechY = GROUND_Y; this.facing = 1; this.pointerMoved = false;
    this.input.once(Phaser.Input.Events.POINTER_MOVE, () => { this.pointerMoved = true; });
    this.rig = new HarrowRig();
    this.cameras.main.setBackgroundColor(palCss('void'));
    this.pipeline = installPipeline(this, this.cameras.main, 'world');

    this.buildStars();
    this.buildEarth();
    this.buildRidges();
    this.buildAtmosphere();
    this.view = new RigView(this, 'harrow', 20);
    this.fx = new RigFx(this, 19, 21);
    this.buildLogo();
    this.buildMenu();
    this.startMusic();
    this.cameras.main.fadeIn(600, 0, 0, 0);
    markDevReady(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.menu?.destroy(); this.guide?.destroy(); });
  }

  // ── backdrop ───────────────────────────────────────────────────────────────
  private buildStars(): void {
    const g = this.add.graphics().setDepth(0);
    const rng = new Phaser.Math.RandomDataGenerator(['title-stars']);
    for (let i = 0; i < 260; i++) {
      const x = rng.between(0, GAME_W / 2 - 1) * 2, y = rng.between(0, 380) * 2;
      const r = rng.frac();
      g.fillStyle(pal(r > 0.97 ? 'cyan3' : r > 0.85 ? 'hull6' : r > 0.5 ? 'hull4' : 'hull3'), 1).fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 18; i++) {
      const s = this.add.rectangle(rng.between(0, GAME_W / 2 - 1) * 2, rng.between(0, 300) * 2, 4, 4, pal('hull6')).setOrigin(0).setDepth(0);
      this.tweens.add({ targets: s, alpha: { from: 0.1, to: 1 }, duration: rng.between(700, 2200), yoyo: true, repeat: -1, delay: rng.between(0, 2000) });
    }
  }

  /** A pixel Earth: oceans, pale continents, clouds, a lit limb and night-side lights. */
  private buildEarth(): void {
    const R = 76, S = 2 * R + 8;
    const key = 'title-earth';
    if (!this.textures.exists(key)) {
      const land = tileableNoise(128, 64, 5, 4, 4), cloud = tileableNoise(128, 64, 9, 5, 6);
      const tex = this.textures.createCanvas(key, S, S)!;
      const ctx = tex.getContext();
      const img = ctx.createImageData(S, S);
      const L = [-0.62, -0.45, 0.64];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = (x - S / 2 + 0.5) / R, dy = (y - S / 2 + 0.5) / R;
        const rr = dx * dx + dy * dy;
        let c: PaletteName | null = null;
        if (rr <= 1) {
          const nz = Math.sqrt(1 - rr);
          const d = Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]);
          const lon = Math.atan2(dx, nz) / Math.PI * 0.5 + 0.5, lat = Math.asin(Math.max(-1, Math.min(1, dy))) / Math.PI + 0.5;
          const u = Math.floor(lon * 127), v = Math.floor(lat * 63);
          const isLand = land[v * 128 + u] > 0.56, isCloud = cloud[v * 128 + ((u + 20) % 128)] > 0.62;
          const shade = Math.pow(d, 0.8);
          if (isCloud) c = rampPick(['void', 'hull2', 'hull4', 'hull5', 'hull6'], shade, x, y);
          else if (isLand) c = shade < 0.12 && (u * 7 + v * 13) % 23 === 0 ? 'amber1' : rampPick(['void', 'hull1', 'hull3', 'regolith1', 'regolith2'], shade, x, y);
          else c = rampPick(['void', 'cold0', 'cold1', 'cold2', 'cyan1'], shade, x, y);
        } else if (rr <= 1.06) {
          const d = Math.max(0, dx * L[0] + dy * L[1]);
          if (d > 0.1) c = d > 0.5 ? 'cyan2' : 'cyan1';
        }
        if (!c) continue;
        const [r, g, b] = PALETTE_RGB[palIndex(c)];
        const o = (y * S + x) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
    }
    this.add.image(1540, 250, key).setScale(2).setDepth(1);
  }

  /** Three lunar ridges in 2px columns, plus an outpost silhouette on the far one. */
  private buildRidges(): void {
    const noise = (seed: number, x: number) => {
      let v = 0, a = 1, f = 1 / 240, tot = 0;
      for (let o = 0; o < 4; o++) { v += Math.sin(x * f * 6.283 + seed * 1.7 + o * 2.1) * a; tot += a; a *= 0.5; f *= 2.3; }
      return v / tot;
    };
    const layers: { base: number; amp: number; seed: number; fill: PaletteName; top: PaletteName; depth: number }[] = [
      { base: 690, amp: 70, seed: 3, fill: 'hull1', top: 'hull2', depth: 2 },
      { base: 790, amp: 44, seed: 7, fill: 'regolith0', top: 'regolith1', depth: 4 },
      { base: GROUND_Y, amp: 26, seed: 11, fill: 'regolith1', top: 'regolith2', depth: 8 },
    ];
    for (const L of layers) {
      const g = this.add.graphics().setDepth(L.depth);
      for (let x = 0; x < GAME_W; x += 2) {
        // the near ridge flattens where HARROW stands
        const flat = L.depth === 8 ? Math.min(1, Math.abs(x - MECH_X) / 220) : 1;
        const y = Math.round((L.base + noise(L.seed, x) * L.amp * flat) / 2) * 2;
        g.fillStyle(pal(L.fill), 1).fillRect(x, y, 2, GAME_H - y);
        g.fillStyle(pal(L.top), 1).fillRect(x, y, 2, 2);
      }
      if (L.depth === 8) {
        const rng = new Phaser.Math.RandomDataGenerator(['title-craters']);
        for (let i = 0; i < 14; i++) {
          const cx = rng.between(0, GAME_W / 2) * 2, cy = rng.between(GROUND_Y + 40, GAME_H - 20);
          const w = rng.between(10, 36) * 2;
          g.fillStyle(pal('regolith0'), 1).fillRect(cx - w / 2, cy, w, 4);
          g.fillStyle(pal('regolith2'), 1).fillRect(cx - w / 2 + 4, cy + 4, w - 8, 2);
        }
      }
      if (L.depth === 2) this.buildOutpost(g, 1180, Math.round((L.base + noise(L.seed, 1180) * L.amp) / 2) * 2);
    }
  }

  private buildOutpost(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(pal('hull2'), 1);
    g.fillRect(x - 60, y - 16, 120, 16);
    g.fillRect(x - 40, y - 28, 44, 12);
    g.fillRect(x + 20, y - 60, 4, 44);
    g.fillRect(x + 12, y - 64, 20, 4);
    const lamp = this.add.rectangle(x + 20, y - 68, 4, 4, pal('amber1')).setOrigin(0).setDepth(2);
    this.tweens.add({ targets: lamp, alpha: { from: 0, to: 1 }, duration: 120, hold: 200, repeatDelay: 1400, yoyo: true, repeat: -1 });
  }

  private buildAtmosphere(): void {
    const fogs: [number, PaletteName, number, number][] = [[11, 'hull2', 740, 180], [12, 'regolith0', 840, 110]];
    for (const [seed, color, y, h] of fogs) {
      const key = ensureFogTexture(this, seed);
      this.fog.push(this.add.tileSprite(0, y, GAME_W, h, key).setOrigin(0, 0.5).setTint(pal(color)).setAlpha(0.5).setDepth(y < 800 ? 3 : 7).setTileScale(2, h / 64));
    }
    this.shaft = this.add.image(760, -40, ensureShaftTexture(this)).setOrigin(0.5, 0).setScale(5, 5.6).setRotation(-0.35).setTint(pal('hull5')).setAlpha(0.14).setDepth(6);

    const cols = GAME_W / CELL + 2, rows = GAME_H / CELL + 2;
    this.field = new DustField({ cols, rows, cell: CELL, sink: 4 });
    this.field.windX = -34;
    this.field.anchor(-CELL, -CELL);
    const key = 'title-dust';
    if (this.textures.exists(key)) this.textures.remove(key);
    this.fieldTex = this.textures.createCanvas(key, cols, rows)!;
    this.pixels = this.fieldTex.getContext().createImageData(cols, rows);
    this.add.image(-CELL, -CELL, key).setOrigin(0).setScale(CELL).setDepth(18);
  }

  // ── logo + menu ────────────────────────────────────────────────────────────
  private buildLogo(): void {
    const x = 120, y = 150;
    label(this, x + 6, y + 6, 'MOONSEC', 'display', 'accentDeep').setScale(1.5).setDepth(30);
    label(this, x, y, 'MOONSEC', 'display', 'ink').setScale(1.5).setDepth(31);
    const g = this.add.graphics().setDepth(31);
    g.fillStyle(pal('cyan2'), 1).fillRect(x, y + 104, 96, 4);
    g.fillStyle(pal('cyan1'), 1).fillRect(x + 104, y + 104, 520, 4);
    icon(this, x + 12, y + 140, 'armor', 2, 'accent').setDepth(31);
    label(this, x + 36, y + 140, 'LUNAR DEFENSE DIVISION', 'small', 'inkDim').setOrigin(0, 0.5).setDepth(31);
    label(this, GAME_W - 24, GAME_H - 20, `ALPHA ${__APP_VERSION__}`, 'small', 'inkFaint').setOrigin(1, 0.5).setDepth(31);
  }

  private buildMenu(): void {
    this.menu?.destroy();
    const L = this.menu = new Layer(this);
    const s = graphics();
    this.buttons = buttonColumn(L, 1360, 520, 440, [
      { icon: 'play', text: 'START', key: 'ENTER', onClick: () => this.begin('Game') },
      { icon: 'map', text: 'MISSIONS', onClick: () => this.begin('Overworld') },
      { icon: 'controls', text: 'CONTROLS', key: 'H', onClick: () => this.openGuide() },
      { icon: 'graphics', text: s.preset.toUpperCase(), key: 'G', onClick: () => this.cyclePreset() },
      { icon: this.sound.mute ? 'mute' : 'audio', text: this.sound.mute ? 'MUTED' : 'SOUND', key: 'M', onClick: () => this.toggleAudio() },
    ], 40, 64);
    L.key('keydown-H', () => this.openGuide());
    L.key('keydown-G', () => this.cyclePreset());
    L.key('keydown-M', () => this.toggleAudio());
  }

  private cyclePreset(): void {
    const s = nextPreset(graphics());
    setGraphics(s); saveGraphicsSettings(s);
    this.pipeline?.apply(s);
    this.buttons[3]?.setText(s.preset.toUpperCase());
  }

  private toggleAudio(): void {
    this.sound.mute = !this.sound.mute;
    saveMuted(this.sound.mute);
    this.buttons[4]?.setIcon(this.sound.mute ? 'mute' : 'audio').setText(this.sound.mute ? 'MUTED' : 'SOUND');
  }

  private openGuide(): void {
    if (this.guide || this.launch >= 0) return;
    this.menu?.destroy(); this.menu = undefined;
    this.guide = new PilotGuide(this, true, () => {
      this.guide?.destroy(); this.guide = undefined;
      this.time.delayedCall(0, () => this.buildMenu());
    });
  }

  private startMusic(): void {
    const play = () => {
      if (this.sound.get('music-title')?.isPlaying || !this.scene.isActive()) return;
      this.sound.play('music-title', { loop: true, volume: 0.45 });
    };
    if (this.sound.locked) this.sound.once(Phaser.Sound.Events.UNLOCKED, play); else play();
  }

  /** Jets flare, HARROW lifts off, then the campaign starts. */
  private begin(target: 'Game' | 'Overworld'): void {
    if (this.launch >= 0) return;
    this.launch = 0;
    this.menu?.destroy(); this.menu = undefined;
    this.field.blast(MECH_X, GROUND_Y, 220, 4);
    this.field.deposit(MECH_X, GROUND_Y - 8, 140, 3, 0, -40);
    this.cameras.main.shake(500, 0.004);
    const music = this.sound.get('music-title');
    if (music) this.tweens.add({ targets: music, volume: 0, duration: 1100 });
    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.sound.stopByKey('music-title');
        const totalScore = (this.registry.get('totalScore') as number) ?? 0;
        if (target === 'Game') {
          this.scene.start('Game', { level: 0, totalScore: 0, completedNodes: [] });
          this.scene.launch('UI');
        } else {
          this.scene.start('Overworld', { currentNode: 0, completedNodes: (this.registry.get('completedNodes') as number[]) ?? [], totalScore });
        }
      });
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.t += dt;
    this.guide?.tick(delta);

    // HARROW: idle, tracking the cursor; lifts off on START
    const p = this.pointerMoved ? this.input.activePointer : { x: 1540 + Math.cos(this.t * 0.4) * 160, y: 250 + Math.sin(this.t * 0.7) * 90 };
    const hx = MECH_X, hy = this.mechY - 60 * MECH_SCALE;
    const wantFacing: 1 | -1 = p.x < hx - 24 ? -1 : p.x > hx + 24 ? 1 : this.facing;
    this.facing = wantFacing;
    let thrust = 0;
    if (this.launch >= 0) {
      this.launch += dt;
      thrust = 1;
      this.mechY -= Math.max(0, this.launch - 0.25) * 900 * dt;
    }
    this.rig.update({
      dt, dx: 0, vx: 0, vy: this.launch > 0.25 ? -300 : 0, grounded: this.launch < 0.25, facing: this.facing,
      aimDx: (p.x - hx) / 2, aimDy: (p.y - hy) / 2,
      moving: false, dashing: false, dashDir: 1, thrust, sputter: false, mode: 'normal',
      modeRemaining: 0, modeTime: this.t, hp: 100, time: this.t,
    });
    const my = Math.round(this.mechY / 2) * 2;
    this.view.sync(MECH_X, my, this.facing, this.rig, {}, MECH_SCALE);
    for (const j of this.rig.jets) {
      const x = MECH_X + j.x * MECH_SCALE * this.facing, y = my + j.y * MECH_SCALE;
      this.fx.jetFlame(x, y, Math.atan2(j.dy, j.dx * this.facing), j.power * 1.6, delta);
      if (y > GROUND_Y - 160) this.field.deposit(x, GROUND_Y - 8, 60, 0.4 * j.power, j.dx * this.facing * 80, -30);
    }

    // wind-blown dust off the ridge + a little kicked up at HARROW's feet
    if (Math.random() < 0.5) this.field.deposit(GAME_W - Math.random() * 400, GROUND_Y - 10 - Math.random() * 60, 40, 0.25, -40, -6);
    if (Math.random() < 0.05 && this.launch < 0) this.fx.kickDust(MECH_X + (Math.random() - 0.5) * 80, GROUND_Y, 1, 0.6);
    this.acc += dt;
    while (this.acc >= 1 / 30) { this.acc -= 1 / 30; this.field.step(1 / 30); this.paintDust(); }

    this.fog.forEach((f, i) => { f.tilePositionX = Math.round((this.t * (6 + i * 8)) / 2); });
    this.shaft.setAlpha(0.1 + Math.min(0.12, this.field.densityAt(900, 700) * 0.2));
  }

  private paintDust(): void {
    const d = this.pixels.data, f = this.field.density;
    const [r, g, b] = PALETTE_RGB[palIndex('regolith2')];
    for (let i = 0; i < f.length; i++) {
      const o = i * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round(Math.min(0.75, f[i] * 0.5) * 255);
    }
    this.fieldTex.getContext().putImageData(this.pixels, 0, 0);
    this.fieldTex.refresh();
  }
}
