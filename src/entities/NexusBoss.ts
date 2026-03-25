import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Drone } from './Drone';

interface DroneScaling {
  attackSpeed: number;
  shootInterval: number;
  extraHp: number;
  bulletSpeedMult: number;
}

type BossState = 'DRIFT' | 'CHARGE' | 'FIRE' | 'HURT' | 'DEATH';

const HP             = 18;
const SCALE          = 4.5;
const DRIFT_SPEED    = 50;
const CHARGE_MS      = 1200;
const DRIFT_MS       = 1800;
const BULLET_SPEED   = 280;
const SPREAD_ANGLES  = [-20, 0, 20] as const;
const ESCORT_RESPAWN = 20000;

export class NexusBoss extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private bossState: BossState = 'DRIFT';
  private hp: number;
  private driftDir = -1;
  private phaseTimer = 0;
  private escorts: (Drone | null)[] = [null, null];
  private scaling: DroneScaling;
  private level: number;

  constructor(scene: GameScene, x: number, y: number, scaling: DroneScaling, level = 1) {
    super(scene, x, y, 'nexus');
    this.scene   = scene;
    this.scaling = scaling;
    this.level   = level;

    // Apply L2 multiplier to boss own stats
    if (level === 2) {
      this.scaling = {
        ...scaling,
        attackSpeed:   Math.round(scaling.attackSpeed   * 1.2),
        shootInterval: Math.round(scaling.shootInterval * 0.85),
      };
    }

    this.hp = level === 2 ? Math.round(HP * 1.2) : HP;
    this.setOrigin(0.5, 0.5);
    this.setScale(SCALE);
    this.setDepth(10);
    this.play('nexus-hover');

    // Spawn escorts after a short delay to let physics settle
    scene.time.delayedCall(500, () => this.spawnEscort(0));
    scene.time.delayedCall(800, () => this.spawnEscort(1));
  }

  // Called after physics.add.existing(this)
  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(20, 22, true);
    body.setCollideWorldBounds(true);
  }

  private spawnEscort(slot: number): void {
    if (this.bossState === 'DEATH') return;
    if (!this.active) return;

    const dx  = slot === 0 ? -120 : 120;
    const escort = new Drone(
      this.scene,
      this.x + dx,
      this.y,
      'drone-red',
      this.scaling,
      'normal',
    );
    this.scene.add.existing(escort);
    this.scene.physics.add.existing(escort);
    this.scene.drones.add(escort);

    const body = escort.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    escort.startPatrol(-1);

    // Register bullet overlaps for escort (same as DroneSpawner pattern)
    this.scene.physics.add.overlap(
      this.scene.playerBullets,
      escort,
      (e, bullet) => {
        const b = bullet as Phaser.Physics.Arcade.Image;
        b.setActive(false).setVisible(false);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
        (e as unknown as Drone).takeDamage(1);
        this.scene.audio.play('hit');
        this.scene.spawnFloatingText((e as Phaser.GameObjects.Sprite).x, (e as Phaser.GameObjects.Sprite).y - 20, '-1', '#ffffff');
      },
    );
    this.scene.physics.add.overlap(
      this.scene.missiles,
      escort,
      (e, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnExplosion(m.x, m.y);
        (e as unknown as Drone).takeDamage(3);
        this.scene.cameras.main.shake(150, 0.01);
        this.scene.audio.play('explosion');
        this.scene.spawnFloatingText((e as Phaser.GameObjects.Sprite).x, (e as Phaser.GameObjects.Sprite).y - 20, '-3', '#ffff00');
      },
    );

    this.escorts[slot] = escort;

    // Respawn logic — check if escort died
    const checkRespawn = () => {
      if (this.bossState === 'DEATH' || !this.active) return;
      if (!escort.active) {
        this.escorts[slot] = null;
        this.scene.time.delayedCall(ESCORT_RESPAWN, () => {
          if (this.bossState !== 'DEATH' && this.active) {
            this.spawnEscort(slot);
          }
        });
      } else {
        this.scene.time.delayedCall(1000, checkRespawn);
      }
    };
    this.scene.time.delayedCall(1000, checkRespawn);
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.bossState === 'DEATH') return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    switch (this.bossState) {
      case 'DRIFT': {
        body.setVelocityX(this.driftDir * DRIFT_SPEED);
        // Reverse at camera ±500px from centre
        const camCentreX = this.scene.cameras.main.scrollX + 640;
        if (this.x < camCentreX - 500) this.driftDir = 1;
        if (this.x > camCentreX + 500) this.driftDir = -1;
        this.setFlipX(this.driftDir > 0);

        this.phaseTimer -= delta;
        if (this.phaseTimer <= 0) {
          this.setBossState('CHARGE');
        }
        break;
      }

      case 'CHARGE': {
        body.setVelocityX(0);
        this.phaseTimer -= delta;
        if (this.phaseTimer <= 0) {
          this.fire();
          this.setBossState('FIRE');
        }
        break;
      }

      case 'FIRE':
        // Transition handled in fire() via delayedCall
        break;

      case 'HURT':
        break;
    }
  }

  private fire(): void {
    const target = this.scene.getPilotOrPlayer();
    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);

    for (const offsetDeg of SPREAD_ANGLES) {
      const angle = baseAngle + Phaser.Math.DegToRad(offsetDeg);
      const b = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image;
      if (!b) continue;
      b.setActive(true).setVisible(true).setDepth(14);
      b.setBlendMode(Phaser.BlendModes.ADD);
      const body = b.body as Phaser.Physics.Arcade.Body;
      if (body) {
        body.enable = true;
        // Enable bouncing in L2
        if (this.level === 2) {
          body.setCollideWorldBounds(true);
          body.setBounce(1, 1);
          (body as Phaser.Physics.Arcade.Body).onWorldBounds = true;
          b.setData('bounces', 0);
        }
      }
      b.setVelocity(
        Math.cos(angle) * BULLET_SPEED,
        Math.sin(angle) * BULLET_SPEED,
      );
    }

    // Boss fire sound — modulated drone-shoot (fat low blast)
    this.scene.audio.playAt('drone-shoot', { rate: 0.65, detune: -300, volume: 0.55 });
    this.scene.cameras.main.shake(80, 0.005);

    // Return to DRIFT after attack animation completes
    this.scene.time.delayedCall(600, () => {
      if (this.bossState !== 'DEATH') this.setBossState('DRIFT');
    });
  }

  takeDamage(amount: number): void {
    if (this.bossState === 'DEATH' || this.bossState === 'HURT') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.setBossState('DEATH');
    } else {
      this.setBossState('HURT');
    }
  }

  private setBossState(newState: BossState): void {
    if (this.bossState === 'DEATH') return;
    this.bossState = newState;

    switch (newState) {
      case 'DRIFT':
        this.play('nexus-hover');
        this.phaseTimer = DRIFT_MS;
        break;

      case 'CHARGE':
        this.play('nexus-charge');
        this.phaseTimer = CHARGE_MS;
        // Telegraph sound — deep rumble
        this.scene.audio.playAt('hurt', { rate: 0.5, detune: -200, volume: 0.5 });
        break;

      case 'FIRE':
        this.play('nexus-attack');
        break;

      case 'HURT':
        this.play('nexus-hurt');
        this.setTint(0xff8888);
        this.scene.audio.playAt('hurt', { rate: 0.6, detune: -400, volume: 0.85 });
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.clearTint();
          if (this.bossState === 'HURT') this.setBossState('DRIFT');
        });
        break;

      case 'DEATH': {
        this.play('nexus-death');
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        (this.body as Phaser.Physics.Arcade.Body).enable = false;

        // Three staggered explosions
        const offsets = [{ x: 0, y: 0 }, { x: -40, y: 20 }, { x: 35, y: -15 }];
        offsets.forEach((off, i) => {
          this.scene.time.delayedCall(i * 150, () => {
            this.scene.spawnExplosion(this.x + off.x, this.y + off.y);
            this.scene.audio.playAt('explosion', {
              rate: 0.5,
              detune: -200 - i * 200,
              volume: 0.9,
            });
          });
        });
        // Final death stinger
        this.scene.time.delayedCall(400, () => {
          this.scene.audio.playAt('death', { rate: 0.4, detune: -400, volume: 0.7 });
        });

        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('bossKilled', this.x, this.y);
          this.destroy();
        });
        break;
      }
    }
  }
}
