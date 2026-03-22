import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { RapidGun } from '../weapons/RapidGun';
import { Turret } from '../weapons/Turret';
import { HomingMissile } from '../weapons/HomingMissile';

type AnimState = 'idle' | 'walk' | 'run' | 'jump_loop' | 'jump_start' | 'jump_land' | 'hurt' | 'death';

const WALK_SPEED = 220;
const RUN_SPEED = 350;
const JUMP_VEL = -510;
const JETPACK_FORCE = -920;
const JETPACK_MAX_FUEL = 2200; // ms
const FRICTION = 0.78;

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  hp = 5;
  readonly maxHp = 5;

  private curAnim: AnimState = 'idle';
  private onGround = false;
  private jetpackFuel = JETPACK_MAX_FUEL;
  private hurtLock = 0;
  private dead = false;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private keySpace: Phaser.Input.Keyboard.Key;
  private keyShift: Phaser.Input.Keyboard.Key;

  private rapidGun: RapidGun;
  private turret: Turret;
  private missile: HomingMissile;

  private jetpackInner!: Phaser.GameObjects.Particles.ParticleEmitter;
  private jetpackOuter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, 'mech');
    this.scene = scene;

    this.setOrigin(0.5, 1); // feet at position
    this.setScale(0.75);
    this.setDepth(10);

    const kb = scene.input.keyboard!;
    this.cursors   = kb.createCursorKeys();
    this.keyA      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD      = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyShift  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    this.rapidGun = new RapidGun(scene);
    this.turret   = new Turret(scene);
    this.missile  = new HomingMissile(scene);

    // Left-click: turret fire
    scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.dead) return;
      if (ptr.leftButtonDown()) {
        const wp = scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
        this.turret.fire(this.x, this.y, wp.x, wp.y, scene.time.now);
      }
    });

    // Prevent context menu on right-click
    scene.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.play('idle');

    // Jetpack flame emitters — orange core + cyan outer glow
    this.jetpackInner = scene.add.particles(0, 0, 'pixel', {
      speed:    { min: 60, max: 120 },
      angle:    { min: 80, max: 100 },  // downward ±10°
      scale:    { start: 2.5, end: 0 },
      alpha:    { start: 1, end: 0 },
      tint:     [0xff6600, 0xff2200, 0xffaa00],
      lifespan: 120,
      frequency: 20,
      blendMode: 'ADD',
      emitting:  false,
    }).setDepth(9);

    this.jetpackOuter = scene.add.particles(0, 0, 'pixel', {
      speed:    { min: 40, max: 90 },
      angle:    { min: 65, max: 115 }, // downward ±25°
      scale:    { start: 3, end: 0 },
      alpha:    { start: 0.7, end: 0 },
      tint:     [0x00aaff, 0x0044ff, 0x44eeff],
      lifespan: 180,
      frequency: 25,
      blendMode: 'ADD',
      emitting:  false,
    }).setDepth(8);
  }

  update(time: number, delta: number): void {
    if (this.dead) return;

    const body = this.body as Phaser.Physics.Arcade.Body;
    this.onGround = body.blocked.down;

    const left  = this.cursors.left.isDown  || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const space = this.keySpace.isDown;

    // --- Horizontal movement ---
    if (left) {
      body.setVelocityX(-WALK_SPEED);
      this.setFlipX(true);
    } else if (right) {
      body.setVelocityX(WALK_SPEED);
      this.setFlipX(false);
    } else {
      body.setVelocityX(body.velocity.x * FRICTION);
    }

    // --- Jump / Jetpack ---
    if (space) {
      if (this.onGround && Phaser.Input.Keyboard.JustDown(this.keySpace)) {
        body.setVelocityY(JUMP_VEL);
        this.playAnim('jump_start');
        this.scene.audio.play('jump');
      } else if (!this.onGround && this.jetpackFuel > 0) {
        this.jetpackFuel -= delta;
        body.setAccelerationY(JETPACK_FORCE);
        body.velocity.y = Math.max(body.velocity.y, -200);
        this.scene.events.emit('jetpackFuel', this.jetpackFuel, JETPACK_MAX_FUEL);
      }
    } else {
      body.setAccelerationY(0);
      if (this.onGround && this.jetpackFuel < JETPACK_MAX_FUEL) {
        this.jetpackFuel = Math.min(JETPACK_MAX_FUEL, this.jetpackFuel + delta * 0.6);
        this.scene.events.emit('jetpackFuel', this.jetpackFuel, JETPACK_MAX_FUEL);
      }
    }

    // --- Jetpack flame ---
    // Must be before hurtLock guard so flame turns off during hurt animation
    const jetpackActive = space && !this.onGround && this.jetpackFuel > 0;
    const thrustX = this.x + (this.flipX ? 12 : -12); // behind mech
    const thrustY = this.y - 60;                        // ~53% up from feet
    this.jetpackInner.setPosition(thrustX, thrustY);
    this.jetpackInner.emitting = jetpackActive;
    this.jetpackOuter.setPosition(thrustX, thrustY);
    this.jetpackOuter.emitting = jetpackActive;

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
    this.scene.events.emit('jetpackFuel', this.jetpackFuel, JETPACK_MAX_FUEL);
  }

  private updateAnim(body: Phaser.Physics.Arcade.Body): void {
    if (!this.onGround) {
      this.playAnim('jump_loop');
      return;
    }

    const vx = Math.abs(body.velocity.x);
    if (vx > RUN_SPEED * 0.6) {
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
    this.play({ key, repeat: -1 }, true);
  }

  isDead(): boolean {
    return this.dead;
  }

  takeDamage(amount: number): void {
    if (this.dead || this.hurtLock > 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.scene.events.emit('healthChange', this.hp, this.maxHp);

    if (this.hp <= 0) {
      this.dead = true;
      this.play('death');
      this.scene.audio.play('death');
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      body.setAcceleration(0, 0);
      this.scene.time.delayedCall(1500, () => {
        this.scene.events.emit('gameOver');
      });
    } else {
      this.hurtLock = 600;
      this.play({ key: 'hurt', repeat: 0 }, true);
      this.curAnim = 'hurt';
      this.setTint(0xff4444);
      this.scene.time.delayedCall(200, () => this.clearTint());
      this.scene.audio.play('hurt');
    }
  }

  destroy(fromScene?: boolean): void {
    this.jetpackInner.destroy();
    this.jetpackOuter.destroy();
    super.destroy(fromScene);
  }
}
