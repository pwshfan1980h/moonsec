import Phaser from 'phaser';
import { installPipeline } from '../render/RenderPipeline';
import { pal, palCss } from '../render/palette';
import { parseLevelMap } from '../level/levelMap';
import { autotile } from '../world/autotile';
import { WORLD_PROPS } from '../world/props';
import { WORLD_TILES_KEY, placeProp } from '../world/worldTextures';
import { markDevReady } from './ready';

/** A terrain sample: terraces, an overhang, a trench, a floating ledge and a gantry deck. */
const SAMPLE = `
..........................................................
..........................................................
....................................=======...............
..........................................................
..............######......................................
.............########.................#####...............
............##########..........====..........#...........
..S.......#############..............................##...
#########################.....##########......############
#########################.....##########......############
##########################...###########################..
##########################################################
`;

/**
 * Dev-only world kit sheet (`?rigtest=world`): the autotiled terrain on a sample map, then every
 * prop in near and far variants, for screenshots and eyeballing the kit outside a mission.
 */
export class WorldKitGallery extends Phaser.Scene {
  constructor() { super({ key: 'WorldKit' }); }

  create(): void {
    this.cameras.main.setBackgroundColor(pal('void'));
    installPipeline(this, this.cameras.main, 'world');
    const label = (x: number, y: number, t: string) => this.add.text(x, y, t, { fontFamily: 'monospace', fontSize: '18px', color: palCss('cyan2') });

    // terrain sample, top of the sheet
    const map = parseLevelMap(SAMPLE, 'sample');
    const tm = this.make.tilemap({ data: autotile(map), tileWidth: 32, tileHeight: 32 });
    const ts = tm.addTilesetImage(WORLD_TILES_KEY, WORLD_TILES_KEY, 32, 32, 0, 0)!;
    tm.createLayer(0, ts, 32, 16)!.setDepth(1);
    label(40, 400, 'terrain: autotiled regolith, deep strata, decks');

    // props on two ground lines: near, then far
    const names = Object.keys(WORLD_PROPS) as (keyof typeof WORLD_PROPS)[];
    const floors = [700, 1040];
    floors.forEach((fy, row) => {
      this.add.rectangle(0, fy, 1920, 4, pal('hull3')).setOrigin(0, 0);
      let x = 40;
      for (const n of names) {
        const spec = WORLD_PROPS[n];
        const topLeft = spec.px === 0 && spec.py === 0;
        const w = spec.w * 2;
        if (x + w > 1900) break;
        placeProp(this, n, topLeft ? x : x + spec.px * 2, topLeft ? fy - spec.h * 2 - 20 : fy, 2, row === 1);
        x += w + 18;
      }
      label(40, fy + 8, row === 0 ? 'props (near)' : 'props (far)');
    });
    markDevReady(this);
  }
}
