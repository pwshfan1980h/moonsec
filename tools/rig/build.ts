// Rasterises every rig part (src/rig/parts) into public/assets/rig.png + rig.json.
//   node tools/rig/build.ts
// Also writes art/rigs/<rig>/<part>.png (near variant) for artists; art/rigs/README.md
// explains the override workflow.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RIG_PARTS } from '../../src/rig/parts/index.ts';
import { atlasJson, buildAtlas } from '../../src/rig/atlas.ts';
import { rasterizePart } from '../../src/rig/raster.ts';
import { encodePng } from '../palette/png.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const atlas = buildAtlas(RIG_PARTS);
writeFileSync(path.join(ROOT, 'public/assets/rig.png'), encodePng(atlas.image));
writeFileSync(path.join(ROOT, 'public/assets/rig.json'), JSON.stringify(atlasJson(atlas, 'rig.png'), null, 1) + '\n');
for (const [rig, parts] of Object.entries(RIG_PARTS)) {
  const dir = path.join(ROOT, 'art/rigs', rig);
  mkdirSync(dir, { recursive: true });
  for (const [name, spec] of Object.entries(parts)) writeFileSync(path.join(dir, `${name}.png`), encodePng(rasterizePart(spec, 'n')));
}
console.log(`rig atlas: ${Object.keys(atlas.frames).length} frames, ${atlas.image.width}×${atlas.image.height}`);
