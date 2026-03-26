import Phaser from 'phaser';
import { Player } from '../entities/Player';
import type { MechType } from '../entities/Player';
import { Pilot } from '../entities/Pilot';
import { DroneSpawner } from '../systems/DroneSpawner';
import { AudioSystem } from '../systems/AudioSystem';
import { GAME_W, GAME_H, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT, PLATFORM_BANDS } from '../constants';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { TREE_NODES, applyTreeEffect } from '../data/upgradeTree';
import { CARD_POOL } from '../data/upgradeCards';

export class GameScene extends Phaser.Scene {
  player!: Player;
  pilot: Pilot | null = null;
  playerBullets!: Phaser.Physics.Arcade.Group;
  droneBullets!: Phaser.Physics.Arcade.Group;
  missiles!: Phaser.Physics.Arcade.Group;
  drones!: Phaser.Physics.Arcade.Group;
  crawlers!: Phaser.Physics.Arcade.Group;
  pickups!: Phaser.Physics.Arcade.Group;
  audio!: AudioSystem;
  score = 0;
  platformData: { x: number; y: number; w: number }[] = [];
  private isGameOver = false;
  private killStreak = 0;
  private prevHp = 0;
  private pilotGroundCollider: Phaser.Physics.Arcade.Collider | null = null;
  private pilotBulletOverlap:  Phaser.Physics.Arcade.Collider | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private spawner!: DroneSpawner;
  private bgStars!: Phaser.GameObjects.TileSprite;
  private bgTerrain!: Phaser.GameObjects.TileSprite;
  private bgHaze?: Phaser.GameObjects.TileSprite;
  public currentLevel = 1;
  private isBossDead = false;

  constructor() {
    super({ key: 'Game' });
  }

  init(data: { mechType?: MechType; level?: number; totalScore?: number }): void {
    if (data.mechType) this.registry.set('mechType', data.mechType);
    if (data.level !== undefined) this.registry.set('currentLevel', data.level);
    if (data.totalScore !== undefined) this.registry.set('totalScore', data.totalScore);
  }

  create(): void {
    // Reset state that persists across scene.restart() (instance is reused, not reconstructed)
    this.isGameOver   = false;
    this.killStreak   = 0;
    this.prevHp       = 0;
    this.pilot        = null;
    this.pilotGroundCollider = null;
    this.pilotBulletOverlap  = null;
    this.isBossDead      = false;
    this.bgHaze          = undefined;
    this.currentLevel    = (this.registry.get('currentLevel') as number) ?? 1;
    this.score           = (this.registry.get('totalScore')   as number) ?? 0;

    // Init ProgressionSystem once — guard against re-creation on level restart
    if (!this.registry.get('progression')) {
      this.registry.set('progression', new ProgressionSystem());
    }
    const prog = this.registry.get('progression') as ProgressionSystem;

    // isNewGame flag: set by UIScene before restart; reset run upgrades
    if (this.registry.get('isNewGame')) {
      this.registry.set('runUpgrades', [] as string[]);
      this.registry.set('isNewGame', false);
    }
    if (!this.registry.get('runUpgrades')) {
      this.registry.set('runUpgrades', [] as string[]);
    }

    this.audio?.destroy(); // close old AudioContext before creating new one
    this.audio = new AudioSystem(this.sound);

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

    // Health pack — cyan cross
    const hg = this.add.graphics();
    hg.fillStyle(0x00ffff, 1);
    hg.fillRect(5, 1, 4, 12);
    hg.fillRect(1, 5, 12, 4);
    hg.generateTexture('pickup-health', 14, 14);
    hg.destroy();

    // Fuel canister — yellow body with orange nozzle
    const fg = this.add.graphics();
    fg.fillStyle(0xffff00, 1);
    fg.fillRect(2, 3, 10, 9);
    fg.fillStyle(0xff8800, 1);
    fg.fillRect(4, 1, 6, 3);
    fg.generateTexture('pickup-fuel', 14, 14);
    fg.destroy();

    if (this.currentLevel === 2) {
      this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      this.makeBackgroundL2();
      this.makeGroundL2();
      this.makePlatforms('purple', { low: 18, mid: 15, high: 10 });
    } else {
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
      this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 1, WORLD_WIDTH, 2, 0x4444cc).setDepth(5);

      // --- Platforms ---
      this.makePlatforms();
    }

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

    this.crawlers = this.physics.add.group({ runChildUpdate: true });

    this.pickups = this.physics.add.group({
      maxSize: 20,
      runChildUpdate: false,
      allowGravity: false,
    });

    // --- Player ---
    // Origin (0.5, 1) → feet at position y. Start 5px above ground.
    const mechType = (this.registry.get('mechType') as MechType) ?? 'mech';
    const spawnY = GROUND_Y - 5; // same for both levels — L2 is now a surface level
    this.player = new Player(this, 300, spawnY, mechType);
    this.add.existing(this.player);
    this.physics.add.existing(this.player);

    // Apply persistent tree upgrades
    for (const id of prog.ownedNodes) {
      const node = TREE_NODES.find(n => n.id === id);
      if (node) applyTreeEffect(this.player, node.effect);
    }

    // Re-apply per-run card upgrades (survive L1→L2 transition)
    const runUpgrades = (this.registry.get('runUpgrades') as string[]) ?? [];
    for (const id of runUpgrades) {
      const card = CARD_POOL.find(c => c.id === id);
      if (card) card.apply(this.player);
    }

    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const bc = this.player.bodyConfig;
    pb.setSize(bc.w, bc.h, false);
    pb.setOffset(bc.offX, bc.offY);
    pb.setCollideWorldBounds(true);
    pb.setMaxVelocityX(400);

    // Player lands on ground
    this.physics.add.collider(this.player, this.ground);

    // Crawlers land on ground
    this.physics.add.collider(this.crawlers, this.ground);

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

    // Pickups collected by mech
    this.physics.add.overlap(
      this.pickups,
      this.player,
      (_p, pickup) => {
        const pk = pickup as Phaser.Physics.Arcade.Image;
        if (!pk.active) return;
        pk.setActive(false).setVisible(false);
        if (pk.body) (pk.body as Phaser.Physics.Arcade.Body).enable = false;
        if (pk.getData('type') === 'health') {
          this.player.heal(1);
        } else {
          this.player.restoreJetpackFuel(1000);
        }
        this.audio.play('pickup');
      },
    );

    // --- Camera ---
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, false, 0.12, 0.08);

    // --- Spawner ---
    this.spawner = new DroneSpawner(this);

    // --- Score tracking + kill streak + pickups ---
    const STREAK_MILESTONES = [3, 5, 10, 20];
    const STREAK_BONUSES    = [50, 100, 150, 200];

    this.events.on('droneKilled', (x: number, y: number) => {
      this.score += 100;
      this.events.emit('scoreChange', this.score);

      // Kill streak milestone check
      this.killStreak++;
      const milestoneIdx = STREAK_MILESTONES.indexOf(this.killStreak);
      if (milestoneIdx !== -1) {
        const bonus = STREAK_BONUSES[milestoneIdx];
        this.score += bonus;
        this.events.emit('scoreChange', this.score);
        this.events.emit('killStreak', this.killStreak, bonus);
      }

      // Random pickup drop (15% health, 15% fuel)
      const roll = Math.random();
      if (roll < 0.15) {
        this.spawnPickup(x, y, 'health');
      } else if (roll < 0.30) {
        this.spawnPickup(x, y, 'fuel');
      }
    });

    // Reset kill streak on damage
    this.events.on('healthChange', (hp: number) => {
      if (hp < this.prevHp) {
        this.killStreak = 0;
      }
      this.prevHp = hp;
    });

    this.events.on('gameOver', () => {
      this.isGameOver = true;
    });

    this.events.on('bossKilled', () => {
      this.isBossDead = true;
      this.score += 1000;
      this.events.emit('scoreChange', this.score);
      // Level transition handled by UIScene listening to same event
    });

    this.events.on('waveCleared', (wave: number) => {
      // Between-wave upgrade card picker (skip for boss wave)
      if (!this.spawner.isBossWave()) {
        this.scene.launch('UpgradeCards', { wave, audio: this.audio, player: this.player });
        this.scene.pause('Game');
        this.scene.get('UpgradeCards').events.once('shutdown', () => {
          this.scene.resume('Game');
        });
      }
    });

    // --- Emit initial HUD state ---
    this.events.emit('healthChange', this.player.hp, this.player.maxHp);
    this.events.emit('missileCooldown', 0);
    this.events.emit('turretCooldown', 1);
    this.events.emit('jetpackFuel', 1, 1);
    this.events.emit('scoreChange', this.score);

    if (this.currentLevel === 2) {
      this.physics.world.off('worldbounds');
      this.physics.world.on('worldbounds', (body: Phaser.Physics.Arcade.Body) => {
        const go = body.gameObject as Phaser.Physics.Arcade.Image;
        if (!go?.active) return;
        const bounces = (go.getData('bounces') ?? 0) + 1;
        if (bounces >= 2) {
          go.setActive(false).setVisible(false);
          body.enable = false;
        } else {
          go.setData('bounces', bounces);
          this.audio.playAt('hit', { rate: 1.8, detune: 400, volume: 0.2 });
        }
      });
    }

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
          this.cameras.main.startFollow(this.player, false, 0.12, 0.08);
        }
      } else {
        if (this.player.isDead() || this.player.isHurtLocked()) return;
        this.audio.play('eject');
        const spawnPos = this.player.eject();
        this.pilot = new Pilot(this, spawnPos.x, spawnPos.y);
        this.cameras.main.startFollow(this.pilot, false, 0.12, 0.08);
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
      onGround:  pb.blocked.down,
      moving:    Math.abs(pb.velocity.x) > 10,
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

  spawnFloatingText(x: number, y: number, text: string, color = '#ffffff'): void {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '14px', color })
      .setDepth(25).setOrigin(0.5, 1);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  private spawnPickup(x: number, y: number, type: 'health' | 'fuel'): void {
    const key = type === 'health' ? 'pickup-health' : 'pickup-fuel';
    const p = this.pickups.get(x, y, key) as Phaser.Physics.Arcade.Image;
    if (!p) return;
    p.setActive(true).setVisible(true).setDepth(12).setPosition(x, y);
    p.setData('type', type);
    if (p.body) {
      const pb = p.body as Phaser.Physics.Arcade.Body;
      pb.enable = true;
      pb.setVelocity(0, 0);
    }
    // Despawn if uncollected after 6s
    this.time.delayedCall(6000, () => {
      if (p.active) {
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
      }
    });
  }

  spawnExplosion(x: number, y: number): void {
    const emitter = this.add.particles(x, y, 'flare', {
      speed: { min: 80, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.5, end: 0 },
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
    // Sky
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x030318)
      .setDepth(0).setScrollFactor(0);

    // Dedup texture keys on scene restart (instance is reused, not reconstructed)
    for (const key of ['bgStars', 'bgTerrain', 'bgHaze']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }

    // Layer 1: starfield — 420+ 1px dots, random alpha 0.25–0.55
    const starsGfx = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 420; i++) {
      starsGfx.fillStyle(0xffffff, 0.25 + Math.random() * 0.30);
      starsGfx.fillRect(
        Phaser.Math.Between(0, GAME_W - 1),
        Phaser.Math.Between(0, GROUND_Y - 1),
        1, 1,
      );
    }
    starsGfx.generateTexture('bgStars', GAME_W, GROUND_Y);
    starsGfx.destroy();
    this.bgStars = this.add.tileSprite(GAME_W / 2, GROUND_Y / 2, GAME_W, GROUND_Y, 'bgStars')
      .setDepth(1).setScrollFactor(0);

    // Layer 2: crater terrain silhouette (200px tall, bottom edge at GROUND_Y)
    // Craters are cut into the bottom edge using arc() — darker color overlaid on baseline.
    // Each crater: upper-semicircle arc (slice PI→0 clockwise) centered at y=200 (bottom edge),
    // so the bowl shape cuts upward into the terrain.
    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    const terrainGfx = this.make.graphics({ x: 0, y: 0 }, false);
    terrainGfx.fillStyle(0x0d0d1e, 1);
    terrainGfx.fillRect(0, 0, GAME_W, 200);
    for (let i = 0; i < 7; i++) {
      const cx = hash(i + 200) * GAME_W;
      const cr = 30 + hash(i + 400) * 50;
      // Center at bottom edge (y=200); upper semicircle cuts upward into terrain
      terrainGfx.fillStyle(0x070710, 1);
      terrainGfx.slice(cx, 200, cr, Math.PI, 0, false); // clockwise PI→0 = upper semicircle
      terrainGfx.fillPath();
    }
    terrainGfx.generateTexture('bgTerrain', GAME_W, 200);
    terrainGfx.destroy();
    this.bgTerrain = this.add.tileSprite(GAME_W / 2, GROUND_Y, GAME_W, 200, 'bgTerrain')
      .setDepth(2).setOrigin(0.5, 1).setScrollFactor(0);

    // Layer 3: dust haze — 8-strip vertical gradient (120px tall, bottom edge at GROUND_Y)
    const hazeGfx = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 8; i++) {
      hazeGfx.fillStyle(0x1a1a2e, (1 - i / 8) * 0.35);
      hazeGfx.fillRect(0, i * 15, GAME_W, 15);
    }
    hazeGfx.generateTexture('bgHaze', GAME_W, 120);
    hazeGfx.destroy();
    this.bgHaze = this.add.tileSprite(GAME_W / 2, GROUND_Y, GAME_W, 120, 'bgHaze')
      .setDepth(3).setOrigin(0.5, 1).setScrollFactor(0);
  }

  private makeGroundL2(): void {
    this.ground = this.physics.add.staticGroup();
    const groundRect = this.add.rectangle(
      WORLD_WIDTH / 2,
      GROUND_Y + GROUND_HEIGHT / 2,
      WORLD_WIDTH,
      GROUND_HEIGHT,
      0x0d0a20,
    ).setDepth(4);
    this.ground.add(groundRect);
    // Purple glow line (visual only — not added to physics group)
    this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 1, WORLD_WIDTH, 2, 0x6633cc).setDepth(5);
  }

  private makeBackgroundL2(): void {
    // Cold dark sky
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x010112)
      .setDepth(0).setScrollFactor(0);

    // Dedup texture keys on restart
    for (const key of ['bgStarsL2', 'bgTerrainL2']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }

    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    // Starfield — 520 dots, cold blue tint #aabbff
    const starsGfx = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 520; i++) {
      starsGfx.fillStyle(0xaabbff, 0.20 + Math.random() * 0.25);
      starsGfx.fillRect(
        Phaser.Math.Between(0, GAME_W - 1),
        Phaser.Math.Between(0, GROUND_Y - 1),
        1, 1,
      );
    }
    starsGfx.generateTexture('bgStarsL2', GAME_W, GROUND_Y);
    starsGfx.destroy();
    this.bgStars = this.add.tileSprite(GAME_W / 2, GROUND_Y / 2, GAME_W, GROUND_Y, 'bgStarsL2')
      .setDepth(1).setScrollFactor(0);

    // Jagged terrain silhouette — larger craters (arc cuts), angular peaks, cold baseline #080815
    const terrainGfx = this.make.graphics({ x: 0, y: 0 }, false);
    terrainGfx.fillStyle(0x080815, 1);
    terrainGfx.fillRect(0, 0, GAME_W, 200);
    for (let i = 0; i < 8; i++) {
      const cx = hash(i + 500) * GAME_W;
      const cr = 40 + hash(i + 700) * 60;
      // Crater: upper-semicircle arc cut into bottom edge (same pattern as L1, larger radius)
      terrainGfx.fillStyle(0x040410, 1);
      terrainGfx.slice(cx, 200, cr, Math.PI, 0, false);
      terrainGfx.fillPath();
      // Angular peak between craters — triangle protrusion from bottom edge
      const px = hash(i + 800) * GAME_W;
      const ph = 10 + hash(i + 900) * 10;
      terrainGfx.fillStyle(0x0a0a18, 1);
      terrainGfx.fillTriangle(px - 12, 200, px + 12, 200, px, 200 - ph);
    }
    terrainGfx.generateTexture('bgTerrainL2', GAME_W, 200);
    terrainGfx.destroy();
    this.bgTerrain = this.add.tileSprite(GAME_W / 2, GROUND_Y, GAME_W, 200, 'bgTerrainL2')
      .setDepth(2).setOrigin(0.5, 1).setScrollFactor(0);
    // bgHaze intentionally left undefined for L2 (no atmospheric scattering)
  }

  private updateParallax(): void {
    const sx = this.cameras.main.scrollX;
    this.bgStars.setTilePosition(sx * 0.05, 0);
    this.bgTerrain.setTilePosition(sx * 0.20, 0);
    if (this.bgHaze) this.bgHaze.setTilePosition(sx * 0.35, 0);
  }

  private makePlatforms(
    palette: 'blue' | 'purple' = 'blue',
    counts: { low: number; mid: number; high: number } = { low: 15, mid: 12, high: 8 },
  ): void {
    this.platformData = [];

    const hash = (n: number): number =>
      ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    const configs = [
      { ...PLATFORM_BANDS[0], count: counts.low,  minW: 100, maxW: 160 },
      { ...PLATFORM_BANDS[1], count: counts.mid,  minW:  80, maxW: 130 },
      { ...PLATFORM_BANDS[2], count: counts.high, minW:  60, maxW: 100 },
    ];

    configs.forEach(({ yMin, yMax, count, minW, maxW }, bandIdx) => {
      const span    = 5600;
      const spacing = span / count;
      let lastX     = 200;

      for (let i = 0; i < count; i++) {
        const seed = bandIdx * 100 + i;
        const rawX = 400 + i * spacing + hash(seed) * spacing * 0.6;
        const w    = minW + hash(seed + 2000) * (maxW - minW);
        const x    = Math.min(
          i === 0 ? rawX : Math.max(lastX + 200, rawX),
          6000 - w / 2,
        );
        lastX = x;
        const y = yMin + hash(seed + 1000) * (yMax - yMin);
        this.platformData.push({ x, y, w });
        this.addStructure(x, y, w, palette);
      }
    });
  }

  private addStructure(x: number, y: number, w: number, palette: 'blue' | 'purple' = 'blue'): void {
    const bodyColor   = palette === 'purple' ? 0x1a0d2e : 0x1c2040;
    const slabColor   = palette === 'purple' ? 0x100820 : 0x12122e;
    const postColor   = palette === 'purple' ? 0x2a1a44 : 0x2a3a5a;
    const glowColor   = palette === 'purple' ? 0xaa66ff : 0x7799ff;
    const accentColor = palette === 'purple' ? 0x3a2255 : 0x334466;
    const lightColor  = palette === 'purple' ? 0xff3355 : 0xff8800;

    // Physics rect — one-way top surface, unchanged from before
    const rect = this.add.rectangle(x, y, w, 8, bodyColor).setDepth(4);
    this.ground.add(rect);
    const body = rect.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down  = false;
    body.checkCollision.left  = false;
    body.checkCollision.right = false;

    // Slab body below surface (visual only — no physics body)
    this.add.rectangle(x, y + 14, w, 20, slabColor).setDepth(3);

    // Corner posts
    this.add.rectangle(x - w / 2 + 3, y + 14, 6, 20, postColor).setDepth(4);
    this.add.rectangle(x + w / 2 - 3, y + 14, 6, 20, postColor).setDepth(4);

    // Top edge glow
    this.add.rectangle(x, y - 3, w, 2, glowColor).setDepth(5);

    // Bottom accent line
    this.add.rectangle(x, y + 24, w, 2, accentColor).setDepth(4);

    // Amber indicator lights — 1 per ~50px of width
    const lightCount = Math.max(1, Math.floor(w / 50));
    const spacing    = w / (lightCount + 1);
    for (let i = 0; i < lightCount; i++) {
      const lx = x - w / 2 + spacing * (i + 1);
      this.add.rectangle(lx, y + 14, 3, 3, lightColor).setDepth(5);
    }
  }

  private cullBullets(): void {
    const cam = this.cameras.main;
    const minX = cam.scrollX - 100;
    const maxX = cam.scrollX + GAME_W + 100;
    const minY = cam.scrollY - 100;
    const maxY = cam.scrollY + GAME_H + 100;

    const cull = (group: Phaser.Physics.Arcade.Group) => {
      group.getChildren().forEach((go) => {
        const obj = go as Phaser.Physics.Arcade.Image;
        if (!obj.active) return;
        if (obj.x < minX || obj.x > maxX || obj.y > maxY || obj.y < minY) {
          obj.setActive(false).setVisible(false);
          if (obj.body) (obj.body as Phaser.Physics.Arcade.Body).enable = false;
        }
      });
    };

    cull(this.playerBullets);
    cull(this.droneBullets);
  }
}
