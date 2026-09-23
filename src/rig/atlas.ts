import { rasterizePart, type Raster } from './raster';
import { PART_VARIANTS, frameName, type PartSet } from './parts/types';

export interface AtlasFrame { x: number; y: number; w: number; h: number }

export interface Atlas {
  image: Raster;
  frames: Record<string, AtlasFrame>;
}

const WIDTH = 512;
const GAP = 1;

/**
 * Rasterises every part variant and shelf-packs them into one image. Deterministic
 * (sorted by height then name) so the committed atlas can be checked for staleness.
 */
export function buildAtlas(rigs: Record<string, PartSet>): Atlas {
  const items: { name: string; r: Raster }[] = [];
  for (const rig of Object.keys(rigs).sort()) {
    for (const part of Object.keys(rigs[rig]).sort()) {
      for (const v of PART_VARIANTS) items.push({ name: frameName(rig, part, v), r: rasterizePart(rigs[rig][part], v) });
    }
  }
  items.sort((a, b) => b.r.height - a.r.height || (a.name < b.name ? -1 : 1));
  const frames: Record<string, AtlasFrame> = {};
  let x = GAP, y = GAP, shelf = 0;
  for (const { name, r } of items) {
    if (x + r.width + GAP > WIDTH) { x = GAP; y += shelf + GAP; shelf = 0; }
    frames[name] = { x, y, w: r.width, h: r.height };
    x += r.width + GAP;
    shelf = Math.max(shelf, r.height);
  }
  let height = y + shelf + GAP;
  height = 1 << Math.ceil(Math.log2(Math.max(height, 1)));
  const data = new Uint8Array(WIDTH * height * 4);
  for (const { name, r } of items) {
    const f = frames[name];
    for (let j = 0; j < r.height; j++) {
      data.set(r.data.subarray(j * r.width * 4, (j + 1) * r.width * 4), ((f.y + j) * WIDTH + f.x) * 4);
    }
  }
  return { image: { width: WIDTH, height, data }, frames };
}

/** Phaser JSON-hash atlas descriptor. */
export function atlasJson(atlas: Atlas, image: string): object {
  const frames: Record<string, object> = {};
  for (const [name, f] of Object.entries(atlas.frames)) {
    frames[name] = {
      frame: { x: f.x, y: f.y, w: f.w, h: f.h }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h },
    };
  }
  return { frames, meta: { image, size: { w: atlas.image.width, h: atlas.image.height }, scale: '1', format: 'RGBA8888' } };
}
