import { PALETTE_RGB, REMAPS, palIndex, type PaletteName } from '../render/palette';
import { OUTLINE_PAD, type DrawApi, type PartSpec, type PartVariant } from './parts/types';

/** RGBA image, 4 bytes per pixel. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

function remapFor(variant: PartVariant): (c: PaletteName) => PaletteName {
  const far = variant === 'f' || variant === 'fe';
  const emp = variant === 'e' || variant === 'fe';
  return (c) => {
    let out = c;
    if (emp) out = REMAPS.emp[out] ?? out;
    if (far) out = REMAPS.far[out] ?? out;
    return out;
  };
}

/**
 * Rasterises a part with a 1 px outline (hull0) around every opaque shape.
 * Pure — used by the atlas build tool and by tests.
 */
export function rasterizePart(spec: PartSpec, variant: PartVariant = 'n'): Raster {
  const pad = OUTLINE_PAD;
  const width = spec.w + pad * 2, height = spec.h + pad * 2;
  const data = new Uint8Array(width * height * 4);
  const map = remapFor(variant);
  const put = (x: number, y: number, c: PaletteName) => {
    const X = x + pad, Y = y + pad;
    if (X < 0 || Y < 0 || X >= width || Y >= height) return;
    const [r, g, b] = PALETTE_RGB[palIndex(map(c))];
    const o = (Y * width + X) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  };
  const api: DrawApi = {
    R(x, y, w, h, c) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
    },
    P(pts, c) {
      let minY = Infinity, maxY = -Infinity;
      for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
        const yc = y + 0.5;
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
          if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1));
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const a = Math.ceil(xs[i] - 0.5), b = Math.floor(xs[i + 1] - 0.5);
          for (let x = a; x <= b; x++) put(x, y, c);
        }
      }
    },
    D(cx, cy, r, c) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.3) put(x, y, c);
    },
    px(x, y, c) { put(x, y, c); },
  };
  spec.draw(api);

  // outline: every transparent pixel touching an opaque one (4-neighbour)
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 0;
  const outline: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) outline.push(y * width + x);
  }
  const [or, og, ob] = PALETTE_RGB[palIndex('hull0')];
  for (const i of outline) { data[i * 4] = or; data[i * 4 + 1] = og; data[i * 4 + 2] = ob; data[i * 4 + 3] = 255; }
  return { width, height, data };
}
