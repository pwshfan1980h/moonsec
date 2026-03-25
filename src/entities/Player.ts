import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { RapidGun } from '../weapons/RapidGun';
import { Turret } from '../weapons/Turret';
import { HomingMissile } from '../weapons/HomingMissile';
import { MECH_STATS } from '../constants';

type AnimState = 'idle' | 'walk' | 'run' | 'jump_loop' | 'jump_start' | 'jump_land' | 'hurt' | 'death';

const FRICTION = 0.78;

const NANITE_HEAL_AMOUNT   = 1;
const NANITE_HEAL_DURATION = 4000;  // ms
const NANITE_COOLDOWN      = 20000; // ms

export type MechType = 'mech' | 'mech4';

const MECH_CONFIG: Record<MechType, {
  textureKey: string; animPrefix: string; scale: number;
  bodyW: number; bodyH: number; bodyOffX: number; bodyOffY: number;
}> = {
  mech:  { textureKey: 'mech',  animPrefix: '',       scale: 0.75, bodyW: 100, bodyH: 150, bodyOffX: 37.5, bodyOffY: 0  },
  mech4: { textureKey: 'mech4', animPrefix: 'mech4-', scale: 1.6,  bodyW: 36,  bodyH: 60,  bodyOffX: 17,   bodyOffY: 10 },
};

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  hp = 5;
  maxHp = 5;

  walkSpeed = 220;
  runSpeed  = 350;
  jumpVelocity = -510;
  jetpackAccel = -920;
  jetpackMaxFuel = 2200;

  private curAnim: AnimState = 'idle';
  private onGround = false;
  private jetpackFuel = 0;
  private hurtLock = 0;
  private dead = false;
  piloting = true;

  private animPrefix: string = '';
  readonly bodyConfig: { w: number; h: number; offX: number; offY: number };

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private keySpace: Phaser.Input.Keyboard.Key;
  private keyShift: Phaser.Input.Keyboard.Key;
  private keyQ: Phaser.Input.Keyboard.Key;

  private rapidGun: RapidGun;
  private turret: Turret;
  private missile: HomingMissile;

  private jetpackInner!: Phaser.GameObjects.Particles.ParticleEmitter;
  private jetpackOuter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private jetpackSmoke!: Phaser.GameObjects.Particles.ParticleEmitter;

  private naniteActive     = false;
  private naniteHealElapsed = 0;
  private naniteCooldown   = 0;
  private naniteHealStart  = 0;

  private naniteAmbient!: Phaser.GameObjects.Particles.ParticleEmitter;
  private naniteSpark!:   Phaser.GameObjects.Particles.ParticleEmitter;
  private naniteSparkEvent: Phaser.Time.TimerEvent | null = null;

  constructor(scene: GameScene, x: number, y: number, mechType: MechType = 'mech') {
    const cfg = MECH_CONFIG[mechType] ?? MECH_CONFIG['mech'];

    super(scene, x, y, cfg.textureKey);
    this.scene = scene;

    this.animPrefix = cfg.animPrefix;
    this.bodyConfig = { w: cfg.bodyW, h: cfg.bodyH, offX: cfg.bodyOffX, offY: cfg.bodyOffY };

    const stats = MECH_STATS[mechType] ?? MECH_STATS['mech4'];
    this.maxHp          = stats.maxHp;
    this.hp             = stats.maxHp;
    this.walkSpeed      = stats.walkSpeed;
    this.runSpeed       = stats.runSpeed;
    this.jumpVelocity   = stats.jumpVelocity;
    this.jetpackAccel   = stats.jetpackAccel;
    this.jetpackMaxFuel = stats.jetpackMaxFuel;
    this.jetpackFuel    = stats.jetpackMaxFuel;

    this.setOrigin(0.5, 1); // feet at position
    this.setScale(cfg.scale);
    this.setDepth(10);

    const kb = scene.input.keyboard!;
    this.cursors   = kb.createCursorKeys();
    this.keyA      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyShift  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyQ      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    this.rapidGun = new RapidGun(scene);
    this.turret   = new Turret(scene);
    this.missile  = new HomingMissile(scene);

    // Left-click: turret fire
    scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.dead || !this.piloting) return;
      if (ptr.leftButtonDown()) {
        const wp = scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
        this.turret.fire(this.x, this.y, wp.x, wp.y, scene.time.now);
      }
    });

    // Prevent context menu on right-click
    scene.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.play(this.animPrefix + 'idle');

    // Jetpack flame emitters — orange core + cyan outer glow
    this.jetpackInner = scene.add.particles(0, 0, 'flare', {
      speed:    { min: 60, max: 120 },
      angle:    { min: 80, max: 100 },  // downward ±10°
      scale:    { start: 0.8, end: 0 },
      alpha:    { start: 1, end: 0 },
      tint:     [0xff6600, 0xff2200, 0xffaa00],
      lifespan: 120,
      frequency: 20,
      blendMode: 'ADD',
      emitting:  false,
    }).setDepth(9);

    this.jetpackOuter = scene.add.particles(0, 0, 'flare', {
      speed:    { min: 40, max: 90 },
      angle:    { min: 65, max: 115 }, // downward ±25°
      scale:    { start: 1.2, end: 0 },
      alpha:    { start: 0.7, end: 0 },
      tint:     [0x00aaff, 0x0044ff, 0x44eeff],
      lifespan: 180,
      frequency: 25,
      blendMode: 'ADD',
      emitting:  false,
    }).setDepth(8);

    // Jetpack exhaust smoke — intentionally uses 'pixel' (1×1 square) for blocky wispy look;
    // switching to 'flare' would produce an undesirable ~110px soft circle per particle
    this.jetpackSmoke = scene.add.particles(0, 0, 'pixel', {
      speed:     { min: 10, max: 40 },
      angle:     { min: 60, max: 120 }, // downward spread
      scale:     { start: 3.5, end: 0 },
      alpha:     { start: 0.22, end: 0 },
      tint:      [0xaaaaaa, 0x888888, 0xcccccc, 0xffffff],
      lifespan:  700,
      frequency: 35,
      blendMode: Phaser.BlendModes.NORMAL,
      emitting:  false,
    }).setDepth(7); // behind flame (depth 8,9), above background

    // Nanite heal emitters
    this.naniteAmbient = scene.add.particles(this.x, this.y - 56, 'flare', {
      tint: [0x00ff88, 0x44ffcc, 0x00ccff],
      speed: { min: 20, max: 50 },
      angle: { min: 250, max: 290 },
      lifespan: 800,
      scale: { start: 0.8, end: 0 },
      frequency: 60,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(9);

    this.naniteSpark = scene.add.particles(this.x, this.y - 56, 'flare', {
      tint: [0x00ffff, 0xffffff],
      speed: { min: 60, max: 120 },
      angle: { min: 0, max: 360 },
      lifespan: 300,
      scale: { start: 1, end: 0 },
      quantity: 6,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(9);

    // Nanite Q key listener
    this.keyQ.on('down', () => {
      if (!this.naniteActive && this.naniteCooldown <= 0 && this.hp < this.maxHp && !this.dead && this.piloting) {
        this.naniteActive = true;
        this.naniteHealElapsed = 0;
        this.naniteHealStart = this.hp;
        this.startNaniteParticles();
      }
    });
  }

  update(time: number, delta: number): void {
    if (this.dead) return;
    if (!this.piloting) return; // mech frozen while pilot is on foot

    const body = this.body as Phaser.Physics.Arcade.Body;
    this.onGround = body.blocked.down;

    const left  = this.cursors.left.isDown  || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const space = this.keySpace.isDown;

    // --- Horizontal movement ---
    if (left) {
      body.setVelocityX(-this.walkSpeed);
      this.setFlipX(true);
    } else if (right) {
      body.setVelocityX(this.walkSpeed);
      this.setFlipX(false);
    } else {
      body.setVelocityX(body.velocity.x * FRICTION);
    }

    // --- Jump / Jetpack ---
    if (space) {
      if (this.onGround && Phaser.Input.Keyboard.JustDown(this.keySpace)) {
        body.setVelocityY(this.jumpVelocity);
        this.playAnim('jump_start');
        this.scene.audio.play('jump');
      } else if (!this.onGround && this.jetpackFuel > 0) {
        this.jetpackFuel -= delta;
        body.setAccelerationY(this.jetpackAccel);
        body.velocity.y = Math.max(body.velocity.y, -200);
        this.scene.events.emit('jetpackFuel', this.jetpackFuel, this.jetpackMaxFuel);
        this.scene.audio.startLoop('jetpack');
      }
    } else {
      body.setAccelerationY(0);
      this.scene.audio.stopLoop('jetpack');
      if (this.onGround && this.jetpackFuel < this.jetpackMaxFuel) {
        this.jetpackFuel = Math.min(this.jetpackMaxFuel, this.jetpackFuel + delta * 0.6);
        this.scene.events.emit('jetpackFuel', this.jetpackFuel, this.jetpackMaxFuel);
      }
    }

    // --- Jetpack flame ---
    // Must be before hurtLock guard so flame turns off during hurt animation
    const jetpackActive = space && !this.onGround && this.jetpackFuel > 0;
    const thrustX = this.x + (this.flipX ? 12 : -12); // behind mech
    const thrustY = this.y - 60;                        // ~53% up from feet
    this.jetpackInner.setPosition(thrustX, thrustY);
    // setEmitting() not declared in Phaser 3.80 types; direct property assignment is correct
    this.jetpackInner.emitting = jetpackActive;
    this.jetpackOuter.setPosition(thrustX, thrustY);
    this.jetpackOuter.emitting = jetpackActive;
    this.jetpackSmoke.setPosition(thrustX, thrustY);
    this.jetpackSmoke.emitting = jetpackActive;

    // --- Hurt timeout ---
    if (this.hurtLock > 0) {
      this.hurtLock -= delta;
      return; // freeze input while hurt
    }

    // --- Animation state ---
    this.updateAnim(body);

    // --- Weapons ---
    this.rapidGun.update(time, !this.flipX);
    this.missile.update(time, delta);

    if (Phaser.Input.Keyboard.JustDown(this.keyShift)) {
      this.missile.fire(this);
    }

    // Emit weapon cooldowns + fuel to HUD
    this.scene.events.emit('missileCooldown', this.missile.getCooldownProgress());
    this.scene.events.emit('turretCooldown', this.turret.getCooldownProgress(time));
    this.scene.events.emit('jetpackFuel', this.jetpackFuel, this.jetpackMaxFuel);

    // ── Nanite heal ──────────────────────────────────────────────────
    if (this.naniteActive) {
      this.naniteHealElapsed += delta;
      const progress = Math.min(this.naniteHealElapsed / NANITE_HEAL_DURATION, 1);
      this.hp = Math.min(this.naniteHealStart + NANITE_HEAL_AMOUNT * progress, this.maxHp);
      this.scene.events.emit('healthChange', this.hp, this.maxHp);
      this.scene.events.emit('naniteChange', 'active', progress);
      this.naniteAmbient.setPosition(this.x, this.y - 56);
      if (progress >= 1) {
        this.naniteActive = false;
        this.naniteCooldown = NANITE_COOLDOWN;
        this.stopNaniteParticles();
      }
    } else if (this.naniteCooldown > 0) {
      this.naniteCooldown = Math.max(0, this.naniteCooldown - delta);
      const cdProgress = 1 - this.naniteCooldown / NANITE_COOLDOWN;
      this.scene.events.emit('naniteChange', 'cooldown', cdProgress);
    } else {
      this.scene.events.emit('naniteChange', 'ready', 1);
    }
  }

  private updateAnim(body: Phaser.Physics.Arcade.Body): void {
    if (!this.onGround) {
      this.playAnim('jump_loop');
      return;
    }

    const vx = Math.abs(body.velocity.x);
    // walkSpeed baseline; keep run threshold well above it so walk anim plays during normal movement
    if (vx > this.walkSpeed * 1.4) {
      this.playAnim('run');
    } else if (vx > 15) {
      this.playAnim('walk');
    } else {
      this.playAnim('idle');
    }
  }

  private playAnim(key: AnimState): void {
    if (this.curAnim === key) return;
    this.curAnim = key;
    this.play({ key: this.animPrefix + key, repeat: -1 }, true);
  }

  private startNaniteParticles(): void {
    this.naniteAmbient.start();
    // Spark burst every 600ms
    this.naniteSparkEvent = this.scene.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        if (this.naniteActive) {
          this.naniteSpark.emitParticle(6, this.x, this.y - 56);
        }
      },
    });
  }

  private stopNaniteParticles(): void {
    this.naniteAmbient.stop();
    if (this.naniteSparkEvent) {
      this.naniteSparkEvent.remove();
      this.naniteSparkEvent = null;
    }
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

  isDead(): boolean {
    return this.dead;
  }

  isHurtLocked(): boolean {
    return this.hurtLock > 0;
  }

  eject(): { x: number; y: number } {
    this.piloting = false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    body.moves = false;                // freeze mech in place (even mid-air)
    body.setCollideWorldBounds(false); // prevent spurious world-bounds events while frozen
    this.setAlpha(0.45);               // dark/idle visual — mech "goes dark"
    this.play({ key: this.animPrefix + 'idle', repeat: -1 }, true);
    this.jetpackInner.emitting = false;
    this.jetpackOuter.emitting = false;
    this.scene.audio.stopLoop('jetpack');
    // Spawn pilot 20px to the side and just above the mech top.
    // displayHeight at scale 0.75 = 112.5px; +8px margin clears the sprite.
    const spawnX = this.x + (this.flipX ? -20 : 20);
    const spawnY = this.y - (this.displayHeight + 8);
    return { x: spawnX, y: spawnY };
  }

  reenter(): void {
    this.piloting = true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.moves = true;
    body.setCollideWorldBounds(true);
    this.setAlpha(1);
  }

  takeDamage(amount: number): void {
    if (this.dead || this.hurtLock > 0) {
      this.scene.audio.stopLoop('jetpack'); // stop loop even on early return
      return;
    }
    this.scene.audio.stopLoop('jetpack'); // stop loop on new damage (hurt + death branches)
    if (this.naniteActive) {
      this.naniteActive = false;
      this.naniteCooldown = NANITE_COOLDOWN;
      this.stopNaniteParticles();
      this.scene.events.emit('naniteChange', 'cooldown', 0);
    }
    this.hp = Math.max(0, this.hp - amount);
    this.scene.events.emit('healthChange', this.hp, this.maxHp);

    if (this.hp <= 0) {
      this.dead = true;
      this.jetpackInner.emitting = false;
      this.jetpackOuter.emitting = false;
      this.scene.audio.stopLoop('jetpack'); // safety belt — no-op if already stopped
      this.play(this.animPrefix + 'death');
      this.scene.audio.play('death');
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      body.setAcceleration(0, 0);
      this.scene.time.delayedCall(1500, () => {
        this.scene.events.emit('gameOver');
      });
    } else {
      this.hurtLock = 600;
      this.play({ key: this.animPrefix + 'hurt', repeat: 0 }, true);
      this.curAnim = 'hurt';
      this.setTint(0xff4444);
      this.scene.time.delayedCall(200, () => this.clearTint());
      this.scene.audio.play('hurt');
    }
  }

  destroy(fromScene?: boolean): void {
    this.stopNaniteParticles();
    this.jetpackInner.destroy();
    this.jetpackOuter.destroy();
    this.naniteAmbient.destroy();
    this.naniteSpark.destroy();
    super.destroy(fromScene);
  }
}
