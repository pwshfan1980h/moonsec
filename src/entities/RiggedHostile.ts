import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { DamageProfile, Hostile } from '../collisions/HostileCombat';
import { RigView, type RigSource } from '../rig/view/RigView';
import { RigFx } from '../rig/view/RigFx';
import type { SocketPose } from '../rig/pose';
import { VPX } from '../render/GraphicsSettings';
import { pal, type PaletteName } from '../render/palette';

export type RadarKind = 'flyer' | 'walker' | 'heavy' | 'swarm' | 'mine' | 'boss';

export interface RiggedHostileOptions {
  rig: string;
  /** Hitbox in world units; origin is bottom-centre for walkers, centre for flyers. */
  bodyW: number;
  bodyH: number;
  hp: number;
  radar: RadarKind;
  depth?: number;
  gravity?: boolean;
  /** Hitbox origin y: 1 = feet (walkers), 0.5 = centre (flyers). */
  originY?: number;
}

/** Any rig body an enemy uses: something the view can draw, with sockets. */
export interface HostileBody extends RigSource {
  readonly sockets: Record<string, SocketPose>;
}

/** One RigFx per scene for every enemy (pooled emitters). */
export function enemyFx(scene: GameScene): RigFx {
  const s = scene as GameScene & { __enemyFx?: RigFx };
  if (!s.__enemyFx || !s.__enemyFx.jet.scene) s.__enemyFx = new RigFx(scene, 9, 12);
  return s.__enemyFx;
}

function hitboxTexture(scene: Phaser.Scene, w: number, h: number): string {
  const key = `hitbox-${w}x${h}`;
  if (!scene.textures.exists(key)) {
    const g = scene.add.graphics();
    g.generateTexture(key, w, h);
    g.destroy();
  }
  return key;
}

/**
 * Base for rigged enemies. The Arcade sprite is an invisible hitbox (so groups, overlaps
 * and HostileCombat keep working); a RigView draws the body. Subclasses supply `think`
 * (AI) and `body` (the rig to draw), and may override death.
 */
export abstract class RiggedHostile extends Phaser.Physics.Arcade.Sprite implements Hostile {
  declare scene: GameScene;
  abstract readonly damageProfile: DamageProfile;
  abstract readonly rig: HostileBody;
  hp: number;
  readonly maxHp: number;
  facing: 1 | -1 = 1;
  readonly radar: { kind: RadarKind; isBoss: boolean };
  readonly view: RigView;
  protected dying = false;
  protected aiState = 'HOVER';
  private readonly parts: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: GameScene, x: number, y: number, readonly opts: RiggedHostileOptions) {
    super(scene, x, y, hitboxTexture(scene, opts.bodyW, opts.bodyH));
    this.hp = this.maxHp = opts.hp;
    this.radar = { kind: opts.radar, isBoss: opts.radar === 'boss' };
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, opts.originY ?? 0.5).setVisible(false).setDepth(opts.depth ?? 8);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(opts.gravity ?? false);
    this.view = new RigView(scene, opts.rig, opts.depth ?? 8);
  }

  /** Every frame: decide and move. */
  protected abstract think(dt: number, time: number): void;
  /** Every frame after thinking: advance the rig. */
  protected abstract animate(dt: number, time: number): void;

  get isBoss(): boolean { return this.radar.isBoss; }
  getState(): string { return this.aiState; }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.active) return;
    const dt = Math.min(delta, 50) / 1000;
    if (!this.dying) this.think(dt, time);
    this.animate(dt, time);
    this.view.sync(this.x, this.y + this.rigOffsetY(), this.facing, this.rig);
  }

  /** World y of the rig origin relative to the sprite (feet vs centre). */
  protected rigOffsetY(): number { return 0; }

  /** World position of a rig socket. */
  socket(name: string): { x: number; y: number; angle: number } {
    const s = this.rig.sockets[name];
    const oy = this.y + this.rigOffsetY();
    if (!s) return { x: this.x, y: oy, angle: 0 };
    return {
      x: this.x + s.x * this.facing * VPX, y: oy + s.y * VPX,
      angle: this.facing > 0 ? s.a : Math.PI - s.a,
    };
  }

  /** Attach a destructible sub-part (registered for player fire). */
  protected addPart<T extends Phaser.GameObjects.GameObject>(part: T): T {
    this.parts.push(part);
    return part;
  }

  takeDamage(amount: number): void {
    if (this.dying || !this.active) return;
    this.hp -= amount;
    this.rig.flash = 0.06;
    this.onHit(amount);
    if (this.hp <= 0) this.die();
  }

  protected onHit(_amount: number): void { /* subclasses react (evade, stagger) */ }

  /** Standard death: scatter the rig's parts, explode, report the kill, clean up. */
  die(): void {
    if (this.dying) return;
    this.dying = true;
    this.aiState = 'DEATH';
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    const fx = enemyFx(this.scene);
    const c = this.socket('core');
    this.scene.spawnExplosion(c.x, c.y);
    fx.chips(c.x, c.y, 6);
    fx.spark(c.x, c.y, 10);
    this.view.shatter(this.deathTint());
    this.scene.events.emit('droneKilled', this.x, this.y);
    this.scene.ai?.tokens.release(this);
    this.scene.time.delayedCall(60, () => this.destroy());
  }

  protected deathTint(): PaletteName { return 'hull3'; }

  destroy(fromScene?: boolean): void {
    this.scene?.ai?.tokens.release(this);
    for (const p of this.parts) p.destroy();
    this.parts.length = 0;
    this.view?.destroy();
    super.destroy(fromScene);
  }
}

/**
 * A separately destructible piece of a rigged enemy (a leg, a shield, a hangar door).
 * It follows a socket, takes player fire through HostileCombat, and calls `onBreak`.
 */
export class HitPart extends Phaser.Physics.Arcade.Image implements Hostile {
  hp: number;
  broken = false;

  constructor(
    scene: GameScene, w: number, h: number, hp: number,
    readonly damageProfile: DamageProfile,
    private readonly onHitPart: (amount: number) => void,
    private readonly onBreak: () => void,
  ) {
    super(scene, 0, 0, hitboxTexture(scene, w, h));
    this.hp = hp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    scene.hostileCombat.register(this as unknown as Phaser.GameObjects.Sprite & Hostile);
  }

  follow(x: number, y: number): void { if (!this.broken) this.setPosition(x, y); }

  takeDamage(amount: number): void {
    if (this.broken) return;
    this.hp -= amount;
    this.onHitPart(amount);
    if (this.hp <= 0) {
      this.broken = true;
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
      this.onBreak();
    }
  }
}

/** Radar colour per enemy kind (palette). */
export function radarColor(kind: RadarKind): number {
  return pal(kind === 'boss' ? 'hostile1' : kind === 'heavy' || kind === 'walker' ? 'amber1' : kind === 'mine' ? 'amber0' : 'hostile1');
}
