import Phaser from 'phaser';
import type { GameScene } from '../../scenes/GameScene';
import type { DamageProfile } from '../../collisions/HostileCombat';
import { RiggedHostile, enemyFx, type RadarKind } from '../RiggedHostile';
import { EnemyRig, type EnemyRigSpec } from '../../rig/bodies/enemyRig';
import { Perception, type Vec } from '../../ai/Perception';
import { FlightRoute } from '../../systems/FlightNavigation';
import { VPX } from '../../render/GraphicsSettings';
import { pal, type PaletteName } from '../../render/palette';
import { DAMAGE } from '../../balance/armor';
import type { Span, SpanLink } from '../../ai/GroundNav';
import { TILE } from '../../fx/terrain';
import { stepUpHeight } from '../../level/stepUp';

export interface Scaling { attackSpeed: number; shootInterval: number; extraHp: number; bulletSpeedMult: number }
export const BASE_SCALING: Scaling = { attackSpeed: 216, shootInterval: 1890, extraHp: 0, bulletSpeedMult: 0.78 };

export function profile(over: Partial<DamageProfile> = {}): DamageProfile {
  return {
    fromRapid: 1, fromTurret: 1, fromMissile: 3,
    chunkTint: pal('hull4'), chunkChance: 0.35, chunkCount: 2,
    showDamageText: true, impactAudio: true, ...over,
  };
}

/** Fires one enemy bullet from the shared pool. Always stamps its damage. */
export function fireBullet(scene: GameScene, x: number, y: number, angle: number, speed: number, damage = DAMAGE.droneBullet, key = 'bullet-drone'): void {
  const b = scene.droneBullets.get(x, y, key) as Phaser.Physics.Arcade.Image | null;
  if (!b) return;
  b.setActive(true).setVisible(true).setDepth(14).setData('damage', damage).setScale(1).setTint(pal('hostile1'));
  b.setBlendMode(Phaser.BlendModes.NORMAL);
  const body = b.body as Phaser.Physics.Arcade.Body | undefined;
  if (body) { body.enable = true; body.setAllowGravity(false); }
  b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
}

/** A hostile-red warning line that pulses for `ms`, then disappears. */
export function telegraphLine(scene: Phaser.Scene, a: Vec, b: Vec, ms: number, color: PaletteName = 'hostile1', width = 2): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(13);
  const draw = (alpha: number) => {
    g.clear();
    g.lineStyle(width, pal(color), alpha);
    g.lineBetween(Math.round(a.x / 2) * 2, Math.round(a.y / 2) * 2, Math.round(b.x / 2) * 2, Math.round(b.y / 2) * 2);
  };
  draw(1);
  let t = 0;
  const ev = scene.time.addEvent({ delay: 60, loop: true, callback: () => { t += 60; draw(Math.floor(t / 120) % 2 ? 0.45 : 1); } });
  scene.time.delayedCall(ms, () => { ev.remove(); g.destroy(); });
  return g;
}

interface CommonOpts {
  hp: number;
  radar: RadarKind;
  bodyW: number;
  bodyH: number;
  sight?: number;
  fov?: number;
}

/** Shared parts of every enemy that wears an EnemyRig. */
abstract class FoeBase extends RiggedHostile {
  readonly rig: EnemyRig;
  readonly perception: Perception;
  protected aim: Record<string, number> = {};
  protected rigExtra: { pitch?: number; crouch?: number; fold?: number; open?: number; spread?: number; lightsOff?: boolean } = {};
  protected broken = new Set<string>();
  protected lastX: number;
  protected lastY: number;
  protected t = 0;
  /** Random 0..1 per enemy, to desynchronise animation and patterns. */
  readonly seed = Math.random();

  constructor(scene: GameScene, x: number, y: number, spec: EnemyRigSpec, o: CommonOpts & { gravity: boolean; originY: number }) {
    super(scene, x, y, { rig: spec.rig, bodyW: o.bodyW, bodyH: o.bodyH, hp: o.hp, radar: o.radar, gravity: o.gravity, originY: o.originY });
    this.rig = new EnemyRig(spec);
    this.perception = new Perception({ range: o.sight ?? 900, fov: o.fov ?? Math.PI * 2, memory: 4, hearing: 700 });
    this.lastX = x; this.lastY = y;
  }

  get fx() { return enemyFx(this.scene); }
  get player() { return this.scene.player; }
  get target(): Vec { return this.scene.player.getAimPoint(); }

  protected sense(dt: number): void {
    const ai = this.scene.ai;
    this.perception.update(dt, this, this.facing, this.target, (a, b) => ai ? ai.lineClear(a, b) : true, ai?.noises ?? []);
  }

  /** Local aim angle (facing-relative) from a rig socket to a world point. */
  protected aimAngle(from: string, p: Vec): number {
    const s = this.socket(from);
    return Math.atan2(p.y - s.y, (p.x - s.x) * this.facing);
  }

  protected faceToward(x: number): void {
    if (Math.abs(x - this.x) > 8) this.facing = x > this.x ? 1 : -1;
  }
}

/** Flying enemy: steers through the flight graph with acceleration limits. */
export abstract class Flyer extends FoeBase {
  protected route: FlightRoute | undefined;
  protected velX = 0;
  protected velY = 0;
  private accX = 0;
  private accY = 0;
  maxAccel = 700;

  constructor(scene: GameScene, x: number, y: number, spec: EnemyRigSpec, o: CommonOpts) {
    super(scene, x, y, spec, { ...o, gravity: false, originY: 0.5 });
    const nav = scene.flightNavigation;
    if (nav) this.route = new FlightRoute(nav, Math.max(24, o.bodyW / 2), Math.max(20, o.bodyH / 2));
    scene.drones.add(this);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  }

  /** Accelerate toward a desired velocity. */
  drive(dvx: number, dvy: number, dt: number): void {
    const ax = Phaser.Math.Clamp((dvx - this.velX) / Math.max(dt, 1e-3), -this.maxAccel, this.maxAccel);
    const ay = Phaser.Math.Clamp((dvy - this.velY) / Math.max(dt, 1e-3), -this.maxAccel, this.maxAccel);
    this.velX += ax * dt; this.velY += ay * dt;
    this.accX = ax; this.accY = ay;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(this.velX, this.velY);
  }

  /** Path toward a world point at `speed` (falls back to direct flight without a graph). */
  protected flyTo(dest: Vec, speed: number, dt: number, time: number): void {
    const v = this.route ? this.route.steer(this, dest, speed, time) : (() => {
      const dx = dest.x - this.x, dy = dest.y - this.y, d = Math.hypot(dx, dy) || 1;
      const s = Math.min(speed, d * 3);
      return { x: (dx / d) * s, y: (dy / d) * s };
    })();
    this.drive(v.x, v.y, dt);
  }

  protected animate(dt: number, time: number): void {
    this.t += dt;
    const dx = (this.x - this.lastX) / VPX;
    this.lastX = this.x; this.lastY = this.y;
    this.rig.update({
      dt, dx, vx: this.velX / VPX, vy: this.velY / VPX, ax: this.accX / VPX, ay: this.accY / VPX,
      grounded: false, facing: this.facing, moving: false, aim: this.aim, time: time / 1000 + this.seed * 10,
      broken: this.broken, ...this.rigExtra,
    });
    // thruster wash
    for (const [k, s] of Object.entries(this.rig.sockets)) {
      if (!k.startsWith('nozzle') || Math.random() > 0.35) continue;
      const wx = this.x + s.x * this.facing * VPX, wy = this.y + s.y * VPX;
      this.fx.jetFlame(wx, wy, Math.PI / 2 + (this.accX > 0 ? -0.3 : 0.3) * this.facing, 0.35, 16);
    }
  }
}

/** Ground enemy: gravity, span-aware walking, jumps along GroundNav links. */
/** A route link that is just a one-tile rise onto the adjacent cell. */
function isStepLink(l: SpanLink): boolean {
  return l.kind === 'jump' && Math.abs(l.from.y - l.land.y - TILE) < 1 && Math.abs(l.land.x - l.from.x) <= TILE;
}

export abstract class Walker extends FoeBase {
  protected walkSpeed = 90;
  protected route: SpanLink[] | null = null;
  private routeAt = -Infinity;
  private jumping = false;

  constructor(scene: GameScene, x: number, y: number, spec: EnemyRigSpec, o: CommonOpts & { walkSpeed?: number }) {
    super(scene, x, y, spec, { ...o, gravity: true, originY: 1 });
    this.walkSpeed = o.walkSpeed ?? 90;
    scene.tanks.add(this);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
  }

  get grounded(): boolean { return (this.body as Phaser.Physics.Arcade.Body).blocked.down; }

  protected span(): Span | null {
    return this.scene.ai?.ground.spanAt(this.x, this.y) ?? null;
  }

  /** Walk toward a world x on the current span (and across links toward `goal` if given). */
  protected walkTo(goalX: number, goalY: number | null, speedScale: number, time: number): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.grounded) return false;
    this.jumping = false;
    const nav = this.scene.ai?.ground;
    const here = this.span();
    let tx = goalX;
    let stepping = false;
    if (nav && here && goalY !== null) {
      const goalSpan = nav.spanAt(goalX, goalY);
      if (goalSpan && goalSpan.id !== here.id) {
        if (time > this.routeAt || !this.route) { this.route = nav.route(here.id, goalSpan.id); this.routeAt = time + 1000; }
        const next = this.route?.[0];
        if (next && isStepLink(next)) {
          // one-tile terrace: walk into it and let step-up lift the walker
          tx = next.land.x;
          stepping = true;
          if (Math.abs(this.x - next.land.x) < 10 || this.span()?.id === next.to) this.route?.shift();
        } else if (next) {
          tx = next.from.x;
          if (Math.abs(this.x - next.from.x) < 10) {
            // take the link: jump up/across, or step off
            const dx = next.land.x - this.x, dy = next.land.y - this.y;
            const vy = dy < -8 ? -Math.sqrt(2 * 600 * (-dy + 40)) : -120;
            body.setVelocity(Phaser.Math.Clamp(dx * 2.2, -260, 260), vy);
            this.jumping = true;
            this.route?.shift();
            return true;
          }
        }
      }
    }
    if (here && nav && !stepping) tx = nav.clampToSpan(here, tx, 10);
    const dx = tx - this.x;
    const speed = this.walkSpeed * speedScale;
    body.setVelocityX(Math.abs(dx) < 6 ? 0 : Math.sign(dx) * speed);
    if (Math.abs(dx) >= 6) this.stepUp(Math.sign(dx) as -1 | 1);
    return Math.abs(dx) < 6;
  }

  /** Lift onto a one-tile ledge when pushing into it. */
  private stepUp(dir: -1 | 1): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const terrain = this.scene.ai?.terrain;
    if (!terrain || !(dir > 0 ? body.blocked.right : body.blocked.left)) return;
    const h = stepUpHeight(terrain, { x: this.x, y: body.bottom, halfW: body.width / 2, h: body.height }, dir);
    if (h <= 0) return;
    this.y -= h;
    this.x += dir * 4;
    this.rig.land(60);
  }

  protected halt(): void {
    if (this.grounded) (this.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
  }

  protected animate(dt: number, time: number): void {
    this.t += dt;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const dx = (this.x - this.lastX) / VPX;
    this.lastX = this.x;
    const wasAir = this.rig.airW > 0.5;
    this.rig.update({
      dt, dx, vx: body.velocity.x / VPX, vy: body.velocity.y / VPX, grounded: this.grounded, facing: this.facing,
      moving: Math.abs(body.velocity.x) > 8, aim: this.aim, time: time / 1000 + this.seed * 10,
      broken: this.broken, ...this.rigExtra,
    });
    if (wasAir && this.grounded) {
      this.rig.land(Math.abs(body.velocity.y) / VPX + 80);
    }
  }
}
