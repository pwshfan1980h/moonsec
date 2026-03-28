import Phaser from 'phaser';
import { Player } from '../entities/Player';
import type { MechType } from '../entities/Player';
import { Pilot } from '../entities/Pilot';
import { StunDart } from '../entities/StunDart';
import { DroneSpawner } from '../systems/DroneSpawner';
import { AudioSystem } from '../systems/AudioSystem';
import { MusicSystem } from '../systems/MusicSystem';
import { GAME_W, GAME_H, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT, PLATFORM_BANDS } from '../constants';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { TREE_NODES, applyTreeEffect } from '../data/upgradeTree';
import { CARD_POOL } from '../data/upgradeCards';
import { buildLevel1Map } from '../data/levelData';

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
  private music: MusicSystem | null = null;
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
  private groundLayer?: Phaser.Tilemaps.TilemapLayer;
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

    this.music?.destroy(); // stop music from previous run
    this.music = new MusicSystem();
    this.music.start(0.35);

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
      this.makePlatforms('purple', { low: 8, mid: 6, high: 4 });
      this.makeBaseProps('high'); // more damage — dark side is ruined
      this.makeTerrainObstacles('purple');
    } else {
      this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);

      // --- Background ---
      this.makeBackground();

      // --- Ground (tilemap) ---
      this.ground = this.physics.add.staticGroup();
      this.groundLayer = undefined;
      this.makeTilemapGround();

      // --- Platforms ---
      this.makePlatforms();
      this.makeBaseProps(); // 'low' damage — default
      this.makeTerrainObstacles('blue');
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
    if (this.groundLayer) this.physics.add.collider(this.player, this.groundLayer);

    // Crawlers land on ground
    this.physics.add.collider(this.crawlers, this.ground);
    if (this.groundLayer) this.physics.add.collider(this.crawlers, this.groundLayer);

    // Drone bullets hit player
    this.physics.add.overlap(
      this.droneBullets,
      this.player,
      (playerObj, b) => {
        const bullet = b as Phaser.Physics.Arcade.Image;
        bullet.setActive(false).setVisible(false);
        if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
        (playerObj as Player).takeDamage(1);
        this.cameras.main.shake(80, 0.006);
      },
    );

    // StunDart rams player — EMP stun
    this.physics.add.overlap(
      this.drones,
      this.player,
      (playerObj, dartObj) => {
        if (!(dartObj instanceof StunDart)) return;
        (dartObj as StunDart).onHitPlayer(playerObj as Player);
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
    this.cameras.main.setBounds(0, -(GAME_H - 120), WORLD_WIDTH, WORLD_HEIGHT + (GAME_H - 120));
    this.cameras.main.startFollow(this.player, false, 0.20, 0.18);

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
          this.cameras.main.startFollow(this.player, false, 0.20, 0.18);
        }
      } else {
        if (this.player.isDead() || this.player.isHurtLocked()) return;
        this.audio.play('eject');
        const spawnPos = this.player.eject();
        this.pilot = new Pilot(this, spawnPos.x, spawnPos.y);
        this.pilot.setFireCallback((bx, by, dirX) => {
          const b = this.playerBullets.get(bx, by, 'bullet-rapid') as Phaser.Physics.Arcade.Image;
          if (!b) return;
          b.setActive(true).setVisible(true).setDepth(14);
          b.setBlendMode(Phaser.BlendModes.ADD);
          const bb = b.body as Phaser.Physics.Arcade.Body;
          if (bb) { bb.enable = true; bb.setAllowGravity(false); }
          b.setVelocity(dirX * 400, 0);
          this.audio.play('rapid');
        });
        this.cameras.main.startFollow(this.pilot, false, 0.12, 0.08);
        this.pilotGroundCollider = this.physics.add.collider(this.pilot, this.ground);
        if (this.groundLayer) this.physics.add.collider(this.pilot, this.groundLayer);
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

  shutdown(): void {
    this.music?.destroy();
    this.music = null;
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
  }

  private makeBaseProps(damageLevel: 'low' | 'high' = 'low'): void {
    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    // ── Habitat Domes (8) ─────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const x   = Math.max(200, Math.min(6200, 300 + i * 725 + (hash(i + 10) * 400 - 200)));
      const r   = 50 + hash(i + 20) * 50;
      const dmg = damageLevel === 'high' ? hash(i + 30) < 0.67 : hash(i + 30) < 0.33;
      const g   = this.add.graphics().setDepth(3.5).setPosition(x, GROUND_Y);

      // Dome shell — upper semicircle (clockwise arc PI→0 passes through top)
      g.fillStyle(0x12122e, 1);
      g.slice(0, 0, r, Math.PI, 0, false);
      g.fillPath();

      // Inner glow (60% radius)
      g.fillStyle(0x0d0d25, 1);
      g.slice(0, 0, r * 0.6, Math.PI, 0, false);
      g.fillPath();

      // Panel lines — radial from center to rim
      const lineCount = 4 + Math.floor(hash(i + 40) * 3);
      g.lineStyle(1, 0x2a2a50, 1);
      for (let l = 0; l < lineCount; l++) {
        if (dmg && l === 1) continue; // leave a gap for damaged domes
        const a = -Math.PI + (Math.PI * (l + 1)) / (lineCount + 1);
        g.lineBetween(0, 0, Math.cos(a) * r, Math.sin(a) * r);
      }

      // Base plate (at ground level = y:0 in local coords since position is GROUND_Y)
      g.fillStyle(0x1a1a3a, 1);
      g.fillRect(-r - 10, 0, r * 2 + 20, 12);

      // Airlock nub
      g.fillStyle(0x1e1e44, 1);
      g.fillRect(-7, -18, 14, 18);

      // Window dot at upper-center
      g.fillStyle(dmg ? 0xff2200 : 0x4488ff, dmg ? 1 : 0.6);
      g.fillCircle(0, -r * 0.65, 4);

      // Crack for damaged domes
      if (dmg) {
        g.lineStyle(1, 0xff4400, 0.7);
        const crackA = -Math.PI * 0.7;
        g.lineBetween(
          Math.cos(crackA) * r * 0.9, Math.sin(crackA) * r * 0.9,
          Math.cos(crackA) * r * 0.3 + hash(i + 60) * 10 - 5,
          Math.sin(crackA) * r * 0.3,
        );
      }
    }

    // ── Communication Towers (6) ─────────────────────────────────────
    for (let i = 0; i < 6; i++) {
      const x   = Math.max(300, Math.min(6000, 500 + i * 900 + (hash(i + 110) * 300 - 150)));
      const mh  = 80 + hash(i + 120) * 60; // mast height 80–140px
      const dmg = damageLevel === 'high' ? true : hash(i + 130) < 0.5;
      const g   = this.add.graphics().setDepth(3.5).setPosition(x, GROUND_Y);
      if (dmg) g.setAngle(hash(i + 140) * 12 - 6); // −6° to +6° lean

      // Base block
      g.fillStyle(0x1e2040, 1);
      g.fillRect(-10, -10, 20, 10);

      // Mast — drawn upward from origin so setAngle rotates around base
      g.fillStyle(0x1e2040, 1);
      g.fillRect(-3, -mh, 6, mh);

      // Support struts (undamaged towers only)
      if (!dmg) {
        g.lineStyle(1, 0x1a1a38, 1);
        g.lineBetween(0, -mh * 0.6, -25, 0);
        g.lineBetween(0, -mh * 0.6, 25, 0);
      }

      // Dish or broken stub
      if (!dmg) {
        g.fillStyle(0x252545, 1);
        g.fillEllipse(0, -mh, 28, 14);
        g.lineStyle(1, 0x3a3a60, 1);
        g.lineBetween(-14, -mh, 14, -mh);
      } else {
        g.fillStyle(0x252545, 1);
        g.fillEllipse(0, -mh, 14, 6);
        g.lineStyle(1, 0x3a3a60, 1);
        g.lineBetween(-7, -mh, 7, -mh + 5);
      }
    }

    // ── Solar Array Clusters (5) ─────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const cx   = Math.max(300, Math.min(6000, 400 + i * 1100 + (hash(i + 210) * 300 - 150)));
      const cnt  = 3 + Math.floor(hash(i + 220) * 3); // 3–5 panels
      const miss = damageLevel === 'high' ? 0.5 : 0;

      for (let p = 0; p < cnt; p++) {
        if (miss > 0 && hash(i * 100 + p + 230) < miss) continue;
        const px = cx + (p - (cnt - 1) / 2) * 44;

        const g = this.add.graphics().setDepth(3.5);
        g.fillStyle(0x1a1a38, 1);
        g.fillRect(px - 2, GROUND_Y - 40, 4, 40);

        // Panel tilted 30° (rotates around center of rectangle)
        this.add.rectangle(px, GROUND_Y - 40, 32, 10, 0x1a2840)
          .setDepth(3.5).setAngle(30);

        // Panel highlight
        this.add.rectangle(px, GROUND_Y - 44, 30, 1, 0x334466)
          .setDepth(3.6).setAngle(30);
      }
    }
  }

  private makeBackgroundL2(): void {
    // Deep void — dark crimson sky (distinct from L1 blue-black)
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0d0005)
      .setDepth(0).setScrollFactor(0);

    // Dedup texture keys on restart
    for (const key of ['bgStarsL2', 'bgTerrainL2', 'bgNebulaL2']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }

    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    // ── Nebula cloud layer — large soft blobs of deep red/purple ──────
    const nebGfx = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 6; i++) {
      const nx = hash(i + 1000) * GAME_W;
      const ny = 80 + hash(i + 1100) * (GROUND_Y - 300);
      const nr = 120 + hash(i + 1200) * 180;
      const col = i % 2 === 0 ? 0x330011 : 0x1a0028;
      nebGfx.fillStyle(col, 0.55 + hash(i + 1300) * 0.25);
      nebGfx.fillCircle(nx, ny, nr);
    }
    nebGfx.generateTexture('bgNebulaL2', GAME_W, GROUND_Y);
    nebGfx.destroy();
    this.add.tileSprite(GAME_W / 2, GROUND_Y / 2, GAME_W, GROUND_Y, 'bgNebulaL2')
      .setDepth(1).setScrollFactor(0);

    // ── Starfield — blood-red tinted, denser than L1 ──────────────────
    const starsGfx = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 600; i++) {
      // Alternate warm (red) and cool (white) stars
      const col = i % 3 === 0 ? 0xff5533 : (i % 3 === 1 ? 0xffffff : 0xffaa88);
      starsGfx.fillStyle(col, 0.15 + Math.random() * 0.35);
      starsGfx.fillRect(
        Phaser.Math.Between(0, GAME_W - 1),
        Phaser.Math.Between(0, GROUND_Y - 1),
        1, 1,
      );
    }
    // A few larger bright stars
    for (let i = 0; i < 8; i++) {
      starsGfx.fillStyle(0xffddcc, 0.7);
      starsGfx.fillRect(
        Phaser.Math.Between(0, GAME_W - 1),
        Phaser.Math.Between(0, GROUND_Y - 200),
        2, 2,
      );
    }
    starsGfx.generateTexture('bgStarsL2', GAME_W, GROUND_Y);
    starsGfx.destroy();
    this.bgStars = this.add.tileSprite(GAME_W / 2, GROUND_Y / 2, GAME_W, GROUND_Y, 'bgStarsL2')
      .setDepth(2).setScrollFactor(0);

    // ── Jagged crystalline terrain silhouette — shard spires ─────────
    const terrainGfx = this.make.graphics({ x: 0, y: 0 }, false);
    terrainGfx.fillStyle(0x0a0010, 1);
    terrainGfx.fillRect(0, 0, GAME_W, 260);

    // Crystal spires — pointed triangles jutting upward
    for (let i = 0; i < 16; i++) {
      const sx  = hash(i + 2000) * GAME_W;
      const sw  = 12 + hash(i + 2100) * 30;
      const sh  = 40 + hash(i + 2200) * 140;
      terrainGfx.fillStyle(0x160020, 1);
      terrainGfx.fillTriangle(sx - sw, 260, sx + sw, 260, sx, 260 - sh);
    }
    // Deep craters — torn ground pits
    for (let i = 0; i < 5; i++) {
      const cx = hash(i + 2500) * GAME_W;
      const cr = 50 + hash(i + 2600) * 70;
      terrainGfx.fillStyle(0x06000e, 1);
      terrainGfx.slice(cx, 260, cr, Math.PI, 0, false);
      terrainGfx.fillPath();
    }
    // Purple rim glow on terrain top
    terrainGfx.lineStyle(2, 0x6600aa, 0.5);
    terrainGfx.lineBetween(0, 0, GAME_W, 0);

    terrainGfx.generateTexture('bgTerrainL2', GAME_W, 260);
    terrainGfx.destroy();
    this.bgTerrain = this.add.tileSprite(GAME_W / 2, GROUND_Y, GAME_W, 260, 'bgTerrainL2')
      .setDepth(3).setOrigin(0.5, 1).setScrollFactor(0);

    // ── Ground glow — vivid magenta instead of blue ───────────────────
    this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 1, WORLD_WIDTH, 3, 0xcc0055).setDepth(5);
  }

  private updateParallax(): void {
    const sx = this.cameras.main.scrollX;
    this.bgStars.setTilePosition(sx * 0.05, 0);
    this.bgTerrain.setTilePosition(sx * 0.20, 0);
    if (this.bgHaze) this.bgHaze.setTilePosition(sx * 0.35, 0);
  }

  private makeTerrainObstacles(palette: 'blue' | 'purple' = 'blue'): void {
    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    const bodyColor  = palette === 'purple' ? 0x12082a : 0x0e1228;
    const glowColor  = palette === 'purple' ? 0x8833cc : 0x3355aa;
    const edgeColor  = palette === 'purple' ? 0x4a1a66 : 0x1a2a55;

    // 14 ground-level obstacles across the world — rocks/ruins the player must jump over
    for (let i = 0; i < 14; i++) {
      const seed = i * 77 + 3000;
      const x   = 500 + i * 400 + (hash(seed) * 200 - 100);
      const w   = 60  + hash(seed + 1) * 100;  // 60–160px wide
      const h   = 80  + hash(seed + 2) * 120;  // 80–200px tall
      const cx  = Math.max(w / 2 + 50, Math.min(WORLD_WIDTH - w / 2 - 50, x));
      const top = GROUND_Y - h;

      // Physics rect (player/crawler land on top)
      const rect = this.add.rectangle(cx, top + h / 2, w, h, bodyColor).setDepth(4);
      this.ground.add(rect);
      const body = rect.body as Phaser.Physics.Arcade.StaticBody;
      body.checkCollision.down = false;
      body.checkCollision.left = false;
      body.checkCollision.right = false;

      // Top glow edge
      this.add.rectangle(cx, top, w, 2, glowColor).setDepth(5);

      // Side detail lines
      this.add.rectangle(cx - w / 2 + 3, top + h / 2, 3, h, edgeColor).setDepth(5);
      this.add.rectangle(cx + w / 2 - 3, top + h / 2, 3, h, edgeColor).setDepth(5);
    }
  }

  private makeTilemapGround(): void {
    const map = this.make.tilemap({
      data: buildLevel1Map(),
      tileWidth: 32,
      tileHeight: 32,
    });

    const tileset = map.addTilesetImage('industrial-tileset', 'industrial-tileset');
    if (!tileset) {
      console.warn('[GameScene] industrial-tileset not found — ground tilemap skipped');
      return;
    }

    this.groundLayer = map.createLayer(0, tileset, 0, 0) ?? undefined;
    if (!this.groundLayer) return;

    this.groundLayer.setCollisionByExclusion([-1]);
    this.groundLayer.setDepth(4);
  }

  private makePlatforms(
    palette: 'blue' | 'purple' = 'blue',
    counts: { low: number; mid: number; high: number } = { low: 7, mid: 5, high: 3 },
  ): void {
    this.platformData = [];

    const hash = (n: number): number =>
      ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    const configs = [
      { ...PLATFORM_BANDS[0], count: counts.low,  minW: 200, maxW: 380 },
      { ...PLATFORM_BANDS[1], count: counts.mid,  minW: 160, maxW: 300 },
      { ...PLATFORM_BANDS[2], count: counts.high, minW: 120, maxW: 220 },
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
