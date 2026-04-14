import Phaser from 'phaser';
import { Player } from '../entities/Player';
import type { MechType } from '../entities/Player';
import { StunDart } from '../entities/StunDart';
import { DroneSpawner } from '../systems/DroneSpawner';
import { AudioSystem } from '../systems/AudioSystem';
import { MusicSystem } from '../systems/MusicSystem';
import { GAME_W, GAME_H, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT, PLATFORM_BANDS, BOSS_WAVE_L1 } from '../constants';
import { buildLevel1Map } from '../data/levelData';
import { DebugLog } from '../systems/DebugLog';

export class GameScene extends Phaser.Scene {
  player!: Player;
  playerBullets!: Phaser.Physics.Arcade.Group;
  droneBullets!: Phaser.Physics.Arcade.Group;
  missiles!: Phaser.Physics.Arcade.Group;
  drones!: Phaser.Physics.Arcade.Group;
  tanks!: Phaser.Physics.Arcade.Group;
  pickups!: Phaser.Physics.Arcade.Group;
  bossProjectiles!: Phaser.Physics.Arcade.Group;
  debugLog?: DebugLog;
  audio!: AudioSystem;
  private music: MusicSystem | null = null;
  score = 0;
  platformData: { x: number; y: number; w: number }[] = [];
  private isGameOver = false;
  private killStreak = 0;
  private prevHp = 0;

  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private groundLayer?: Phaser.Tilemaps.TilemapLayer;
  private spawner!: DroneSpawner;
  private bgStars?: Phaser.GameObjects.TileSprite;
  private bgTerrain?: Phaser.GameObjects.TileSprite;
  private bgHaze?: Phaser.GameObjects.TileSprite;
  private isBossDead = false;
  private waitingForStart = true;

  constructor() {
    super({ key: 'Game' });
  }

  init(data: { mechType?: MechType; totalScore?: number; level?: number }): void {
    if (data.mechType)               this.registry.set('mechType',      data.mechType);
    if (data.totalScore !== undefined) this.registry.set('totalScore',  data.totalScore);
    if (data.level      !== undefined) this.registry.set('currentLevel', data.level);
    this.waitingForStart = true;
  }

  create(): void {
    // Fade out title music if it carried through the transition
    for (const m of this.sound.getAll('music-title') as Phaser.Sound.WebAudioSound[]) {
      if (m.isPlaying) {
        this.tweens.add({ targets: m, volume: 0, duration: 800, ease: 'Linear',
          onComplete: () => m.stop() });
      }
    }

    // Reset state that persists across scene.restart() (instance is reused, not reconstructed)
    this.isGameOver   = false;
    this.killStreak   = 0;
    this.prevHp       = 0;
    this.isBossDead      = false;
    this.bgHaze          = undefined;
    this.bgStars         = undefined;
    this.bgTerrain       = undefined;
    this.groundLayer     = undefined;
    this.debugLog?.destroy();
    this.debugLog        = undefined;
    this.score           = (this.registry.get('totalScore')   as number) ?? 0;

    this.music?.destroy(); // stop music from previous run
    this.music = new MusicSystem();
    // music starts when title is dismissed

    this.audio?.destroy(); // close old AudioContext before creating new one
    this.audio = new AudioSystem(this.sound);

    const kb = this.input.keyboard!;

    // Debug log — toggle with backtick (`)
    this.debugLog = new DebugLog(this);
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK).on('down', () => this.debugLog?.toggle());

    // Boss projectile — large orange orb
    const bpg = this.add.graphics();
    bpg.fillStyle(0xff6600, 0.9);
    bpg.fillCircle(16, 16, 16);
    bpg.fillStyle(0xffaa44, 0.6);
    bpg.fillCircle(16, 16, 9);
    bpg.generateTexture('boss-projectile', 32, 32);
    bpg.destroy();

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);

    // --- Background ---
    this.makeBackground();

    // --- Ground (tilemap) ---
    this.ground = this.physics.add.staticGroup();
    this.makeTilemapGround(buildLevel1Map());

    // --- Platforms ---
    this.makePlatforms();
    this.makeBaseProps();
    this.makeTerrainObstacles();

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

    this.tanks = this.physics.add.group({ runChildUpdate: true });

    this.pickups = this.physics.add.group({
      maxSize: 20,
      runChildUpdate: false,
      allowGravity: false,
    });

    this.bossProjectiles = this.physics.add.group({
      defaultKey: 'boss-projectile',
      maxSize: 10,
      runChildUpdate: false,
      allowGravity: false,
    });

    // --- Player ---
    // Origin (0.5, 1) → feet at position y. Start 5px above ground.
    const mechType = (this.registry.get('mechType') as MechType) ?? 'mech';
    const spawnY = GROUND_Y - 5;
    this.player = new Player(this, 300, spawnY, mechType);
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
    if (this.groundLayer) this.physics.add.collider(this.player, this.groundLayer);

    // Tanks land on ground
    this.physics.add.collider(this.tanks, this.ground);
    if (this.groundLayer) this.physics.add.collider(this.tanks, this.groundLayer);

    // --- Geometry collision for projectiles & enemies ---

    const killBullet = (b: unknown) => {
      const bullet = b as Phaser.Physics.Arcade.Image;
      if (!bullet.active) return;
      bullet.setActive(false).setVisible(false);
      if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
    };

    const killMissile = (m: unknown) => {
      const missile = m as Phaser.Physics.Arcade.Image;
      if (!missile.active) return;
      missile.setData('hitTarget', true);
      missile.setActive(false).setVisible(false);
      if (missile.body) (missile.body as Phaser.Physics.Arcade.Body).enable = false;
      this.spawnExplosion(missile.x, missile.y);
      this.audio.play('explosion');
    };

    // Player bullets destroyed by geometry
    this.physics.add.overlap(this.playerBullets, this.ground, killBullet);
    if (this.groundLayer) this.physics.add.overlap(this.playerBullets, this.groundLayer, killBullet);

    // Drone bullets destroyed by geometry
    this.physics.add.overlap(this.droneBullets, this.ground, killBullet);
    if (this.groundLayer) this.physics.add.overlap(this.droneBullets, this.groundLayer, killBullet);

    // Boss projectiles destroyed by geometry
    this.physics.add.overlap(this.bossProjectiles, this.ground, killBullet);
    if (this.groundLayer) this.physics.add.overlap(this.bossProjectiles, this.groundLayer, killBullet);

    // Missiles explode on geometry
    this.physics.add.overlap(this.missiles, this.ground, (m) => killMissile(m));
    if (this.groundLayer) this.physics.add.overlap(this.missiles, this.groundLayer, (m) => killMissile(m));

    // Enemies blocked by geometry
    this.physics.add.collider(this.drones, this.ground);
    if (this.groundLayer) this.physics.add.collider(this.drones, this.groundLayer);

    // Drone bullets hit player
    this.physics.add.overlap(
      this.droneBullets,
      this.player,
      (playerObj, b) => {
        const bullet = b as Phaser.Physics.Arcade.Image;
        bullet.setActive(false).setVisible(false);
        if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
        const dmg = (bullet.getData('damage') as number | undefined) ?? 1;
        (playerObj as Player).takeDamage(dmg);
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
        this.tweens.killTweensOf(pk);
        pk.setAlpha(1);
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

    // Player bullets destroy boss projectiles
    this.physics.add.overlap(
      this.playerBullets,
      this.bossProjectiles,
      (_proj, bullet) => {
        const b = bullet as Phaser.Physics.Arcade.Image;
        b.setActive(false).setVisible(false);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
        const p = _proj as Phaser.Physics.Arcade.Image;
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
        this.audio.play('hit');
      },
    );

    // Boss projectiles hit player
    this.physics.add.overlap(
      this.bossProjectiles,
      this.player,
      (projObj, playerObj) => {
        const p = projObj as Phaser.Physics.Arcade.Image;
        if (!p.active) return;
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
        (playerObj as Player).takeDamage(1);
        this.cameras.main.shake(100, 0.008);
      },
    );

    // Missiles are intercepted by boss projectiles
    this.physics.add.overlap(
      this.missiles,
      this.bossProjectiles,
      (projObj, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        const p = projObj as Phaser.Physics.Arcade.Image;
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
        this.spawnExplosion(m.x, m.y);
        this.audio.play('explosion');
      },
    );

    // --- Camera ---
    this.cameras.main.setBounds(0, -(GAME_H - 120), WORLD_WIDTH, WORLD_HEIGHT + (GAME_H - 120));
    this.cameras.main.startFollow(this.player, false, 0.20, 0.18);

    // --- Spawner ---
    this.spawner = new DroneSpawner(this);
    this.events.once('titleDismissed', () => {
      this.waitingForStart = false;
      this.music?.start(0.35);
    });

    // --- Wave audio ---
    this.events.on('waveStart', (wave: number) => {
      this.audio.playWaveStinger();
      if (wave === BOSS_WAVE_L1) this.music?.setBossMode();
    });

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
        this.audio.playStreakChime(this.killStreak);
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

    // --- Emit initial HUD state ---
    this.events.emit('healthChange', this.player.hp, this.player.maxHp);
    this.events.emit('missileCooldown', 0);
    this.events.emit('turretCooldown', 1);
    this.events.emit('jetpackFuel', 1, 1);
    this.events.emit('scoreChange', this.score);

  }

  update(time: number, delta: number): void {
    if (this.isGameOver) return;
    if (this.waitingForStart) return;
    this.player.update(time, delta);
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    this.audio.update({
      onGround:  pb.blocked.down,
      moving:    Math.abs(pb.velocity.x) > 10,
      velocityX: pb.velocity.x,
      delta,
    });
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

  public getPlayerPos(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  public getApproxGroundY(): number {
    return GROUND_Y;
  }

  spawnFloatingText(x: number, y: number, text: string, color = '#ffffff'): void {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '14px', color })
      .setDepth(25).setOrigin(0.5, 1);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  private spawnPickup(x: number, y: number, type: 'health' | 'fuel'): void {
    const [key, frame] = type === 'health'
      ? ['collectables', Math.random() < 0.5 ? 36 : 44]
      : ['collectables', Math.random() < 0.5 ? 32 : 40];
    const p = this.pickups.get(x, y, key, frame) as Phaser.Physics.Arcade.Image;
    if (!p) return;
    p.setActive(true).setVisible(true).setDepth(12).setPosition(x, y).setAlpha(1)
      .setDisplaySize(42, 42);
    p.setData('type', type);
    if (p.body) {
      const pb = p.body as Phaser.Physics.Arcade.Body;
      pb.enable = true;
      pb.setVelocity(0, 0);
    }

    // Start pulse warning 3s before despawn (at t=7s)
    this.time.delayedCall(7000, () => {
      if (!p.active) return;
      this.tweens.add({
        targets: p,
        alpha: { from: 1, to: 0.25 },
        duration: 350,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // Despawn after 10s
    this.time.delayedCall(10000, () => {
      if (p.active) {
        this.tweens.killTweensOf(p);
        p.setAlpha(1);
        p.setActive(false).setVisible(false);
        if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
      }
    });
  }

  spawnExplosion(x: number, y: number): void {
    const emitter = this.add.particles(x, y, 'flare', {
      speed:    { min: 60, max: 160 },
      angle:    { min: 0, max: 360 },
      gravityY: 280,
      scale:    { start: 1.2, end: 0 },
      alpha:    { start: 1, end: 0 },
      tint:     [0xff6600, 0xff2200, 0xff9900, 0xffcc00],
      lifespan: { min: 1500, max: 3000 },
      emitting: false,
      blendMode: 'ADD',
    });
    emitter.setDepth(20);
    emitter.explode(7);
    this.time.delayedCall(3200, () => emitter.destroy());
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
    const hash = GameScene.hash;
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

    this.makeBackgroundDomes();
  }

  private makeBackgroundDomes(): void {
    const hash = GameScene.hash;

    // Three depth layers. scrollFactor determines parallax speed and sets
    // the effective canvas width: GAME_W + (WORLD_WIDTH - GAME_W) * f.
    // Domes are spread across that range so they stay visible throughout the run.
    const layers = [
      // Very far — huge, barely-there silhouettes just above the starfield
      { f: 0.06, count: 5, rMin: 210, rMax: 330,
        outerColor: 0x06060f, innerColor: 0x09091a, rimColor: 0x111128, depth: 1.2 },
      // Far — large domes, subtle blue tint
      { f: 0.13, count: 7, rMin: 140, rMax: 230,
        outerColor: 0x08081c, innerColor: 0x0c0c28, rimColor: 0x18183c, depth: 1.5 },
      // Mid-far — most visible, richer blue, smaller
      { f: 0.22, count: 9, rMin:  90, rMax: 165,
        outerColor: 0x0a0a24, innerColor: 0x0f0f34, rimColor: 0x1e1e52, depth: 1.8 },
    ];

    layers.forEach(({ f, count, rMin, rMax, outerColor, innerColor, rimColor, depth }, layerIdx) => {
      // Effective x-range: all positions that will ever be on screen for this parallax factor
      const maxX   = GAME_W + (WORLD_WIDTH - GAME_W) * f;
      const spacing = maxX / count;

      for (let i = 0; i < count; i++) {
        const seed = layerIdx * 300 + i * 19 + 700;
        const wx   = i * spacing + hash(seed) * spacing * 0.45;
        const r    = rMin + hash(seed + 1) * (rMax - rMin);

        const g = this.add.graphics()
          .setDepth(depth)
          .setScrollFactor(f)
          .setPosition(wx, GROUND_Y);

        // Outer dome shell — upper semicircle
        g.fillStyle(outerColor, 1);
        g.slice(0, 0, r, Math.PI, 0, false);
        g.fillPath();

        // Inner glass fill — lighter centre
        g.fillStyle(innerColor, 1);
        g.slice(0, 0, r * 0.68, Math.PI, 0, false);
        g.fillPath();

        // Deep inner core — tiny bright spot suggesting interior light
        g.fillStyle(rimColor, 1);
        g.slice(0, 0, r * 0.32, Math.PI, 0, false);
        g.fillPath();

        // Structural rim arc
        g.lineStyle(1, rimColor, 0.8);
        g.beginPath();
        g.arc(0, 0, r, Math.PI, 0, false);
        g.strokePath();

        // Base plate
        g.fillStyle(rimColor, 0.6);
        g.fillRect(-r - 4, 0, r * 2 + 8, 3);

        // Vertical support spine at apex
        g.lineStyle(1, rimColor, 0.4);
        g.lineBetween(0, 0, 0, -r);
      }
    });
  }

  private makeBaseProps(): void {
    const hash = GameScene.hash;

    // ── Habitat Domes (8) ─────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const x   = Math.max(200, Math.min(6200, 300 + i * 725 + (hash(i + 10) * 400 - 200)));
      const r   = 50 + hash(i + 20) * 50;
      const dmg = hash(i + 30) < 0.33;
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
      const dmg = hash(i + 130) < 0.5;
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
      for (let p = 0; p < cnt; p++) {
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

  private updateParallax(): void {
    const sx = this.cameras.main.scrollX;
    if (this.bgStars)   this.bgStars.setTilePosition(sx * 0.05, 0);
    if (this.bgTerrain) this.bgTerrain.setTilePosition(sx * 0.20, 0);
    if (this.bgHaze)    this.bgHaze.setTilePosition(sx * 0.35, 0);
  }

  private makeTerrainObstacles(): void {
    const hash = GameScene.hash;
    const bodyColor  = 0x0e1228;
    const glowColor  = 0x3355aa;
    const edgeColor  = 0x1a2a55;

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

  private makeTilemapGround(mapData: number[][]): void {
    const map = this.make.tilemap({
      data: mapData,
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
    counts: { low: number; mid: number; high: number } = { low: 7, mid: 5, high: 3 },
  ): void {
    this.platformData = [];

    const hash = GameScene.hash;

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
        this.addStructure(x, y, w);
      }
    });
  }

  private addStructure(x: number, y: number, w: number): void {
    const bodyColor   = 0x1c2040;
    const slabColor   = 0x12122e;
    const postColor   = 0x2a3a5a;
    const glowColor   = 0x7799ff;
    const accentColor = 0x334466;
    const lightColor  = 0xff8800;

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

  private static hash(n: number): number {
    return ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;
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
