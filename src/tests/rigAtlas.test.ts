import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../rig/atlas';
import { RIG_PARTS } from '../rig/parts';
import { rasterizePart } from '../rig/raster';
import { isPaletteColor } from '../render/palette';
import { decodePng } from '../../tools/palette/png.ts';

const ASSETS = path.resolve(__dirname, '../../public/assets');

describe('rig atlas', () => {
  const built = buildAtlas(RIG_PARTS);

  it('matches the committed atlas (run `npm run art:rig` after editing parts)', () => {
    const png = decodePng(readFileSync(path.join(ASSETS, 'rig.png')));
    expect([png.width, png.height]).toEqual([built.image.width, built.image.height]);
    expect(Buffer.from(png.data).equals(Buffer.from(built.image.data))).toBe(true);
    const json = JSON.parse(readFileSync(path.join(ASSETS, 'rig.json'), 'utf8')) as { frames: Record<string, { frame: object }> };
    expect(Object.keys(json.frames).sort()).toEqual(Object.keys(built.frames).sort());
  });

  it('rasterises every part onto the palette with an outline and pivots inside the frame', () => {
    for (const [rig, parts] of Object.entries(RIG_PARTS)) {
      for (const [name, spec] of Object.entries(parts)) {
        const r = rasterizePart(spec);
        expect(spec.px, `${rig}/${name} pivot x`).toBeGreaterThanOrEqual(0);
        expect(spec.px).toBeLessThanOrEqual(spec.w);
        expect(spec.py).toBeGreaterThanOrEqual(0);
        expect(spec.py).toBeLessThanOrEqual(spec.h);
        let opaque = 0;
        for (let i = 0; i < r.data.length; i += 4) {
          if (r.data[i + 3] === 0) continue;
          opaque++;
          expect(isPaletteColor([r.data[i], r.data[i + 1], r.data[i + 2]]), `${rig}/${name}`).toBe(true);
        }
        expect(opaque, `${rig}/${name} is empty`).toBeGreaterThan(0);
      }
    }
  });
});
