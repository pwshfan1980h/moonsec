import Phaser from 'phaser';
import type { GameScene } from '../../scenes/GameScene';
import { Flyer, fireBullet, profile, telegraphLine, BASE_SCALING, type Scaling } from './base';
import { HERON, HORNET, JACKAL, WASP } from '../../rig/bodies/foeSpecs';
import { UtilityBrain, type BrainAction } from '../../ai/UtilityBrain';
import { flankSlot } from '../../ai/AttackTokens';
import { orbit } from '../../ai/Steering';
import type { Vec } from '../../ai/Perception';
import { DAMAGE } from '../../balance/armor';
import { pal } from '../../render/palette';

const EMP_DURATION = 3000;

// ── WASP ────────────────────────────────────────────────────────────────────

export interface Squad { members: Wasp[] }

/**
 * Pod-thruster squad flyer. One member suppresses from a firing position; the others
 * flank to the side HARROW isn't aiming at, using terrain to break line of sight. A hard
 * hit triggers an evasive roll; losing sight sends it to search the last known position.
 */
export class Wasp extends Flyer {
  readonly damageProfile = profile({ chunkTint: pal('hostile0') });
  private readonly brain: UtilityBrain<Wasp>;
  private burstLeft = 0;
  private nextShotAt = 0;
  private evadeUntil = 0;
  private evadeDir: 1 | -1 = 1;
  private anchor: Vec;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING, readonly squad: Squad = { members: [] }) {
    super(scene, x, y, WASP, { hp: 2 + tuning.extraHp, radar: 'flyer', bodyW: 36, bodyH: 22 });
    squad.members.push(this);
    this.anchor = { x, y };
    this.brain = new UtilityBrain<Wasp>([SUPPRESS, FLANK, SEARCH, EVADE, HUNT], 0.12, this.seed);
  }

  get role(): 'suppressor' | 'flanker' { return this.squad.members.filter((m) => m.active)[0] === this ? 'suppressor' : 'flanker'; }
  get slot(): number { return this.squad.members.filter((m) => m.active).indexOf(this); }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    this.brain.tick(this, dt);
    const tgt = this.perception.lastKnown ?? this.target;
    this.faceToward(tgt.x);
    this.aim.gun = this.aimAngle('muzzle_gun', this.target);
    this.aiState = this.perception.sees ? 'ATTACK' : 'HOVER';
    void time;
  }

  tryFire(time: number): void {
    const ai = this.scene.ai;
    if (!this.perception.sees || !ai) return;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    if (dist > 700 || this.burstLeft > 0 || time < this.nextShotAt) return;
    if (!ai.tokens.acquire(this, 'ranged', ai.now, 1 - dist / 1000)) return;
    {
      this.burstLeft = 2;
      this.nextShotAt = time + this.tuning.shootInterval + Math.random() * 500;
      const m = this.socket('muzzle_gun');
      telegraphLine(this.scene, m, this.target, 220, 'hostile0', 2);
      this.scene.time.delayedCall(220, () => this.burst());
    }
  }

  private burst(): void {
    if (!this.active || this.dying) return;
    const shoot = () => {
      if (!this.active || this.dying || this.burstLeft <= 0) return;
      this.burstLeft--;
      const m = this.socket('muzzle_gun');
      const a = Phaser.Math.Angle.Between(m.x, m.y, this.target.x, this.target.y) + (Math.random() - 0.5) * 0.08;
      fireBullet(this.scene, m.x, m.y, a, 260 * this.tuning.bulletSpeedMult, DAMAGE.burstRound);
      this.rig.fire('gun');
      this.scene.audio.play('drone-shoot');
      if (this.burstLeft > 0) this.scene.time.delayedCall(110, shoot);
      else this.scene.ai?.tokens.release(this);
    };
    shoot();
  }

  protected onHit(amount: number): void {
    if (amount >= 1 && this.hp > 0) {
      this.evadeUntil = this.scene.time.now + 450;
      this.evadeDir = Math.random() < 0.5 ? 1 : -1;
      this.brain.interrupt(this);
    }
  }

  // brain helpers
  get evading(): boolean { return this.scene.time.now < this.evadeUntil; }
  doEvade(dt: number): void {
    const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.drive((-dy / d) * 420 * this.evadeDir, (dx / d) * 420 * this.evadeDir - 60, dt);
    this.rigExtra.pitch = this.evadeDir * 0.6;
  }
  doFlyTo(p: Vec, speed: number, dt: number): void { this.rigExtra.pitch = 0; this.flyTo(p, speed, dt, this.scene.time.now); }
  get speed(): number { return this.tuning.attackSpeed; }
  get anchorPoint(): Vec { return this.anchor; }
  set anchorPoint(p: Vec) { this.anchor = p; }
}

const SUPPRESS: BrainAction<Wasp> = {
  name: 'suppress', minCommit: 1.2,
  score: (w) => (w.perception.aware ? (w.role === 'suppressor' ? 0.8 : 0.45) : 0),
  update: (w, dt) => {
    const nav = w.scene.flightNavigation;
    const goal = nav ? nav.firingPosition(w, w.target, 280, 24, 20, 600) : { x: w.target.x - w.facing * 280, y: w.target.y - 200 };
    w.doFlyTo(goal, w.speed, dt);
    w.tryFire(w.scene.time.now);
    return 'running';
  },
};

const FLANK: BrainAction<Wasp> = {
  name: 'flank', minCommit: 1.5,
  score: (w) => (w.perception.aware && w.role === 'flanker' ? 0.7 : 0),
  update: (w, dt) => {
    const n = Math.max(1, w.squad.members.filter((m) => m.active).length - 1);
    const slot = flankSlot(Math.max(0, w.slot - 1), n, w.target, w.player.facing, 340);
    const nav = w.scene.flightNavigation;
    const goal = nav?.nearestOpen(slot, 24, 20) ?? slot;
    w.doFlyTo(goal, w.speed * 1.15, dt);
    w.tryFire(w.scene.time.now);
    return 'running';
  },
};

const SEARCH: BrainAction<Wasp> = {
  name: 'search', minCommit: 1,
  score: (w) => (!w.perception.sees && w.perception.lastKnown ? 0.6 : 0),
  update: (w, dt) => {
    const lk = w.perception.lastKnown;
    if (!lk) return 'done';
    w.doFlyTo({ x: lk.x, y: lk.y - 180 }, w.speed * 0.9, dt);
    return 'running';
  },
};

const EVADE: BrainAction<Wasp> = {
  name: 'evade', minCommit: 0.35, cooldown: 1.5,
  score: (w) => (w.evading ? 1.2 : 0),
  update: (w, dt) => { w.doEvade(dt); return w.evading ? 'running' : 'done'; },
};

/** Not aware yet: sweep toward the player's area in wide arcs (hunting, not patrolling). */
const HUNT: BrainAction<Wasp> = {
  name: 'hunt',
  score: () => 0.2,
  update: (w, dt) => {
    const p = w.scene.player;
    const a = w.anchorPoint;
    w.anchorPoint = { x: a.x + (p.x - a.x) * dt * 0.25, y: Math.min(a.y, p.y - 220) };
    const v = orbit(w, w.anchorPoint, 160, w.speed * 0.6, w.seed > 0.5 ? 1 : -1);
    w.drive(v.x, v.y, dt);
    return 'running';
  },
};

// ── HORNET ──────────────────────────────────────────────────────────────────

/**
 * Swept-wing harrier. Flies curved strafing runs that start on HARROW's blind side,
 * sweep over it with guns firing, and loop back out to line up the next pass.
 */
export class Hornet extends Flyer {
  readonly damageProfile = profile({ chunkTint: pal('hull4') });
  private mode: 'loiter' | 'run' | 'exit' = 'loiter';
  private run: Vec[] = [];
  private modeUntil = 0;
  private nextShot = 0;
  private runShots = 0;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, HORNET, { hp: 3 + tuning.extraHp, radar: 'flyer', bodyW: 44, bodyH: 18 });
    this.maxAccel = 900;
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.target;
    const ai = this.scene.ai;
    if (this.mode === 'loiter') {
      const v = orbit(this, { x: p.x, y: p.y - 300 }, 480, this.tuning.attackSpeed * 0.8, this.seed > 0.5 ? 1 : -1);
      this.drive(v.x, v.y, dt);
      this.faceToward(this.x + this.velX);
      if (time > this.modeUntil && this.perception.aware && ai?.tokens.acquire(this, 'ranged', ai.now, 0.5)) {
        const blind = -this.player.facing;
        this.run = [
          { x: p.x + blind * 520, y: p.y - 240 },
          { x: p.x + blind * 180, y: p.y - 150 },
          { x: p.x - blind * 200, y: p.y - 170 },
          { x: p.x - blind * 560, y: p.y - 320 },
        ];
        this.mode = 'run';
        this.runShots = 0;
      }
    } else if (this.mode === 'run') {
      const wp = this.run[0];
      if (!wp) { this.mode = 'exit'; this.modeUntil = time + 1200; ai?.tokens.release(this); return; }
      const speed = this.tuning.attackSpeed * 1.8;
      this.flyTo(wp, speed, dt, time);
      this.faceToward(wp.x);
      if (Phaser.Math.Distance.Between(this.x, this.y, wp.x, wp.y) < 60) this.run.shift();
      this.aim.gun = this.aimAngle('muzzle_gun', p);
      const ahead = (p.x - this.x) * this.facing;
      if (ahead > 0 && ahead < 420 && time > this.nextShot && this.perception.sees && this.runShots < 6) {
        this.runShots++;
        this.nextShot = time + 140;
        const m = this.socket('muzzle_gun');
        fireBullet(this.scene, m.x, m.y, Phaser.Math.Angle.Between(m.x, m.y, p.x, p.y) + (Math.random() - 0.5) * 0.12, 300 * this.tuning.bulletSpeedMult, DAMAGE.strafeRound);
        this.rig.fire('gun', -2);
      }
      this.rigExtra.pitch = Phaser.Math.Clamp(this.velY / 400, -0.4, 0.4);
    } else {
      this.drive(this.velX * 0.98, this.velY - 120 * dt, dt);
      if (time > this.modeUntil) { this.mode = 'loiter'; this.modeUntil = time + 1500 + Math.random() * 1500; }
    }
    this.aiState = this.mode === 'run' ? 'ATTACK' : 'HOVER';
  }
}

// ── HERON ───────────────────────────────────────────────────────────────────

/**
 * Hover sniper. Settles at a perch or firing spot, tracks HARROW with a lagging laser
 * sight, fires after holding steady for 0.8 s, then relocates. Breaking line of sight
 * with terrain resets the aim.
 */
export class Heron extends Flyer {
  readonly damageProfile = profile({ chunkTint: pal('hull5') });
  private mode: 'relocate' | 'aim' = 'relocate';
  private spot: Vec | null = null;
  private steady = 0;
  private laser: Phaser.GameObjects.Graphics;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, HERON, { hp: 2 + tuning.extraHp, radar: 'flyer', bodyW: 30, bodyH: 24, sight: 1100 });
    this.laser = scene.add.graphics().setDepth(13);
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.target;
    this.faceToward(p.x);
    const ai = this.scene.ai;
    this.laser.clear();
    if (this.mode === 'relocate') {
      if (!this.spot) {
        const perch = ai?.cover.bestPerch(p, this, 560);
        const nav = this.scene.flightNavigation;
        const cand = perch ? { x: perch.x, y: perch.y - 70 } : nav?.firingPosition(this, p, 540, 18, 14, 800) ?? { x: p.x + 500, y: p.y - 300 };
        this.spot = nav?.nearestOpen(cand, 18, 14) ?? cand;
      }
      this.flyTo(this.spot, this.tuning.attackSpeed * 1.1, dt, time);
      const there = Phaser.Math.Distance.Between(this.x, this.y, this.spot.x, this.spot.y) < 24;
      // snipers share the artillery token: only one laser on the player at a time
      if (there && (!ai || ai.tokens.acquire(this, 'artillery', ai.now, 0.5))) { this.mode = 'aim'; this.steady = 0; }
      this.aim.gun = this.aimAngle('muzzle_gun', p);
    } else {
      this.drive(0, Math.sin(time / 300) * 10, dt);
      this.aim.gun = this.aimAngle('muzzle_gun', p);
      const tr = this.rig.aimers.get('gun')!;
      const m = this.socket('muzzle_gun');
      const onTarget = this.perception.sees && tr.onTarget(this.aim.gun, 0.07);
      this.steady = onTarget ? this.steady + dt : Math.max(0, this.steady - dt * 2);
      if (this.perception.sees) {
        const len = 1400;
        const end = { x: m.x + Math.cos(m.angle) * len, y: m.y + Math.sin(m.angle) * len };
        const blink = this.steady > 0.55 && Math.floor(time / 60) % 2 === 0;
        this.laser.lineStyle(2, pal(blink ? 'cyan3' : 'hostile1'), 0.8);
        this.laser.lineBetween(m.x, m.y, end.x, end.y);
      }
      if (this.steady >= 0.8) {
        fireBullet(this.scene, m.x, m.y, m.angle, 620 * this.tuning.bulletSpeedMult, DAMAGE.sniperBullet);
        this.rig.fire('gun', -5);
        this.scene.audio.playAt('drone-shoot', { rate: 0.7, detune: -300, volume: 0.6 });
        this.mode = 'relocate';
        this.spot = null;
        ai?.tokens.release(this);
      }
      if (!this.perception.aware) { this.mode = 'relocate'; this.spot = null; ai?.tokens.release(this); }
    }
    this.aiState = this.mode === 'aim' ? 'ATTACK' : 'HOVER';
  }

  destroy(fromScene?: boolean): void { this.laser?.destroy(); super.destroy(fromScene); }
}

// ── JACKAL ──────────────────────────────────────────────────────────────────

export type PackPhase = 'circle' | 'feint' | 'strike' | 'scatter';

/**
 * Pack coordinator (pure — tested). The pack circles out of reach, two members feint
 * a charge and peel off, then the striker comes from the opposite side.
 */
export class JackalPack {
  phase: PackPhase = 'circle';
  timer = 2.5;
  striker = -1;
  constructor(public size: number) {}

  update(dt: number, alive: number): void {
    this.timer -= dt;
    if (alive <= 0) return;
    if (this.timer > 0) return;
    switch (this.phase) {
      case 'circle': this.phase = alive >= 2 ? 'feint' : 'strike'; this.timer = alive >= 2 ? 0.9 : 1.2; this.striker = alive - 1; break;
      case 'feint': this.phase = 'strike'; this.timer = 1.3; this.striker = alive - 1; break;
      case 'strike': this.phase = 'scatter'; this.timer = 1.2; break;
      case 'scatter': this.phase = 'circle'; this.timer = 2 + Math.random(); this.striker = -1; break;
    }
  }

  roleOf(index: number): 'circle' | 'feint' | 'strike' | 'scatter' {
    if (this.phase === 'feint') return index === this.striker ? 'circle' : 'feint';
    if (this.phase === 'strike') return index === this.striker ? 'strike' : 'circle';
    return this.phase;
  }
}

export class Jackal extends Flyer {
  readonly damageProfile = profile({ chunkTint: pal('cyan1') });
  private strikeFrom: Vec | null = null;
  private diving = false;

  constructor(scene: GameScene, x: number, y: number, readonly pack: JackalPack, readonly members: Jackal[], private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, JACKAL, { hp: 2, radar: 'flyer', bodyW: 32, bodyH: 14 });
    members.push(this);
    this.maxAccel = 1400;
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const alive = this.members.filter((m) => m.active && !m.dying);
    const index = alive.indexOf(this);
    if (index === 0) this.pack.update(dt, alive.length);
    const p = this.target;
    const role = this.pack.roleOf(index);
    const side: 1 | -1 = index % 2 === 0 ? 1 : -1;
    if (role === 'circle' || role === 'scatter') {
      const radius = role === 'scatter' ? 520 : 380;
      const v = orbit(this, { x: p.x, y: p.y - 120 }, radius, this.tuning.attackSpeed * 1.3, side);
      this.drive(v.x, v.y, dt);
      this.faceToward(this.x + this.velX);
    } else if (role === 'feint') {
      const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (d > 220) { this.flyTo(p, 420, dt, time); this.faceToward(p.x); } else this.drive(-this.velX, -260, dt);
    } else {
      // the real strike: swing round to the side the player isn't aiming at, then dive
      if (!this.strikeFrom) this.strikeFrom = { x: p.x - this.player.facing * 280, y: p.y - 70 };
      if (!this.diving && Phaser.Math.Distance.Between(this.x, this.y, this.strikeFrom.x, this.strikeFrom.y) < 50) this.diving = true;
      this.flyTo(this.diving ? p : this.strikeFrom, this.diving ? 560 : 520, dt, time);
      this.faceToward(p.x);
      this.rigExtra.fold = 1;
      if (this.diving && Math.random() < 0.3) this.fx.spark(this.x, this.y, 1, Math.PI, 1);
    }
    if (role !== 'strike') { this.strikeFrom = null; this.diving = false; }
    if (role !== 'strike') this.rigExtra.fold = role === 'feint' ? 0.6 : 0;
    this.aiState = role === 'strike' || role === 'feint' ? 'ATTACK' : 'HOVER';
  }

  /** Contact with HARROW (CollisionRegistry's generic drone overlap). */
  onHitPlayer(): void {
    if (this.dying) return;
    this.scene.player.empStun(EMP_DURATION);
    this.fx.spark(this.x, this.y, 16, -Math.PI / 2, 3);
    this.die();
  }
}
