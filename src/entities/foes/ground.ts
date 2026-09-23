import Phaser from 'phaser';
import type { GameScene } from '../../scenes/GameScene';
import { Walker, profile, BASE_SCALING, type Scaling } from './base';
import { HitPart } from '../RiggedHostile';
import { BULWARK, LONGLEG, TICK } from '../../rig/bodies/foeSpecs';
import { PPCRound } from '../PPCRound';
import { predictLanding } from '../../ai/Predict';
import type { Vec } from '../../ai/Perception';
import { DAMAGE } from '../../balance/armor';
import { pal } from '../../render/palette';

// ── TICK ────────────────────────────────────────────────────────────────────

export type TickMode = 'burrowed' | 'emerge' | 'hop' | 'arm' | 'boom';

/** Pure decision for a tick mine: when to wake and when to blow (tested). */
export function tickNext(mode: TickMode, distToPlayer: number, sees: boolean, grounded: boolean, armedFor: number): TickMode {
  if (mode === 'burrowed') return sees && distToPlayer < 300 ? 'emerge' : 'burrowed';
  if (mode === 'emerge') return 'hop';
  if (mode === 'hop') return grounded ? (distToPlayer < 110 ? 'arm' : 'hop') : 'hop';
  if (mode === 'arm') return armedFor >= 0.6 ? 'boom' : 'arm';
  return 'boom';
}

/**
 * Crawler mine. Waits burrowed with only its sensor nub showing (dust puffs give it away),
 * unburrows when it senses HARROW, hops toward where HARROW will land, beeps, and blows.
 * It can be shot at any point — mid-hop is the satisfying moment.
 */
export class Tick extends Walker {
  readonly damageProfile = profile({ chunkChance: 0, impactAudio: false, fromRapid: 1, fromTurret: 1, fromMissile: 1 });
  private mode: TickMode = 'burrowed';
  private armedFor = 0;
  private hopAt = 0;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, TICK, { hp: 1, radar: 'mine', bodyW: 22, bodyH: 14, sight: 420, walkSpeed: 60 });
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.player;
    const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
    const prev = this.mode;
    this.mode = tickNext(this.mode, d, this.perception.sees, this.grounded, this.armedFor);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.mode === 'burrowed') {
      this.rigExtra.crouch = 1;
      this.view.container.setAlpha(0.35);
      body.setVelocityX(0);
    } else {
      this.view.container.setAlpha(1);
      this.rigExtra.crouch = 0;
    }
    if (this.mode === 'emerge' && prev === 'burrowed') {
      this.fx.kickDust(this.x, this.y, 8, 1.2);
    }
    if (this.mode === 'hop') {
      this.faceToward(p.x);
      if (this.grounded && time > this.hopAt) {
        this.hopAt = time + 700;
        const land = predictLanding(p, p.velocity, 600, (x, y) => this.scene.ai?.terrain.surfaceBelow(x, y) ?? null, { maxTime: 0.7 });
        const dx = Phaser.Math.Clamp(land.x - this.x, -260, 260);
        body.setVelocity(dx * 1.5, -300);
        this.scene.audio.playAt('jump', { rate: 2, volume: 0.3 });
      }
    }
    if (this.mode === 'arm') {
      body.setVelocityX(0);
      this.armedFor += dt;
      this.rig.glow = Math.floor(this.armedFor * 10) % 2 ? 0.05 : 0;
      this.rig.glowColor = 'hostile1';
      if (Math.floor(this.armedFor * 10) !== Math.floor((this.armedFor - dt) * 10)) this.scene.audio.playAt('ui-nav', { rate: 1.6, volume: 0.35 });
    }
    if (this.mode === 'boom') this.detonate();
    this.aiState = this.mode === 'burrowed' ? 'HOVER' : 'ATTACK';
  }

  takeDamage(amount: number): void {
    if (this.dying) return;
    super.takeDamage(amount);
  }

  private detonate(): void {
    if (this.dying) return;
    const p = this.player;
    if (Phaser.Math.Distance.Between(this.x, this.y - 10, p.x, p.y - 40) < 95) p.takeDamage(DAMAGE.mine, this.x);
    this.die();
  }
}

// ── LONGLEG ─────────────────────────────────────────────────────────────────

/**
 * Hexapod artillery spider. Walks to a perch with a view of HARROW, braces (legs spread,
 * hull drops), charges its coil with a visible beam and heat shimmer, fires a PPC round,
 * then relocates — the walk between perches is the window to punish it.
 */
export class Longleg extends Walker {
  readonly damageProfile = profile({ fromRapid: 0.5, chunkTint: pal('hull3') });
  private mode: 'relocate' | 'brace' | 'charge' | 'cool' = 'relocate';
  private goal: Vec | null = null;
  private modeT = 0;
  private beam?: Phaser.GameObjects.Graphics;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, LONGLEG, { hp: 10 + tuning.extraHp * 2, radar: 'heavy', bodyW: 56, bodyH: 44, sight: 1000, walkSpeed: 70 });
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.target;
    const ai = this.scene.ai;
    this.modeT += dt;
    this.aim.gun = this.aimAngle('muzzle_gun', p);
    if (this.mode === 'relocate') {
      if (!this.goal) {
        const perch = ai?.cover.bestPerch(p, this, 560);
        const side = this.x < p.x ? -1 : 1;
        this.goal = perch ?? { x: p.x + side * (480 + Math.random() * 180), y: this.y };
      }
      const arrived = this.walkTo(this.goal.x, this.goal.y, 1, time);
      this.faceToward(p.x);
      if (arrived || this.modeT > 5) { this.mode = 'brace'; this.modeT = 0; }
    } else if (this.mode === 'brace') {
      this.halt();
      this.rigExtra.crouch = 0.8; this.rigExtra.spread = 1;
      if (this.modeT > 0.5 && this.perception.sees && ai?.tokens.acquire(this, 'artillery', ai.now)) { this.mode = 'charge'; this.modeT = 0; }
      if (this.modeT > 3) { this.mode = 'relocate'; this.modeT = 0; this.goal = null; }
    } else if (this.mode === 'charge') {
      const m = this.socket('muzzle_gun');
      this.beam?.destroy();
      this.beam = this.scene.add.graphics().setDepth(13);
      const blink = Math.floor(this.modeT * 12) % 2 === 0;
      this.beam.lineStyle(2, pal(blink ? 'hostile1' : 'amber1'), 0.8);
      this.beam.lineBetween(m.x, m.y, m.x + Math.cos(m.angle) * 1600, m.y + Math.sin(m.angle) * 1600);
      const coil = this.socket('coil');
      if (Math.random() < dt * 20) this.fx.spark(coil.x, coil.y, 1, -Math.PI / 2, 2);
      if (this.modeT > 1.1) {
        this.beam.destroy(); this.beam = undefined;
        const round = new PPCRound(this.scene, m.x, m.y, m.angle, 150 * this.tuning.bulletSpeedMult, 6000);
        this.scene.ppcRounds.add(round);
        this.rig.fire('gun', -6);
        this.scene.audio.playAt('explosion', { rate: 0.95, detune: 150, volume: 0.5 });
        this.scene.cameras.main.shake(110, 0.005);
        ai?.tokens.release(this);
        this.mode = 'cool'; this.modeT = 0;
      }
    } else {
      this.rigExtra.crouch = 0.3; this.rigExtra.spread = 0.5;
      if (this.modeT > 0.8) { this.mode = 'relocate'; this.modeT = 0; this.goal = null; this.rigExtra.crouch = 0; this.rigExtra.spread = 0; }
    }
    this.aiState = this.mode === 'charge' ? 'ATTACK' : 'HOVER';
  }

  die(): void { this.beam?.destroy(); this.dieStaged({ booms: 4 }); }
  destroy(fromScene?: boolean): void { this.beam?.destroy(); super.destroy(fromScene); }
}

// ── BULWARK ─────────────────────────────────────────────────────────────────

/**
 * Walker tank with a frontal shield slab. Advances cover to cover, then braces — shield
 * slammed down, legs planted — to lob telegraphed mortar shells. The shield blocks fire
 * from the front and can be shot off; flanking with a surge dash hits the hull directly.
 */
export class Bulwark extends Walker {
  readonly damageProfile = profile({ chunkTint: pal('hull4'), chunkCount: 3 });
  private shield: HitPart;
  private mode: 'advance' | 'brace' | 'fire' = 'advance';
  private goal: Vec | null = null;
  private modeT = 0;
  private reticle?: Phaser.GameObjects.Graphics;
  private markX = 0;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, BULWARK, { hp: 5 + tuning.extraHp * 2, radar: 'heavy', bodyW: 50, bodyH: 60, sight: 900, walkSpeed: 60 });
    this.shield = this.addPart(new HitPart(scene, 18, 52, 3, profile({ fromRapid: 0.34, chunkTint: pal('hull5') }),
      () => { this.rig.flash = 0.04; this.fx.spark(this.shield.x, this.shield.y, 3); },
      () => {
        this.broken.add('shield');
        this.scene.spawnExplosion(this.shield.x, this.shield.y);
        this.fx.chips(this.shield.x, this.shield.y, 8);
        this.scene.cameras.main.shake(160, 0.006);
      }));
  }

  get shielded(): boolean { return !this.broken.has('shield'); }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.player;
    const ai = this.scene.ai;
    this.modeT += dt;
    if (this.mode === 'advance') {
      if (!this.goal || this.modeT > 4) {
        const c = ai?.cover.bestCover(p, this, 700, 260);
        this.goal = c ?? { x: p.x + (this.x < p.x ? -420 : 420), y: this.y };
        this.modeT = 0;
      }
      const arrived = this.walkTo(this.goal.x, this.goal.y, 1, time);
      this.faceToward(p.x);
      this.rigExtra.open = 0;
      if (arrived && this.perception.sees) { this.mode = 'brace'; this.modeT = 0; }
    } else if (this.mode === 'brace') {
      this.halt();
      this.faceToward(p.x);
      this.rigExtra.open = Math.min(1, this.modeT * 4);
      this.rigExtra.crouch = 0.6;
      if (this.modeT > 0.4 && ai?.tokens.acquire(this, 'artillery', ai.now, 0.5)) {
        this.mode = 'fire'; this.modeT = 0;
        this.markX = p.x;
        this.reticle = this.scene.add.graphics().setDepth(13);
      } else if (this.modeT > 2.5) { this.mode = 'advance'; this.goal = null; this.rigExtra.crouch = 0; }
    } else {
      // the reticle tracks HARROW, then locks and the shell is lobbed at the lock
      if (this.modeT < 1.2) this.markX += (p.x - this.markX) * Math.min(1, dt * 3);
      const gy = this.scene.ai?.terrain.surfaceBelow(this.markX, p.y - 40) ?? p.y;
      this.reticle?.clear().lineStyle(2, pal(this.modeT < 1.2 ? 'hostile1' : 'amber1'), 0.9).strokeCircle(this.markX, gy - 10, 34);
      this.aim.gun = -1.1;
      if (this.modeT > 1.6) {
        this.reticle?.destroy(); this.reticle = undefined;
        this.lobShell(this.markX, gy);
        ai?.tokens.release(this);
        this.mode = 'advance'; this.modeT = 0; this.goal = null; this.rigExtra.crouch = 0;
      }
    }
    this.shield.follow(this.socket('extra_shield').x + this.facing * 4, this.y - 32);
    this.aiState = this.mode === 'fire' ? 'ATTACK' : 'HOVER';
  }

  private lobShell(tx: number, ty: number): void {
    const m = this.socket('muzzle_gun');
    const shell = this.scene.add.image(m.x, m.y, 'bullet-drone').setScale(2).setTint(pal('amber1')).setDepth(14);
    this.rig.fire('gun', -5);
    this.scene.audio.play('turret');
    const flight = 1100;
    this.scene.tweens.add({ targets: shell, x: tx, duration: flight, ease: 'Linear' });
    this.scene.tweens.add({ targets: shell, y: Math.min(m.y, ty) - 240, duration: flight / 2, ease: 'Quad.Out', yoyo: false,
      onComplete: () => this.scene.tweens.add({ targets: shell, y: ty - 8, duration: flight / 2, ease: 'Quad.In',
        onComplete: () => {
          shell.destroy();
          this.scene.spawnExplosion(tx, ty - 10);
          const p = this.scene.player;
          if (Math.abs(p.x - tx) < 80 && Math.abs(p.y - ty) < 70) p.takeDamage(DAMAGE.tankShell, tx);
        } }) });
  }

  die(): void { this.reticle?.destroy(); this.dieStaged({ booms: 4 }); }
  destroy(fromScene?: boolean): void { this.reticle?.destroy(); super.destroy(fromScene); }
}

