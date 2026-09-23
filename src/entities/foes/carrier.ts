import Phaser from 'phaser';
import type { GameScene } from '../../scenes/GameScene';
import { Flyer, profile, BASE_SCALING, type Scaling } from './base';
import { HitPart } from '../RiggedHostile';
import { BROODMOTHER, MANTA, MITE } from '../../rig/bodies/foeSpecs';
import { flock, seek } from '../../ai/Steering';
import { predictLanding } from '../../ai/Predict';
import type { Vec } from '../../ai/Perception';
import { DAMAGE } from '../../balance/armor';
import { pal } from '../../render/palette';

// ── BROODMOTHER ─────────────────────────────────────────────────────────────

/**
 * Heavy carrier. Holds a standoff distance (preferring terrain between it and HARROW),
 * opens its belly hangar to launch mites, and recalls them to repair when damaged.
 * The hangar door is a destructible part: break it and no more mites come out.
 */
export class Broodmother extends Flyer {
  readonly damageProfile = profile({ fromRapid: 0.5, chunkTint: pal('hull3'), chunkCount: 3 });
  readonly brood: Mite[] = [];
  private door: HitPart;
  private doorOpen = 0;
  private mode: 'standoff' | 'launch' | 'recall' = 'standoff';
  private modeUntil = 0;
  private spot: Vec | null = null;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, BROODMOTHER, { hp: 12 + tuning.extraHp * 2, radar: 'heavy', bodyW: 88, bodyH: 34, sight: 1200 });
    this.maxAccel = 220;
    this.door = this.addPart(new HitPart(scene, 32, 12, 4, profile({ fromRapid: 0.5, chunkTint: pal('amber0') }),
      () => { this.rig.flash = 0.05; },
      () => {
        this.broken.add('door');
        const s = this.socket('extra_door');
        this.scene.spawnExplosion(s.x, s.y);
        this.fx.chips(s.x, s.y, 6);
      }));
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const p = this.target;
    const ai = this.scene.ai;
    const liveBrood = this.brood.filter((m) => m.active && !m.isDying);
    if (this.mode === 'standoff') {
      if (!this.spot || time > this.modeUntil) {
        const nav = this.scene.flightNavigation;
        const side = this.x < p.x ? -1 : 1;
        const cand = { x: p.x + side * 780, y: p.y - 300 };
        this.spot = nav?.nearestOpen(cand, 48, 24) ?? cand;
        this.modeUntil = time + 3500;
      }
      this.flyTo(this.spot, 110, dt, time);
      this.faceToward(p.x);
      const hurt = this.hp < this.maxHp * 0.5;
      if (hurt && liveBrood.length > 0) { this.mode = 'recall'; this.modeUntil = time + 3000; }
      else if (!this.broken.has('door') && liveBrood.length < 6 && this.perception.aware && time > this.modeUntil - 1500) {
        this.mode = 'launch'; this.modeUntil = time + 1600;
      }
    } else if (this.mode === 'launch') {
      this.drive(0, Math.sin(time / 300) * 8, dt);
      this.doorOpen = Math.min(1, this.doorOpen + dt * 2.5);
      if (this.doorOpen >= 1 && liveBrood.length < 6 && Math.random() < dt * 5 && !this.broken.has('door')) {
        const bay = this.socket('bay');
        const role: Mite['role'] = liveBrood.filter((m) => m.role === 'screen').length < 2 ? 'screen' : 'bite';
        const mite = new Mite(this.scene, bay.x, bay.y + 10, this, role);
        this.brood.push(mite);
        this.scene.hostileCombat.register(mite);
        this.scene.events.emit('hostileSpawned');
      }
      if (time > this.modeUntil || this.broken.has('door')) { this.mode = 'standoff'; this.modeUntil = time + 5000; }
    } else {
      this.drive(0, 0, dt);
      this.doorOpen = Math.min(1, this.doorOpen + dt * 2);
      if (time > this.modeUntil || liveBrood.every((m) => m.docked)) { this.mode = 'standoff'; this.modeUntil = time + 4000; }
    }
    if (this.mode !== 'launch' && this.mode !== 'recall') this.doorOpen = Math.max(0, this.doorOpen - dt * 1.5);
    this.rigExtra.open = this.doorOpen;
    const door = this.socket('extra_door');
    this.door.follow(door.x + this.facing * 12, door.y + 4);
    void ai;
    this.aiState = this.mode === 'launch' ? 'ATTACK' : 'HOVER';
  }

  get recalling(): boolean { return this.mode === 'recall'; }

  /** A docked mite patches the hull. */
  repair(amount: number): void { this.hp = Math.min(this.maxHp, this.hp + amount); this.rig.glow = 0.2; this.rig.glowColor = 'green1'; }

  die(): void {
    if (this.dying) return;
    for (const m of this.brood) if (m.active) m.orphan();
    this.dieStaged({ booms: 5 });
  }
}

// ── MITE ────────────────────────────────────────────────────────────────────

/**
 * Tiny swarm drone. Screeners hold a wall between their mother and HARROW; biters dive
 * in and latch onto the hull, chewing armor until a surge dash or jet burst throws them
 * off. When the mother recalls, they dock and patch her up.
 */
export class Mite extends Flyer {
  readonly damageProfile = profile({ chunkChance: 0, showDamageText: false, impactAudio: false });
  latched = false;
  docked = false;
  private latchOffset = { x: 0, y: 0 };
  private chewAt = 0;
  private orphaned = false;

  constructor(scene: GameScene, x: number, y: number, private readonly mother: Broodmother, public role: 'screen' | 'bite') {
    super(scene, x, y, MITE, { hp: 1, radar: 'swarm', bodyW: 14, bodyH: 10 });
    this.maxAccel = 1100;
  }

  get isDying(): boolean { return this.dying; }
  orphan(): void { this.orphaned = true; this.role = 'bite'; this.docked = false; }

  protected think(dt: number, time: number): void {
    const p = this.target;
    const player = this.scene.player;
    if (this.latched) {
      // riding the hull; thrown off by a surge or the jets' blast
      if (player.surging || player.jetting || player.isDead) {
        this.latched = false;
        this.drive((Math.random() - 0.5) * 600, -300, dt);
        this.takeDamage(player.surging ? 1 : 0);
        return;
      }
      this.setPosition(player.x + this.latchOffset.x * player.facing, player.y + this.latchOffset.y);
      this.velX = 0; this.velY = 0;
      if (time > this.chewAt) {
        this.chewAt = time + 1000;
        player.takeDamage(DAMAGE.swarmling / 2, this.x);
        this.fx.spark(this.x, this.y, 3);
      }
      return;
    }
    const mother = this.mother;
    const motherAlive = mother.active && !this.orphaned;
    if (motherAlive && mother.recalling) {
      const bay = mother.socket('bay');
      this.flyTo(bay, 320, dt, time);
      if (Phaser.Math.Distance.Between(this.x, this.y, bay.x, bay.y) < 20) {
        if (!this.docked) { this.docked = true; mother.repair(0.5); }
      }
      this.view.setVisible(!this.docked);
      return;
    }
    this.docked = false;
    this.view.setVisible(true);
    const swarm = motherAlive ? mother.brood : [];
    const others = swarm.filter((m) => m !== this && m.active).map((m) => ({ x: m.x, y: m.y, vx: m.velX, vy: m.velY }));
    const sep = flock({ x: this.x, y: this.y, vx: this.velX, vy: this.velY }, others, { separation: 1.2, alignment: 0.05, cohesion: 0.02, radius: 60 });
    let goal: Vec;
    if (this.role === 'screen' && motherAlive) {
      goal = { x: (mother.x + p.x) / 2 + Math.sin(time / 500 + this.seed * 6) * 40, y: (mother.y + p.y) / 2 + Math.cos(time / 400 + this.seed * 6) * 50 };
    } else {
      goal = p;
    }
    const v = seek(this, goal, this.role === 'bite' ? 300 : 220);
    this.drive(v.x + sep.x, v.y + sep.y, dt);
    this.faceToward(this.x + this.velX);
    this.rigExtra.fold = Math.floor(time / 40) % 2;
    this.aiState = this.role === 'bite' ? 'ATTACK' : 'HOVER';
  }

  /** Contact with HARROW: biters latch on. */
  onHitPlayer(): void {
    if (this.role !== 'bite' || this.latched || this.dying) return;
    const player = this.scene.player;
    if (player.surging) return;
    this.latched = true;
    this.latchOffset = { x: (this.x - player.x) * player.facing * 0.6, y: Math.max(-100, this.y - player.y) };
    this.chewAt = this.scene.time.now + 400;
  }
}

// ── MANTA ───────────────────────────────────────────────────────────────────

/**
 * Dive bomber. Circles a racetrack at altitude; with a bomb token it folds its wings,
 * paints a reticle where HARROW will be, dives and drops a stick of three bombs along the
 * predicted path, then pulls up. Only spawned over ground.
 */
export class Manta extends Flyer {
  readonly damageProfile = profile({ chunkTint: pal('hull4') });
  private mode: 'circle' | 'dive' | 'climb' = 'circle';
  private mark: Vec | null = null;
  private reticle: Phaser.GameObjects.Graphics;
  private dropped = 0;
  private modeUntil = 0;

  constructor(scene: GameScene, x: number, y: number, private readonly tuning: Scaling = BASE_SCALING) {
    super(scene, x, y, MANTA, { hp: 3 + tuning.extraHp, radar: 'flyer', bodyW: 60, bodyH: 16 });
    this.maxAccel = 600;
    this.reticle = scene.add.graphics().setDepth(13);
  }

  protected think(dt: number, time: number): void {
    this.sense(dt);
    const ai = this.scene.ai;
    const player = this.scene.player;
    this.reticle.clear();
    if (this.mode === 'circle') {
      const cx = player.x, cy = player.y - 380;
      const a = time / 1600 + this.seed * 6;
      this.flyTo({ x: cx + Math.cos(a) * 420, y: cy + Math.sin(a) * 70 }, 260, dt, time);
      this.faceToward(this.x + this.velX);
      this.rigExtra.fold = 0;
      if (time > this.modeUntil && this.perception.aware && ai?.tokens.acquire(this, 'bomb', ai.now)) {
        const terrain = ai.terrain;
        const land = predictLanding(player, player.velocity, 600, (x, y) => terrain.surfaceBelow(x, y), { maxTime: 1.2 });
        this.mark = { x: land.x, y: land.y };
        this.mode = 'dive';
        this.dropped = 0;
        this.modeUntil = time + 2600;
      }
    } else if (this.mode === 'dive') {
      const m = this.mark!;
      const shrink = Math.max(0, (this.modeUntil - time) / 2600);
      this.reticle.lineStyle(2, pal('hostile1'), 0.9);
      this.reticle.strokeCircle(m.x, m.y - 4, 20 + shrink * 50);
      this.reticle.lineBetween(m.x - 10, m.y - 4, m.x + 10, m.y - 4);
      const run = { x: m.x - this.facing * 60, y: m.y - 230 };
      this.flyTo(run, 380, dt, time);
      this.rigExtra.fold = 1;
      this.rigExtra.pitch = 0.3;
      const over = Math.abs(this.x - m.x) < 90 && this.y < m.y - 120;
      if (over && this.dropped < 3 && Math.random() < dt * 12) this.dropBomb();
      if (this.dropped >= 3 || time > this.modeUntil) {
        this.mode = 'climb'; this.modeUntil = time + 1500;
        ai?.tokens.release(this);
      }
    } else {
      this.drive(this.velX, -200, dt);
      this.rigExtra.fold = 0; this.rigExtra.pitch = -0.2;
      if (time > this.modeUntil) { this.mode = 'circle'; this.modeUntil = time + 2500 + Math.random() * 2000; }
    }
    this.aiState = this.mode === 'dive' ? 'ATTACK' : 'HOVER';
  }

  private dropBomb(): void {
    this.dropped++;
    const bay = this.socket('bay');
    const bomb = this.scene.add.image(bay.x, bay.y, 'rig', 'foe/manta_bomb@n').setScale(2).setDepth(9);
    const ground = this.scene.ai?.terrain.surfaceBelow(bay.x, bay.y) ?? this.scene.getApproxGroundY();
    const fall = Math.max(80, ground - bay.y);
    this.scene.tweens.add({
      targets: bomb, y: ground - 6, x: bay.x + this.velX * 0.3, duration: Math.sqrt(fall / 300) * 1000, ease: 'Quad.In',
      onComplete: () => {
        bomb.destroy();
        this.scene.spawnExplosion(bomb.x, ground - 10);
        this.scene.air?.explosion(bomb.x, ground - 10, true);
        const p = this.scene.player;
        if (Math.abs(p.x - bomb.x) < 70 && Math.abs(p.y - ground) < 60) p.takeDamage(DAMAGE.stickBomb, bomb.x);
      },
    });
  }

  destroy(fromScene?: boolean): void { this.reticle?.destroy(); super.destroy(fromScene); }
}

