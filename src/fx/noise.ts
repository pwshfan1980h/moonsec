import { mulberry32 } from '../rig/math';

/**
 * Tileable fractal value noise, values 0..1, row-major. Pure — used to bake fog and
 * heat-haze textures at boot (no shader dependency, identical on every GPU).
 */
export function tileableNoise(width: number, height: number, seed: number, octaves = 4, baseCells = 4): Float32Array {
  const out = new Float32Array(width * height);
  const rand = mulberry32(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = baseCells << o, cy = Math.max(1, Math.round((baseCells << o) * (height / width)));
    const lattice = new Float32Array(cx * cy);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
    for (let y = 0; y < height; y++) {
      const fy = (y / height) * cy, y0 = Math.floor(fy), ty = smooth(fy - y0);
      const y1 = (y0 + 1) % cy;
      for (let x = 0; x < width; x++) {
        const fx = (x / width) * cx, x0 = Math.floor(fx), tx = smooth(fx - x0);
        const x1 = (x0 + 1) % cx;
        const a = lattice[y0 * cx + x0], b = lattice[y0 * cx + x1];
        const c = lattice[y1 * cx + x0], d = lattice[y1 * cx + x1];
        out[y * width + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function smooth(t: number): number { return t * t * (3 - 2 * t); }
