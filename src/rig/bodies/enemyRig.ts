import { AimTracker } from '../aim';
import { Gait, type GaitSpec } from '../gait';
import { solveTwoBone, type TwoBoneResult } from '../ik';
import { approach, clamp, lerp, Spring } from '../math';
import type { PartSet, PartVariant } from '../parts/types';
import { sock, type Placement, type SocketPose } from '../pose';
import type { PaletteName } from '../../render/palette';

/**
 * A configurable rig for enemies: a core hull plus any mix of IK legs (with a gait),
 * aiming guns, thruster pods, folding wings, a wobbling tail and fixed extras. Each enemy
 * describes its body as data (EnemyRigSpec) and drives it through EnemyRigInput; the
 * rig produces ordered placements and world-ready sockets like HarrowRig does.
 *
 * Local space: native pixels, y-down, +x = facing, origin at the core pivot for flyers
 * or at the ground under the hips for walkers (`hipHeight` set).
 */

export interface LegSpecE {
  /** Socket on the core where the hip is. */
  hip: string;
  thigh: string;
  shin: string;
  foot?: string;
  l1: number;
  l2: number;
  /** +1 knee bends back (reverse joint), -1 forward. */
  bend: 1 | -1;
  far?: boolean;
  /** Socket on the shin part for the ankle (defaults to its length). */
  ankle?: string;
}

export interface AimerSpec {
  name: string;
  part: string;
  /** Socket on the core the gun pivots at. */
  mount: string;
  arc: readonly [number, number];
  /** Socket on the gun part for the muzzle. */
  muzzle: string;
  far?: boolean;
  /** Draw in front of the core (default) or behind it. */
  behind?: boolean;
  omega?: number;
}

export interface PodSpec {
  part: string;
  mount: string;
  far?: boolean;
  /** Nozzle socket on the pod (for jet flames). */
  nozzle?: string;
  behind?: boolean;
}

export interface WingSpec {
  part: string;
  mount: string;
  far?: boolean;
  /** Rotation when fully folded (radians). */
  fold: number;
  behind?: boolean;
}

export interface TailSpec {
  part: string;
  mount: string;
  segments: number;
  /** Distance between segments along the part (native px). */
  length: number;
}

export interface ExtraSpec {
  part: string;
  mount: string;
  far?: boolean;
  behind?: boolean;
  /** Extra rotation driven by `open` (0..1): lids, doors, shields. */
  openRot?: number;
  /** Extra offset driven by `open`. */
  openDx?: number;
  openDy?: number;
  /** Hidden when `open` is below this. */
  showAbove?: number;
  /** Hidden when a named extra is broken. */
  id?: string;
}

export interface EnemyRigSpec {
  rig: string;
  parts: PartSet;
  core: string;
  /** Walkers: hip height above ground (native px). Flyers omit it. */
  hipHeight?: number;
  legs?: LegSpecE[];
  gait?: GaitSpec;
  aimers?: AimerSpec[];
  pods?: PodSpec[];
  wings?: WingSpec[];
  tail?: TailSpec;
  extras?: ExtraSpec[];
  /** Sockets on the core to publish in rig space (FX anchors, hitpart anchors). */
  publish?: string[];
}

export interface EnemyRigInput {
  dt: number;
  /** Body displacement this frame, native px. */
  dx: number;
  vx: number;
  vy: number;
  /** Acceleration (native px/s²) — pods tilt against it. */
  ax?: number;
  ay?: number;
  grounded: boolean;
  facing: 1 | -1;
  moving: boolean;
  /** Target angle per aimer (local, facing-relative). */
  aim?: Record<string, number>;
  /** Hull pitch in radians (extra lean). */
  pitch?: number;
  /** 0..1 lowers walkers (brace, charge, deploy). */
  crouch?: number;
  /** 0..1 folds wings. */
  fold?: number;
  /** 0..1 opens doors / lids / shields. */
  open?: number;
  /** 0..1 spreads legs out (deploy, death). */
  spread?: number;
  /** Extras with these ids are hidden (destroyed parts). */
  broken?: ReadonlySet<string>;
  lightsOff?: boolean;
  time: number;
}

export class EnemyRig {
  readonly gait?: Gait;
  readonly aimers = new Map<string, AimTracker>();
  readonly hipS = new Spring(240, 16);
  readonly recoil = new Map<string, Spring>();
  flash = 0;
  tint = 0;
  glow = 0;
  glowColor: PaletteName = 'hostile1';
  crouch = 0;
  airW = 0;
  readonly placements: Placement[] = [];
  readonly sockets: Record<string, SocketPose> = {};
  readonly bones: [number, number][][] = [];
  private tailAngles: number[] = [];
  private tailVel: number[] = [];
  private readonly ik: TwoBoneResult[];

  constructor(readonly spec: EnemyRigSpec) {
    if (spec.gait) this.gait = new Gait(spec.gait);
    for (const a of spec.aimers ?? []) {
      this.aimers.set(a.name, new AimTracker(a.arc[0], a.arc[1], 'weighted', 0));
      this.recoil.set(a.name, new Spring(320, 24, -4, 2));
    }
    this.ik = (spec.legs ?? []).map(() => ({ upper: 0, lower: 0, kneeX: 0, kneeY: 0, endX: 0, endY: 0, reached: true }));
    if (spec.tail) { this.tailAngles = new Array(spec.tail.segments).fill(Math.PI); this.tailVel = new Array(spec.tail.segments).fill(0); }
  }

  fire(aimer: string, kick = -3): void { this.recoil.get(aimer)?.impulse(kick * 40); }
  land(v: number): void { this.hipS.impulse(Math.min(200, v * 0.8)); }

  update(inp: EnemyRigInput): void {
    const dt = inp.dt;
    this.flash = Math.max(0, this.flash - dt);
    this.tint = Math.max(0, this.tint - dt);
    this.glow = Math.max(0, this.glow - dt);
    this.hipS.step(dt);
    for (const s of this.recoil.values()) s.step(dt);
    this.crouch = approach(this.crouch, inp.crouch ?? 0, dt * 4);
    this.airW = approach(this.airW, inp.grounded ? 0 : 1, dt * 8);
    this.gait?.update(dt, inp.grounded ? inp.dx : 0, inp.facing, inp.moving && inp.grounded);
    for (const [name, tr] of this.aimers) {
      const target = inp.aim?.[name];
      const spec = this.spec.aimers!.find((a) => a.name === name)!;
      if (spec.omega) tr.feel = 'weighted';
      if (target !== undefined) tr.update(target, dt, spec.omega ? spec.omega / 16 : 1);
    }
    this.solve(inp);
  }

  private solve(inp: EnemyRigInput): void {
    const S = this.spec, P = S.parts, out = this.placements;
    out.length = 0;
    this.bones.length = 0;
    const off = !!inp.lightsOff;
    const vN: PartVariant = off ? 'e' : 'n', vF: PartVariant = off ? 'fe' : 'f';
    const walker = S.hipHeight !== undefined;
    const bob = this.gait ? this.gait.hipDrop : 0;
    const coreY = walker ? -S.hipHeight! + this.crouch * S.hipHeight! * 0.45 + this.hipS.x + bob : this.hipS.x;
    const lean = (inp.pitch ?? 0) + (walker ? clamp(inp.vx * inp.facing / 200, -1, 1) * 0.05 : clamp(inp.vx * inp.facing / 300, -1, 1) * 0.18);
    const core: Placement = { part: S.core, spec: P[S.core], x: 0, y: coreY, rot: lean, variant: vN };
    const behind: Placement[] = [], front: Placement[] = [], farLegs: Placement[] = [], nearLegs: Placement[] = [];
    const mk = (part: string, x: number, y: number, rot: number, variant: PartVariant): Placement => ({ part, spec: P[part], x, y, rot, variant });

    // legs
    (S.legs ?? []).forEach((leg, i) => {
      const [hx, hy] = sock(core, leg.hip);
      const foot = this.gait?.feet[i];
      const rest = S.gait?.legs[i].rest ?? 0;
      const spread = 1 + (inp.spread ?? 0) * 0.5;
      let fx = rest * spread + (foot ? foot.x - rest : 0);
      let fy = foot ? foot.y : 0;
      const reach = clamp((inp.vy + 40) / 200, 0, 1);
      const airX = rest * lerp(0.7, 1, reach), airY = Math.min(0, hy + (leg.l1 + leg.l2) * lerp(0.6, 0.95, reach));
      fx = lerp(fx, airX, this.airW); fy = lerp(fy, airY, this.airW);
      const s = solveTwoBone(hx, hy, fx, fy - 2, leg.l1, leg.l2, leg.bend, this.ik[i]);
      const v = leg.far ? vF : vN;
      const list = leg.far ? farLegs : nearLegs;
      list.push(mk(leg.thigh, hx, hy, s.upper, v), mk(leg.shin, s.kneeX, s.kneeY, s.lower, v));
      if (leg.foot) list.push(mk(leg.foot, s.endX, s.endY, (foot?.toe ?? 0) + this.airW * 0.3, v));
      this.sockets[`knee${i}`] = { x: s.kneeX, y: s.kneeY, a: s.upper };
      this.sockets[`foot${i}`] = { x: s.endX, y: s.endY, a: 0 };
      this.bones.push([[hx, hy], [s.kneeX, s.kneeY], [s.endX, s.endY]]);
    });

    // pods: tilt against acceleration (thrust vectoring)
    (S.pods ?? []).forEach((pod, podIndex) => {
      const [px, py] = sock(core, pod.mount);
      const ax = (inp.ax ?? 0) * inp.facing, ay = inp.ay ?? 0;
      const tilt = clamp(-ax / 900, -0.7, 0.7) + clamp(ay / 1400, -0.3, 0.3);
      const p = mk(pod.part, px, py, lean + tilt, pod.far ? vF : vN);
      (pod.behind || pod.far ? behind : front).push(p);
      if (pod.nozzle) {
        const [nx, ny] = sock(p, pod.nozzle);
        this.sockets[`nozzle${podIndex}`] = { x: nx, y: ny, a: lean + tilt + Math.PI / 2 };
      }
    });

    // wings: bank with vertical speed, fold on command
    for (const w of S.wings ?? []) {
      const [wx, wy] = sock(core, w.mount);
      const flap = Math.sin(inp.time * 14) * 0.05;
      const rot = lean + clamp(inp.vy / 600, -0.3, 0.3) + (inp.fold ?? 0) * w.fold + flap;
      (w.behind || w.far ? behind : front).push(mk(w.part, wx, wy, rot, w.far ? vF : vN));
    }

    // tail: chained springs trailing opposite the motion
    if (S.tail) {
      let [tx, ty] = sock(core, S.tail.mount);
      let prev = lean + Math.PI;
      for (let k = 0; k < S.tail.segments; k++) {
        const target = prev + clamp(-inp.vy / 500, -0.4, 0.4) + Math.sin(inp.time * 3 + k) * 0.08;
        this.tailVel[k] += ((target - this.tailAngles[k]) * 90 - this.tailVel[k] * 10) * inp.dt;
        this.tailAngles[k] += this.tailVel[k] * inp.dt;
        behind.push(mk(S.tail.part, tx, ty, this.tailAngles[k], vF));
        tx += Math.cos(this.tailAngles[k]) * S.tail.length;
        ty += Math.sin(this.tailAngles[k]) * S.tail.length;
        prev = this.tailAngles[k];
      }
    }

    // extras (doors, shields, lids, antennae)
    const open = inp.open ?? 0;
    for (const e of S.extras ?? []) {
      if (e.id && inp.broken?.has(e.id)) continue;
      if (e.showAbove !== undefined && open < e.showAbove) continue;
      const [ex, ey] = sock(core, e.mount);
      const p = mk(e.part, ex + (e.openDx ?? 0) * open, ey + (e.openDy ?? 0) * open, lean + (e.openRot ?? 0) * open, e.far ? vF : vN);
      (e.behind || e.far ? behind : front).push(p);
      if (e.id) this.sockets[`extra_${e.id}`] = { x: p.x, y: p.y, a: p.rot };
    }

    // guns
    const gunsBehind: Placement[] = [], gunsFront: Placement[] = [];
    for (const a of S.aimers ?? []) {
      const [mx, my] = sock(core, a.mount);
      const ang = this.aimers.get(a.name)!.angle;
      const r = this.recoil.get(a.name)!.x;
      const p = mk(a.part, mx + Math.cos(ang) * r, my + Math.sin(ang) * r, ang, a.far ? vF : vN);
      (a.behind || a.far ? gunsBehind : gunsFront).push(p);
      const [zx, zy] = sock(p, a.muzzle);
      this.sockets[`muzzle_${a.name}`] = { x: zx, y: zy, a: ang };
    }

    out.push(...farLegs, ...behind, ...gunsBehind, core, ...nearLegs, ...front, ...gunsFront);
    for (const name of S.publish ?? []) {
      const [x, y] = sock(core, name);
      this.sockets[name] = { x, y, a: lean };
    }
    this.sockets.core = { x: core.x, y: core.y, a: lean };
  }
}
