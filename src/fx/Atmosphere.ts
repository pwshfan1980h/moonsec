import Phaser from 'phaser';
import { pal, PALETTE_RGB, palIndex } from '../render/palette';
import type { GraphicsSettings } from '../render/GraphicsSettings';
import type { CameraPipeline } from '../render/RenderPipeline';
import { DustField } from './DustField';
import { tileableNoise } from './noise';
import type { AtmosphereRecipe } from './atmosphereRecipes';
import type { TerrainProbe } from './terrain';

const CELL = 8;           // world units per dust cell
const STEP = 1 / 30;      // dust simulation rate
const WASH_RANGE = 160;   // jets kick dust within this height of the ground
const HAZE_W = 240, HAZE_H = 135;

/**
 * Lunar atmosphere for a mission: a simulated dust field that feet, landings, jets and
 * explosions stir up; drifting fog layers; light shafts that brighten where dust hangs;
 * heat haze over jets and blasts; and background motes. Everything is drawn in palette
 * colours and dithered by the retro camera filter.
 */
export class Atmosphere {
  private field?: DustField;
  private fieldTex?: Phaser.Textures.CanvasTexture;
  private fieldImg?: Phaser.GameObjects.Image;
  private pixels?: ImageData;
  private readonly fog: { sprite: Phaser.GameObjects.TileSprite; layer: AtmosphereRecipe['fog'][number] }[] = [];
  private readonly shafts: { img: Phaser.GameObjects.Image; base: number; x: number; y: number; flicker: number }[] = [];
  private motes?: Phaser.GameObjects.Particles.ParticleEmitter;
  private hazeStamps: { x: number; y: number; s: number }[] = [];
  private acc = 0;
  private t = 0;
  private readonly dustRgb: readonly [number, number, number];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly recipe: AtmosphereRecipe,
    private readonly terrain: TerrainProbe,
    private readonly floorY: number,
    private readonly ceilingY: number | null,
    private settings: GraphicsSettings,
    private readonly pipeline?: CameraPipeline,
  ) {
    this.dustRgb = PALETTE_RGB[palIndex(recipe.dust)];
    this.build();
  }

  private build(): void {
    const s = this.settings;
    if (s.dust >= 1) this.buildFog();
    if (s.dust >= 2) { this.buildField(); this.buildShafts(); }
    this.buildMotes();
    ensureHazeBlob(this.scene);
  }

  private buildField(): void {
    const cam = this.scene.cameras.main;
    const cols = Math.ceil(cam.width / cam.zoom / CELL) + 4;
    const rows = Math.ceil(cam.height / cam.zoom / CELL) + 4;
    this.field = new DustField({ cols, rows, cell: CELL, sink: 5 });
    this.field.windX = this.recipe.wind;
    const key = 'dust-field';
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.fieldTex = this.scene.textures.createCanvas(key, cols, rows)!;
    this.pixels = this.fieldTex.getContext().createImageData(cols, rows);
    this.fieldImg = this.scene.add.image(0, 0, key).setOrigin(0, 0).setScale(CELL).setDepth(9.5);
  }

  private buildFog(): void {
    const cam = this.scene.cameras.main;
    for (const layer of this.recipe.fog) {
      const key = ensureFogTexture(this.scene, layer.seed);
      const sprite = this.scene.add.tileSprite(0, this.floorY - layer.height, cam.width / cam.zoom + 64, layer.thickness, key)
        .setTint(pal(layer.color)).setAlpha(layer.alpha).setDepth(3.5).setTileScale(2, layer.thickness / 64);
      this.fog.push({ sprite, layer });
    }
  }

  private buildShafts(): void {
    const r = this.recipe.shafts;
    if (!r) return;
    ensureShaftTexture(this.scene);
    const worldW = this.scene.physics.world.bounds.width;
    for (let x = 300; x < worldW; x += r.spacing) {
      const y = r.from === 'ceiling' && this.ceilingY !== null ? this.ceilingY : this.floorY - 900;
      const img = this.scene.add.image(x, y, 'light-shaft').setOrigin(0.5, 0).setRotation(-r.lean)
        .setDisplaySize(r.from === 'sky' ? 260 : 170, r.length).setTint(pal(r.color)).setBlendMode(Phaser.BlendModes.ADD).setDepth(3.8);
      this.shafts.push({ img, base: r.alpha, x, y: y + r.length * 0.55, flicker: r.from === 'ceiling' ? 1 : 0 });
    }
  }

  private buildMotes(): void {
    if (this.recipe.motes <= 0) return;
    const worldW = this.scene.physics.world.bounds.width;
    this.motes = this.scene.add.particles(0, 0, 'pixel', {
      x: { min: 0, max: worldW },
      y: { min: this.floorY - 60, max: this.floorY - 4 },
      speedX: { min: this.recipe.wind * 0.5 - 6, max: this.recipe.wind + 10 },
      speedY: { min: -8, max: 2 },
      lifespan: { min: 3500, max: 6500 },
      alpha: { start: 0.5, end: 0 },
      scale: 0.5,
      tint: pal(this.recipe.dust),
      frequency: 1000 / this.recipe.motes,
      quantity: 1,
    }).setDepth(3.9);
  }

  applySettings(s: GraphicsSettings): void {
    const rebuild = s.dust !== this.settings.dust;
    this.settings = s;
    if (!rebuild) return;
    this.destroy();
    this.build();
  }

  // ── sources ──────────────────────────────────────────────────────────────
  footstep(x: number, y: number, weight: number): void {
    const k = this.recipe.kick * weight;
    this.field?.deposit(x - 6, y - 3, 12, 0.35 * k, -30, -12);
    this.field?.deposit(x + 6, y - 3, 12, 0.35 * k, 30, -12);
  }

  landing(x: number, y: number, speed: number): void {
    const k = this.recipe.kick * Math.min(2, speed / 400);
    for (const side of [-1, 1]) this.field?.deposit(x + side * 18, y - 4, 26, 0.6 * k, side * 110 * k, -26);
  }

  /** Jet exhaust pointing (dirX, dirY): if it reaches the ground, it throws dust sideways. */
  jetWash(x: number, y: number, dirX: number, dirY: number, power: number): void {
    this.heat(x + dirX * 20, y + dirY * 20, 0.6 * power);
    if (dirY < 0.4 || !this.field) return;
    const d = this.terrain.groundBelow(x, y, WASH_RANGE);
    if (d === null) return;
    const s = (1 - d / WASH_RANGE) * power;
    const gy = y + d;
    this.field.blast(x, gy - 6, 40, 200 * s);
    for (const side of [-1, 1]) this.field.deposit(x + side * 26, gy - 5, 20, 0.22 * s * this.recipe.kick, side * 180 * s, -30 * s);
  }

  explosion(x: number, y: number, big: boolean): void {
    this.heat(x, y, big ? 2 : 1.2);
    if (!this.field) return;
    this.field.blast(x, y, big ? 120 : 70, big ? 420 : 260);
    const d = this.terrain.groundBelow(x, y, 120);
    if (d !== null) this.field.deposit(x, y + d - 8, big ? 60 : 36, big ? 1.4 : 0.8, 0, -60);
  }

  /** Heat shimmer at a world point for this frame. */
  heat(x: number, y: number, strength: number): void {
    if (this.hazeStamps.length < 24) this.hazeStamps.push({ x, y, s: strength });
  }

  // ── per frame ────────────────────────────────────────────────────────────
  update(delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.t += dt;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;

    for (const { sprite, layer } of this.fog) {
      sprite.setPosition(Math.round(view.centerX / 2) * 2, this.floorY - layer.height);
      sprite.width = view.width + 64;
      sprite.tilePositionX = Math.round((view.x * layer.parallax + layer.drift * this.t) / 2);
    }

    if (this.field && this.fieldTex && this.pixels && this.fieldImg) {
      this.acc += dt;
      let stepped = false;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.field.anchor(view.x - 2 * CELL, view.y - 2 * CELL);
        this.field.step(STEP);
        stepped = true;
      }
      if (stepped) this.paintField();
      this.fieldImg.setPosition(this.field.originX * CELL, this.field.originY * CELL);
    }

    for (const sh of this.shafts) {
      const dust = this.field ? Math.min(1, this.field.densityAt(sh.x, sh.y) * 2) : 0;
      const flick = sh.flicker ? (Math.sin(this.t * 13 + sh.x) > 0.97 ? 0.3 : 1) : 1;
      sh.img.setAlpha(sh.base * (0.55 + dust * 1.6) * flick);
    }

    this.updateHaze();
  }

  private paintField(): void {
    const f = this.field!, data = this.pixels!.data;
    const [r, g, b] = this.dustRgb;
    for (let i = 0; i < f.density.length; i++) {
      const a = Math.min(0.8, f.density[i] * 0.55);
      const o = i * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = Math.round(a * 255);
    }
    this.fieldTex!.getContext().putImageData(this.pixels!, 0, 0);
    this.fieldTex!.refresh();
  }

  private updateHaze(): void {
    const haze = this.pipeline?.haze;
    if (!haze) { this.hazeStamps.length = 0; return; }
    const on = this.settings.haze && this.hazeStamps.length > 0;
    haze.controller.active = on;
    if (!on) { this.hazeStamps.length = 0; return; }
    const cam = this.scene.cameras.main;
    const sx = HAZE_W / cam.width, sy = HAZE_H / cam.height;
    const tex = haze.texture;
    tex.fill(0x808080, 1);
    for (const st of this.hazeStamps) {
      const px = (st.x - cam.worldView.x) * cam.zoom * sx;
      const py = (st.y - cam.worldView.y) * cam.zoom * sy;
      tex.stamp('haze-blob', undefined, px + (Math.random() - 0.5) * 2, py + (Math.random() - 0.5) * 2, {
        alpha: Math.min(1, 0.5 * st.s), scale: 0.5 + 0.35 * st.s, rotation: Math.random() * Math.PI * 2,
      });
    }
    tex.render();
    this.hazeStamps.length = 0;
  }

  destroy(): void {
    this.fieldImg?.destroy(); this.fieldImg = undefined;
    this.field = undefined;
    for (const f of this.fog) f.sprite.destroy();
    this.fog.length = 0;
    for (const s of this.shafts) s.img.destroy();
    this.shafts.length = 0;
    this.motes?.destroy(); this.motes = undefined;
    if (this.pipeline?.haze) this.pipeline.haze.controller.active = false;
  }
}

/** A swirl of red/green offsets fading to neutral (128) at the edge — one heat-haze "puff". */
function ensureHazeBlob(scene: Phaser.Scene): void {
  if (scene.textures.exists('haze-blob')) return;
  const size = 32;
  const n = tileableNoise(size, size, 7, 3, 2);
  const m = tileableNoise(size, size, 8, 3, 2);
  const tex = scene.textures.createCanvas('haze-blob', size, size)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    const fall = Math.max(0, 1 - d);
    const o = (y * size + x) * 4;
    img.data[o] = Math.round(128 + (n[y * size + x] - 0.5) * 200);
    img.data[o + 1] = Math.round(128 + (m[y * size + x] - 0.5) * 200);
    img.data[o + 2] = 128;
    img.data[o + 3] = Math.round(255 * fall * fall);
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

export const HAZE_MAP = { key: 'haze-map', width: HAZE_W, height: HAZE_H };

/** Tileable fog wisp band (white, alpha = density), tinted per layer. Returns the key. */
export function ensureFogTexture(scene: Phaser.Scene, seed: number): string {
  const key = `fog-${seed}`;
  if (scene.textures.exists(key)) return key;
  const w = 256, h = 64;
  const n = tileableNoise(w, h, seed, 4, 3);
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const band = Math.sin((y / (h - 1)) * Math.PI);
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, (n[y * w + x] - 0.42) / 0.58) * band;
      const o = (y * w + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * Math.min(1, v * 1.6));
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

/** Soft cone used for light shafts (white, alpha falloff). Returns the key. */
export function ensureShaftTexture(scene: Phaser.Scene): string {
  const key = 'light-shaft';
  if (scene.textures.exists(key)) return key;
  const w = 48, h = 192;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const half = 4 + t * (w / 2 - 4);
    for (let x = 0; x < w; x++) {
      const edge = 1 - Math.min(1, Math.abs(x - w / 2) / half);
      const a = Math.pow(1 - t, 1.3) * Math.min(1, edge * 2);
      const o = (y * w + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}
