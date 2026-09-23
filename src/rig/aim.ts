import { clamp, wrapAngle } from './math';

export type AimFeel = 'weighted' | 'snappy' | 'instant';

const FEEL: Record<AimFeel, { omega: number; maxRate: number }> = {
  weighted: { omega: 16, maxRate: 9 },
  snappy: { omega: 30, maxRate: 20 },
  instant: { omega: Infinity, maxRate: Infinity },
};

/**
 * Turns a gun toward a target angle with weight: a critically damped spring with a
 * turn-rate cap, clamped to the gun's firing arc. Angles are local to the rig's facing
 * (0 = straight ahead, negative = up in y-down space).
 */
export class AimTracker {
  angle: number;
  velocity = 0;

  constructor(public arcMin: number, public arcMax: number, public feel: AimFeel = 'weighted', initial = 0) {
    this.angle = initial;
  }

  update(target: number, dt: number, rateScale = 1): number {
    const goal = clamp(wrapAngle(target), this.arcMin, this.arcMax);
    const { omega, maxRate } = FEEL[this.feel];
    if (!Number.isFinite(omega)) {
      this.angle = goal;
      this.velocity = 0;
      return this.angle;
    }
    const acc = omega * omega * (goal - this.angle) - 2 * omega * this.velocity;
    this.velocity = clamp(this.velocity + acc * dt, -maxRate * rateScale, maxRate * rateScale);
    this.angle = clamp(this.angle + this.velocity * dt, this.arcMin, this.arcMax);
    return this.angle;
  }

  /** Aim is "on target" when within `tolerance` radians of the (clamped) goal. */
  onTarget(target: number, tolerance = 0.08): boolean {
    return Math.abs(clamp(wrapAngle(target), this.arcMin, this.arcMax) - this.angle) <= tolerance;
  }
}
