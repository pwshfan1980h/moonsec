import { damageStage } from '../../balance/armor';
import { AimTracker, type AimFeel } from '../aim';
import { damageFx, LIMP_EASE_SECONDS, type DamageFx } from '../damage';
import { Gait, type GaitSpec } from '../gait';
import { solveTwoBone, type TwoBoneResult } from '../ik';
import { approach, clamp, lerp, mulberry32, smoothstep, Spring } from '../math';
import { HARROW_PARTS } from '../parts/harrow';
import type { PartVariant } from '../parts/types';
import { sock, type Placement, type SocketPose } from '../pose';

/**
 * HARROW presentation controller. Pure: the Player owns physics, input and gameplay
 * timers; this turns that state into a pose (ordered parts), sockets for weapons and
 * FX, and events (footfalls, toe drags, cook-off booms, vents).
 *
 * Units: native pixels (world units / 2), seconds. Rig-local space is y-down with +x
 * toward `facing`; the origin is the ground point under the mech.
 */

export type RigMode = 'normal' | 'repair' | 'relay' | 'emp' | 'dead' | 'spawn';

export interface HarrowInput {
  dt: number;
  /** Body displacement this frame (native px, world x axis). */
  dx: number;
  /** Velocity, native px/s. */
  vx: number;
  vy: number;
  grounded: boolean;
  facing: 1 | -1;
  /** Aim target relative to the feet, native px, world axes. */
  aimDx: number;
  aimDy: number;
  /** Walking input held (drives the gait blend). */
  moving: boolean;
  dashing: boolean;
  /** World direction of the current dash. */
  dashDir: 1 | -1;
  /** Jump-jet thrust 0..1. */
  thrust: number;
  /** Jets coughing on an empty tank. */
  sputter: boolean;
  mode: RigMode;
  /** Seconds left in a timed mode (EMP), for the reboot flicker. */
  modeRemaining: number;
  /** Seconds since the current mode began. */
  modeTime: number;
  /** Armor points. */
  hp: number;
  time: number;
  feel?: AimFeel;
}

export type RigEvent =
  | { type: 'footfall'; x: number; weight: number }
  | { type: 'toeDrag'; x: number; y: number }
  | { type: 'boom'; x: number; y: number; big: boolean }
  | { type: 'vent'; x: number; y: number };

export interface JetEmitter { x: number; y: number; dx: number; dy: number; power: number; main: boolean }

const P = HARROW_PARTS;
export const HARROW = {
  hipHeight: 30,
  thigh: 15,
  shin: 17,
  walkSpeed: 66,
  /** Native px from the feet to the torso centre — where enemies aim. */
  aimHeight: 40,
  aimMain: [-1.35, 1.05] as const,
  aimRapid: [-1.3, 1.1] as const,
  crouch: { repair: 9, relay: 3, emp: 7, dead: 17, heavy: 9, dash: 3 },
  gait: { cycle: 36, stance: 0.5, lift: 6, bob: 2, legs: [{ rest: -3, phase: 0.5 }, { rest: 3, phase: 0 }] } as GaitSpec,
  /** Near leg takes the hit when critical. */
  limpLeg: 1,
  cookOff: [0.15, 0.45, 0.7, 1.05],
} as const;

const FAR = 0, NEAR = 1;

export class HarrowRig {
  readonly gait = new Gait(HARROW.gait);
  readonly aimMain = new AimTracker(HARROW.aimMain[0], HARROW.aimMain[1], 'weighted', -0.1);
  readonly aimRapid = new AimTracker(HARROW.aimRapid[0], HARROW.aimRapid[1], 'weighted', -0.1);
  readonly hipS = new Spring(260, 16);
  readonly leanS = new Spring(120, 12);
  readonly kickS = new Spring(220, 18);
  readonly recoilS = new Spring(300, 22, -5, 3);
  readonly recoil2S = new Spring(500, 30, -3, 2);
  readonly bodyXS = new Spring(140, 14);

  crouch = 0;
  airW = 0;
  limpW = 0;
  spin = 0;
  spinPhase = 0;
  spinning = false;
  heat = 0;
  hatch = 0;
  hatchT = -1;
  plateOpen = 0;
  antenna = 0;
  landT = 0;
  heavyLand = false;
  launchBurst = 0;
  flashMain = 0;
  flashRapid = 0;
  /** Silhouette flashes, read by the view. */
  flash = 0;
  tint = 0;
  glow = 0;
  glowColor: 'green1' | 'cyan2' = 'cyan2';
  lightsOff = false;
  deathT = 0;
  booms = 0;
  ventT = 3;
  damage: DamageFx = damageFx('healthy');
  stage = damageStage(100);

  readonly placements: Placement[] = [];
  readonly events: RigEvent[] = [];
  readonly jets: JetEmitter[] = [];
  readonly sockets: Record<string, SocketPose> = {};
  /** Debug bones: [hip, knee, ankle] per leg. */
  readonly bones: [number, number][][] = [];

  private readonly ikOut: TwoBoneResult[] = [0, 1].map(() => ({ upper: 0, lower: 0, kneeX: 0, kneeY: 0, endX: 0, endY: 0, reached: true }));
  private readonly rng = mulberry32(0x4a55);
  private last!: HarrowInput;

  // ── gameplay-triggered moments ────────────────────────────────────────────
  fireCannon(): void {
    this.recoilS.impulse(-180); this.kickS.impulse(-7); this.leanS.impulse(-1.6); this.hipS.impulse(25);
    this.flashMain = 0.06;
  }
  fireGatling(): void {
    this.recoil2S.impulse(-50); this.kickS.impulse(-0.6); this.flashRapid = 0.035;
    this.heat = Math.min(1, this.heat + 0.025);
  }
  setGatlingSpin(on: boolean): void { this.spinning = on; }
  openHatch(): void { this.hatchT = 0; this.hipS.impulse(30); }
  /** `dir`: world direction the hit came from (+1 = from the right). */
  hurt(dir: 1 | -1, facing: 1 | -1): void {
    this.flash = 0.06; this.tint = 0.2;
    this.leanS.impulse(-dir * facing * 5); this.hipS.impulse(60); this.kickS.impulse(-6); this.bodyXS.impulse(-dir * facing * 40);
  }
  land(impactVy: number, heavy: boolean): void {
    this.heavyLand = heavy;
    this.hipS.impulse(Math.min(260, impactVy * 0.9));
    this.landT = heavy ? 0.35 : 0.12;
  }
  launch(): void { this.launchBurst = 0.14; this.hipS.impulse(-60); }
  pulse(color: 'green1' | 'cyan2', seconds = 0.5): void { this.glow = seconds; this.glowColor = color; }
  endDash(dir: 1 | -1, facing: 1 | -1): void { this.hipS.impulse(70); this.leanS.impulse(-dir * facing * 3); }

  update(input: HarrowInput): void {
    const dt = input.dt;
    this.last = input;
    this.events.length = 0;
    this.stage = damageStage(input.hp);
    this.damage = damageFx(this.stage);
    if (input.feel) { this.aimMain.feel = input.feel; this.aimRapid.feel = input.feel; }

    // timers
    this.flash = Math.max(0, this.flash - dt);
    this.tint = Math.max(0, this.tint - dt);
    this.glow = Math.max(0, this.glow - dt);
    this.flashMain = Math.max(0, this.flashMain - dt);
    this.flashRapid = Math.max(0, this.flashRapid - dt);
    this.launchBurst = Math.max(0, this.launchBurst - dt);
    this.landT = Math.max(0, this.landT - dt);

    const mode = input.mode;
    const alive = mode !== 'dead';

    // gatling spin + heat
    this.spin = this.spinning && alive && mode !== 'emp' ? Math.min(1, this.spin + dt * 4) : Math.max(0, this.spin - dt * 1.6);
    this.spinPhase += this.spin * dt * 40;
    this.heat = Math.max(0, this.heat - dt * 0.35);

    // missile hatch
    if (this.hatchT >= 0) { this.hatchT += dt; if (this.hatchT > 0.75) this.hatchT = -1; }
    this.hatch = approach(this.hatch, this.hatchT >= 0 && this.hatchT < 0.6 ? 1 : 0, dt * 9);
    this.plateOpen = approach(this.plateOpen, mode === 'repair' ? 1 : 0, dt * 5);
    this.antenna = approach(this.antenna, mode === 'relay' ? 1 : 0, dt * 4);
    this.limpW = approach(this.limpW, this.damage.limp && alive ? 1 : 0, dt / LIMP_EASE_SECONDS);

    // lights
    if (mode === 'dead') this.lightsOff = true;
    else if (mode === 'emp') this.lightsOff = input.modeRemaining > 0.5 || this.rng() < 0.5;
    else this.lightsOff = this.rng() < this.damage.flicker;

    // crouch
    const C = HARROW.crouch;
    let crouchT = 0;
    if (mode === 'repair') crouchT = Math.abs(input.vx) < 8 ? C.repair : 3;
    else if (mode === 'relay') crouchT = C.relay;
    else if (mode === 'emp') crouchT = input.modeRemaining > 0.5 ? C.emp : 0;
    else if (mode === 'dead') crouchT = C.dead;
    if (this.landT > 0 && this.heavyLand) crouchT = Math.max(crouchT, C.heavy);
    if (input.dashing) crouchT = Math.max(crouchT, C.dash);
    this.crouch = approach(this.crouch, crouchT, dt * (mode === 'dead' ? 30 : 60));

    for (const s of [this.hipS, this.leanS, this.kickS, this.recoilS, this.recoil2S, this.bodyXS]) s.step(dt);

    // gait
    const moving = input.grounded && !input.dashing && input.moving && alive && mode !== 'emp';
    this.gait.update(dt, input.grounded && !input.dashing ? input.dx : 0, input.facing, moving,
      this.limpW > 0 ? { leg: HARROW.limpLeg, weight: this.limpW } : undefined);
    this.airW = approach(this.airW, input.grounded ? 0 : 1, dt * (input.grounded ? 14 : 7));

    // aim (arcs are facing-local; droop when the arms are busy or dead)
    this.solvePose(input); // sockets for shoulders, from last frame's aim
    const aimFor = (tr: AimTracker, sh: SocketPose, rateScale: number) => {
      const lx = input.aimDx * input.facing - sh.x, ly = input.aimDy - sh.y;
      let target = Math.atan2(ly, lx);
      let droop = 0;
      if (mode === 'repair') droop = 0.7 * this.plateOpen;
      else if (mode === 'relay') droop = 0.55;
      else if (mode === 'emp' && input.modeRemaining > 0.5) droop = 1;
      else if (mode === 'dead') droop = 1;
      if (droop > 0) target = lerp(clamp(target, tr.arcMin, tr.arcMax), 0.95, droop);
      tr.update(target, dt, mode === 'emp' && input.modeRemaining > 0.5 ? 0.25 : rateScale);
    };
    aimFor(this.aimMain, this.sockets.shoulderNear, 1);
    aimFor(this.aimRapid, this.sockets.shoulderFar, 0.85);

    // idle vents, cook-off, toe drags, footfalls
    for (const e of this.gait.events) this.events.push({ type: 'footfall', x: e.x, weight: e.weight });
    if (alive && input.grounded && Math.abs(input.vx) < 4 && mode === 'normal') {
      this.ventT -= dt;
      if (this.ventT <= 0) { this.ventT = 3 + this.rng() * 1.5; this.events.push({ type: 'vent', ...xy(this.sockets.vent) }); }
    }
    if (mode === 'dead') {
      this.deathT += dt;
      while (this.booms < HARROW.cookOff.length && this.deathT >= HARROW.cookOff[this.booms]) {
        const big = this.booms === HARROW.cookOff.length - 1;
        this.events.push({ type: 'boom', x: -8 + this.rng() * 20, y: -HARROW.hipHeight - 12 + this.rng() * 18 + (big ? 8 : 0), big });
        this.booms++;
      }
    } else { this.deathT = 0; this.booms = 0; }

    this.solvePose(input);
    const near = this.gait.feet[HARROW.limpLeg];
    if (near.dragging) this.events.push({ type: 'toeDrag', ...xy(this.sockets.toeNear) });
  }

  // ── pose ──────────────────────────────────────────────────────────────────
  private solvePose(input: HarrowInput): void {
    const out = this.placements;
    out.length = 0;
    this.bones.length = 0;
    const mode = input.mode;
    const facing = input.facing;
    const off = this.lightsOff;
    const vN: PartVariant = off ? 'e' : 'n';
    const vF: PartVariant = off ? 'fe' : 'f';

    const breathe = mode === 'normal' && this.gait.weight < 0.3 && input.grounded ? Math.round(Math.sin(input.time * 5) * 0.5 + 0.5) : 0;
    const hipY = -HARROW.hipHeight + this.crouch + this.hipS.x + this.gait.hipDrop + breathe;
    const hipX = this.bodyXS.x * 0.1;
    let lean = this.leanS.x * 0.06 + clamp((input.vx * facing) / HARROW.walkSpeed, -1.5, 1.5) * 0.06 + this.gait.lurch;
    if (input.dashing) lean += 0.3 * input.dashDir * facing;
    if (mode === 'dead') lean += Math.min(1, this.deathT * 2) * 0.45;
    if (mode === 'emp' && input.modeRemaining > 0.5) lean += 0.12;
    lean += clamp(this.aimMain.angle * 0.18, -0.22, 0.16);

    const torso = mk('torso', hipX, hipY, lean, vN);
    const spread = mode === 'dead' ? 1.5 : mode === 'repair' && Math.abs(input.vx) < 8 ? 1.25 : mode === 'relay' ? 1.3 : 1;

    // legs
    const hips = [sock(torso, 'hipFar'), sock(torso, 'hipNear')];
    const reach = clamp((input.vy + 40) / 160, 0, 1);
    const legPl: Placement[][] = [];
    for (const i of [FAR, NEAR]) {
      const spec = HARROW.gait.legs[i];
      const foot = this.gait.feet[i];
      let gx = spec.rest * spread + (foot.x - spec.rest);
      let gy = foot.y;
      if (input.dashing) { gx = spec.rest + (i === FAR ? -7 : 7) * input.dashDir * facing; gy = 0; }
      const tuckY = hipY + (HARROW.thigh + HARROW.shin) * lerp(0.62, 0.95, reach);
      const flail = input.sputter ? Math.sin(input.time * 9 + i) * 3.6 : Math.sin(input.time * 9 + i) * 0.5;
      const ax = spec.rest * lerp(0.7, 1.05, reach) + flail;
      const fx = lerp(gx, ax, this.airW);
      const fy = lerp(gy, Math.min(tuckY, 0), this.airW);
      const [hx, hy] = hips[i];
      const s = solveTwoBone(hx, hy, fx, fy - 4, HARROW.thigh, HARROW.shin, 1, this.ikOut[i]);
      const v = i === FAR ? vF : vN;
      const toe = (foot.toe) + this.airW * 0.35;
      const thigh = mk('thigh', hx, hy, s.upper, v);
      const shin = mk('shin', s.kneeX, s.kneeY, s.lower, v);
      const footPl = mk('foot', s.endX, s.endY, toe, v);
      legPl[i] = [thigh, shin, footPl];
      this.bones.push([[hx, hy], [s.kneeX, s.kneeY], [s.endX, s.endY]]);
    }

    // arms
    const shN = sock(torso, 'shoulderNear'), shF = sock(torso, 'shoulderFar');
    const aimM = this.aimMain.angle + this.kickS.x * 0.05;
    const aimR = this.aimRapid.angle + this.kickS.x * 0.02 + (this.spin > 0.8 ? (this.rng() - 0.5) * 0.03 : 0);
    const gat = mk('gatling', shF[0], shF[1], aimR, vF);
    const gbS = sock(gat, 'barrels');
    const spinFrame = Math.floor(this.spinPhase) % 2 === 0 ? 'barrelsA' : 'barrelsB';
    const r2 = this.recoil2S.x * 0.2;
    const gb = mk(spinFrame, gbS[0] + Math.cos(aimR) * r2, gbS[1] + Math.sin(aimR) * r2, aimR, vF);
    const pod = mk('pod', ...sock(torso, 'pod'), lean, vN);
    const lid = mk('lid', ...sock(pod, 'lid'), lean - this.hatch * 1.15, vN);
    const po = this.plateOpen;
    const plateS = sock(torso, 'plate');
    const plate = mk('plate', plateS[0] - po * 3, plateS[1] - po * 3, lean - po * 0.7, vN);
    const can = mk('cannon', shN[0], shN[1], aimM, vN);
    const bS = sock(can, 'barrel');
    const rc = this.recoilS.x;
    const bar = mk('barrel', bS[0] + Math.cos(aimM) * rc, bS[1] + Math.sin(aimM) * rc, aimM, vN);

    out.push(legPl[FAR][0], legPl[FAR][1], legPl[FAR][2], gb, gat, pod, lid, torso);
    if (po > 0.05) out.push({ ...mk('core', plateS[0], plateS[1], lean, 'n'), alpha: po });
    out.push(plate);
    if (this.antenna > 0.05) {
      const top = sock(pod, 'top');
      out.push({ ...mk('antenna', top[0], top[1], lean, vN), scaleY: smoothstep(this.antenna) });
    }
    out.push(legPl[NEAR][0], legPl[NEAR][1], legPl[NEAR][2], bar, can);

    const mz = sock(bar, 'muzzle'), mr = sock(gb, 'muzzle');
    if (this.flashMain > 0) out.push(mk('flashBig', mz[0], mz[1], aimM, 'n'));
    if (this.flashRapid > 0) out.push(mk('flashSmall', mr[0], mr[1], aimR, 'n'));

    // sockets
    const S = this.sockets;
    S.muzzleMain = { x: mz[0], y: mz[1], a: aimM };
    S.muzzleRapid = { x: mr[0], y: mr[1], a: aimR };
    S.shoulderNear = { x: shN[0], y: shN[1], a: 0 };
    S.shoulderFar = { x: shF[0], y: shF[1], a: 0 };
    S.podTube = pose(sock(pod, 'tube'), lean - Math.PI / 2);
    S.podLeds = pose(sock(pod, 'leds'), lean);
    S.antennaTip = this.antenna > 0.05 ? pose(sock(out.find((p) => p.part === 'antenna')!, 'tip'), 0) : pose(sock(pod, 'top'), 0);
    S.eject = pose(sock(can, 'eject'), aimM - Math.PI / 2);
    S.vent = pose(sock(torso, 'vent'), lean - Math.PI / 2);
    S.breach = pose(sock(torso, 'breach'), lean - Math.PI / 2);
    S.chest = pose(sock(torso, 'chest'), lean);
    S.jetBack = pose(sock(torso, 'jetBack'), lean + 2.1);
    S.calfNear = pose(sock(legPl[NEAR][1], 'calfJet'), Math.PI / 2);
    S.calfFar = pose(sock(legPl[FAR][1], 'calfJet'), Math.PI / 2);
    S.toeNear = pose(sock(legPl[NEAR][2], 'toe'), 0);
    S.footNear = pose([legPl[NEAR][2].x, legPl[NEAR][2].y], 0);
    S.footFar = pose([legPl[FAR][2].x, legPl[FAR][2].y], 0);

    // jets
    this.jets.length = 0;
    const alive = mode !== 'dead' && mode !== 'emp';
    let power = 0;
    if (alive) {
      if (this.launchBurst > 0) power = 1.3;
      else if (input.thrust > 0) power = input.thrust;
      else if (input.sputter) power = this.rng() < 0.25 ? 0.9 : 0;
    }
    if (input.dashing && alive) {
      this.jets.push({ x: S.jetBack.x, y: S.jetBack.y, dx: -input.dashDir * facing, dy: 0.1, power: 1.2, main: true });
    } else if (power > 0) {
      this.jets.push({ x: S.jetBack.x, y: S.jetBack.y, dx: Math.cos(S.jetBack.a), dy: Math.sin(S.jetBack.a), power, main: true });
      this.jets.push({ x: S.calfFar.x, y: S.calfFar.y, dx: 0, dy: 1, power: power * 0.6, main: false });
      this.jets.push({ x: S.calfNear.x, y: S.calfNear.y, dx: 0, dy: 1, power, main: false });
    }
  }

  /** The last input this rig was solved with. */
  get input(): HarrowInput { return this.last; }
}

function mk(part: keyof typeof P, x: number, y: number, rot: number, variant: PartVariant): Placement {
  return { part: part as string, spec: P[part], x, y, rot, variant };
}
function pose(p: [number, number], a: number): SocketPose { return { x: p[0], y: p[1], a }; }
function xy(s: SocketPose): { x: number; y: number } { return { x: s.x, y: s.y }; }
