import type Phaser from 'phaser';
import { rasterizePart, type Raster } from '../rig/raster';
import { OUTLINE_PAD, type PartVariant } from '../rig/parts/types';
import { WORLD_PROPS } from './props';
import { T, terrainTiles } from './terrainTiles';

/** Tileset texture for text-map levels: 32-unit cells (16 native px at 2×). */
export const WORLD_TILES_KEY = 'world-tiles';
/** Prop atlas; frames `name@n` (near) and `name@f` (far, one ramp step darker). */
export const WORLD_ATLAS_KEY = 'world';
const TILESET_COLS = 16;
const PROP_VARIANTS: readonly PartVariant[] = ['n', 'f'];

function blit(ctx: CanvasRenderingContext2D, r: Raster, x: number, y: number, scale: number): void {
  const img = ctx.createImageData(r.width * scale, r.height * scale);
  for (let j = 0; j < r.height * scale; j++) for (let i = 0; i < r.width * scale; i++) {
    const s = ((Math.floor(j / scale) * r.width) + Math.floor(i / scale)) * 4, o = (j * r.width * scale + i) * 4;
    img.data[o] = r.data[s]; img.data[o + 1] = r.data[s + 1]; img.data[o + 2] = r.data[s + 2]; img.data[o + 3] = r.data[s + 3];
  }
  ctx.putImageData(img, x, y);
}

/**
 * Rasterises the world kit at boot (same primitives and palette as the rig, no committed PNG):
 * the terrain tileset at 2× for the tilemap, and the prop atlas at native size (placed at 2×).
 */
export function buildWorldTextures(scene: Phaser.Scene): void {
  const tiles = terrainTiles();
  if (scene.textures.exists(WORLD_TILES_KEY)) scene.textures.remove(WORLD_TILES_KEY);
  const S = T * 2;
  const rows = Math.ceil(tiles.length / TILESET_COLS);
  const tileset = scene.textures.createCanvas(WORLD_TILES_KEY, TILESET_COLS * S, rows * S)!;
  tiles.forEach((spec, i) => blit(tileset.getContext(), rasterizePart(spec, 'n', { outline: false }), (i % TILESET_COLS) * S, Math.floor(i / TILESET_COLS) * S, 2));
  tileset.refresh();

  const items = Object.entries(WORLD_PROPS).flatMap(([name, spec]) => PROP_VARIANTS.map((v) => ({ name: `${name}@${v}`, r: rasterizePart(spec, v) })));
  items.sort((a, b) => b.r.height - a.r.height);
  const W = 512;
  const placed: { name: string; r: Raster; x: number; y: number }[] = [];
  let x = 1, y = 1, shelf = 0;
  for (const it of items) {
    if (x + it.r.width + 1 > W) { x = 1; y += shelf + 1; shelf = 0; }
    placed.push({ ...it, x, y });
    x += it.r.width + 1;
    shelf = Math.max(shelf, it.r.height);
  }
  if (scene.textures.exists(WORLD_ATLAS_KEY)) scene.textures.remove(WORLD_ATLAS_KEY);
  const atlas = scene.textures.createCanvas(WORLD_ATLAS_KEY, W, y + shelf + 1)!;
  for (const p of placed) {
    blit(atlas.getContext(), p.r, p.x, p.y, 1);
    atlas.add(p.name, 0, p.x, p.y, p.r.width, p.r.height);
  }
  atlas.refresh();
}

/**
 * Place a prop standing on (x, y) in world units (its anchor there), drawn at 2×.
 * `far` uses the darker variant for background layers.
 */
export function placeProp(scene: Phaser.Scene, name: keyof typeof WORLD_PROPS, x: number, y: number, depth: number, far = false): Phaser.GameObjects.Image {
  const spec = WORLD_PROPS[name];
  const w = spec.w + OUTLINE_PAD * 2, h = spec.h + OUTLINE_PAD * 2;
  return scene.add.image(x, y, WORLD_ATLAS_KEY, `${name}@${far ? 'f' : 'n'}`)
    .setOrigin((spec.px + OUTLINE_PAD) / w, (spec.py + OUTLINE_PAD) / h).setScale(2).setDepth(depth);
}
