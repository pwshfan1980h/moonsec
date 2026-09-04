import Phaser from 'phaser';
import { Player } from '../entities/Player';
import type { MechType } from '../entities/Player';
import { SurfaceMission } from '../systems/SurfaceMission';
import { DroneSpawner } from '../systems/DroneSpawner';
import { AudioSystem } from '../systems/AudioSystem';
import { MusicSystem, musicIntensityForWave } from '../systems/MusicSystem';
import { PlayerHud } from '../ui/PlayerHud';
import { MovingPlatform } from '../entities/MovingPlatform';
import { PPCRound } from '../entities/PPCRound';
import { GAME_W, GAME_H, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT } from '../constants';
import { buildMap } from '../data/levelData';
import { LEVEL_CONFIGS, NODE_GRAPH } from '../data/levelConfigs';
import type { LevelConfig } from '../data/levelConfigs';
import { DebugLog } from '../systems/DebugLog';
import { PickupSystem } from '../systems/PickupSystem';
import type { PickupType } from '../systems/PickupSystem';
import { CollisionRegistry } from '../collisions/CollisionRegistry';
import { EnvironmentalLife } from '../systems/EnvironmentalLife';

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
  private pickupSystem?: PickupSystem;
  private gameEventUnsubs: Array<() => void> = [];
  private bgStars?: Phaser.GameObjects.TileSprite;
  private bgTerrain?: Phaser.GameObjects.TileSprite;
  private bgHaze?: Phaser.GameObjects.TileSprite;
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

  init(data: { mechType?: MechType; totalScore?: number; level?: number; completedNodes?: number[] }): void {
    if (data.mechType)                this.registry.set('mechType',      data.mechType);
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
    this.bgHaze          = undefined;
    this.bgStars         = undefined;
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
            mechType: (this.registry.get('mechType') as MechType) ?? 'mech4',
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
    bpg.fillStyle(0xff6600, 0.9);
    bpg.fillCircle(16, 16, 16);
    bpg.fillStyle(0xffaa44, 0.6);
    bpg.fillCircle(16, 16, 9);
    bpg.generateTexture('boss-projectile', 32, 32);
    bpg.destroy();

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);

    // --- Moving-platform texture (shared across all levels) ---
    if (!this.textures.exists('moving-platform')) {
      const mpg = this.add.graphics();
      mpg.fillStyle(0x2a4a8a, 1);
      mpg.fillRect(0, 0, 128, 16);
      mpg.lineStyle(2, 0x5588cc, 1);
      mpg.strokeRect(0, 0, 128, 16);
      mpg.fillStyle(0x5588cc, 0.4);
      mpg.fillRect(4, 4, 120, 4);
      mpg.generateTexture('moving-platform', 128, 16);
      mpg.destroy();
    }

    // --- Background ---
    this.makeBackground();

    // --- Ground (tilemap) ---
    this.ground = this.physics.add.staticGroup();
    const mapSeed = Math.random() * 0xFFFFFFFF | 0;
    this.makeTilemapGround(
      buildMap(this.activeConfig.template, mapSeed),
      this.activeConfig.tilesetKey,
    );

    // --- Platforms ---
    // Tilemap supplies the actual platform geometry via TMPL fixedPlatforms /
    // extraPlatforms (see buildMap). makeTilemapGround also populates
    // platformData for the radar.
    this.makeBaseProps();
    new EnvironmentalLife(this, this.activeConfig).create();

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
    const mechType = (this.registry.get('mechType') as MechType) ?? 'mech';
    const spawnCol = this.activeConfig.spawnCol;
    const spawnX = spawnCol !== undefined ? spawnCol * 32 : 300;
    const spawnY = this.activeConfig.spawnRow !== undefined
      ? this.activeConfig.spawnRow * 32 - 4
      : GROUND_Y - 5;
    this.player = new Player(this, spawnX, spawnY, mechType);
    this.add.existing(this.player);
    this.physics.add.existing(this.player);
    this.playerHud = new PlayerHud(this, this.player);

    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const bc = this.player.bodyConfig;
    pb.setSize(bc.w, bc.h, false);
    pb.setOffset(bc.offX, bc.offY);
    pb.setCollideWorldBounds(true);
    pb.setMaxVelocityX(1200);

    new CollisionRegistry(this).registerCore();
    this.pickupSystem.registerCollectionOverlap();

    // --- Camera ---
    this.cameras.main.setBounds(0, -(GAME_H - 120), WORLD_WIDTH, WORLD_HEIGHT + (GAME_H - 120));
    this.cameras.main.setZoom(1.2);
    this.cameras.main.startFollow(this.player, false, 0.20, 0.18);

    // --- Moving platforms (Trade Lanes only) ---
    this.movingPlatforms = this.physics.add.group({ runChildUpdate: true });
    if (this.activeConfig.movingPlatforms.length > 0) {
      this.spawnMovingPlatforms();
      new CollisionRegistry(this).registerMovingPlatforms();
    }

    // --- Spawner ---
    const cfg = this.activeConfig;
    const startAtBoss = import.meta.env.DEV
      && new URLSearchParams(window.location.search).get('boss') === '1';
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
      const requested = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('encounter')) : 0;
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

  }

  update(time: number, delta: number): void {
    if (this.isGameOver) return;
    this.player.update(time, delta);
    this.playerHud?.update();
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    this.audio.update({
      onGround:  pb.blocked.down,
      moving:    Math.abs(pb.velocity.x) > 10,
      velocityX: pb.velocity.x,
      delta,
    });
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

  public getPlayerPos(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
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

  spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color = '#ffffff',
    opts?: { fontSize?: string; rise?: number; duration?: number; stroke?: string },
  ): void {
    const fontSize = opts?.fontSize ?? '14px';
    const rise     = opts?.rise     ?? 30;
    const duration = opts?.duration ?? 600;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace', fontSize, color,
    };
    if (opts?.stroke) { style.stroke = opts.stroke; style.strokeThickness = 3; }
    const t = this.add.text(x, y, text, style).setDepth(25).setOrigin(0.5, 1);
    this.tweens.add({ targets: t, y: y - rise, alpha: 0, duration, onComplete: () => t.destroy() });
  }

  /**
   * Single tinted snapshot of the player's current frame, fading out behind the dash path.
   * Cheap echo — same texture/frame, no physics, time-tweened destruction.
   */
  spawnSurgeGhost(player: Player): void {
    const ghost = this.add.sprite(player.x, player.y, player.texture.key, player.frame.name);
    ghost.setOrigin(player.originX, player.originY);
    ghost.setScale(player.scaleX, player.scaleY);
    ghost.setFlipX(player.flipX);
    ghost.setDepth(player.depth - 1);
    ghost.setTint(0x6de3ff);
    ghost.setAlpha(0.55);
    ghost.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets:  ghost,
      alpha:    0,
      duration: 260,
      ease:     'Cubic.Out',
      onComplete: () => ghost.destroy(),
    });
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
      tint:     [0x6de3ff, 0xaaffff, 0xffffff, 0x2288ff],
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
      this.spawnFloatingText(sx, sy - 20, `-${damage}`, '#6de3ff');
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
        ring.lineStyle(3, 0x6de3ff, state.a);
        ring.beginPath();
        ring.arc(x, y, state.r, startAngle, endAngle, false);
        ring.strokePath();
        // Inner glow rim
        ring.lineStyle(1, 0xffffff, state.a * 0.6);
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
      tint:     [0x6de3ff, 0xaaffff, 0xffffff, 0x2288ff],
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
        core.fillStyle(0xffffcc, cs.a);
        core.fillCircle(x, y, cs.r);
      },
      onComplete: () => core.destroy(),
    });

    // Expanding shockwave ring — Graphics with a WebGL glow post-FX
    const ring = this.add.graphics().setDepth(22);
    // postFX requires WebGL; guard so a Canvas fallback still renders the ring cleanly.
    // Phaser 4 moved/retuned some post-FX typings, so keep this optional at runtime.
    try { (ring as Phaser.GameObjects.Graphics & { postFX?: { addGlow?: (...args: unknown[]) => unknown } }).postFX?.addGlow?.(0xff8833, 6, 0, false, 0.1, 16); } catch { /* canvas — no glow */ }
    const rs = { r: 8, a: 1 };
    this.tweens.add({
      targets: rs, r: radius, a: 0,
      duration: 380,
      ease: 'Cubic.Out',
      onUpdate: () => {
        ring.clear();
        ring.lineStyle(4, 0xffaa44, rs.a);
        ring.strokeCircle(x, y, rs.r);
        ring.lineStyle(2, 0xffffff, rs.a * 0.7);
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
        this.spawnFloatingText(obj.x, obj.y - 16, `-${splashDamage}`, '#ffaa44');
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
      tint:     [0xff6600, 0xff2200, 0xff9900, 0xffcc00],
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
      ? { tints: [0xffddaa, 0xffaa33, 0xff6600], count: 5, gravity: 120, speed: [80, 220] as [number, number], life: [160, 320] as [number, number] }
      : { tints: [0xbbccee, 0x8899aa, 0xddddee], count: 4, gravity: 320, speed: [40, 160] as [number, number], life: [200, 400] as [number, number] };

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
  spawnEnemyChunks(x: number, y: number, tint = 0x99aaff, count = 3): void {
    const emitter = this.add.particles(x, y, 'pixel', {
      speed:    { min: 60, max: 180 },
      angle:    { min: 200, max: 340 }, // upward spray, then gravity pulls down
      gravityY: 520,
      scale:    { start: 1.2, end: 0.6 },
      alpha:    { start: 1, end: 0 },
      tint:     [tint, 0x555566, 0x222233],
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
    const skyColor = this.activeConfig?.bgSkyColor ?? 0x030318;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, skyColor)
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

    if (this.activeConfig?.nodeIndex === 0) this.makeSurfaceSignature();
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
      earth.fillStyle(0x4488ff, 0.05 * i);
      earth.fillCircle(0, 0, R + i * 3);
    }

    // Ocean with limb darkening — successive rings brighten toward the
    // sunlit core, offset slightly up-left so the center of brightness
    // sits on the implied-sun side.
    earth.fillStyle(0x0a1a40, 1); earth.fillCircle(0, 0, R);
    earth.fillStyle(0x12285e, 1); earth.fillCircle(-2, -2, R - 6);
    earth.fillStyle(0x1a3c82, 1); earth.fillCircle(-4, -4, R - 14);
    earth.fillStyle(0x2350a0, 1); earth.fillCircle(-6, -6, R - 26);

    // Polar ice caps (ellipses inside the disc)
    earth.fillStyle(0xe8f4ff, 0.60);
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
    earth.fillStyle(0x2e6b3a, 1);
    for (const flat of continents) {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        pts.push(new Phaser.Math.Vector2(flat[i], flat[i + 1]));
      }
      earth.fillPoints(pts, true);
    }

    // Interior land highlights — brighter green dots to suggest lit terrain
    earth.fillStyle(0x5cbf6b, 0.75);
    earth.fillCircle(-30, -16, 5);
    earth.fillCircle(26,  -6, 5);
    earth.fillCircle(34,   8, 4);
    earth.fillCircle(-16, 18, 4);
    earth.fillCircle(28,  42, 3);

    // Cloud bands — thin stretched ellipses at varying latitudes,
    // two alpha tiers so some bands read as high-cirrus wisps.
    earth.fillStyle(0xffffff, 0.22);
    earth.fillEllipse(-16, -46, 44, 6);
    earth.fillEllipse( 12, -12, 56, 6);
    earth.fillEllipse(-30,  36, 40, 6);
    earth.fillEllipse( 28,  22, 34, 5);
    earth.fillStyle(0xffffff, 0.42);
    earth.fillEllipse(  4, -38, 28, 3);
    earth.fillEllipse(-12,   4, 22, 3);
    earth.fillEllipse( 22,  48, 20, 3);

    // Terminator — feathered dark side via stacked slice fills with
    // increasing offset, producing a soft gradient instead of a hard line.
    for (let i = 0; i < 5; i++) {
      const alpha = 0.12 + i * 0.05;
      earth.fillStyle(0x000000, alpha);
      earth.beginPath();
      earth.slice(i * 3, i * 2, R - i * 2, -Math.PI * 0.18, Math.PI * 0.82, false);
      earth.fillPath();
    }

    // Specular rim — two stacked arcs on sunlit edge for a brighter hit
    earth.lineStyle(1.5, 0xcce4ff, 0.75);
    earth.beginPath();
    earth.arc(0, 0, R - 0.5, Math.PI * 1.0, Math.PI * 1.55, false);
    earth.strokePath();
    earth.lineStyle(1, 0xffffff, 0.45);
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
      const star = this.add.rectangle(sx, sy, 2, 2, 0xffffff, 1)
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

    // ── Moon-dust drift ──
    // Low-alpha particles rising near ground, drifting slowly right. World-space
    // emitter spread across the level so dust passes the camera naturally.
    const dustGfx = this.make.graphics({ x: 0, y: 0 }, false);
    dustGfx.fillStyle(0xc8c8d8, 1);
    dustGfx.fillRect(0, 0, 2, 2);
    if (this.textures.exists('bgDust')) this.textures.remove('bgDust');
    dustGfx.generateTexture('bgDust', 2, 2);
    dustGfx.destroy();

    this.add.particles(0, 0, 'bgDust', {
      x:        { min: 0, max: WORLD_WIDTH },
      y:        { min: GROUND_Y - 30, max: GROUND_Y - 2 },
      speedX:   { min: 8, max: 22 },
      speedY:   { min: -4, max: 2 },
      lifespan: { min: 3500, max: 6000 },
      alpha:    { start: 0.35, end: 0 },
      scale:    { min: 0.8, max: 1.6 },
      frequency: 180,
      quantity: 1,
    }).setDepth(3.4);
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

  private updateParallax(delta: number): void {
    const sx = this.cameras.main.scrollX;
    if (this.activeConfig.trainEffect) {
      this.trainOffset += delta * 0.12; // ~120 px/s leftward drift
      if (this.bgStars)   this.bgStars.setTilePosition(sx * 0.05 - this.trainOffset * 0.15, 0);
      if (this.bgTerrain) this.bgTerrain.setTilePosition(sx * 0.20 - this.trainOffset * 0.55, 0);
      if (this.bgHaze)    this.bgHaze.setTilePosition(sx * 0.35 - this.trainOffset, 0);
      return;
    }
    if (this.bgStars)   this.bgStars.setTilePosition(sx * 0.05, 0);
    if (this.bgTerrain) this.bgTerrain.setTilePosition(sx * 0.20, 0);
    if (this.bgHaze)    this.bgHaze.setTilePosition(sx * 0.35, 0);
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
