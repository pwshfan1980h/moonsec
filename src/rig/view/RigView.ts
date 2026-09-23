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
  /** Resting multiply tint (boss variants). */
  baseTint?: PaletteName;
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

  /** `scale` is screen/world units per native pixel (VPX in the world; larger for UI portraits). */
  sync(x: number, y: number, facing: 1 | -1, src: RigSource, fx: RigViewEffects = {}, scale = VPX): void {
    this.frameCounter++;
    const c = this.container;
    c.setPosition(x, y).setScale(scale * facing, scale);
    const parts = src.placements;
    // Hit flash is a solid silhouette; pulses (upgrade, repair done, drop-in) tint instead.
    const fill = src.flash > 0 ? pal('cyan3') : undefined;
    const multiply = src.tint > 0 ? pal('hostile1')
      : src.glow > 0 && this.frameCounter % 6 < 3 ? pal(src.glowColor)
      : fx.dark && fx.dark > 0.3 ? pal('hull3')
      : fx.baseTint ? pal(fx.baseTint) : undefined;
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
        const wy = y + p.y * scale;
        if (Math.abs(wy - fx.scanY) < 5 * scale) partFill = pal('green1');
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

  /** Death: every part flies off, tumbling and falling, tinted and fading. */
  shatter(tint: PaletteName, durationMs = 900): void {
    for (const img of this.images) {
      if (!img.visible) continue;
      const m = img.getWorldTransformMatrix();
      const piece = this.scene.add.image(m.tx, m.ty, RIG_ATLAS_KEY, img.frame.name)
        .setOrigin(img.originX, img.originY).setRotation(m.rotationNormalized)
        .setScale(m.scaleX, m.scaleY).setDepth(this.container.depth)
        .setTint(pal(tint)).setTintMode(Phaser.TintModes.MULTIPLY);
      const vx = (Math.random() - 0.5) * 260, vy = -120 - Math.random() * 180;
      const spin = (Math.random() - 0.5) * 8;
      this.scene.tweens.add({ targets: piece, x: m.tx + vx * (durationMs / 1000), duration: durationMs, ease: 'Linear' });
      this.scene.tweens.add({ targets: piece, y: m.ty + vy * 0.35, duration: durationMs * 0.3, ease: 'Quad.Out', yoyo: false,
        onComplete: () => this.scene.tweens.add({ targets: piece, y: piece.y + 320, duration: durationMs * 0.7, ease: 'Quad.In' }) });
      this.scene.tweens.add({ targets: piece, rotation: piece.rotation + spin, alpha: 0, duration: durationMs, ease: 'Quad.In', onComplete: () => piece.destroy() });
    }
    this.container.setVisible(false);
  }

  setVisible(v: boolean): void { this.container.setVisible(v); }

  destroy(): void { this.container.destroy(true); }
}
