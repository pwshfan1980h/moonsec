import { approach, clamp, frac, lerp, smoothstep } from './math';

/**
 * Distance-driven procedural gait.
 *
 * Each leg's phase advances with distance travelled (not time), so a planted foot's
 * offset shrinks by exactly the body's displacement and never slides. For a leg with
 * stance fraction `s` of a cycle `C`, the stride is `s·C`; the swing carries the foot
 * forward over the remaining `(1-s)·C`. Walking backward runs the phase in reverse.
 *
 * Coordinates: foot `x` is local to the rig (facing-relative, +x = ahead), `y` is up
 * from the ground as a negative number (y-down space).
 */
export interface LegSpec {
  /** Foot rest position, local x. */
  rest: number;
  /** Phase offset 0..1. */
  phase: number;
}

export interface GaitSpec {
  /** Distance for one full cycle (all legs step once). */
  cycle: number;
  /** Fraction of the cycle each foot spends planted (0.5 = walk). */
  stance: number;
  /** Swing foot lift height. */
  lift: number;
  /** Hip drop on footfall. */
  bob: number;
  legs: LegSpec[];
}

export interface LimpSpec {
  /** Index of the damaged leg. */
  leg: number;
  /** 0..1 blend toward the full limp. */
  weight: number;
}

export interface FootState {
  x: number;
  y: number;
  lift: number;
  stance: boolean;
  /** Foot pitch: negative = toe up (swing), positive = toe down (dragging). */
  toe: number;
  /** Bad leg scraping the ground through its swing. */
  dragging: boolean;
}

export interface GaitEvent {
  type: 'footfall';
  leg: number;
  x: number;
  /** 0..1 how heavy the step reads (limping footfalls on the bad leg land hard). */
  weight: number;
}

/** Limp shape. Tuned against HARROW; see gait.test.ts for the invariants. */
export const LIMP = {
  badStance: 0.35,
  goodStance: 0.65,
  badLift: 0.15,
  /** Hip dip while the bad leg carries the weight (native px). */
  dip: 3,
  /** Torso lurch toward the ground during the bad stance (radians). */
  lurch: 0.12,
} as const;

export class Gait {
  dist = 0;
  /** 0 = standing, 1 = full gait. */
  weight = 0;
  /** Downward hip offset this frame (native px). */
  hipDrop = 0;
  /** Extra torso pitch this frame (radians, + = nose down). */
  lurch = 0;
  readonly feet: FootState[];
  readonly events: GaitEvent[] = [];
  private readonly prevStance: boolean[];

  constructor(public spec: GaitSpec) {
    this.feet = spec.legs.map((l) => ({ x: l.rest, y: 0, lift: 0, stance: true, toe: 0, dragging: false }));
    this.prevStance = spec.legs.map(() => true);
  }

  /** Effective stance fraction and phase offset for leg `i` under a limp. */
  legParams(i: number, limp?: LimpSpec): { stance: number; phase: number; liftScale: number } {
    const base = this.spec.legs[i];
    const w = limp ? clamp(limp.weight, 0, 1) : 0;
    if (!limp || w <= 0) return { stance: this.spec.stance, phase: base.phase, liftScale: 1 };
    if (i === limp.leg) {
      return { stance: lerp(this.spec.stance, LIMP.badStance, w), phase: base.phase, liftScale: lerp(1, LIMP.badLift, w) };
    }
    const bad = this.spec.legs[limp.leg];
    const badStance = lerp(this.spec.stance, LIMP.badStance, w);
    // Bipeds: the good leg plants exactly as the bad leg lifts — a hobble with no double support.
    const phase = this.spec.legs.length === 2 ? lerp(base.phase, frac(bad.phase - badStance), w) : base.phase;
    return { stance: lerp(this.spec.stance, LIMP.goodStance, w), phase, liftScale: 1 };
  }

  /**
   * @param dx      body displacement this frame (world units in the rig's native px)
   * @param facing  +1 / -1
   * @param moving  whether the body is walking (drives the gait weight)
   */
  update(dt: number, dx: number, facing: 1 | -1, moving: boolean, limp?: LimpSpec): void {
    this.events.length = 0;
    this.weight = approach(this.weight, moving ? 1 : 0, dt * (moving ? 6 : 5));
    this.dist += dx;
    const { cycle, lift, bob } = this.spec;
    const dir = dx >= 0 ? 1 : -1;
    let drop = 0;
    let dip = 0;
    this.spec.legs.forEach((leg, i) => {
      const { stance: s, phase, liftScale } = this.legParams(i, limp);
      const p = frac(this.dist / cycle + phase);
      const stride = s * cycle;
      const foot = this.feet[i];
      let rel: number, h: number;
      const inStance = p < s;
      if (inStance) {
        rel = stride / 2 - (p / s) * stride;
        h = 0;
        // footfall pulse: strongest right after landing (direction aware)
        const since = dir > 0 ? p / s : 1 - p / s;
        drop = Math.max(drop, Math.exp(-((since / 0.35) ** 2)));
        if (limp && i === limp.leg) dip = Math.max(dip, Math.sin(Math.PI * (p / s)) * limp.weight);
      } else {
        const q = (p - s) / (1 - s);
        rel = -stride / 2 + smoothstep(q) * stride;
        h = Math.sin(Math.PI * q) * lift * liftScale;
      }
      const w = this.weight;
      foot.x = leg.rest + rel * facing * w;
      foot.y = -h * w;
      foot.lift = h * w;
      foot.stance = inStance || w < 0.05;
      foot.dragging = !!limp && i === limp.leg && limp.weight > 0.5 && !inStance && w > 0.5;
      foot.toe = foot.dragging ? 0.3 : -0.25 * (lift > 0 ? foot.lift / lift : 0);
      if (!this.prevStance[i] && foot.stance && w > 0.5) {
        const heavy = limp && i === limp.leg ? 0.6 + 0.4 * limp.weight : 0.6;
        this.events.push({ type: 'footfall', leg: i, x: foot.x, weight: heavy });
      }
      this.prevStance[i] = foot.stance;
    });
    this.hipDrop = bob * this.weight * drop + LIMP.dip * dip * this.weight;
    this.lurch = LIMP.lurch * dip * this.weight;
  }
}
