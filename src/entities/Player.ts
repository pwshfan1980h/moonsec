import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { RapidGun } from '../weapons/RapidGun';
import { Turret } from '../weapons/Turret';
import { HomingMissile } from '../weapons/HomingMissile';
import { JumpAssist } from '../systems/JumpAssist';
import { PLAYER_STATS } from '../constants';
import { ARMOR_BASE, HEAL } from '../balance/armor';
import { HarrowRig, HARROW, type RigMode } from '../rig/bodies/harrow';
import { RigView } from '../rig/view/RigView';
import { RigFx } from '../rig/view/RigFx';
import { worldAngle, type SocketPose } from '../rig/pose';
import { VPX } from '../render/GraphicsSettings';
import { devParams } from '../dev/devParams';
import { nextFacing, surgeDirection, type FacingState } from './playerFacing';

const FRICTION = 0.78;
const NANITE_HEAL_DURATION = 4000;  // ms
/** Jet-assisted drop at mission start. */
const DROP_IN_HEIGHT = 160;
const DROP_IN_MAX_FALL = 260;

export type PlayerUpgradeId = 'armor' | 'ammo' | 'fuel' | 'capacitor' | 'missile-rack' | 'repair-core';

/** Physics body (world units). The rig itself is drawn separately by RigView. */
export const HARROW_BODY = { w: 40, h: 92, visualH: 112 } as const;

export interface MuzzlePose { x: number; y: number; angle: number }

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  hp = ARMOR_BASE;
  maxHp = ARMOR_BASE;

  walkSpeed = PLAYER_STATS.walkSpeed;
  runSpeed  = PLAYER_STATS.runSpeed;
  jumpVelocity = PLAYER_STATS.jumpVelocity;
  jetpackAccel = PLAYER_STATS.jetpackAccel;
  jetpackMaxFuel = PLAYER_STATS.jetpackMaxFuel;

  rapidMinInterval  = 60;
  rapidAmmo         = PLAYER_STATS.rapidAmmoMax;
  rapidAmmoMax      = PLAYER_STATS.rapidAmmoMax;
  turretCooldownMs  = 420;
  turretDamage = 1;
  missileCooldownMs = 5000;
  missileSlots      = 6;
  naniteCooldownMs  = 20000;
  naniteHealAmount  = HEAL.nanite;

  /** Always toward the cursor. */
  facing: 1 | -1 = 1;
  readonly rig = new HarrowRig();
  readonly rigView: RigView;
  private readonly fx: RigFx;
  private facingState: FacingState = { facing: 1, heldMs: 0 };

  private empUntil = 0;
  private onGround = false;
  private jetpackFuel = 0;
  private hurtLock = 0;
  private dead = false;
  private spawning = true;
  private relayActive = false;
  private thrusting = false;
  private sputtering = false;
  private walkHeld = false;
  private lastX = 0;
  private presentationTime = 0;
  private fxClock = { smoke: 0, sparks: 0, fire: 0, debris: 0 };

  private wasAirborne = false;
  private prevVelocityY = 0;

  // Surge dash state — double-tap A/D or Left/Right to lunge horizontally
  private readonly SURGE_TAP_WINDOW = 260; // ms
  private readonly SURGE_DURATION   = 400; // ms
  private readonly SURGE_SPEED      = 1200; // px/s — total traversal ≈ 480 px
  private readonly SURGE_COOLDOWN   = 700; // ms
  private readonly SURGE_DAMAGE     = 2;
  private readonly SURGE_RADIUS     = 95;  // px
  private readonly SURGE_GHOST_INTERVAL = 50; // ms between afterimages
  private lastTapLeft     = -1e9;
  private lastTapRight    = -1e9;
  private surgeUntil      = 0;
  private surgeCooldownAt = 0;
  private surgeDir: -1 | 1 = 1;
  private surgeNextGhostAt = 0;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private keySpace: Phaser.Input.Keyboard.Key;
  private keyE: Phaser.Input.Keyboard.Key;
  private jumpAssist = new JumpAssist();
  private keyDash: Phaser.Input.Keyboard.Key;
  private keyQ: Phaser.Input.Keyboard.Key;

  private rapidGun: RapidGun;
  private turret: Turret;
  private missile: HomingMissile;

  private naniteActive     = false;
  private naniteHealElapsed = 0;
  private naniteCooldown   = 0;
  private naniteHealStart  = 0;
  private naniteTickAt     = 0;
  private readonly onPointerDown: (ptr: Phaser.Input.Pointer) => void;
  private readonly onContextMenu: (event: MouseEvent) => void;
  private readonly onRelay: (progress: number, active: boolean) => void;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y - DROP_IN_HEIGHT, 'harrow-hitbox');
    this.scene = scene;
    this.jetpackFuel = this.jetpackMaxFuel;
    this.lastX = this.x;

    this.setOrigin(0.5, 1); // feet at position
    this.setDepth(10);
    this.setVisible(false); // the rig draws the mech; this sprite is the physics body
    this.rigView = new RigView(scene, 'harrow', 10);
    this.fx = new RigFx(scene, 9, 12);

    const armor = devParams().armor;
    if (armor !== undefined) this.hp = Math.max(1, Math.min(this.maxHp, armor));

    const kb = scene.input.keyboard!;
    this.cursors   = kb.createCursorKeys();
    this.keyA      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyE      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyDash   = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyQ      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    this.rapidGun = new RapidGun(scene);
    this.turret   = new Turret(scene);
    this.missile  = new HomingMissile(scene);

    // Left-click: heavy cannon, fired from the barrel you can see
    this.onPointerDown = (ptr: Phaser.Input.Pointer) => {
      if (!this.canAct()) return;
      if (ptr.leftButtonDown()) {
        const wp = scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const m = this.muzzle('muzzleMain');
        if (this.turret.fire(m.x, m.y, wp.x, wp.y, scene.time.now)) {
          this.rig.fireCannon();
          const e = this.socketWorld('eject');
          this.fx.chips(e.x, e.y, 1, -Math.PI / 2 - this.facing * 0.6);
          this.fx.puff(m.x, m.y, 2, m.angle, 0.6);
        }
      }
    };
    scene.input.on('pointerdown', this.onPointerDown);

    // Prevent context menu on right-click
    this.onContextMenu = (event: MouseEvent) => event.preventDefault();
    scene.game.canvas.addEventListener('contextmenu', this.onContextMenu);

    // Surface relays report hold-F progress; the rig raises its antenna and beams in
    this.onRelay = (progress: number, active: boolean) => { this.relayActive = active && progress > 0 && progress < 1; };
    scene.events.on('relayProgress', this.onRelay);

    // Nanite Q key listener
    this.keyQ.on('down', () => {
      if (!this.naniteActive && this.naniteCooldown <= 0 && this.hp < this.maxHp && this.canAct()) {
        this.naniteActive = true;
        this.scene.events.emit('pilotAction', 'repair');
        this.naniteHealElapsed = 0;
        this.naniteHealStart = this.hp;
        this.scene.audio.play('nanite-heal');
      }
    });
  }

  private canAct(): boolean {
    return !this.dead && !this.spawning && this.scene.time.now >= this.empUntil;
  }

  get isDead(): boolean { return this.dead; }

  update(time: number, delta: number): void {
    if (this.dead) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const airborne = !body.blocked.down;

    if (this.wasAirborne && !airborne) this.onLanded(this.prevVelocityY);
    this.wasAirborne = airborne;
    this.prevVelocityY = body.velocity.y;
    this.onGround = body.blocked.down;

    // Facing always follows the cursor
    const cam = this.scene.cameras.main;
    const ptr = this.scene.input.activePointer;
    const aim = cam.getWorldPoint(ptr.x, ptr.y);
    this.facingState = nextFacing(this.facingState, aim.x - this.x, delta);
    this.facing = this.facingState.facing;
    this.setFlipX(this.facing < 0);

    if (this.spawning) {
      // Jet-assisted drop: no control until the mech lands
      body.setVelocityX(0);
      body.velocity.y = Math.min(body.velocity.y, DROP_IN_MAX_FALL);
      this.thrusting = true;
      return;
    }
    if (time < this.empUntil) { // EMP shutdown — no input, gravity still applies
      this.thrusting = false;
      body.setAccelerationY(0);
      this.scene.audio.stopLoop('jetpack');
      return;
    }

    const left  = this.cursors.left.isDown  || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const space = this.keySpace.isDown;
    this.walkHeld = left !== right;

    // --- Surge: double-tap detection ---
    const tappedLeft  = Phaser.Input.Keyboard.JustDown(this.cursors.left)
                     || Phaser.Input.Keyboard.JustDown(this.keyA);
    const tappedRight = Phaser.Input.Keyboard.JustDown(this.cursors.right)
                     || Phaser.Input.Keyboard.JustDown(this.keyD);
    if (tappedLeft) {
      if (time - this.lastTapLeft < this.SURGE_TAP_WINDOW) {
        this.tryStartSurge(-1, time);
        this.lastTapLeft = -1e9; // consume so a 3rd tap doesn't immediately re-fire
      } else {
        this.lastTapLeft = time;
      }
    }
    if (tappedRight) {
      if (time - this.lastTapRight < this.SURGE_TAP_WINDOW) {
        this.tryStartSurge(1, time);
        this.lastTapRight = -1e9;
      } else {
        this.lastTapRight = time;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyDash)) this.tryStartSurge(surgeDirection(left, right, this.facing), time);

    const surging = time < this.surgeUntil;

    // --- Horizontal movement ---
    if (surging) {
      body.setVelocityX(this.SURGE_SPEED * this.surgeDir);
      if (time >= this.surgeNextGhostAt) {
        this.surgeNextGhostAt = time + this.SURGE_GHOST_INTERVAL;
        this.scene.spawnSurgeGhost(this);
      }
    } else if (left && !right) {
      body.setVelocityX(-this.walkSpeed);
    } else if (right && !left) {
      body.setVelocityX(this.walkSpeed);
    } else {
      body.setVelocityX(body.velocity.x * Math.pow(FRICTION, delta / (1000 / 60)));
    }

    // Buffered presses can jump on landing or just after leaving an edge.
    const jump = this.jumpAssist.update(time, this.onGround, Phaser.Input.Keyboard.JustDown(this.keySpace));
    const thrust = space && !this.onGround && this.jetpackFuel > 0 && !jump;
    this.sputtering = space && !this.onGround && this.jetpackFuel <= 0;
    this.thrusting = thrust;
    body.setAccelerationY(0);
    if (jump) {
      body.setVelocityY(this.jumpVelocity);
      this.rig.launch();
      this.fx.kickDust(this.x, this.y, 10, 1.4);
      this.scene.audio.play('jump');
      this.scene.events.emit('pilotAction', 'jump');
    } else if (thrust) {
      this.jetpackFuel = Math.max(0, this.jetpackFuel - delta);
      body.setAccelerationY(this.jetpackAccel);
      body.velocity.y = Math.max(body.velocity.y, -420);
      this.scene.audio.startLoop('jetpack');
    } else {
      this.scene.audio.stopLoop('jetpack');
      if (this.onGround) this.jetpackFuel = Math.min(this.jetpackMaxFuel, this.jetpackFuel + delta * 0.8);
    }

    // --- Hurt timeout ---
    if (this.hurtLock > 0) {
      this.hurtLock -= delta;
      return; // freeze input while hurt
    }

    // --- Weapons ---
    const rmb = this.scene.input.mousePointer.rightButtonDown();
    this.rig.setGatlingSpin(rmb);
    if (this.rapidGun.update(time, this.muzzle('muzzleRapid'))) this.rig.fireGatling();
    this.missile.update(time, delta);

    if (Phaser.Input.Keyboard.JustDown(this.keyE) && this.missile.fire(this)) this.rig.openHatch();

    const surgeActive = time < this.surgeUntil;
    const surgeReady = time >= this.surgeCooldownAt;
    const surgeProgress = surgeReady ? 1 : surgeActive ? 0
      : Phaser.Math.Clamp(1 - (this.surgeCooldownAt - time) / this.SURGE_COOLDOWN, 0, 1);
    this.scene.events.emit('surgeChange', surgeActive ? 'active' : surgeReady ? 'ready' : 'cooldown', surgeProgress);

    // Emit weapon cooldowns + fuel to HUD
    this.scene.events.emit('missileCooldown', this.missile.getCooldownProgress());
    this.scene.events.emit('turretCooldown', this.turret.getCooldownProgress(time));
    this.scene.events.emit('jetpackFuel', this.jetpackFuel, this.jetpackMaxFuel);

    // ── Nanite heal ──────────────────────────────────────────────────
    if (this.naniteActive) {
      this.naniteHealElapsed += delta;
      const progress = Math.min(this.naniteHealElapsed / NANITE_HEAL_DURATION, 1);
      this.hp = Math.min(this.naniteHealStart + this.naniteHealAmount * progress, this.maxHp);
      this.scene.events.emit('healthChange', this.hp, this.maxHp);
      this.scene.events.emit('naniteChange', 'active', progress);
      if (time >= this.naniteTickAt) { this.naniteTickAt = time + 600; this.scene.audio.play('nanite-tick'); }
      if (progress >= 1) {
        this.naniteActive = false;
        this.naniteCooldown = this.naniteCooldownMs;
        this.rig.pulse('green1', 0.5);
      }
    } else if (this.naniteCooldown > 0) {
      this.naniteCooldown = Math.max(0, this.naniteCooldown - delta);
      const cdProgress = 1 - this.naniteCooldown / this.naniteCooldownMs;
      this.scene.events.emit('naniteChange', 'cooldown', cdProgress);
    } else {
      this.scene.events.emit('naniteChange', 'ready', 1);
    }
  }

  private onLanded(vy: number): void {
    const heavy = vy > 450 || this.spawning;
    if (vy > 600 || this.spawning) {
      this.scene.audio.play('landing-slam');
      this.scene.cameras.main.shake(160, 0.006);
    } else if (vy > 300) {
      this.scene.audio.play('landing-heavy');
      this.scene.cameras.main.shake(60, 0.003);
    } else {
      this.scene.audio.play('landing-soft');
    }
    this.rig.land(vy / VPX, heavy);
    this.fx.kickDust(this.x - 16, this.y, heavy ? 14 : 5, heavy ? 1.8 : 1);
    this.fx.kickDust(this.x + 16, this.y, heavy ? 14 : 5, heavy ? 1.8 : 1);
    if (this.spawning) {
      this.spawning = false;
      this.thrusting = false;
      this.rig.pulse('cyan2', 0.45);
    }
  }

  // ── Presentation (runs every frame, including game over) ─────────────────
  tickPresentation(delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.presentationTime += dt;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const now = this.scene.time.now;
    const mode: RigMode = this.dead ? 'dead'
      : now < this.empUntil ? 'emp'
      : this.spawning ? 'spawn'
      : this.naniteActive ? 'repair'
      : this.relayActive ? 'relay'
      : 'normal';
    const cam = this.scene.cameras.main;
    const ptr = this.scene.input.activePointer;
    const aim = cam.getWorldPoint(ptr.x, ptr.y);
    const dx = (this.x - this.lastX) / VPX;
    this.lastX = this.x;
    const surging = now < this.surgeUntil;
    this.rig.update({
      dt, dx, vx: body.velocity.x / VPX, vy: body.velocity.y / VPX, grounded: body.blocked.down,
      facing: this.facing, aimDx: (aim.x - this.x) / VPX, aimDy: (aim.y - this.y) / VPX,
      moving: this.walkHeld && !surging && !this.dead, dashing: surging, dashDir: this.surgeDir,
      thrust: this.thrusting ? 1 : 0, sputter: this.sputtering, mode,
      modeRemaining: Math.max(0, (this.empUntil - now) / 1000), modeTime: 0,
      hp: this.hp, time: this.presentationTime,
    });
    this.rigView.sync(this.x, this.y, this.facing, this.rig, {
      dark: this.dead ? Math.min(1, this.rig.deathT) : 0,
      scanY: mode === 'repair' ? this.y - ((this.presentationTime * 90) % HARROW_BODY.visualH) : undefined,
    });
    this.drawEffects(delta, mode);
  }

  private drawEffects(delta: number, mode: RigMode): void {
    const rig = this.rig;
    for (const j of rig.jets) {
      const p = this.toWorld(j.x, j.y);
      this.fx.jetFlame(p.x, p.y, Math.atan2(j.dy, j.dx * this.facing), j.power, delta);
    }
    // wash dust when jets fire near the ground
    if (rig.jets.length && !this.onGround && Math.random() < 0.3) this.fx.kickDust(this.x, this.y + 40, 1, 1.5);

    for (const e of rig.events) {
      if (e.type === 'footfall') {
        const p = this.toWorld(e.x, 0);
        this.fx.kickDust(p.x, p.y, e.weight > 0.7 ? 5 : 3, e.weight);
        this.scene.audio.play('footstep');
      } else if (e.type === 'toeDrag') {
        const p = this.toWorld(e.x, e.y);
        if (Math.random() < 0.5) this.fx.spark(p.x, p.y, 2, -Math.PI / 2 - this.facing * 1.2, 0.8);
        if (Math.random() < 0.3) this.fx.kickDust(p.x, p.y, 1, 0.6);
      } else if (e.type === 'boom') {
        const p = this.toWorld(e.x, e.y);
        this.scene.spawnExplosion(p.x, p.y);
        this.fx.chips(p.x, p.y, e.big ? 8 : 3);
        this.fx.flame(p.x, p.y, e.big ? 10 : 4);
        this.scene.cameras.main.shake(e.big ? 240 : 100, e.big ? 0.01 : 0.004);
      } else if (e.type === 'vent') {
        const p = this.toWorld(e.x, e.y);
        this.fx.puff(p.x, p.y, 6, -Math.PI / 2 - this.facing * 0.5, 0.7);
      }
    }

    // damage states: smoke from the back, sparks, fire and debris at the breach
    const d = rig.damage;
    const dt = delta / 1000;
    const clock = this.fxClock;
    const vent = this.socketWorld('vent'), breach = this.socketWorld('breach');
    if (mode === 'dead' ? rig.deathT > 1 : d.smoke > 0) {
      clock.smoke += dt * (mode === 'dead' ? 10 : d.smoke);
      while (clock.smoke >= 1) { clock.smoke -= 1; this.fx.puff(vent.x, vent.y, 1); }
    }
    if (d.sparks > 0 && mode !== 'dead') {
      clock.sparks += dt * d.sparks;
      while (clock.sparks >= 1) { clock.sparks -= 1; const c = this.socketWorld('chest'); this.fx.spark(c.x + (Math.random() - 0.5) * 24, c.y + (Math.random() - 0.5) * 16, 4); }
    }
    if (d.fire || (mode === 'dead' && rig.deathT < 3)) {
      clock.fire += dt * 30;
      while (clock.fire >= 1) { clock.fire -= 1; this.fx.flame(breach.x + (Math.random() - 0.5) * 6, breach.y); }
    }
    if (d.debris > 0 && mode !== 'dead' && this.walkHeld) {
      clock.debris += dt * d.debris;
      while (clock.debris >= 1) { clock.debris -= 1; this.fx.chips(breach.x, breach.y, 1, Math.PI / 2); }
    }

    if (mode === 'repair') {
      const c = this.socketWorld('chest');
      this.fx.swarm(this.x, c.y, 34, 14, this.presentationTime, 2);
      if (Math.random() < dt * 5) this.fx.spark(c.x + (Math.random() - 0.5) * 30, c.y + (Math.random() - 0.5) * 20, 3);
    }
    if (mode === 'relay') {
      const tip = this.socketWorld('antennaTip');
      if (Math.random() < dt * 20) this.fx.spark(tip.x, tip.y, 1, -Math.PI / 2, 3);
    }
    this.fx.empArcs(mode === 'emp' && rig.lightsOff, this.x, this.y, 60, 90);
  }

  // ── sockets for gameplay ──────────────────────────────────────────────────
  private toWorld(lx: number, ly: number): { x: number; y: number } {
    return { x: this.x + lx * this.facing * VPX, y: this.y + ly * VPX };
  }

  socketWorld(name: string): { x: number; y: number; angle: number } {
    const s: SocketPose | undefined = this.rig.sockets[name];
    if (!s) return { x: this.x, y: this.y - HARROW.aimHeight * VPX, angle: 0 };
    const p = this.toWorld(s.x, s.y);
    return { ...p, angle: worldAngle(s.a, this.facing) };
  }

  /** Muzzle position and barrel direction in world space. */
  muzzle(name: 'muzzleMain' | 'muzzleRapid' | 'podTube'): MuzzlePose {
    return this.socketWorld(name);
  }

  /** Where enemies aim: the torso centre. */
  getAimPoint(): { x: number; y: number } {
    return { x: this.x, y: this.y - HARROW.aimHeight * VPX };
  }

  private tryStartSurge(dir: -1 | 1, time: number): void {
    if (!this.canAct()) return;
    if (this.hurtLock > 0) return;
    if (time < this.surgeCooldownAt) return;

    this.scene.events.emit('pilotAction', 'dash');
    this.surgeDir      = dir;
    this.surgeUntil    = time + this.SURGE_DURATION;
    this.surgeCooldownAt = time + this.SURGE_DURATION + this.SURGE_COOLDOWN;
    this.surgeNextGhostAt = time; // first ghost on the very next update
    this.scene.audio.play('surge');
    this.scene.spawnSurgeShockwave(this.x, this.y - 30, dir, this.SURGE_RADIUS, this.SURGE_DAMAGE);
    this.scene.spawnSurgeTrail(this, dir, this.SURGE_DURATION);
    this.scene.time.delayedCall(this.SURGE_DURATION, () => {
      if (this.dead) return;
      this.rig.endDash(dir, this.facing);
      this.fx.spark(this.x + dir * 20, this.y - 2, 8, dir > 0 ? Math.PI : 0, 0.8);
    });
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.scene.events.emit('healthChange', this.hp, this.maxHp);
  }

  restoreJetpackFuel(amount: number): void {
    this.jetpackFuel = Math.min(this.jetpackMaxFuel, this.jetpackFuel + amount);
    this.scene.events.emit('jetpackFuel', this.jetpackFuel, this.jetpackMaxFuel);
  }

  consumeRapidAmmo(): boolean {
    if (this.rapidAmmo <= 0) return false;
    this.rapidAmmo -= 1;
    this.scene.events.emit('rapidAmmoChange', this.rapidAmmo, this.rapidAmmoMax);
    return true;
  }

  refillRapidAmmo(amount: number): void {
    if (this.dead) return;
    this.rapidAmmo = Math.min(this.rapidAmmoMax, this.rapidAmmo + amount);
    this.scene.events.emit('rapidAmmoChange', this.rapidAmmo, this.rapidAmmoMax);
  }

  applyUpgrade(id: PlayerUpgradeId): void {
    if (this.dead) return;
    this.rig?.pulse('green1', 0.6);
    if (id === 'capacitor') {
      this.turretDamage = 2;
      this.turretCooldownMs = 650;
      return;
    }
    if (id === 'missile-rack') {
      this.missileCooldownMs = 3000;
      this.rapidAmmoMax = Math.max(50, this.rapidAmmoMax - 50);
      this.rapidAmmo = Math.min(this.rapidAmmo, this.rapidAmmoMax);
      this.scene.events.emit('rapidAmmoChange', this.rapidAmmo, this.rapidAmmoMax);
      return;
    }
    if (id === 'repair-core') {
      this.naniteHealAmount = HEAL.naniteRepairCore;
      this.naniteCooldownMs = 28000;
      this.heal(HEAL.repairCoreUpgrade);
      return;
    }
    if (id === 'armor') {
      this.maxHp += HEAL.armorUpgradeMax;
      this.hp = Math.min(this.maxHp, this.hp + HEAL.armorUpgradeMax);
      this.scene.events.emit('healthChange', this.hp, this.maxHp);
      return;
    }
    if (id === 'ammo') {
      this.rapidAmmoMax += 35;
      this.rapidAmmo = this.rapidAmmoMax;
      this.scene.events.emit('rapidAmmoChange', this.rapidAmmo, this.rapidAmmoMax);
      return;
    }

    this.jetpackMaxFuel += 500;
    this.jetpackFuel = this.jetpackMaxFuel;
    this.scene.events.emit('jetpackFuel', this.jetpackFuel, this.jetpackMaxFuel);
  }

  takeDamage(amount: number, sourceX?: number): void {
    const surging = this.scene.time.now < this.surgeUntil;
    if (this.dead || this.hurtLock > 0 || surging || this.spawning) {
      this.scene.audio.stopLoop('jetpack'); // stop loop even on early return
      return;
    }
    this.scene.audio.stopLoop('jetpack'); // stop loop on new damage (hurt + death branches)
    if (this.naniteActive) {
      this.naniteActive = false;
      this.naniteCooldown = this.naniteCooldownMs;
      this.scene.events.emit('naniteChange', 'cooldown', 0);
    }
    this.hp = Math.max(0, this.hp - amount);
    this.scene.events.emit('healthChange', this.hp, this.maxHp);
    const incomingDir: -1 | 1 = sourceX === undefined
      ? (this.facing > 0 ? 1 : -1)
      : (sourceX < this.x ? -1 : 1);
    const chest = this.socketWorld('chest');
    this.scene.events.emit('playerDamaged', { amount, direction: incomingDir, x: chest.x, y: chest.y });
    this.rig.hurt(incomingDir, this.facing);
    this.fx.spark(chest.x + incomingDir * 12, chest.y, 12, incomingDir > 0 ? Math.PI : 0, 1.4);
    this.fx.chips(chest.x, chest.y, 3, incomingDir > 0 ? Math.PI + 0.6 : -0.6);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.hp <= 0) {
      this.dead = true;
      this.thrusting = false;
      this.scene.audio.stopLoop('jetpack'); // safety belt — no-op if already stopped
      this.scene.audio.play('death');
      body.setVelocity(0, 0);
      body.setAcceleration(0, 0);
      this.scene.time.delayedCall(1500, () => {
        this.scene.events.emit('gameOver');
      });
    } else {
      this.hurtLock = 600;
      body.setVelocityX(-incomingDir * 280);
      body.setVelocityY(Math.min(body.velocity.y, -160));
      this.scene.audio.play('hurt');
    }
  }

  empStun(duration: number): void {
    if (this.dead || this.scene.time.now < this.empUntil) return;
    this.empUntil = this.scene.time.now + duration;
    this.naniteActive = false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    this.scene.audio.stopLoop('jetpack');
    // Deep EMP crackle — very low-pitched hurt sound
    this.scene.audio.playAt('hurt', { rate: 0.15, detune: -1200, volume: 1.0 });
    this.scene.cameras.main.flash(300, 0, 160, 255, false);
  }

  destroy(fromScene?: boolean): void {
    // Phaser nulls `this.scene` inside the parent destroy. The scene-shutdown
    // teardown path can re-enter destroy on the same sprite, so guard against
    // a missing scene before touching its input/canvas handles.
    if (this.scene) {
      this.scene.input.off('pointerdown', this.onPointerDown);
      this.scene.game.canvas.removeEventListener('contextmenu', this.onContextMenu);
      this.scene.events.off('relayProgress', this.onRelay);
    }
    this.rigView?.destroy();
    this.fx?.destroy();
    super.destroy(fromScene);
  }
}
