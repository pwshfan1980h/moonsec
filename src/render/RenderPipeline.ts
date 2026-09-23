import Phaser from 'phaser';
import { devParams } from '../dev/devParams';
import { blockSize, loadGraphicsSettings, type GraphicsSettings } from './GraphicsSettings';
import { RetroFilter } from './filters/RetroFilter';

let current: GraphicsSettings | undefined;

/** Current graphics settings (loaded once; `?gfx=` overrides in dev). */
export function graphics(): GraphicsSettings {
  current ??= loadGraphicsSettings(devParams().gfx);
  return current;
}

export function setGraphics(s: GraphicsSettings): void {
  current = s;
}

export interface CameraPipeline {
  retro?: RetroFilter;
  apply(s: GraphicsSettings): void;
}

function supportsFilters(scene: Phaser.Scene): boolean {
  return scene.sys.game.renderer.type === Phaser.WEBGL;
}

/**
 * Installs the retro filter on a camera. `world` cameras get the pixel-grid snap and
 * dither; UI cameras keep crisp text (quantize, no dither) until the UI is on the grid.
 */
export function installPipeline(scene: Phaser.Scene, camera: Phaser.Cameras.Scene2D.Camera, kind: 'world' | 'ui'): CameraPipeline {
  if (!supportsFilters(scene)) return { apply: () => undefined };
  const retro = new RetroFilter(camera);
  camera.filters.external.add(retro);
  const pipeline: CameraPipeline = {
    retro,
    apply(s) {
      const on = s.grid || s.quantize;
      retro.active = on;
      retro.block = kind === 'world' && s.grid ? blockSize(s) : 1;
      retro.quantize = s.quantize;
      retro.spread = kind === 'world' && s.dither ? 1 : 0;
      retro.scanlines = kind === 'world' && s.scanlines ? 1 : 0;
      retro.hardAlpha = kind === 'ui' && s.quantize;
    },
  };
  pipeline.apply(graphics());
  return pipeline;
}
