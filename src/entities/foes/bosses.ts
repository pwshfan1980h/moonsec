import { icon as uiIcon } from '../../ui/kit/draw';
import type { IconName } from '../../ui/icons';
import { tc, type Role } from '../../ui/theme';
import Phaser from 'phaser';
import type { GameScene } from '../../scenes/GameScene';
import { Flyer, Walker, fireBullet, profile, BASE_SCALING, type Scaling } from './base';
import { HitPart } from '../RiggedHostile';
import { Wasp, type Squad } from './flyers';
import { NEXUS, WARDEN } from '../../rig/bodies/foeSpecs';
import { leadTarget } from '../../ai/Predict';
import { DAMAGE } from '../../balance/armor';
import { pal, type PaletteName } from '../../render/palette';
import type { RigViewEffects } from '../../rig/view/RigView';
import { SURFACE_BOSS_X, wardenDamage } from '../../data/surfaceMission';

// ── WARDEN ──────────────────────────────────────────────────────────────────

export type WardenPhase = 'shielded' | 'warning' | 'exposed' | 'dead';
export type WardenAttack = 'sweep' | 'column';

/**
 * The Warden's attack rhythm, pure so it can be tested: shield up → telegraph → strike →
 * core exposed → repeat. Attacks alternate sweep/column while the dish stands; once the
 * dish is destroyed only sweeps remain. Losing arms lengthens the exposure window.
 */
export class WardenCycle {
  phase: WardenPhase = 'shielded';
  timer = 2;
  cycle = 0;
  attack: WardenAttack = 'sweep';

  constructor(public dishAlive = true, public armsAlive = 2) {}

  /** Advances time; returns the strike when a telegraph completes (else null). */
  update(dt: number, hpRatio: number): WardenAttack | null {
    if (this.phase === 'dead') return null;
    this.timer -= dt;
    if (this.timer > 0) return null;
    if (this.phase === 'shielded') {
      this.phase = 'warning';
      this.attack = this.dishAlive && this.cycle % 2 === 1 ? 'column' : 'sweep';
      this.timer = 1.7;
      return null;
    }
    if (this.phase === 'warning') {
      this.phase = 'exposed';
      this.timer = (hpRatio <= 0.5 ? 3.2 : 4.2) + (2 - this.armsAlive) * 0.8;
      return this.attack;
    }
    this.phase = 'shielded';
    this.cycle++;
    this.timer = 1.8;
    return null;
  }
}

/**
 * Surface Ops boss: a four-legged fortress. Its two sweep arms each cover half of the
 * ground sweep (break one and that half is safe); its uplink dish calls the orbital
 * column (break it and the columns stop). The core only takes damage while exposed.
 * Between strikes it walks the arena to keep its distance.
 */
export class Warden extends Walker {
  readonly damageProfile = profile({ fromRapid: 0.5, chunkTint: pal('hull4'), chunkCount: 4 });
  readonly cycle = new WardenCycle();
  private arms: HitPart[] = [];
  private dish: HitPart;
  private g: Phaser.GameObjects.Graphics;
  private status: Phaser.GameObjects.Image;
  private strikeX = SURFACE_BOSS_X;
  private shieldNoticeAt = 0;

  constructor(scene: GameScene) {
    const floor = scene.getApproxGroundY();
    super(scene, SURFACE_BOSS_X, floor - 2, WARDEN, { hp: 20, radar: 'boss', bodyW: 100, bodyH: 110, sight: 2000, walkSpeed: 50 });
    const armProfile = profile({ fromRapid: 0.5, chunkTint: pal('hostile0') });
    for (const id of ['armN', 'armF']) {
      this.arms.push(this.addPart(new HitPart(scene, 50, 22, 6, armProfile,
        () => { this.rig.flash = 0.04; },
        () => {
          this.broken.add(id);
          this.cycle.armsAlive--;
          const s = this.socket(`muzzle_${id}`);
          this.scene.spawnExplosion(s.x, s.y);
          this.fx.chips(s.x, s.y, 8);
          this.announce(`ARM DOWN · ${this.cycle.armsAlive} LEFT`);
        })));
    }
    this.dish = this.addPart(new HitPart(scene, 36, 22, 5, armProfile,
      () => { this.rig.flash = 0.04; },
      () => {
        this.broken.add('dish');
        this.cycle.dishAlive = false;
        const s = this.socket('extra_dish');
        this.scene.spawnExplosion(s.x, s.y);
        this.announce('UPLINK DISH DOWN · NO MORE ORBITAL STRIKES');
      }));
    this.g = scene.add.graphics().setDepth(10);
    this.status = uiIcon(scene, this.x, this.y + 40, 'armor', 4, 'accent').setDepth(12);
    this.announce('SHIELD ONLINE · WATCH THE GROUND');
  }

  get phase(): WardenPhase { return this.cycle.phase; }
  get isBoss(): boolean { return true; }

  private announce(hint: string): void {
    this.scene.events.emit('surfaceBossStatus', this.hp, this.maxHp, hint, this.cycle.phase === 'exposed');
    const c = this.cycle;
    // an icon over the Warden says what to do: shoot the core, jump the sweep, dash clear
    const [glyph, role]: [IconName, Role] = c.phase === 'exposed' ? ['target', 'warn']
      : c.phase === 'warning' ? (c.attack === 'sweep' ? ['arrowU', 'danger'] : ['surge', 'danger'])
      : ['armor', 'accent'];
    this.status.setFrame(glyph).setTint(tc(role));
  }

  protected think(dt: number, time: number): void {
    const p = this.player;
    const floor = this.scene.getApproxGroundY();
    const c = this.cycle;
    const prev = c.phase;
    const strike = c.update(dt, this.hp / this.maxHp);
    this.faceToward(p.x);
    // walk between phases to keep a firing distance
    if (c.phase === 'shielded') {
      const want = Phaser.Math.Clamp(p.x + (this.x < p.x ? -520 : 520), 5150, 6250);
      this.walkTo(want, this.y, 1, time);
    } else this.halt();
    this.aim.armN = this.aimAngle('muzzle_armN', { x: p.x, y: floor - 30 });
    this.aim.armF = this.aimAngle('muzzle_armF', { x: p.x, y: floor - 30 });
    this.rigExtra.open = c.phase === 'exposed' ? 1 : 0;
    this.rigExtra.crouch = c.phase === 'warning' ? 0.4 : 0;

    const g = this.g.clear();
    if (prev !== c.phase) {
      if (c.phase === 'warning') {
        this.strikeX = Phaser.Math.Clamp(p.x, 5070, 6300);
        this.announce(c.attack === 'sweep' ? 'GROUND SWEEP · JUMP / SPACE' : 'ORBITAL STRIKE · DASH / SHIFT');
        this.scene.audio.playAt('ui-nav', { rate: 0.6, volume: 0.6 });
      } else if (c.phase === 'exposed') this.announce('CORE EXPOSED · FIRE NOW');
      else if (c.phase === 'shielded') this.announce('SHIELD ONLINE · REPOSITION');
    }
    if (c.phase === 'warning') {
      const k = 1 - Math.max(0, c.timer) / 1.7;
      g.fillStyle(pal('hostile0'), 0.15 + k * 0.3);
      g.lineStyle(4, pal(Math.floor(time / 120) % 2 ? 'amber1' : 'hostile1'), 1);
      if (c.attack === 'sweep') {
        for (const zone of this.sweepZones()) {
          g.fillRect(zone[0], floor - 58, zone[1] - zone[0], 58);
          g.strokeRect(zone[0], floor - 58, zone[1] - zone[0], 58);
        }
      } else {
        g.fillRect(this.strikeX - 125, 220, 250, floor - 220);
        g.strokeRect(this.strikeX - 125, 220, 250, floor - 220);
        const dish = this.socket('extra_dish');
        this.scene.air?.heat(dish.x, dish.y - 10, 1.5);
      }
    }
    if (strike) {
      const hit = strike === 'sweep'
        ? this.sweepZones().some(([a, b]) => p.x >= a && p.x <= b) && p.y > floor - 58
        : Math.abs(p.x - this.strikeX) < 125;
      if (hit) p.takeDamage(DAMAGE.wardenSweep, this.x);
      this.scene.spawnExplosion(strike === 'sweep' ? p.x : this.strikeX, floor - 30);
      this.scene.air?.explosion(strike === 'sweep' ? p.x : this.strikeX, floor - 30, true);
      this.scene.audio.play('explosion');
      for (const id of ['armN', 'armF']) if (!this.broken.has(id)) this.rig.fire(id, -6);
    }
    if (c.phase === 'exposed') {
      const core = this.socket('core');
      this.scene.air?.heat(core.x, core.y, 0.8);
    }
    this.arms.forEach((arm, i) => { const s = this.socket(i === 0 ? 'muzzle_armN' : 'muzzle_armF'); arm.follow(s.x - 20 * Math.cos(s.angle), s.y - 20 * Math.sin(s.angle)); });
    const d = this.socket('extra_dish');
    this.dish.follow(d.x, d.y - 10);
    this.status.setPosition(this.x, this.y + 40);
    this.aiState = c.phase === 'warning' ? 'ATTACK' : 'HOVER';
  }

  /** Each surviving arm sweeps its half of the arena. */
  private sweepZones(): [number, number][] {
    const zones: [number, number][] = [];
    const front = this.facing > 0 ? [this.x, 6380] : [5000, this.x];
    const back = this.facing > 0 ? [5000, this.x] : [this.x, 6380];
    if (!this.broken.has('armN')) zones.push(front as [number, number]);
    if (!this.broken.has('armF')) zones.push(back as [number, number]);
    return zones;
  }

  takeDamage(amount: number): void {
    if (this.dying) return;
    const dmg = wardenDamage(amount, this.cycle.phase === 'exposed');
    if (!dmg) {
      if (this.scene.time.now > this.shieldNoticeAt) {
        this.shieldNoticeAt = this.scene.time.now + 900;
        this.scene.spawnFloatingText(this.x, this.y - 180, '', 'accent', { icon: 'armor' });
      }
      return;
    }
    super.takeDamage(dmg);
    if (!this.dying) this.announce('CORE EXPOSED · FIRE NOW');
  }

  die(): void {
    this.cycle.phase = 'dead';
    this.g.clear();
    this.status.setFrame('check').setTint(tc('repair'));
    this.scene.events.emit('surfaceBossStatus', 0, this.maxHp, 'WARDEN DISABLED', false);
    this.dieStaged({ booms: 7, event: 'bossKilled', spacingMs: 300 });
  }

  destroy(fromScene?: boolean): void { this.g?.destroy(); this.status?.destroy(); super.destroy(fromScene); }
}

// ── NEXUS ───────────────────────────────────────────────────────────────────

export type BossType = 'nexus-red' | 'nexus-blue' | 'nexus-violet' | 'nexus-cyan' | 'nexus-core';

export interface BossVariantConfig { tint: PaletteName | null; lifeHp: number; lives: number; escorts: number }

export const BOSS_VARIANTS: Record<BossType, BossVariantConfig> = {
  'nexus-red': { tint: null, lifeHp: 6, lives: 3, escorts: 2 },
  'nexus-blue': { tint: 'cold2', lifeHp: 6, lives: 3, escorts: 2 },
  'nexus-violet': { tint: 'regolith2', lifeHp: 8, lives: 3, escorts: 2 },
  'nexus-cyan': { tint: 'hull5', lifeHp: 8, lives: 3, escorts: 3 },
  'nexus-core': { tint: 'hostile1', lifeHp: 10, lives: 4, escorts: 3 },
};

const TELEGRAPH_MS = 4050;

/**
 * Four-pod flyer with a turret head. Repositions to firing spots through the flight graph,
 * fires a leading triple shot, and every third cycle locks a half-screen blast. Each
 * thruster pod is a separate target: losing pods makes it list and slow, and below two
 * pods it switches to a faster, angrier pattern. WASP squads escort it.
 */
export class Nexus extends Flyer {
  readonly damageProfile = profile({ fromRapid: 0.33, chunkTint: pal('hostile0'), chunkChance: 0.7, chunkCount: 4 });
  private lifeHp: number;
  private lives: number;
  private mode: 'reposition' | 'charge' | 'telegraph' | 'hurt' = 'reposition';
  private modeT = 0;
  private cycleN = 0;
  private spot: { x: number; y: number } | null = null;
  private pods: HitPart[] = [];
  private podsAlive = 4;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private blastRect: Phaser.Geom.Rectangle | null = null;
  private squad: Squad = { members: [] };
  private escortAt = 0;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING, private readonly variant: BossVariantConfig = BOSS_VARIANTS['nexus-red']) {
    super(scene, x, y, NEXUS, { hp: variant.lifeHp * variant.lives, radar: 'boss', bodyW: 84, bodyH: 44, sight: 2000 });
    this.lifeHp = variant.lifeHp;
    this.lives = variant.lives;
    this.maxAccel = 260;
    const podProfile = profile({ fromRapid: 0.5, chunkTint: pal('hull3') });
    for (let i = 0; i < 4; i++) {
      this.pods.push(this.addPart(new HitPart(scene, 24, 16, 4, podProfile,
        () => { this.rig.flash = 0.04; },
        () => {
          this.podsAlive--;
          const s = this.pods[i];
          this.scene.spawnExplosion(s.x, s.y);
          this.fx.chips(s.x, s.y, 6);
          this.scene.cameras.main.shake(200, 0.008);
        })));
    }
  }

  get isBoss(): boolean { return true; }
  private get desperate(): boolean { return this.podsAlive <= 1; }

  protected viewFx(): RigViewEffects { return this.variant.tint ? { baseTint: this.variant.tint } : {}; }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.target;
    this.modeT += dt;
    this.faceToward(p.x);
    this.aim.head = this.aimAngle('muzzle_head', p);
    const speed = 150 * (0.4 + 0.15 * this.podsAlive);
    this.rigExtra.pitch = (4 - this.podsAlive) * 0.08 * Math.sin(time / 400);
    if (this.mode === 'reposition') {
      if (!this.spot || this.modeT > 2.6) {
        const nav = this.scene.flightNavigation;
        this.spot = nav?.firingPosition(this, p, 380, 60, 36) ?? { x: p.x + 380, y: p.y - 260 };
        this.modeT = 0;
      }
      this.flyTo(this.spot, speed, dt, time);
      if (this.modeT > (this.desperate ? 1.2 : 2.2)) { this.mode = 'charge'; this.modeT = 0; this.cycleN++; this.scene.audio.playAt('hurt', { rate: 0.5, detune: -200, volume: 0.5 }); }
    } else if (this.mode === 'charge') {
      this.drive(0, 0, dt);
      const core = this.socket('core');
      this.scene.air?.heat(core.x, core.y, 1.2);
      if (this.modeT > (this.desperate ? 0.9 : 1.6)) {
        if (this.cycleN % 3 === 1) this.startTelegraph();
        else { this.tripleShot(); this.mode = 'reposition'; this.modeT = 0; }
      }
    } else if (this.mode === 'telegraph') {
      this.drive(0, 0, dt);
      if (this.modeT * 1000 >= TELEGRAPH_MS) this.blast();
    } else if (this.modeT > 0.6) { this.mode = 'reposition'; this.modeT = 0; }

    // pods follow their sockets
    for (let i = 0; i < 4; i++) {
      const s = this.rig.sockets[`nozzle${i}`];
      if (s) this.pods[i].follow(this.x + s.x * this.facing * 2, this.y + s.y * 2 - 8);
    }
    // escorts: a WASP squad, replenished
    this.squad.members = this.squad.members.filter((m) => m.active);
    if (this.squad.members.length < this.variant.escorts && time > this.escortAt) {
      this.escortAt = time + 20000;
      for (let i = this.squad.members.length; i < this.variant.escorts; i++) {
        const nav = this.scene.flightNavigation;
        const pos = nav?.nearestOpen({ x: this.x + (i - 1) * 140, y: this.y - 60 }) ?? { x: this.x, y: this.y };
        const w = new Wasp(this.scene, pos.x, pos.y, this.tuning, this.squad);
        this.scene.hostileCombat.register(w);
      }
    }
    this.aiState = this.mode === 'reposition' ? 'HOVER' : 'ATTACK';
  }

  private tripleShot(): void {
    const m = this.socket('muzzle_head');
    const aim = leadTarget(m, this.target, this.player.velocity, 204);
    const base = Phaser.Math.Angle.Between(m.x, m.y, aim.x, aim.y);
    const spread = this.desperate ? [-24, -12, 0, 12, 24] : [-12, 0, 12];
    for (const deg of spread) fireBullet(this.scene, m.x, m.y, base + Phaser.Math.DegToRad(deg), 204, DAMAGE.bossProjectile);
    this.rig.fire('head', -6);
    this.scene.audio.playAt('drone-shoot', { rate: 0.65, detune: -300, volume: 0.55 });
    this.scene.cameras.main.shake(80, 0.005);
  }

  private startTelegraph(): void {
    this.mode = 'telegraph'; this.modeT = 0;
    const view = this.scene.cameras.main.worldView;
    const side = this.player.x < view.centerX ? 'left' : 'right';
    const w = view.width * 0.45;
    const x = side === 'left' ? view.x : view.right - w;
    this.blastRect = new Phaser.Geom.Rectangle(x, view.y, w, view.height);
    this.overlay = this.scene.add.rectangle(x + w / 2, view.y + view.height / 2, w, view.height, pal('hostile0'), 0.28).setDepth(55);
    this.scene.tweens.add({ targets: this.overlay, alpha: { from: 0.12, to: 0.38 }, duration: 350, yoyo: true, repeat: -1 });
    this.scene.events.emit('bossTelegraph', { side, duration: TELEGRAPH_MS });
  }

  private blast(): void {
    const rect = this.blastRect;
    if (rect && this.player.x >= rect.x && this.player.x <= rect.right) this.player.takeDamage(DAMAGE.nexusBlast, this.x);
    const ov = this.overlay;
    if (ov) {
      this.scene.tweens.killTweensOf(ov);
      ov.setFillStyle(pal('hostile1'), 0.85);
      this.scene.tweens.add({ targets: ov, alpha: 0, duration: 700, onComplete: () => ov.destroy() });
    }
    this.overlay = null; this.blastRect = null;
    this.scene.events.emit('bossBlastFired', { side: rect && rect.x < this.scene.cameras.main.worldView.centerX ? 'left' : 'right' });
    this.scene.audio.playAt('explosion', { rate: 0.35, detune: -700, volume: 1.0 });
    this.scene.cameras.main.shake(400, 0.02);
    this.mode = 'reposition'; this.modeT = 0;
  }

  takeDamage(amount: number): void {
    if (this.dying || this.mode === 'hurt') return;
    this.lifeHp -= amount;
    this.rig.flash = 0.06;
    this.hp = Math.max(0, (this.lives - 1) * this.variant.lifeHp + this.lifeHp);
    if (this.lifeHp > 0) return;
    this.lives--;
    if (this.lives <= 0) { this.die(); return; }
    this.lifeHp = this.variant.lifeHp;
    if (this.mode !== 'telegraph') { this.mode = 'hurt'; this.modeT = 0; this.rig.tint = 0.6; }
    this.scene.audio.playAt('hurt', { rate: 0.6, detune: -400, volume: 0.85 });
  }

  die(): void {
    if (this.overlay) { this.scene.tweens.killTweensOf(this.overlay); this.overlay.destroy(); this.overlay = null; }
    this.dieStaged({ booms: 8, event: 'bossKilled', spacingMs: 240 });
  }

  destroy(fromScene?: boolean): void { this.overlay?.destroy(); super.destroy(fromScene); }
}
