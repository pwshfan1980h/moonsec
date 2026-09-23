import Phaser from 'phaser';
import type { GameScene } from '../../scenes/GameScene';
import { Walker, fireBullet, profile, telegraphLine, BASE_SCALING, type Scaling } from './base';
import { RiggedHostile, HitPart, enemyFx, type HostileBody } from '../RiggedHostile';
import { BURROWER, PROWLER, RAM, SPOTTER, STILT } from '../../rig/bodies/foeSpecs';
import { EnemyRig } from '../../rig/bodies/enemyRig';
import { predictLanding } from '../../ai/Predict';
import type { Vec } from '../../ai/Perception';
import { DAMAGE } from '../../balance/armor';
import { pal } from '../../render/palette';
import { VPX } from '../../render/GraphicsSettings';
import { RIG_PARTS } from '../../rig/parts';
import type { Placement, SocketPose } from '../../rig/pose';

// ── PROWLER ─────────────────────────────────────────────────────────────────

/**
 * Small reverse-joint skirmisher. Moves between cover points, peeks out to fire a burst
 * when it holds a ranged token, and ducks back. Explosions nearby flush it to new cover.
 */
export class Prowler extends Walker {
  readonly damageProfile = profile({ chunkTint: pal('hull4') });
  private mode: 'move' | 'hold' | 'peek' = 'move';
  private cover: Vec | null = null;
  private modeT = 0;
  private shots = 0;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, PROWLER, { hp: 3 + tuning.extraHp, radar: 'walker', bodyW: 28, bodyH: 36, sight: 900, walkSpeed: 110 });
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.target;
    const ai = this.scene.ai;
    this.modeT += dt;
    this.aim.gun = this.aimAngle('muzzle_gun', p);
    if (this.perception.heard && this.mode === 'hold' && Math.random() < 0.3) { this.mode = 'move'; this.cover = null; }
    if (this.mode === 'move') {
      if (!this.cover) this.cover = ai?.cover.bestCover(p, this, 700, 220) ?? { x: p.x + (this.x < p.x ? -360 : 360), y: this.y };
      const arrived = this.walkTo(this.cover.x, this.cover.y, 1, time);
      this.faceToward(p.x);
      this.rigExtra.crouch = 0;
      if (arrived || this.modeT > 4) { this.mode = 'hold'; this.modeT = 0; }
    } else if (this.mode === 'hold') {
      this.halt();
      this.faceToward(p.x);
      this.rigExtra.crouch = 0.7;
      if (this.modeT > 0.6 && ai?.tokens.acquire(this, 'ranged', ai.now, 0.4)) { this.mode = 'peek'; this.modeT = 0; this.shots = 0; }
      if (this.modeT > 3.5) { this.mode = 'move'; this.cover = null; this.modeT = 0; }
    } else {
      this.rigExtra.crouch = 0;
      if (this.modeT > 0.35 && this.shots < 3 && this.modeT > 0.35 + this.shots * 0.13 && this.perception.sees) {
        if (this.shots === 0) telegraphLine(this.scene, this.socket('muzzle_gun'), p, 150, 'hostile0');
        this.shots++;
        const m = this.socket('muzzle_gun');
        fireBullet(this.scene, m.x, m.y, Phaser.Math.Angle.Between(m.x, m.y, p.x, p.y) + (Math.random() - 0.5) * 0.1, 300 * this.tuning.bulletSpeedMult, DAMAGE.burstRound);
        this.rig.fire('gun');
        this.scene.audio.play('drone-shoot');
      }
      if (this.modeT > 1.1) { this.mode = 'hold'; this.modeT = 0; ai?.tokens.release(this); }
    }
    this.aiState = this.mode === 'peek' ? 'ATTACK' : 'HOVER';
  }
}

// ── SPOTTER ─────────────────────────────────────────────────────────────────

/**
 * Tripod sniper. Walks to a spot with a long view, deploys its legs (0.6 s, vulnerable),
 * tracks with a lagging laser sight, fires when it has held steady, then packs up and moves.
 */
export class Spotter extends Walker {
  readonly damageProfile = profile({ chunkTint: pal('hull5') });
  private mode: 'move' | 'deploy' | 'aim' | 'pack' = 'move';
  private goal: Vec | null = null;
  private modeT = 0;
  private steady = 0;
  private laser: Phaser.GameObjects.Graphics;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, SPOTTER, { hp: 3 + tuning.extraHp, radar: 'walker', bodyW: 26, bodyH: 44, sight: 1200, walkSpeed: 80 });
    this.laser = scene.add.graphics().setDepth(13);
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.target;
    const ai = this.scene.ai;
    this.modeT += dt;
    this.laser.clear();
    this.aim.gun = this.aimAngle('muzzle_gun', p);
    if (this.mode === 'move') {
      if (!this.goal) this.goal = ai?.cover.bestPerch(p, this, 620) ?? { x: p.x + (this.x < p.x ? -560 : 560), y: this.y };
      const arrived = this.walkTo(this.goal.x, this.goal.y, 1, time);
      this.faceToward(p.x);
      this.rigExtra.spread = 0;
      if (arrived || this.modeT > 5) { this.mode = 'deploy'; this.modeT = 0; }
    } else if (this.mode === 'deploy') {
      this.halt();
      this.rigExtra.spread = Math.min(1, this.modeT / 0.6);
      this.rigExtra.crouch = 0.5 * this.rigExtra.spread;
      // snipers share the artillery token: only one laser on the player at a time
      if (this.modeT > 0.6 && ai?.tokens.acquire(this, 'artillery', ai.now, 0.6)) { this.mode = 'aim'; this.modeT = 0; this.steady = 0; }
      else if (this.modeT > 6) { this.mode = 'pack'; this.modeT = 0; }
    } else if (this.mode === 'aim') {
      this.faceToward(p.x);
      const tr = this.rig.aimers.get('gun')!;
      const m = this.socket('muzzle_gun');
      const on = this.perception.sees && tr.onTarget(this.aim.gun, 0.06);
      this.steady = on ? this.steady + dt : Math.max(0, this.steady - dt * 2);
      if (this.perception.sees) {
        const blink = this.steady > 0.6 && Math.floor(time / 60) % 2 === 0;
        this.laser.lineStyle(2, pal(blink ? 'cyan3' : 'hostile1'), 0.8);
        this.laser.lineBetween(m.x, m.y, m.x + Math.cos(m.angle) * 1500, m.y + Math.sin(m.angle) * 1500);
      }
      if (this.steady > 0.9 && ai) {
        fireBullet(this.scene, m.x, m.y, m.angle, 640 * this.tuning.bulletSpeedMult, DAMAGE.sniperBullet);
        this.rig.fire('gun', -5);
        this.scene.audio.playAt('drone-shoot', { rate: 0.7, detune: -300, volume: 0.6 });
        ai.tokens.release(this);
        this.mode = 'pack'; this.modeT = 0;
      }
      if (this.modeT > 5) { this.mode = 'pack'; this.modeT = 0; ai?.tokens.release(this); }
    } else {
      this.rigExtra.spread = Math.max(0, 1 - this.modeT / 0.5);
      this.rigExtra.crouch = 0.5 * this.rigExtra.spread;
      if (this.modeT > 0.5) { this.mode = 'move'; this.modeT = 0; this.goal = null; }
    }
    this.aiState = this.mode === 'aim' ? 'ATTACK' : 'HOVER';
  }

  /** Deployed legs are exposed: extra damage while setting up. */
  takeDamage(amount: number): void { super.takeDamage(this.mode === 'deploy' ? amount * 1.5 : amount); }
  destroy(fromScene?: boolean): void { this.laser?.destroy(); super.destroy(fromScene); }
}

// ── RAM ─────────────────────────────────────────────────────────────────────

/**
 * Charging quad. Lowers its head and scrapes the ground (dust) as a warning, then charges
 * in a straight line it cannot steer — jump it. Hitting a wall stuns it with its back
 * exposed (double damage).
 */
export class Ram extends Walker {
  readonly damageProfile = profile({ chunkTint: pal('hull4'), chunkCount: 3 });
  private mode: 'stalk' | 'scrape' | 'charge' | 'stunned' = 'stalk';
  private modeT = 0;
  private dir: 1 | -1 = 1;
  private hitPlayer = false;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, RAM, { hp: 4 + tuning.extraHp, radar: 'walker', bodyW: 50, bodyH: 34, sight: 800, walkSpeed: 90 });
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.player;
    const ai = this.scene.ai;
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.modeT += dt;
    if (this.mode === 'stalk') {
      const side = this.x < p.x ? -1 : 1;
      this.walkTo(p.x + side * 340, p.y, 1, time);
      this.faceToward(p.x);
      this.rigExtra.pitch = 0;
      const level = Math.abs(p.y - this.y) < 60;
      if (this.modeT > 1 && level && this.perception.sees && ai?.tokens.acquire(this, 'melee', ai.now, 0.5)) {
        this.mode = 'scrape'; this.modeT = 0; this.dir = p.x > this.x ? 1 : -1; this.facing = this.dir;
      }
    } else if (this.mode === 'scrape') {
      this.halt();
      this.rigExtra.pitch = 0.25; this.rigExtra.crouch = 0.5;
      if (Math.random() < dt * 12) this.fx.kickDust(this.x - this.dir * 20, this.y, 2, 1);
      if (this.modeT > 0.9) { this.mode = 'charge'; this.modeT = 0; this.hitPlayer = false; this.scene.audio.play('surge'); }
    } else if (this.mode === 'charge') {
      body.setVelocityX(this.dir * 520);
      this.rigExtra.pitch = 0.3; this.rigExtra.crouch = 0.3;
      if (!this.hitPlayer && Math.abs(p.x - this.x) < 50 && Math.abs(p.y - this.y) < 60) {
        this.hitPlayer = true;
        p.takeDamage(DAMAGE.charger, this.x);
      }
      const blocked = this.dir > 0 ? body.blocked.right : body.blocked.left;
      const span = this.span();
      const atEdge = span && (this.dir > 0 ? this.x > (span.c1 + 1) * 32 - 20 : this.x < span.c0 * 32 + 20);
      if (blocked) {
        this.mode = 'stunned'; this.modeT = 0; body.setVelocityX(-this.dir * 80);
        this.scene.cameras.main.shake(120, 0.005); this.fx.spark(this.x + this.dir * 24, this.y - 20, 10, this.dir > 0 ? Math.PI : 0, 1);
        ai?.tokens.release(this);
      } else if (atEdge || this.modeT > 1.6) {
        this.mode = 'stalk'; this.modeT = 0; this.halt(); ai?.tokens.release(this);
      }
    } else {
      this.halt();
      this.rigExtra.pitch = -0.2;
      if (Math.random() < dt * 6) this.fx.spark(this.x, this.y - 30, 2, -Math.PI / 2, 2);
      if (this.modeT > 1.5) { this.mode = 'stalk'; this.modeT = 0; }
    }
    this.aiState = this.mode === 'charge' || this.mode === 'scrape' ? 'ATTACK' : 'HOVER';
  }

  takeDamage(amount: number): void { super.takeDamage(this.mode === 'stunned' ? amount * 2 : amount); }
}

// ── TRAINING TARGET ─────────────────────────────────────────────────────────

/** Surface Ops training dummy: a deployed tripod that sweeps its sensor and never fires. */
export class TrainingTarget extends Walker {
  readonly damageProfile = profile({ chunkTint: pal('cyan1') });
  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, SPOTTER, { hp: 3, radar: 'walker', bodyW: 26, bodyH: 44, sight: 600, walkSpeed: 0 });
  }
  protected think(_dt: number, time: number): void {
    this.halt();
    this.rigExtra.spread = 1; this.rigExtra.crouch = 0.4;
    this.aim.gun = Math.sin(time / 700) * 0.8 - 0.3;
    this.faceToward(this.scene.player.x);
  }
}

// ── STILT ───────────────────────────────────────────────────────────────────

/**
 * Tall stilt-walker. Strides until its gondola is over HARROW and fires down in bursts;
 * standing still under it is a mistake. Its knees are weak points — break either and the
 * whole thing topples.
 */
export class Stilt extends Walker {
  readonly damageProfile = profile({ fromRapid: 0.5, chunkTint: pal('hull3') });
  private knees: HitPart[] = [];
  private nextBurst = 0;
  private toppling = false;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, STILT, { hp: 8 + tuning.extraHp * 2, radar: 'heavy', bodyW: 36, bodyH: 150, sight: 1000, walkSpeed: 75 });
    for (let i = 0; i < 2; i++) {
      this.knees.push(this.addPart(new HitPart(scene, 22, 22, 3, profile({ chunkTint: pal('hull5') }),
        () => { this.rig.flash = 0.04; },
        () => this.topple())));
    }
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.player;
    const ai = this.scene.ai;
    const offset = Math.sin(time / 1300 + this.seed * 6) * 60;
    this.walkTo(p.x + offset, p.y, 1, time);
    this.faceToward(p.x);
    const t = this.target;
    this.aim.gun = this.aimAngle('muzzle_gun', t);
    const over = Math.abs(p.x - this.x) < 220;
    if (over && this.perception.sees && time > this.nextBurst && ai?.tokens.acquire(this, 'ranged', ai.now, 0.7)) {
      this.nextBurst = time + this.tuning.shootInterval + 600;
      telegraphLine(this.scene, this.socket('muzzle_gun'), t, 260, 'hostile0');
      for (let i = 0; i < 4; i++) {
        this.scene.time.delayedCall(260 + i * 120, () => {
          if (!this.active || this.dying) return;
          const m = this.socket('muzzle_gun');
          fireBullet(this.scene, m.x, m.y, Phaser.Math.Angle.Between(m.x, m.y, this.target.x, this.target.y) + (Math.random() - 0.5) * 0.15, 300 * this.tuning.bulletSpeedMult, DAMAGE.strafeRound);
          this.rig.fire('gun');
          if (i === 3) this.scene.ai?.tokens.release(this);
        });
      }
    }
    this.knees.forEach((k, i) => { const s = this.socket(`knee${i}`); k.follow(s.x, s.y); });
    this.aiState = over ? 'ATTACK' : 'HOVER';
    void dt;
  }

  private topple(): void {
    if (this.toppling) return;
    this.toppling = true;
    this.rigExtra.pitch = this.facing * 0.8;
    this.rigExtra.crouch = 1;
    this.scene.cameras.main.shake(300, 0.01);
    this.scene.time.delayedCall(500, () => { if (this.active) { this.hp = 0; this.dieStaged({ booms: 5 }); } });
  }

  die(): void { this.dieStaged({ booms: 5 }); }
}

// ── SCUTTLER ────────────────────────────────────────────────────────────────

const SEG = 7;           // body segments
const SEG_GAP = 9;       // native px between segments

/** Body for a segmented crawler: head + segments following the head's trail. */
class ScuttlerBody implements HostileBody {
  flash = 0; tint = 0; glow = 0; glowColor = 'hostile1' as const;
  readonly placements: Placement[] = [];
  readonly sockets: Record<string, SocketPose> = { core: { x: 0, y: 0, a: 0 } };
  private readonly trail: Vec[] = [];
  segments = SEG;

  update(dt: number, head: Vec, facing: 1 | -1, upsideDown: boolean, time: number): void {
    this.flash = Math.max(0, this.flash - dt);
    const last = this.trail[0];
    if (!last || Math.hypot(head.x - last.x, head.y - last.y) > 1) this.trail.unshift({ ...head });
    if (this.trail.length > 200) this.trail.length = 200;
    const P = RIG_PARTS.foe;
    this.placements.length = 0;
    const flip = upsideDown ? -1 : 1;
    // walk the trail to place segments at fixed spacing (positions relative to the head)
    let need = SEG_GAP * VPX, acc = 0;
    const pts: Vec[] = [];
    for (let i = 1; i < this.trail.length && pts.length < this.segments; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      acc += Math.hypot(b.x - a.x, b.y - a.y);
      if (acc >= need) { pts.push(b); need += SEG_GAP * VPX; }
    }
    while (pts.length < this.segments) pts.push({ x: head.x - facing * (pts.length + 1) * SEG_GAP * VPX, y: head.y });
    for (let i = pts.length - 1; i >= 0; i--) {
      const lx = ((pts[i].x - head.x) / VPX) * facing, ly = (pts[i].y - head.y) / VPX;
      const leg = Math.sin(time * 18 + i) * 0.5;
      this.placements.push({ part: 'scut_leg', spec: P.scut_leg, x: lx, y: ly + 2 * flip, rot: flip * (Math.PI / 2 + leg), variant: 'f' });
      this.placements.push({ part: 'scut_seg', spec: P.scut_seg, x: lx, y: ly, rot: 0, variant: 'n' });
    }
    this.placements.push({ part: 'scut_head', spec: P.scut_head, x: 0, y: 0, rot: upsideDown ? 0.2 : 0, variant: 'n' });
  }
}

/**
 * Segmented crawler. Walks floors and, where there is one, the ceiling; stalks along the
 * ceiling until it is above where HARROW is going, then drops. Each hit sheds a segment.
 */
export class Scuttler extends RiggedHostile {
  readonly damageProfile = profile({ chunkTint: pal('hull3'), chunkCount: 3 });
  readonly rig = new ScuttlerBody();
  private mode: 'ceiling' | 'drop' | 'floor' = 'floor';
  private vy = 0;
  private biteAt = 0;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, { rig: 'foe', bodyW: 26, bodyH: 18, hp: 7, radar: 'walker', gravity: false, originY: 0.5 });
    scene.drones.add(this);
    const ceil = this.ceilingAbove(x, y);
    if (ceil !== null) { this.mode = 'ceiling'; this.y = ceil + 12; }
  }

  private ceilingAbove(x: number, y: number): number | null {
    const t = this.scene.ai?.terrain;
    if (!t) return null;
    for (let yy = y; yy > y - 700; yy -= 16) if (t.solidAt(x, yy)) return Math.ceil(yy / 32) * 32;
    return null;
  }

  protected think(dt: number, time: number): void {
    const p = this.scene.player;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const terrain = this.scene.ai?.terrain;
    this.facing = p.x > this.x ? 1 : -1;
    if (this.mode === 'ceiling') {
      const ceil = this.ceilingAbove(this.x, this.y + 20);
      const lead = predictLanding(p, p.velocity, 600, (x, y) => terrain?.surfaceBelow(x, y) ?? null, { maxTime: 0.6 });
      body.setVelocity(Phaser.Math.Clamp((lead.x - this.x) * 2, -170, 170), 0);
      if (ceil === null) this.mode = 'drop';
      else if (Math.abs(lead.x - this.x) < 30 && p.y > this.y) { this.mode = 'drop'; this.vy = 0; this.scene.audio.playAt('hurt', { rate: 1.8, volume: 0.3 }); }
    } else if (this.mode === 'drop') {
      this.vy += 900 * dt;
      body.setVelocity(0, this.vy);
      const g = terrain?.surfaceBelow(this.x, this.y) ?? this.scene.getApproxGroundY();
      if (this.y >= g - 10) {
        this.y = g - 10; this.mode = 'floor';
        if (Math.abs(p.x - this.x) < 60 && Math.abs(p.y - g) < 40) p.takeDamage(DAMAGE.charger, this.x);
      }
    } else {
      const g = terrain?.surfaceBelow(this.x, this.y - 12) ?? this.y;
      this.y = g - 10;
      body.setVelocity(Phaser.Math.Clamp((p.x - this.x) * 2, -150, 150), 0);
      if (Math.abs(p.x - this.x) < 44 && Math.abs(p.y - g) < 50 && time > this.biteAt) {
        this.biteAt = time + 900;
        p.takeDamage(DAMAGE.swarmling, this.x);
      }
      const ceil = this.ceilingAbove(this.x, this.y - 40);
      if (ceil !== null && ceil > this.y - 400 && Math.abs(p.x - this.x) > 300 && Math.random() < dt * 0.3) {
        this.y = ceil + 12; this.mode = 'ceiling';
        enemyFx(this.scene).kickDust(this.x, g, 6, 1);
      }
    }
    this.aiState = this.mode === 'drop' ? 'ATTACK' : 'HOVER';
  }

  protected animate(dt: number, time: number): void {
    this.rig.update(dt, { x: this.x, y: this.y }, this.facing, this.mode === 'ceiling', time / 1000);
  }

  takeDamage(amount: number): void {
    super.takeDamage(amount);
    if (!this.dying && this.rig.segments > 1) {
      this.rig.segments = Math.max(1, Math.ceil((this.hp / this.maxHp) * SEG));
      enemyFx(this.scene).chips(this.x - this.facing * this.rig.segments * SEG_GAP * VPX, this.y, 3);
    }
  }
}

// ── BURROWER ────────────────────────────────────────────────────────────────

/**
 * Travels under the regolith — only a moving dust mound gives it away — then erupts where
 * HARROW is going, fires a ring of shots, and stays up (vulnerable) before diving again.
 */
export class Burrower extends RiggedHostile {
  readonly damageProfile = profile({ chunkTint: pal('regolith2') });
  readonly rig = new EnemyRig(BURROWER);
  private mode: 'under' | 'erupt' | 'up' | 'dive' = 'under';
  private modeT = 0;
  private emerge = 0;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, { rig: 'foe', bodyW: 32, bodyH: 28, hp: 5 + tuning.extraHp, radar: 'walker', gravity: false, originY: 1 });
    scene.drones.add(this);
  }

  protected think(dt: number, time: number): void {
    const p = this.scene.player;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const terrain = this.scene.ai?.terrain;
    this.modeT += dt;
    const g = terrain?.surfaceBelow(this.x, this.y - 40) ?? this.y;
    if (this.mode === 'under') {
      body.enable = false;
      this.y = g;
      const lead = predictLanding(p, p.velocity, 600, (x, y) => terrain?.surfaceBelow(x, y) ?? null, { maxTime: 0.5 });
      const dx = lead.x - this.x;
      this.x += Phaser.Math.Clamp(dx, -130 * dt, 130 * dt);
      if (Math.random() < dt * 6) enemyFx(this.scene).kickDust(this.x, g, 1, 0.6);
      this.emerge = Math.max(0, this.emerge - dt * 3);
      if (Math.abs(dx) < 24 && this.modeT > 1.2 && Math.abs(p.y - g) < 80) { this.mode = 'erupt'; this.modeT = 0; }
    } else if (this.mode === 'erupt') {
      this.emerge = Math.min(1, this.modeT / 0.25);
      if (this.modeT > 0.25) {
        body.enable = true;
        enemyFx(this.scene).kickDust(this.x, g, 18, 2);
        this.scene.cameras.main.shake(150, 0.006);
        if (Math.abs(p.x - this.x) < 60 && Math.abs(p.y - g) < 60) p.takeDamage(DAMAGE.charger, this.x);
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI + (i / 7) * Math.PI;
          const r = this.socket('ring');
          fireBullet(this.scene, r.x, r.y, a, 220 * this.tuning.bulletSpeedMult, DAMAGE.burstRound);
        }
        this.mode = 'up'; this.modeT = 0;
      }
    } else if (this.mode === 'up') {
      if (this.modeT > 1.8) { this.mode = 'dive'; this.modeT = 0; }
    } else {
      this.emerge = Math.max(0, 1 - this.modeT / 0.3);
      if (this.modeT > 0.3) { this.mode = 'under'; this.modeT = 0; }
    }
    this.facing = p.x > this.x ? 1 : -1;
    this.view.setVisible(this.emerge > 0.02);
    this.aiState = this.mode === 'up' ? 'ATTACK' : 'HOVER';
    void time;
  }

  protected rigOffsetY(): number { return (1 - this.emerge) * 30; }

  protected animate(dt: number, time: number): void {
    this.rig.update({ dt, dx: 0, vx: 0, vy: 0, grounded: true, facing: this.facing, moving: false, time: time / 1000, open: this.mode === 'up' ? 1 : 0 });
  }
}
