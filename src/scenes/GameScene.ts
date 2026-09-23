import { pal } from '../render/palette';
import { icon as uiIcon, label as uiLabel } from '../ui/kit/draw';
import type { IconName } from '../ui/icons';
import type { Role } from '../ui/theme';
import Phaser from 'phaser';
import { Player, HARROW_BODY } from '../entities/Player';
import { SurfaceMission } from '../systems/SurfaceMission';
import { DroneSpawner } from '../systems/DroneSpawner';
import { AudioSystem } from '../systems/AudioSystem';
import { MusicSystem, musicIntensityForWave } from '../systems/MusicSystem';
import { PlayerHud } from '../ui/PlayerHud';
import { MovingPlatform } from '../entities/MovingPlatform';
import { PPCRound } from '../entities/PPCRound';
import { GAME_W, GAME_H, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT } from '../constants';
import { buildMap } from '../data/levelData';
import { LEVEL_CONFIGS, NODE_GRAPH, spawnPoint } from '../data/levelConfigs';
import type { LevelConfig } from '../data/levelConfigs';
import { DebugLog } from '../systems/DebugLog';
import { PickupSystem } from '../systems/PickupSystem';
import type { PickupType } from '../systems/PickupSystem';
import { CollisionRegistry } from '../collisions/CollisionRegistry';
import { EnvironmentalLife } from '../systems/EnvironmentalLife';
import { dressLevel } from '../world/dressing';
import { SurfaceBackdrop } from '../world/backdrop';
import { drawTradeLaneArt, makeFreightLiftTexture } from '../systems/TradeLaneArt';
import { FlightNavigation } from '../systems/FlightNavigation';
import { devParams } from '../dev/devParams';
import { markDevReady } from '../dev/ready';
import { HostileCombat } from '../collisions/HostileCombat';
import { installPipeline, graphics, type CameraPipeline } from '../render/RenderPipeline';
import { VPX, cameraZoom, type GraphicsSettings } from '../render/GraphicsSettings';
import { TerrainProbe } from '../fx/terrain';
import { AiWorld } from '../ai/AiWorld';

/** Camera frames the mech slightly above its feet. */
const CAMERA_FEET_OFFSET = 80;
/** Per-frame (60 fps) follow lerp. */
const CAMERA_LERP = 0.2;
const snapVpx = (v: number) => Math.round(v / VPX) * VPX;

export class GameScene extends Phaser.Scene {
  player!: Player;
  playerBullets!: Phaser.Physics.Arcade.Group;
  droneBullets!: Phaser.Physics.Arcade.Group;
  missiles!: Phaser.Physics.Arcade.Group;
  drones!: Phaser.Physics.Arcade.Group;
  tanks!: Phaser.Physics.Arcade.Group;
  pickups!: Phaser.Physics.Arcade.Group;
  bossProjectiles!: Phaser.Physics.Arcade.Group;
  ppcRounds!: Phaser.Physics.Arcade.Group;
  movingPlatforms!: Phaser.Physics.Arcade.Group;
  debugLog?: DebugLog;
  audio!: AudioSystem;
  hostileCombat!: HostileCombat;
  private music: MusicSystem | null = null;
  private playerHud?: PlayerHud;
  score = 0;
  platformData: { x: number; y: number; w: number }[] = [];
  private isGameOver = false;
  private killStreak = 0;
  private prevHp = 0;

  ground!: Phaser.Physics.Arcade.StaticGroup;
  groundLayer?: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;
  private spawner?: DroneSpawner;
  surfaceMission?: SurfaceMission;
  flightNavigation?: FlightNavigation;
  /** Shared enemy AI data for this mission (navigation, cover, tokens, noise). */
  ai?: AiWorld;
  private worldPipeline?: CameraPipeline;
  private camFollow = { x: 0, y: 0 };
  private pickupSystem?: PickupSystem;
  private gameEventUnsubs: Array<() => void> = [];
  private bgStars?: Phaser.GameObjects.TileSprite;
  private backdrop?: SurfaceBackdrop;
  private bgTerrain?: Phaser.GameObjects.TileSprite;
  terrain!: TerrainProbe;
  private trainOffset = 0;
  private isBossDead    = false;

  // Campaign state — exposed so UIScene can read on level complete
  currentNode:    number   = 0;
  completedNodes: number[] = [];
  private activeConfig!: LevelConfig;
  private levelGroundY = GROUND_Y;

  constructor() {
    super({ key: 'Game' });
  }

  init(data: { totalScore?: number; level?: number; completedNodes?: number[] }): void {
    if (data.totalScore !== undefined) this.registry.set('totalScore',   data.totalScore);
    if (data.level      !== undefined) this.registry.set('currentLevel', data.level);
    this.currentNode    = data.level        ?? 0;
    this.completedNodes = data.completedNodes ?? [];
  }

  /** Returns the first next node from the active level that hasn't been completed yet. */
  getDefaultNextNode(): number {
    const nexts = NODE_GRAPH[this.currentNode]?.nextNodes ?? [];
    return nexts.find(n => !this.completedNodes.includes(n)) ?? this.currentNode;
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

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
    this.gameEventUnsubs = [];
    this.isBossDead      = false;
    this.bgStars         = undefined;
    this.backdrop        = undefined;
    this.bgTerrain       = undefined;
    this.groundLayer     = undefined;
    this.debugLog?.destroy();
    this.debugLog        = undefined;
    this.score           = (this.registry.get('totalScore')   as number) ?? 0;

    // Select level config for the current node
    const nodeIdx = this.currentNode;
    this.activeConfig  = LEVEL_CONFIGS[nodeIdx] ?? LEVEL_CONFIGS[0];
    this.levelGroundY  = this.activeConfig.template.hasGround
      ? this.activeConfig.template.groundRow * 32
      : GAME_H + 200; // off-screen — mines/tanks won't spawn

    this.music?.destroy();
    this.music = new MusicSystem(this.activeConfig.musicTheme);
    // music starts when title is dismissed

    this.audio?.destroy(); // close old AudioContext before creating new one
    this.audio = new AudioSystem(this.sound);

    const kb = this.input.keyboard!;

    // Debug log — toggle with backtick (`)
    this.debugLog = new DebugLog(this);
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK).on('down', () => this.debugLog?.toggle());

    // Dev-only: number keys 1–5 warp to that level (restart Game scene with new config).
    if (import.meta.env.DEV) {
      const maxLevel = LEVEL_CONFIGS.length;
      for (let i = 0; i < maxLevel; i++) {
        const keyCode = Phaser.Input.Keyboard.KeyCodes.ONE + i;
        kb.addKey(keyCode).on('down', () => {
          this.scene.stop('UI');
          this.scene.start('Game', {
            level: i,
            totalScore: this.score,
            completedNodes: this.completedNodes,
          });
          this.scene.launch('UI');
        });
      }
    }

    // Boss projectile — large orange orb
    const bpg = this.add.graphics();
    bpg.fillStyle(pal('hostile1'), 0.9);
    bpg.fillCircle(16, 16, 16);
    bpg.fillStyle(pal('amber1'), 0.6);
    bpg.fillCircle(16, 16, 9);
    bpg.generateTexture('boss-projectile', 32, 32);
    bpg.destroy();

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);

    // --- Moving-platform texture (shared across all levels) ---
    if (!this.textures.exists('moving-platform')) {
      const mpg = this.add.graphics();
      mpg.fillStyle(pal('cold2'), 1);
      mpg.fillRect(0, 0, 128, 16);
      mpg.lineStyle(2, pal('cyan1'), 1);
      mpg.strokeRect(0, 0, 128, 16);
      mpg.fillStyle(pal('cyan1'), 0.4);
      mpg.fillRect(4, 4, 120, 4);
      mpg.generateTexture('moving-platform', 128, 16);
      mpg.destroy();
    }

    if (nodeIdx === 1) makeFreightLiftTexture(this);

    // --- Background ---
    this.makeBackground();

    // --- Ground (tilemap) ---
    this.ground = this.physics.add.staticGroup();
    const mapSeed = devParams().seed ?? (Math.random() * 0xFFFFFFFF | 0);
    const mapTiles = buildMap(this.activeConfig.template, mapSeed);
    this.terrain = new TerrainProbe(mapTiles, this.activeConfig.template.tileK.EMPTY);
    this.flightNavigation = new FlightNavigation(mapTiles);
    this.ai = new AiWorld(this.terrain, this.flightNavigation);
    this.makeTilemapGround(
      mapTiles,
      this.activeConfig.tilesetKey,
    );

    // --- Platforms ---
    // Tilemap supplies the actual platform geometry via TMPL fixedPlatforms /
    // extraPlatforms (see buildMap). makeTilemapGround also populates
    // platformData for the radar.
    const tmpl = this.activeConfig.template;
    if (tmpl.map) {
      // text-map levels: the world kit replaces the legacy props and ambient life
      dressLevel(this, tmpl.map, tmpl.dressing ?? []);
    } else {
      this.makeBaseProps();
      if (nodeIdx === 1) drawTradeLaneArt(this, tmpl);
      new EnvironmentalLife(this, this.activeConfig).create();
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

    this.tanks = this.physics.add.group({ runChildUpdate: true });

    this.pickups = this.physics.add.group({
      maxSize: 24,
      runChildUpdate: false,
      allowGravity: true,
    });
    this.pickupSystem = new PickupSystem(this);

    this.bossProjectiles = this.physics.add.group({
      defaultKey: 'boss-projectile',
      maxSize: 10,
      runChildUpdate: false,
      allowGravity: false,
    });

    this.ppcRounds = this.physics.add.group({
      runChildUpdate: false,
      allowGravity: false,
    });

    // --- Player ---
    // Origin (0.5, 1) → feet at position y. Start 5px above ground.
    const spawn = spawnPoint(this.activeConfig, GROUND_Y);
    this.player = new Player(this, spawn.x, spawn.y);
    this.add.existing(this.player);
    this.physics.add.existing(this.player);
    this.playerHud = new PlayerHud(this, this.player);

    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    pb.setSize(HARROW_BODY.w, HARROW_BODY.h, true);
    pb.setCollideWorldBounds(true);
    pb.setMaxVelocityX(1200);

    new CollisionRegistry(this).registerCore();
    this.hostileCombat = new HostileCombat(this);
    this.pickupSystem.registerCollectionOverlap();

    // --- Camera ---
    this.cameras.main.setBounds(0, -(GAME_H - 120), WORLD_WIDTH, WORLD_HEIGHT + (GAME_H - 120));
    this.worldPipeline = installPipeline(this, this.cameras.main, 'world');
    this.applyGraphics(graphics());
    this.snapCameraTo(this.player.x, this.player.y, 1);
    const onGraphics = (s: GraphicsSettings) => this.applyGraphics(s);
    this.game.events.on('graphicsChanged', onGraphics);
    this.gameEventUnsubs.push(() => this.game.events.off('graphicsChanged', onGraphics));

    // --- Moving platforms (Trade Lanes only) ---
    this.movingPlatforms = this.physics.add.group({ runChildUpdate: true });
    if (this.activeConfig.movingPlatforms.length > 0) {
      this.spawnMovingPlatforms();
      new CollisionRegistry(this).registerMovingPlatforms();
    }

    // --- Spawner ---
    const cfg = this.activeConfig;
    const startAtBoss = devParams().boss;
    if (this.currentNode !== 0) this.spawner = new DroneSpawner(this, cfg.waveCount, cfg.bossType, cfg.enemyMix, startAtBoss);
    this.music?.start(0.34);

    // --- Wave audio ---
    const onWaveStart = (wave: number) => {
      this.audio.playWaveStinger();
      if (this.currentNode === 0) {
        if (wave > 3) this.music?.setBossMode();
        else this.music?.setIntensity(musicIntensityForWave(wave, 3));
        return;
      }
      if (wave > cfg.waveCount) {
        this.music?.setBossMode();
        this.showRadioTransmission('PRIORITY', cfg.bossWarning, true);
      } else {
        this.music?.setIntensity(musicIntensityForWave(wave, cfg.waveCount));
        const line = cfg.radioLines[(wave - 1) % cfg.radioLines.length];
        this.showRadioTransmission('LUNAR CONTROL', line);
      }
    };
    this.events.on('waveStart', onWaveStart);
    this.gameEventUnsubs.push(() => this.events.off('waveStart', onWaveStart));

    // --- Score tracking + kill streak + pickups ---
    const STREAK_MILESTONES = [3, 5, 10, 20];
    const STREAK_BONUSES    = [50, 100, 150, 200];

    const onDroneKilled = (x: number, y: number) => {
      // Base 100pts now drops as a pickup — must be collected.
      this.spawnPickup(x, y, 'score');

      // Kill streak milestone check (bonuses stay auto-awarded)
      this.killStreak++;
      const milestoneIdx = STREAK_MILESTONES.indexOf(this.killStreak);
      if (milestoneIdx !== -1) {
        const bonus = STREAK_BONUSES[milestoneIdx];
        this.score += bonus;
        this.events.emit('scoreChange', this.score);
        this.events.emit('killStreak', this.killStreak, bonus);
        this.audio.playStreakChime(this.killStreak);
      }

      // Random supply drop — ammo most common, then health/fuel.
      // Rates shaved ~18% to offset faster turret kill-rate → drop cadence stays
      // in the same ballpark as pre-rebalance.
      const roll = Math.random();
      if (roll < 0.15) {
        this.spawnPickup(x, y, 'health');
      } else if (roll < 0.30) {
        this.spawnPickup(x, y, 'fuel');
      } else if (roll < 0.58) {
        this.spawnPickup(x, y, 'ammo');
      }
    };
    this.events.on('droneKilled', onDroneKilled);
    this.gameEventUnsubs.push(() => this.events.off('droneKilled', onDroneKilled));

    // Reset kill streak on damage
    const onHealthChange = (hp: number) => {
      if (hp < this.prevHp) {
        this.killStreak = 0;
      }
      this.prevHp = hp;
    };
    this.events.on('healthChange', onHealthChange);
    this.gameEventUnsubs.push(() => this.events.off('healthChange', onHealthChange));

    const onGameOver = () => {
      this.isGameOver = true;
    };
    this.events.on('gameOver', onGameOver);
    this.gameEventUnsubs.push(() => this.events.off('gameOver', onGameOver));

    const onBossKilled = () => {
      this.score += 1000;
      this.events.emit('scoreChange', this.score);
    };
    this.events.on('bossKilled', onBossKilled);
    this.gameEventUnsubs.push(() => this.events.off('bossKilled', onBossKilled));

    // levelComplete fires after final boss dies (emitted by DroneSpawner)
    const onLevelComplete = () => {
      this.isBossDead = true;
    };
    this.events.on('levelComplete', onLevelComplete);
    this.gameEventUnsubs.push(() => this.events.off('levelComplete', onLevelComplete));

    if (this.currentNode === 0) {
      const requested = devParams().encounter ?? 0;
      const startAtEncounter = requested >= 1 && requested <= 3 && Number.isInteger(requested) ? requested - 1 : undefined;
      this.surfaceMission = new SurfaceMission(this, startAtBoss, startAtEncounter);
    }

    // --- Emit initial HUD state ---
    this.events.emit('healthChange', this.player.hp, this.player.maxHp);
    this.events.emit('missileCooldown', 0);
    this.events.emit('turretCooldown', 1);
    this.events.emit('jetpackFuel', 1, 1);
    this.events.emit('rapidAmmoChange', this.player.rapidAmmo, this.player.rapidAmmoMax);
    this.events.emit('scoreChange', this.score);

    markDevReady(this);
  }


  /** Camera zoom and retro filter follow the graphics settings (pause menu: G / V). */
  private applyGraphics(s: GraphicsSettings): void {
    this.cameras.main.setZoom(cameraZoom(s));
    this.worldPipeline?.apply(s);
  }

  /** The active level's map template (ground, ceiling, rows). */
  get levelTemplate() { return this.activeConfig.template; }


  /**
   * Manual camera follow. The float target is lerped frame-rate independently and the
   * camera scroll is snapped to the virtual pixel grid so scenery never shimmers under
   * the retro filter's block snap.
   */
  private snapCameraTo(x: number, y: number, t: number): void {
    const cam = this.cameras.main;
    const tx = x - cam.width * 0.5;
    const ty = y - CAMERA_FEET_OFFSET - cam.height * 0.5;
    this.camFollow.x += (tx - this.camFollow.x) * t;
    this.camFollow.y += (ty - this.camFollow.y) * t;
    cam.setScroll(Math.round(this.camFollow.x / VPX) * VPX, Math.round(this.camFollow.y / VPX) * VPX);
  }

  update(time: number, delta: number): void {
    // The rig keeps animating after death: the wreck burns while the game-over screen is up.
    this.player.tickPresentation(delta);
    if (this.isGameOver) return;
    this.ai?.update(Math.min(delta, 50) / 1000);
    this.player.update(time, delta);
    const k = delta / (1000 / 60);
    this.snapCameraTo(this.player.x, this.player.y, 1 - Math.pow(1 - CAMERA_LERP, k));
    this.playerHud?.update();
    this.spawner?.update(time, delta);
    this.surfaceMission?.update(time, delta);
    // Moving platforms: runChildUpdate is true on the group, so they self-update
    this.ppcRounds.getChildren().forEach((go) => {
      const r = go as PPCRound;
      if (r.active) r.tick(delta);
    });
    this.cullBullets();
    this.pickupSystem?.updateMagnet();
    this.updateParallax(delta);
  }

  shutdown(): void {
    for (const unsub of this.gameEventUnsubs.splice(0)) unsub();
    this.surfaceMission?.destroy();
    this.surfaceMission = undefined;
    this.spawner?.destroy();
    this.spawner = undefined;
    this.music?.destroy();
    this.music = null;
    this.audio?.destroy();
    this.playerHud?.destroy();
    this.playerHud = undefined;
    this.debugLog?.destroy();
    this.debugLog = undefined;
  }

  public triggerGameOver(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.events.emit('gameOver');
  }

  public isGameOverActive(): boolean {
    return this.isGameOver;
  }

  /** Where enemies aim: HARROW's torso. */
  public getPlayerPos(): { x: number; y: number } {
    return this.player.getAimPoint();
  }

  public getApproxGroundY(): number {
    return this.levelGroundY;
  }

  private spawnMovingPlatforms(): void {
    for (const spec of this.activeConfig.movingPlatforms) {
      const mp = new MovingPlatform(
        this, spec.x, spec.y, spec.width, spec.travel, spec.speed,
        spec.startForward ?? true, spec.axis,
      );
      this.add.existing(mp);
      this.movingPlatforms.add(mp, true);
    }
  }

  /** Bitmap callout that rises and fades over the world (damage numbers, pickups). */
  spawnFloatingText(
    x: number,
    y: number,
    text: string,
    role: Role = 'ink',
    opts?: { icon?: IconName; big?: boolean; rise?: number; duration?: number },
  ): void {
    const rise = opts?.rise ?? 30;
    const duration = opts?.duration ?? 600;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const t = text ? uiLabel(this, 0, 0, text, opts?.big ? 'body' : 'small', role).setOrigin(opts?.icon ? 0 : 0.5, 1) : undefined;
    if (opts?.icon) {
      const g = uiIcon(this, 0, -8, opts.icon, 2, role);
      parts.push(g);
      if (t) t.setX(16);
    }
    if (t) parts.push(t);
    const w = (t?.width ?? 0) + (opts?.icon ? 16 : 0);
    const c = this.add.container(Math.round(x - (opts?.icon ? w / 2 : 0)), Math.round(y), parts).setDepth(25);
    this.tweens.add({ targets: c, y: y - rise, alpha: 0, duration, onComplete: () => c.destroy() });
  }

  /**
   * Single tinted snapshot of the player's current frame, fading out behind the dash path.
   * Cheap echo — same texture/frame, no physics, time-tweened destruction.
   */
  spawnSurgeGhost(player: Player): void {
    player.rigView.spawnGhost('cyan2', 0.45, 260);
  }


  /**
   * Particle trail that follows the player for the duration of the surge — dissipating
   * cyan/white "thrust material" sprayed opposite the dash direction.
   */
  spawnSurgeTrail(player: Player, dir: 1 | -1, durationMs: number): void {
    const back = dir > 0 ? 180 : 0; // emit backward relative to dash
    const emitter = this.add.particles(player.x, player.y - 28, 'flare', {
      speed:    { min: 90,  max: 230 },
      angle:    { min: back - 28, max: back + 28 },
      scale:    { start: 1.1, end: 0 },
      alpha:    { start: 0.85, end: 0 },
      tint:     [pal('cyan2'), pal('cyan3'), pal('cyan3'), pal('cyan1')],
      lifespan: { min: 220, max: 420 },
      frequency: 14, // emit one every ~14ms while active
      blendMode: 'ADD',
    }).setDepth(player.depth - 1);
    emitter.startFollow(player, 0, -28);

    // Stop emitting when the dash ends; keep the emitter alive long enough for in-flight
    // particles to finish their lifespan, then destroy.
    this.time.delayedCall(durationMs, () => emitter.stop());
    this.time.delayedCall(durationMs + 500, () => emitter.destroy());
  }

  /** Forward-biased blue shockwave: expanding ring + particle cone + AoE damage sweep. */
  spawnSurgeShockwave(x: number, y: number, dir: 1 | -1, radius: number, damage: number): void {
    const hit = new Set<Phaser.GameObjects.GameObject>();
    const damageOne = (obj: Phaser.GameObjects.GameObject): void => {
      if (hit.has(obj)) return;
      const s = obj as Phaser.GameObjects.Sprite & { takeDamage?: (n: number) => void; active?: boolean };
      if (!s.active) return;
      const dx = (s as unknown as { x: number }).x - x;
      const dy = (s as unknown as { y: number }).y - y;
      if (dx * dx + dy * dy > radius * radius) return;
      // Forward cone: require the target be in front of the mech (or very close horizontally)
      if (Math.abs(dx) > 12 && Math.sign(dx) !== dir) return;
      if (typeof s.takeDamage !== 'function') return;
      hit.add(obj);
      s.takeDamage(damage);
      const sx = (s as unknown as { x: number }).x;
      const sy = (s as unknown as { y: number }).y;
      this.spawnFloatingText(sx, sy - 20, `-${damage}`, 'accent');
    };
    this.drones.getChildren().forEach(damageOne);
    this.tanks.getChildren().forEach(damageOne);

    // Expanding ring — half-disc oriented in dir
    const ring = this.add.graphics().setDepth(22);
    const startR = 18;
    const endR   = radius;
    const state  = { r: startR, a: 1 };
    const startAngle = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    const endAngle   = dir > 0 ?  Math.PI / 2 : (3 * Math.PI) / 2;
    this.tweens.add({
      targets:  state,
      r:        endR,
      a:        0,
      duration: 320,
      ease:     'Cubic.Out',
      onUpdate: () => {
        ring.clear();
        ring.lineStyle(3, pal('cyan2'), state.a);
        ring.beginPath();
        ring.arc(x, y, state.r, startAngle, endAngle, false);
        ring.strokePath();
        // Inner glow rim
        ring.lineStyle(1, pal('cyan3'), state.a * 0.6);
        ring.beginPath();
        ring.arc(x, y, state.r - 3, startAngle, endAngle, false);
        ring.strokePath();
      },
      onComplete: () => ring.destroy(),
    });

    // Forward particle cone
    const baseAngle = dir > 0 ? 0 : 180;
    const emitter = this.add.particles(x, y, 'flare', {
      speed:    { min: 180, max: 360 },
      angle:    { min: baseAngle - 30, max: baseAngle + 30 },
      scale:    { start: 1.6, end: 0 },
      alpha:    { start: 1, end: 0 },
      tint:     [pal('cyan2'), pal('cyan3'), pal('cyan3'), pal('cyan1')],
      lifespan: { min: 180, max: 320 },
      emitting: false,
      blendMode: 'ADD',
    }).setDepth(21);
    emitter.explode(10);
    this.time.delayedCall(400, () => emitter.destroy());

    this.cameras.main.shake(80, 0.004);
  }

  private spawnPickup(x: number, y: number, type: PickupType): void {
    this.pickupSystem?.spawn(x, y, type);
  }


  /**
   * Missile detonation: existing fireball + a white-hot core flash + an expanding
   * shockwave ring with a WebGL glow shader, plus AoE splash damage to nearby enemies.
   * Pass `primary` so the directly-impacted enemy (already taking full damage from the
   * collision handler) isn't double-damaged.
   */
  spawnMissileBlast(
    x: number,
    y: number,
    opts?: { primary?: Phaser.GameObjects.GameObject; splashRadius?: number; splashDamage?: number },
  ): void {
    const radius = opts?.splashRadius ?? 110;
    const splashDamage = opts?.splashDamage ?? 1;
    const primary = opts?.primary ?? null;

    // Existing particle fireball — preserves the orange/yellow shrapnel look
    this.spawnExplosion(x, y);

    // White-hot core flash — short, additive, fades fast
    const core = this.add.graphics().setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
    const cs = { r: 4, a: 1 };
    this.tweens.add({
      targets: cs, r: radius * 0.42, a: 0,
      duration: 200,
      ease: 'Quad.Out',
      onUpdate: () => {
        core.clear();
        core.fillStyle(pal('cyan3'), cs.a);
        core.fillCircle(x, y, cs.r);
      },
      onComplete: () => core.destroy(),
    });

    // Expanding shockwave ring
    const ring = this.add.graphics().setDepth(22);
    const rs = { r: 8, a: 1 };
    this.tweens.add({
      targets: rs, r: radius, a: 0,
      duration: 380,
      ease: 'Cubic.Out',
      onUpdate: () => {
        ring.clear();
        ring.lineStyle(4, pal('amber1'), rs.a);
        ring.strokeCircle(x, y, rs.r);
        ring.lineStyle(2, pal('cyan3'), rs.a * 0.7);
        ring.strokeCircle(x, y, rs.r - 3);
      },
      onComplete: () => ring.destroy(),
    });

    this.cameras.main.shake(180, 0.012);

    // AoE splash damage to drones + tanks within radius (skip the primary impact target)
    const r2 = radius * radius;
    const splashGroup = (group: Phaser.Physics.Arcade.Group): void => {
      group.getChildren().forEach((go) => {
        if (go === primary) return;
        const obj = go as Phaser.GameObjects.Sprite & { takeDamage?: (n: number) => void };
        if (!obj.active || typeof obj.takeDamage !== 'function') return;
        const dx = obj.x - x;
        const dy = obj.y - y;
        if (dx * dx + dy * dy > r2) return;
        obj.takeDamage(splashDamage);
        this.spawnFloatingText(obj.x, obj.y - 16, `-${splashDamage}`, 'warn');
      });
    };
    splashGroup(this.drones);
    splashGroup(this.tanks);
  }

  spawnExplosion(x: number, y: number): void {
    const emitter = this.add.particles(x, y, 'flare', {
      speed:    { min: 60, max: 160 },
      angle:    { min: 0, max: 360 },
      gravityY: 280,
      scale:    { start: 1.2, end: 0 },
      alpha:    { start: 1, end: 0 },
      tint:     [pal('hostile1'), pal('hostile1'), pal('amber1'), pal('amber1')],
      lifespan: { min: 1500, max: 3000 },
      emitting: false,
      blendMode: 'ADD',
    });
    emitter.setDepth(20);
    emitter.explode(7);
    this.time.delayedCall(3200, () => emitter.destroy());
  }

  /** Quick spark burst at a projectile impact point.
   *  type='geometry' → cool dust/sparks that fall. type='enemy' → hot sparks + optional chunks. */
  spawnBulletImpact(x: number, y: number, type: 'enemy' | 'geometry'): void {
    const cfg = type === 'enemy'
      ? { tints: [pal('cyan3'), pal('amber1'), pal('hostile1')], count: 5, gravity: 120, speed: [80, 220] as [number, number], life: [160, 320] as [number, number] }
      : { tints: [pal('hull6'), pal('hull5'), pal('hull6')], count: 4, gravity: 320, speed: [40, 160] as [number, number], life: [200, 400] as [number, number] };

    const emitter = this.add.particles(x, y, 'pixel', {
      speed:    { min: cfg.speed[0], max: cfg.speed[1] },
      angle:    { min: 0, max: 360 },
      gravityY: cfg.gravity,
      scale:    { start: 1.4, end: 0 },
      alpha:    { start: 1, end: 0 },
      tint:     cfg.tints,
      lifespan: { min: cfg.life[0], max: cfg.life[1] },
      emitting: false,
      blendMode: 'ADD',
    });
    emitter.setDepth(19);
    emitter.explode(cfg.count);
    this.time.delayedCall(cfg.life[1] + 100, () => emitter.destroy());
  }

  /** Bits falling off an enemy — tinted chunks with gravity. Called on hits, low chance. */
  spawnEnemyChunks(x: number, y: number, tint = pal('hull6'), count = 3): void {
    const emitter = this.add.particles(x, y, 'pixel', {
      speed:    { min: 60, max: 180 },
      angle:    { min: 200, max: 340 }, // upward spray, then gravity pulls down
      gravityY: 520,
      scale:    { start: 1.2, end: 0.6 },
      alpha:    { start: 1, end: 0 },
      tint:     [tint, pal('hull4'), pal('hull1')],
      lifespan: { min: 600, max: 1100 },
      rotate:   { start: 0, end: 360 },
      emitting: false,
    });
    emitter.setDepth(18);
    emitter.explode(count);
    this.time.delayedCall(1200, () => emitter.destroy());
  }

  private makeBackground(): void {
    // Sky — color from level config
    const skyColor = this.activeConfig?.bgSkyColor ?? pal('void');
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, skyColor)
      .setDepth(0).setScrollFactor(0);

    // Dedup texture keys on scene restart (instance is reused, not reconstructed)
    for (const key of ['bgStars', 'bgTerrain']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }

    // Layer 1: starfield — 2×2 dots on even coordinates so every star covers a whole cell of
    // the retro filter's 2px grid (1px stars flickered in and out as the grid sampled past them).
    const starsGfx = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 260; i++) {
      starsGfx.fillStyle(pal('cyan3'), 0.25 + Math.random() * 0.30);
      starsGfx.fillRect(
        Phaser.Math.Between(0, GAME_W / 2 - 1) * 2,
        Phaser.Math.Between(0, GROUND_Y / 2 - 1) * 2,
        2, 2,
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
    terrainGfx.fillStyle(pal('hull0'), 1);
    terrainGfx.fillRect(0, 0, GAME_W, 200);
    for (let i = 0; i < 7; i++) {
      const cx = hash(i + 200) * GAME_W;
      const cr = 30 + hash(i + 400) * 50;
      // Center at bottom edge (y=200); upper semicircle cuts upward into terrain
      terrainGfx.fillStyle(pal('void'), 1);
      terrainGfx.slice(cx, 200, cr, Math.PI, 0, false); // clockwise PI→0 = upper semicircle
      terrainGfx.fillPath();
    }
    terrainGfx.generateTexture('bgTerrain', GAME_W, 200);
    terrainGfx.destroy();
    if (!this.activeConfig?.template.map) {
      this.bgTerrain = this.add.tileSprite(GAME_W / 2, GROUND_Y, GAME_W, 200, 'bgTerrain')
        .setDepth(2).setOrigin(0.5, 1).setScrollFactor(0);
      this.makeBackgroundDomes();
    }

    if (this.activeConfig?.template.map) this.backdrop = new SurfaceBackdrop(this);
    else if (this.activeConfig?.nodeIndex === 0) this.makeSurfaceSignature();
  }

  private showRadioTransmission(speaker: string, message: string, warning = false): void {
    this.events.emit('radioTransmission', speaker, message, warning);
  }

  // Surface-Ops-only sky signature: Earth on the horizon, twinkling stars,
  // and slow moon-dust drift at ground level. Makes node 0 read as "lunar"
  // rather than generic "industrial night."
  private makeSurfaceSignature(): void {
    // ── Earth ──
    // scrollFactor 0.04 keeps it nearly locked to the sky but drifts a little
    // so depth reads correctly against the faster dome layers.
    const earthX = 360;
    const earthY = 95;
    const R = 88;
    const earth = this.add.graphics()
      .setDepth(1.1)
      .setScrollFactor(0.04)
      .setPosition(earthX, earthY);

    // Soft atmosphere halo — 6 rings, outer-most is dimmest. Layered this way
    // so the edge reads as light scattering instead of a hard outline.
    for (let i = 6; i >= 1; i--) {
      earth.fillStyle(pal('hull5'), 0.05 * i);
      earth.fillCircle(0, 0, R + i * 3);
    }

    // Ocean with limb darkening — successive rings brighten toward the
    // sunlit core, offset slightly up-left so the center of brightness
    // sits on the implied-sun side.
    earth.fillStyle(pal('cold0'), 1); earth.fillCircle(0, 0, R);
    earth.fillStyle(pal('cold1'), 1); earth.fillCircle(-2, -2, R - 6);
    earth.fillStyle(pal('cyan0'), 1); earth.fillCircle(-4, -4, R - 14);
    earth.fillStyle(pal('cold2'), 1); earth.fillCircle(-6, -6, R - 26);

    // Polar ice caps (ellipses inside the disc)
    earth.fillStyle(pal('cyan3'), 0.60);
    earth.fillEllipse(0, -R * 0.88, R * 0.90, R * 0.22);
    earth.fillEllipse(0,  R * 0.88, R * 0.80, R * 0.18);

    // Continents — stylized polygon landmasses. Points hand-tuned so all
    // vertices sit inside the ocean disc (max radius ~44 vs R=88) and the
    // silhouette reads as land, not overlapping paint blobs.
    const continents: number[][] = [
      [-38, -26, -20, -34, -8, -20, -16, -4, -4, 12, -12, 26, -28, 20, -40, 4, -44, -8],
      [10, -28, 30, -22, 42, -10, 40, 10, 26, 24, 14, 20, 4, 4, 16, -8, 2, -16],
      [20, 36, 32, 38, 38, 46, 28, 48, 18, 44],
    ];
    earth.fillStyle(pal('green0'), 1);
    for (const flat of continents) {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        pts.push(new Phaser.Math.Vector2(flat[i], flat[i + 1]));
      }
      earth.fillPoints(pts, true);
    }

    // Interior land highlights — brighter green dots to suggest lit terrain
    earth.fillStyle(pal('regolith2'), 0.75);
    earth.fillCircle(-30, -16, 5);
    earth.fillCircle(26,  -6, 5);
    earth.fillCircle(34,   8, 4);
    earth.fillCircle(-16, 18, 4);
    earth.fillCircle(28,  42, 3);

    // Cloud bands — thin stretched ellipses at varying latitudes,
    // two alpha tiers so some bands read as high-cirrus wisps.
    earth.fillStyle(pal('cyan3'), 0.22);
    earth.fillEllipse(-16, -46, 44, 6);
    earth.fillEllipse( 12, -12, 56, 6);
    earth.fillEllipse(-30,  36, 40, 6);
    earth.fillEllipse( 28,  22, 34, 5);
    earth.fillStyle(pal('cyan3'), 0.42);
    earth.fillEllipse(  4, -38, 28, 3);
    earth.fillEllipse(-12,   4, 22, 3);
    earth.fillEllipse( 22,  48, 20, 3);

    // Terminator — feathered dark side via stacked slice fills with
    // increasing offset, producing a soft gradient instead of a hard line.
    for (let i = 0; i < 5; i++) {
      const alpha = 0.12 + i * 0.05;
      earth.fillStyle(pal('void'), alpha);
      earth.beginPath();
      earth.slice(i * 3, i * 2, R - i * 2, -Math.PI * 0.18, Math.PI * 0.82, false);
      earth.fillPath();
    }

    // Specular rim — two stacked arcs on sunlit edge for a brighter hit
    earth.lineStyle(1.5, pal('cyan3'), 0.75);
    earth.beginPath();
    earth.arc(0, 0, R - 0.5, Math.PI * 1.0, Math.PI * 1.55, false);
    earth.strokePath();
    earth.lineStyle(1, pal('cyan3'), 0.45);
    earth.beginPath();
    earth.arc(0, 0, R - 1, Math.PI * 1.12, Math.PI * 1.40, false);
    earth.strokePath();

    // ── Twinkling stars ──
    // Fixed screen-space dots that tween alpha independently. Kept small (28)
    // so the existing static starfield stays dominant — these are accents.
    for (let i = 0; i < 28; i++) {
      const sx = Phaser.Math.Between(20, GAME_W - 20);
      const sy = Phaser.Math.Between(10, 200);
      // Avoid overlapping the Earth disc
      if (Phaser.Math.Distance.Between(sx, sy, earthX, earthY) < R + 12) continue;
      const star = this.add.rectangle(sx, sy, 2, 2, pal('cyan3'), 1)
        .setDepth(1.05)
        .setScrollFactor(0);
      this.tweens.add({
        targets:  star,
        alpha:    { from: 0.2, to: 1 },
        duration: Phaser.Math.Between(900, 2400),
        delay:    Phaser.Math.Between(0, 2000),
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.InOut',
      });
    }

  }

  private makeBackgroundDomes(): void {
    const hash = GameScene.hash;

    // Three depth layers. scrollFactor determines parallax speed and sets
    // the effective canvas width: GAME_W + (WORLD_WIDTH - GAME_W) * f.
    // Domes are spread across that range so they stay visible throughout the run.
    const layers = [
      // Very far — huge, barely-there silhouettes just above the starfield
      { f: 0.06, count: 5, rMin: 210, rMax: 330,
        outerColor: pal('void'), innerColor: pal('void'), rimColor: pal('cold0'), depth: 1.2 },
      // Far — large domes, subtle blue tint
      { f: 0.13, count: 7, rMin: 140, rMax: 230,
        outerColor: pal('void'), innerColor: pal('cold0'), rimColor: pal('cold0'), depth: 1.5 },
      // Mid-far — most visible, richer blue, smaller
      { f: 0.22, count: 9, rMin:  90, rMax: 165,
        outerColor: pal('hull0'), innerColor: pal('cold0'), rimColor: pal('cold1'), depth: 1.8 },
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
      g.fillStyle(pal('cold0'), 1);
      g.slice(0, 0, r, Math.PI, 0, false);
      g.fillPath();

      // Inner glow (60% radius)
      g.fillStyle(pal('hull0'), 1);
      g.slice(0, 0, r * 0.6, Math.PI, 0, false);
      g.fillPath();

      // Panel lines — radial from center to rim
      const lineCount = 4 + Math.floor(hash(i + 40) * 3);
      g.lineStyle(1, pal('cold1'), 1);
      for (let l = 0; l < lineCount; l++) {
        if (dmg && l === 1) continue; // leave a gap for damaged domes
        const a = -Math.PI + (Math.PI * (l + 1)) / (lineCount + 1);
        g.lineBetween(0, 0, Math.cos(a) * r, Math.sin(a) * r);
      }

      // Base plate (at ground level = y:0 in local coords since position is GROUND_Y)
      g.fillStyle(pal('hull1'), 1);
      g.fillRect(-r - 10, 0, r * 2 + 20, 12);

      // Airlock nub
      g.fillStyle(pal('hull1'), 1);
      g.fillRect(-7, -18, 14, 18);

      // Window dot at upper-center
      g.fillStyle(dmg ? pal('hostile1') : pal('hull5'), dmg ? 1 : 0.6);
      g.fillCircle(0, -r * 0.65, 4);

      // Crack for damaged domes
      if (dmg) {
        g.lineStyle(1, pal('hostile1'), 0.7);
        const crackA = -Math.PI * 0.7;
        g.lineBetween(
          Math.cos(crackA) * r * 0.9, Math.sin(crackA) * r * 0.9,
          Math.cos(crackA) * r * 0.3 + hash(i + 60) * 10 - 5,
          Math.sin(crackA) * r * 0.3,
        );
      }
    }

    // ── Solar Array Clusters (5) ─────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const cx   = Math.max(300, Math.min(6000, 400 + i * 1100 + (hash(i + 210) * 300 - 150)));
      const cnt  = 3 + Math.floor(hash(i + 220) * 3); // 3–5 panels
      for (let p = 0; p < cnt; p++) {
        const px = cx + (p - (cnt - 1) / 2) * 44;

        const g = this.add.graphics().setDepth(3.5);
        g.fillStyle(pal('hull1'), 1);
        g.fillRect(px - 2, GROUND_Y - 40, 4, 40);

        // Panel tilted 30° (rotates around center of rectangle)
        this.add.rectangle(px, GROUND_Y - 40, 32, 10, pal('hull2'))
          .setDepth(3.5).setAngle(30);

        // Panel highlight
        this.add.rectangle(px, GROUND_Y - 44, 30, 1, pal('hull3'))
          .setDepth(3.6).setAngle(30);
      }
    }
  }

  private updateParallax(delta: number): void {
    const sx = this.cameras.main.scrollX;
    if (this.activeConfig.trainEffect) {
      this.trainOffset += delta * 0.12; // ~120 px/s leftward drift
      if (this.bgStars)   this.bgStars.setTilePosition(snapVpx(sx * 0.05 - this.trainOffset * 0.15), 0);
      if (this.bgTerrain) this.bgTerrain.setTilePosition(snapVpx(sx * 0.20 - this.trainOffset * 0.55), 0);
      return;
    }
    if (this.bgStars)   this.bgStars.setTilePosition(snapVpx(sx * 0.05), 0);
    if (this.bgTerrain) this.bgTerrain.setTilePosition(snapVpx(sx * 0.20), 0);
    this.backdrop?.update(sx);
  }

  private makeTilemapGround(mapData: number[][], tilesetKey = 'industrial-tileset'): void {
    const map = this.make.tilemap({
      data: mapData,
      tileWidth: 32,
      tileHeight: 32,
    });

    const tileset = map.addTilesetImage(tilesetKey, tilesetKey);
    if (!tileset) {
      console.warn(`[GameScene] tileset "${tilesetKey}" not found — ground tilemap skipped`);
      return;
    }

    this.groundLayer = map.createLayer(0, tileset, 0, 0) ?? undefined;
    if (!this.groundLayer) return;

    this.groundLayer.setCollisionByExclusion([-1]);
    this.groundLayer.setDepth(4);

    // Populate platformData (used by the minimap) from tilemap geometry.
    // Scan each row above the ground row for contiguous SURFACE-tile runs;
    // each run becomes one platformData entry.
    this.platformData = [];
    const groundRow = this.activeConfig.template.groundRow;
    for (let r = 0; r < groundRow; r++) {
      let c = 0;
      while (c < mapData[r].length) {
        if (mapData[r][c] === -1) { c++; continue; }
        const startC = c;
        while (c < mapData[r].length && mapData[r][c] !== -1) c++;
        const runLen = c - startC;
        if (runLen >= 2) {
          const x = (startC + runLen / 2) * 32;
          const y = r * 32;
          const w = runLen * 32;
          this.platformData.push({ x, y, w });
        }
      }
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
