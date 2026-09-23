import { clamp } from './math';

export interface TwoBoneResult {
  /** Upper bone angle (hip → knee). */
  upper: number;
  /** Lower bone angle (knee → end). */
  lower: number;
  kneeX: number;
  kneeY: number;
  /** End effector position actually reached (clamped to reach). */
  endX: number;
  endY: number;
  reached: boolean;
}

/**
 * Two-bone IK in a y-down 2D space. `bend` picks the knee side: with the target
 * straight below the hip, +1 swings the knee toward -x (a reverse / bird joint when
 * the rig faces +x) and -1 toward +x (a human knee).
 */
export function solveTwoBone(
  hx: number, hy: number, tx: number, ty: number,
  l1: number, l2: number, bend: 1 | -1,
  out: TwoBoneResult = { upper: 0, lower: 0, kneeX: 0, kneeY: 0, endX: 0, endY: 0, reached: true },
): TwoBoneResult {
  let dx = tx - hx, dy = ty - hy;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 1e-4;
  const minD = Math.abs(l1 - l2) + 1e-4;
  out.reached = d <= maxD && d >= minD;
  if (d < 1e-6) { dx = 0; dy = minD; d = minD; }
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  if (d < minD) { dx *= minD / d; dy *= minD / d; d = minD; }
  const base = Math.atan2(dy, dx);
  const a1 = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  out.upper = base + bend * a1;
  out.kneeX = hx + Math.cos(out.upper) * l1;
  out.kneeY = hy + Math.sin(out.upper) * l1;
  out.endX = hx + dx;
  out.endY = hy + dy;
  out.lower = Math.atan2(out.endY - out.kneeY, out.endX - out.kneeX);
  return out;
}
