import Phaser from 'phaser';
import { PALETTE_RGB } from '../palette';
import { RETRO_FRAG } from '../shaders/retro.frag';

export const RETRO_NODE = 'FilterRetro';

/**
 * Camera filter controller for the retro look. Add to `camera.filters.external`.
 * One controller per camera (Phaser destroys controllers with their FilterList).
 */
export class RetroFilter extends Phaser.Filters.Controller {
  /** Pixel-grid block size in screen pixels (2 × camera zoom). */
  block = 2;
  /** Dither strength 0..1 (0 = nearest palette colour only). */
  spread = 1;
  /** When false, only the block snap runs (the "clean" look keeps the grid but not the palette). */
  quantize = true;
  /** 0..1 darkening on alternate rows. Breaks the palette rule by design; off by default. */
  scanlines = 0;
  /** Snap alpha to 0/1 so translucent layers (UI) cannot blend off-palette. */
  hardAlpha = false;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, RETRO_NODE);
  }
}

const PALETTE_UNIFORM = new Float32Array(PALETTE_RGB.flatMap(([r, g, b]) => [r / 255, g / 255, b / 255]));

/** WebGL render node for RetroFilter. Registered in the game config under RETRO_NODE. */
export class FilterRetroNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(RETRO_NODE, manager, undefined, RETRO_FRAG);
  }

  setupUniforms(controller: Phaser.Filters.Controller, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    const c = controller as RetroFilter;
    const pm = this.programManager;
    pm.setUniform('uResolution', [drawingContext.width, drawingContext.height]);
    pm.setUniform('uBlock', Math.max(1, c.block));
    pm.setUniform('uSpread', c.spread);
    pm.setUniform('uQuantize', c.quantize ? 1 : 0);
    pm.setUniform('uScanlines', c.scanlines);
    pm.setUniform('uHardAlpha', c.hardAlpha ? 1 : 0);
    pm.setUniform('uPalette[0]', PALETTE_UNIFORM);
  }
}
