import Phaser from 'phaser';
import { pal, type PaletteName } from '../../render/palette';
import { VPX } from '../../render/GraphicsSettings';
import { OUTLINE_PAD, frameName } from '../parts/types';
import { RIG_ATLAS_KEY } from '../parts';
import type { Placement } from '../pose';

/** What a view needs from any rig body each frame. */
export interface RigSource {
  readonly placements: readonly Placement[];
  flash: number;
  tint: number;
  glow: number;
  glowColor: PaletteName;
}

export interface RigViewEffects {
  /** 0..1 darkening (destroyed wreck). */
  dark?: number;
  /** World y of a repair scanline; parts crossing it light up. */
  scanY?: number;
}

/**
 * Renders a rig as a Container of atlas Images (one texture → one batch). Parts are
 * native-size frames scaled by VPX; the container flips horizontally for facing.
 * Silhouette effects are done with per-part tints so they stay on the palette.
 */
export class RigView {
  readonly container: Phaser.GameObjects.Container;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private frameCounter = 0;

  constructor(private readonly scene: Phaser.Scene, readonly rig: string, depth: number) {
    this.container = scene.add.container(0, 0).setDepth(depth);
  }

  sync(x: number, y: number, facing: 1 | -1, src: RigSource, fx: RigViewEffects = {}): void {
    this.frameCounter++;
    const c = this.container;
    c.setPosition(x, y).setScale(VPX * facing, VPX);
    const parts = src.placements;
    const fill = src.flash > 0 ? pal('cyan3')
      : src.glow > 0 && this.frameCounter % 4 < 2 ? pal(src.glowColor)
      : undefined;
    const multiply = src.tint > 0 ? pal('hostile1') : fx.dark && fx.dark > 0.3 ? pal('hull3') : undefined;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let img = this.images[i];
      if (!img) {
        img = this.scene.add.image(0, 0, RIG_ATLAS_KEY);
        this.images.push(img);
        c.add(img);
      }
      img.setVisible(true).setFrame(frameName(this.rig, p.part, p.variant));
      img.setOrigin((p.spec.px + OUTLINE_PAD) / (p.spec.w + OUTLINE_PAD * 2), (p.spec.py + OUTLINE_PAD) / (p.spec.h + OUTLINE_PAD * 2));
      img.setPosition(p.x, p.y).setRotation(p.rot).setScale(1, p.scaleY ?? 1).setAlpha(p.alpha ?? 1);
      let partFill = fill;
      if (partFill === undefined && fx.scanY !== undefined) {
        const wy = y + p.y * VPX;
        if (Math.abs(wy - fx.scanY) < 5 * VPX) partFill = pal('green1');
      }
      if (partFill !== undefined) img.setTint(partFill).setTintMode(Phaser.TintModes.FILL);
      else if (multiply !== undefined) img.setTint(multiply).setTintMode(Phaser.TintModes.MULTIPLY);
      else img.clearTint();
    }
    for (let i = parts.length; i < this.images.length; i++) this.images[i].setVisible(false);
  }

  /** A fading, tinted copy of the current pose (surge afterimages). */
  spawnGhost(color: PaletteName, alpha: number, durationMs: number): void {
    const src = this.container;
    const ghost = this.scene.add.container(src.x, src.y).setScale(src.scaleX, src.scaleY).setDepth(src.depth - 1).setAlpha(alpha);
    for (const img of this.images) {
      if (!img.visible) continue;
      const g = this.scene.add.image(img.x, img.y, RIG_ATLAS_KEY, img.frame.name)
        .setOrigin(img.originX, img.originY).setRotation(img.rotation).setScale(img.scaleX, img.scaleY)
        .setTint(pal(color)).setTintMode(Phaser.TintModes.FILL);
      ghost.add(g);
    }
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: durationMs, ease: 'Cubic.Out', onComplete: () => ghost.destroy(true) });
  }

  setVisible(v: boolean): void { this.container.setVisible(v); }

  destroy(): void { this.container.destroy(true); }
}
