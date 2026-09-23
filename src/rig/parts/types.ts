import type { PaletteName } from '../../render/palette';

/** Drawing commands for a part, in part-local native pixels. Colours are palette names only. */
export interface DrawApi {
  /** Filled rectangle. */
  R(x: number, y: number, w: number, h: number, c: PaletteName): void;
  /** Filled convex/concave polygon (scanline, pixel centres). */
  P(points: readonly (readonly [number, number])[], c: PaletteName): void;
  /** Filled disc. */
  D(cx: number, cy: number, r: number, c: PaletteName): void;
  /** Single pixel. */
  px(x: number, y: number, c: PaletteName): void;
}

export type Socket = readonly [number, number];

/**
 * One rigid sprite in a rig. `px, py` is the pivot (joint) in part-local pixels; the
 * part is drawn rotated around it. Sockets are named attachment points in the same
 * space (child pivots, muzzles, nozzles, FX anchors).
 */
export interface PartSpec {
  w: number;
  h: number;
  px: number;
  py: number;
  sockets?: Record<string, Socket>;
  draw(d: DrawApi): void;
}

export type PartSet = Record<string, PartSpec>;

/** Palette variants baked for every part: near, far-side (one ramp step darker), EMP (lights out). */
export type PartVariant = 'n' | 'f' | 'e' | 'fe';
export const PART_VARIANTS: readonly PartVariant[] = ['n', 'f', 'e', 'fe'];

/** Atlas frame name for a part variant. */
export const frameName = (rig: string, part: string, variant: PartVariant): string => `${rig}/${part}@${variant}`;

/** Parts are rasterised with a 1 px outline on every side. */
export const OUTLINE_PAD = 1;
