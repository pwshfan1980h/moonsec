import type Phaser from 'phaser';
import { containerBlocks, decks, surfaceY, type LevelMap } from '../level/levelMap';
import { WORLD_PROPS } from './props';
import { hash } from './shade';
import { placeProp } from './worldTextures';
import { ensureDomeInterior } from './domeInterior';

export type PropName = keyof typeof WORLD_PROPS;

/** A prop standing on the ground under a column (x = col centre + dx); `onDeck` stands it on a deck instead. */
export interface PropDressing { prop: PropName; col: number; dx?: number; far?: boolean; flip?: boolean; onDeck?: boolean }
/** A pipe run along a row's floor, cols a..b inclusive, with supports every `every` cols. */
export interface PipeDressing { pipe: { from: number; to: number; row: number; every?: number } }
/** The storage-dome interior backdrop, centred on a column, standing on a row's top. */
export interface BackdropDressing { domeInterior: { col: number; row: number } }
export type Dressing = PropDressing | PipeDressing | BackdropDressing;

/** Depth bands: backdrop behind terrain, dressing just behind the tile crust, structures level with it. */
export const DRESSING_DEPTH = { backdrop: 1.5, far: 3.2, prop: 3.8, structure: 4.1 } as const;

const CELL = 32;

/**
 * Builds a level's set dressing from its grid and dressing list: containers on every `C` stack,
 * lattice supports under every deck, then the authored props, pipes and backdrops.
 */
export function dressLevel(scene: Phaser.Scene, map: LevelMap, list: readonly Dressing[]): void {
  const tones: PropName[] = ['containerAmber', 'containerCold', 'containerHull'];
  for (const b of containerBlocks(map)) {
    placeProp(scene, tones[Math.floor(hash(b.col, b.row, 5) * 3)], (b.col + 2) * CELL, (b.row + 2) * CELL, DRESSING_DEPTH.structure)
      .setFlipX(hash(b.row, b.col, 6) < 0.5);
  }

  for (const d of decks(map)) {
    const cols = [d.col + 1, d.col + d.width - 2];
    if (d.width > 10) cols.push(d.col + Math.floor(d.width / 2));
    for (const c of cols) {
      const x = c * CELL + 2, top = (d.row + 1) * CELL, ground = surfaceY(map, c, { fromRow: d.row + 1 });
      for (let y = top; y < ground; y += 32) placeProp(scene, 'gantrySegment', x, y, DRESSING_DEPTH.prop);
      placeProp(scene, 'gantryFoot', x + 14, ground, DRESSING_DEPTH.prop);
    }
  }

  for (const item of list) {
    if ('pipe' in item) {
      const { from, to, row, every = 4 } = item.pipe;
      const y = row * CELL;
      for (let c = from; c <= to; c += 2) placeProp(scene, 'pipe', c * CELL, y - 52, DRESSING_DEPTH.far);
      for (let c = from + 1; c <= to; c += every) placeProp(scene, 'pipeSupport', c * CELL, y, DRESSING_DEPTH.far);
    } else if ('domeInterior' in item) {
      const { col, row } = item.domeInterior;
      scene.add.image(col * CELL, row * CELL, ensureDomeInterior(scene)).setOrigin(0.5, 1).setScale(2).setDepth(DRESSING_DEPTH.backdrop);
    } else {
      const x = item.col * CELL + CELL / 2 + (item.dx ?? 0);
      placeProp(scene, item.prop, x, surfaceY(map, item.col, { decks: item.onDeck }), item.far ? DRESSING_DEPTH.far : DRESSING_DEPTH.prop, item.far)
        .setFlipX(item.flip ?? false);
    }
  }
}
