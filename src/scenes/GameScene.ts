import Phaser from 'phaser';
import { Player } from '../entities/Player';
import type { MechType } from '../entities/Player';
import { Pilot } from '../entities/Pilot';
import { DroneSpawner } from '../systems/DroneSpawner';
import { AudioSystem } from '../systems/AudioSystem';
import { WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT, PLATFORM_BANDS } from '../constants';

export class GameScene extends Phaser.Scene {
  player!: Player;
  pilot: Pilot | null = null;
  playerBullets!: Phaser.Physics.Arcade.Group;
  droneBullets!: Phaser.Physics.Arcade.Group;
  missiles!: Phaser.Physics.Arcade.Group;
  drones!: Phaser.Physics.Arcade.Group;
  audio!: AudioSystem;
  score = 0;
  platformData: { x: number; y: number; w: number }[] = [];
  private isGameOver = false;
  private pilotGroundCollider: Phaser.Physics.Arcade.Collider | null = null;
  private pilotBulletOverlap:  Phaser.Physics.Arcade.Collider | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private spawner!: DroneSpawner;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;

  constructor() {
    super({ key: 'Game' });
  }

  init(data: { mechType?: MechType }): void {
    // On first start, MechSelectScene passes mechType via scene data.
    // On restart (R key), data is empty — registry value is intentionally preserved.
    if (data.mechType) {
      this.registry.set('mechType', data.mechType);
    }
  }

  create(): void {
    this.audio = new AudioSystem();

    // Input keys for pilot (Phaser deduplicates — safe alongside Player's own captures)
    const kb = this.input.keyboard!;
    this.cursors  = kb.createCursorKeys();
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Pilot sphere placeholder texture
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('pilot_sphere', 16, 16);
    g.destroy();

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);

    // --- Background ---
    this.makeBackground();

    // --- Ground ---
    this.ground = this.physics.add.staticGroup();
    const groundRect = this.add.rectangle(
      WORLD_WIDTH / 2,
      GROUND_Y + GROUND_HEIGHT / 2,
      WORLD_WIDTH,
      GROUND_HEIGHT,
      0x1a1a3a,
    ).setDepth(4);
    this.ground.add(groundRect);

    // Ground surface glow line
    this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 1, WORLD_WIDTH, 2, 0x4444cc).setDepth(5);

    // --- Platforms ---
    this.makePlatforms();

    // --- Physics groups ---
    this.playerBullets = this.physics.add.group({
      defaultKey: 'bullet-rapid',
      maxSize: 120,
      runChildUpdate: false,
      allowGravity: false,
    });

    this.droneBullets = this.physics.add.group({
      defaultKey: 'bullet-drone',
      maxSize: 60,
      runChildUpdate: false,
      allowGravity: false,
    });

    this.missiles = this.physics.add.group({
      defaultKey: 'bullet-missile',
      maxSize: 6,
      runChildUpdate: false,
      allowGravity: false,
    });

    this.drones = this.physics.add.group({ runChildUpdate: true });

    // --- Player ---
    // Origin (0.5, 1) → feet at position y. Start 5px above ground.
    const mechType = (this.registry.get('mechType') as MechType) ?? 'mech';
    this.player = new Player(this, 300, GROUND_Y - 5, mechType);
    this.add.existing(this.player);
    this.physics.add.existing(this.player);

    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const bc = this.player.bodyConfig;
    pb.setSize(bc.w, bc.h, false);
    pb.setOffset(bc.offX, bc.offY);
    pb.setCollideWorldBounds(true);
    pb.setMaxVelocityX(400);

    // Player lands on ground
    this.physics.add.collider(this.player, this.ground);

    // Drone bullets hit player
    this.physics.add.overlap(
      this.droneBullets,
      this.player,
      (playerObj, b) => {
        const bullet = b as Phaser.Physics.Arcade.Image;
        bullet.setActive(false).setVisible(false);
        if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
        (playerObj as Player).takeDamage(1);
      },
    );

    // --- Camera ---
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.08);

    // --- Spawner ---
    this.spawner = new DroneSpawner(this);

    // --- Score tracking ---
    this.events.on('droneKilled', () => {
      this.score += 100;
      this.events.emit('scoreChange', this.score);
    });

    this.events.on('gameOver', () => {
      this.isGameOver = true;
    });

    // --- Emit initial HUD state ---
    this.events.emit('healthChange', this.player.hp, this.player.maxHp);
    this.events.emit('missileCooldown', 0);
    this.events.emit('turretCooldown', 1);
    this.events.emit('jetpackFuel', 1, 1);
    this.events.emit('scoreChange', 0);

    // --- Eject / reenter (E key) ---
    this.input.keyboard!.on('keydown-E', () => {
      if (this.isGameOver) return;
      if (this.pilot) {
        // Reenter mech if close enough
        const mechCenterY = this.player.y - 56;
        const dist = Phaser.Math.Distance.Between(this.pilot.x, this.pilot.y, this.player.x, mechCenterY);
        if (dist < 80) {
          this.pilotGroundCollider?.destroy();
          this.pilotBulletOverlap?.destroy();
          this.pilotGroundCollider = null;
          this.pilotBulletOverlap  = null;
          this.pilot.destroy();
          this.pilot = null;
          this.player.reenter();
          this.cameras.main.startFollow(this.player, true, 0.12, 0.08);
        }
      } else {
        if (this.player.isDead() || this.player.isHurtLocked()) return;
        const spawnPos = this.player.eject();
        this.pilot = new Pilot(this, spawnPos.x, spawnPos.y);
        this.cameras.main.startFollow(this.pilot, true, 0.12, 0.08);
        this.pilotGroundCollider = this.physics.add.collider(this.pilot, this.ground);
        this.pilotBulletOverlap = this.physics.add.overlap(
          this.droneBullets,
          this.pilot,
          (_pilotObj, bulletObj) => {
            if (!this.pilot?.active) return;
            const bullet = bulletObj as Phaser.Physics.Arcade.Image;
            bullet.setActive(false).setVisible(false);
            if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
            this.triggerGameOver();
          },
        );
      }
    });
  }

  update(time: number, delta: number): void {
    if (this.isGameOver) return;
    this.player.update(time, delta);
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    this.audio.update({
      onGround: pb.blocked.down,
      moving: Math.abs(pb.velocity.x) > 10,
      delta,
    });
    if (this.pilot?.active) this.pilot.update(this.cursors, this.spaceKey, delta);
    this.spawner.update(time, delta);
    this.cullBullets();
    this.updateParallax();
  }

  public triggerGameOver(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.events.emit('gameOver');
  }

  public getPilotOrPlayer(): { x: number; y: number } {
    if (this.pilot?.active) return { x: this.pilot.x, y: this.pilot.y };
    return { x: this.player.x, y: this.player.y };
  }

  spawnExplosion(x: number, y: number): void {
    const emitter = this.add.particles(x, y, 'pixel', {
      speed: { min: 80, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: 3, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffaa00, 0xff4400, 0xffffff, 0xffff00],
      lifespan: 450,
      quantity: 14,
      blendMode: 'ADD',
    });
    emitter.setDepth(20);
    this.time.delayedCall(500, () => emitter.destroy());
  }

  private makeBackground(): void {
    // Solid deep space — fixed to screen
    this.add.rectangle(640, 360, 1280, 720, 0x030318).setDepth(0).setScrollFactor(0);

    // Generate star textures
    const makeStar = (count: number, size: number, alpha: number, key: string) => {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xffffff, alpha);
      for (let i = 0; i < count; i++) {
        gfx.fillRect(
          Phaser.Math.Between(0, 1280),
          Phaser.Math.Between(0, GROUND_Y),
          size, size,
        );
      }
      gfx.generateTexture(key, 1280, GROUND_Y);
      gfx.destroy();
    };

    makeStar(160, 1, 0.4, 'stars-far');
    makeStar(60, 2, 0.7, 'stars-near');

    this.bgFar  = this.add.tileSprite(640, GROUND_Y / 2, 1280, GROUND_Y, 'stars-far').setDepth(1).setScrollFactor(0);
    this.bgNear = this.add.tileSprite(640, GROUND_Y / 2, 1280, GROUND_Y, 'stars-near').setDepth(2).setScrollFactor(0);
  }

  private updateParallax(): void {
    const sx = this.cameras.main.scrollX;
    this.bgFar.setTilePosition(sx * 0.15, 0);
    this.bgNear.setTilePosition(sx * 0.45, 0);
  }

  private makePlatforms(): void {
    this.platformData = [];

    // Deterministic hash: maps any integer to a stable float in [0, 1)
    const hash = (n: number): number =>
      ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    const configs = [
      { ...PLATFORM_BANDS[0], count: 15, minW: 100, maxW: 160 },
      { ...PLATFORM_BANDS[1], count: 12, minW:  80, maxW: 130 },
      { ...PLATFORM_BANDS[2], count:  8, minW:  60, maxW: 100 },
    ];

    configs.forEach(({ yMin, yMax, count, minW, maxW }, bandIdx) => {
      const span = 5600; // x from 400 to 6000
      const spacing = span / count;
      let lastX = 200; // initialised to start-of-span minus min-gap so i=0 is consistent

      for (let i = 0; i < count; i++) {
        const seed = bandIdx * 100 + i;
        const rawX = 400 + i * spacing + hash(seed) * spacing * 0.6;
        const w = minW + hash(seed + 2000) * (maxW - minW);
        // Enforce 200px minimum gap between adjacent platforms in this band
        const x = Math.min(
          i === 0 ? rawX : Math.max(lastX + 200, rawX),
          6000 - w / 2,
        );
        lastX = x;
        const y = yMin + hash(seed + 1000) * (yMax - yMin);
        this.platformData.push({ x, y, w });
        this.addPlatform(x, y, w);
      }
    });
  }

  private addPlatform(x: number, y: number, w: number): void {
    const h = 8;
    const rect = this.add.rectangle(x, y, w, h, 0x2a2a5a).setDepth(4);
    this.ground.add(rect);

    // One-way: only the top surface blocks the player
    const body = rect.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down  = false;
    body.checkCollision.left  = false;
    body.checkCollision.right = false;

    // Glow line — intentionally slightly lighter than ground glow (0x4444cc)
    this.add.rectangle(x, y - h / 2 + 1, w, 2, 0x5555dd).setDepth(5);
  }

  private cullBullets(): void {
    const cam = this.cameras.main;
    const minX = cam.scrollX - 100;
    const maxX = cam.scrollX + 1380;
    const maxY = 820;

    const cull = (group: Phaser.Physics.Arcade.Group) => {
      group.getChildren().forEach((go) => {
        const obj = go as Phaser.Physics.Arcade.Image;
        if (!obj.active) return;
        if (obj.x < minX || obj.x > maxX || obj.y > maxY || obj.y < -50) {
          obj.setActive(false).setVisible(false);
          if (obj.body) (obj.body as Phaser.Physics.Arcade.Body).enable = false;
        }
      });
    };

    cull(this.playerBullets);
    cull(this.droneBullets);
  }
}
