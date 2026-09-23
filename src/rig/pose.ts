import type { PartSpec, PartVariant, Socket } from './parts/types';

/**
 * A part placed in rig-local space (native px, y-down, +x = facing direction, origin
 * at the feet). The part's pivot sits at (x, y) and the part is rotated by `rot`.
 */
export interface Placement {
  part: string;
  spec: PartSpec;
  x: number;
  y: number;
  rot: number;
  variant: PartVariant;
  /** Optional vertical stretch (antenna mast extension). */
  scaleY?: number;
  alpha?: number;
}

export interface SocketPose { x: number; y: number; a: number }

/** Rig-local position of a part-local point after placement. */
export function sock(p: Placement, s: Socket | string): [number, number] {
  const pt = typeof s === 'string' ? p.spec.sockets?.[s] : s;
  if (!pt) throw new Error(`no socket ${String(s)} on ${p.part}`);
  const dx = pt[0] - p.spec.px, dy = (pt[1] - p.spec.py) * (p.scaleY ?? 1);
  const c = Math.cos(p.rot), sn = Math.sin(p.rot);
  return [p.x + dx * c - dy * sn, p.y + dx * sn + dy * c];
}

export function place(part: string, spec: PartSpec, x: number, y: number, rot: number, variant: PartVariant): Placement {
  return { part, spec, x, y, rot, variant };
}

/** Converts a rig-local point to world space (world units = native px × scale). */
export function localToWorld(lx: number, ly: number, originX: number, originY: number, facing: 1 | -1, scale: number): [number, number] {
  return [originX + lx * facing * scale, originY + ly * scale];
}

/** Converts a rig-local angle to a world angle given facing. */
export function worldAngle(a: number, facing: 1 | -1): number {
  return facing > 0 ? a : Math.PI - a;
}

/** Inverse of worldAngle: a world direction expressed in the rig's facing frame. */
export function localAngle(dx: number, dy: number, facing: 1 | -1): number {
  return Math.atan2(dy, dx * facing);
}
