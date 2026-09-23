import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { EnemyMix } from '../data/levelConfigs';
import { WAVE_BRACKETS } from '../constants';
import { WaveHostileCounter } from './WaveHostileCounter';
import { composeWave, isFlyer, unitCount, type FoeType, type LevelCaps } from './waveMix';
import type { RiggedHostile } from '../entities/RiggedHostile';
import type { Scaling } from '../entities/foes/base';
import { Hornet, Heron, Jackal, JackalPack, Wasp, type Squad } from '../entities/foes/flyers';
import { Broodmother, Manta } from '../entities/foes/carrier';
import { Bulwark, Longleg, Tick } from '../entities/foes/ground';
import { Burrower, Prowler, Ram, Scuttler, Spotter, Stilt } from '../entities/foes/surface';
import { BOSS_VARIANTS, Nexus, type BossType } from '../entities/foes/bosses';
import type { Vec } from '../ai/Perception';

export type DroneScaling = Scaling;

const WAVE_DELAY    = 20250;
const SPAWN_STAGGER = 700;

/**
 * Timed waves for missions 1–4. Each wave is composed by `composeWave` from the mission's
 * enemy mix, filtered by what the level geometry allows (no bombers without ground, no
 * ceiling crawlers without a ceiling). Squads and packs spawn together.
 */
export class DroneSpawner {
  private scene: GameScene;
  waveIndex    = 0;
  private nextWaveTime = 4050;
  private spawning    = false;
  private readonly hostileCounter = new WaveHostileCounter();
  private isBossDead  = false;
  private bossActive = false;
  private readonly onHostileSpawned: (count?: number) => void;
  private readonly onDroneKilled: () => void;
  private readonly onBossKilled: () => void;

  constructor(
    scene: GameScene,
    private readonly waveCount: number,
    private readonly bossType: BossType,
    private readonly enemyMix: EnemyMix,
    startAtBoss = false,
  ) {
    this.scene = scene;
    if (startAtBoss) {
      this.waveIndex = waveCount;
      this.nextWaveTime = 0;
    }

    this.onHostileSpawned = (count = 1) => {
      scene.events.emit('dronesRemaining', this.hostileCounter.add(count));
    };
    this.onDroneKilled = () => {
      const remaining = this.hostileCounter.remove();
      scene.events.emit('hostileKilled');
      scene.events.emit('dronesRemaining', remaining);
      if (remaining === 0 && !this.spawning && this.waveIndex > 0) scene.events.emit('waveCleared', this.waveIndex);
    };
    this.onBossKilled = () => {
      const remaining = this.hostileCounter.remove();
      scene.events.emit('hostileKilled');
      scene.events.emit('dronesRemaining', remaining);
      this.isBossDead = true;
      if (remaining === 0) scene.events.emit('levelComplete');
    };

    scene.events.on('hostileSpawned', this.onHostileSpawned);
    scene.events.on('droneKilled', this.onDroneKilled);
    scene.events.on('bossKilled', this.onBossKilled);
  }

  isBossWave(): boolean { return this.waveIndex > this.waveCount; }

  destroy(): void {
    this.scene.events.off('hostileSpawned', this.onHostileSpawned);
    this.scene.events.off('droneKilled', this.onDroneKilled);
    this.scene.events.off('bossKilled', this.onBossKilled);
  }

  update(time: number, _delta: number): void {
    if (this.spawning || this.isBossDead || this.bossActive || this.isBossWave()) return;
    if (time < this.nextWaveTime) return;
    this.nextWaveTime = time + WAVE_DELAY;
    this.spawnWave();
  }

  private bracket(): Scaling {
    let b = WAVE_BRACKETS[0];
    for (const x of WAVE_BRACKETS) if (this.waveIndex >= x.minWave) b = x;
    return b;
  }

  private caps(): LevelCaps {
    const tmpl = this.scene.levelTemplate;
    return {
      ground: tmpl.hasGround,
      floors: (this.scene.ai?.ground.spans.length ?? 0) > 0,
      ceiling: tmpl.hasCeiling,
    };
  }

  private spawnWave(): void {
    this.spawning = true;
    this.waveIndex++;
    this.scene.debugLog?.log('[WAVE] Wave ' + this.waveIndex + ' start');
    if (this.waveIndex > this.waveCount) {
      this.scene.events.emit('waveStart', this.waveIndex, this.waveCount, 1);
      this.spawning = false;
      this.bossActive = true;
      this.spawnBoss();
      return;
    }
    const groups = composeWave(this.waveIndex, this.enemyMix, this.caps());
    this.scene.events.emit('waveStart', this.waveIndex, this.waveCount, unitCount(groups));
    const scaling = this.bracket();
    groups.forEach((g, i) => {
      this.scene.time.delayedCall(i * SPAWN_STAGGER, () => {
        this.spawnGroup(g.type, g.count, scaling, i);
        if (i === groups.length - 1) {
          this.spawning = false;
          if (this.hostileCounter.count === 0) this.scene.events.emit('waveCleared', this.waveIndex);
        }
      });
    });
    if (!groups.length) this.spawning = false;
  }

  private spawnBoss(): void {
    const view = this.scene.cameras.main.worldView;
    const cx = view.centerX, cy = Phaser.Math.Clamp(view.top + 240, 180, this.scene.getApproxGroundY() - 240);
    const safe = this.scene.flightNavigation?.nearestOpen({ x: cx, y: cy }, 60, 36);
    const boss = new Nexus(this.scene, safe?.x ?? cx, safe?.y ?? cy, this.bracket(), BOSS_VARIANTS[this.bossType]);
    this.scene.hostileCombat.register(boss);
    this.scene.debugLog?.log(`[BOSS] ${this.bossType} spawned`);
    this.scene.events.emit('dronesRemaining', this.hostileCounter.add());
  }

  // ── spawning ─────────────────────────────────────────────────────────────
  private flyerSpot(i: number): Vec {
    const view = this.scene.cameras.main.worldView;
    const p = this.scene.player;
    const side = i % 2 === 0 ? -1 : 1;
    const want = { x: side < 0 ? view.left - 120 : view.right + 120, y: p.y - 180 - (i % 3) * 80 };
    return this.scene.flightNavigation?.nearestOpen(want, 30, 24) ?? want;
  }

  /** A walkable spot just off-screen (or the nearest span if none). */
  private groundSpot(i: number): Vec | null {
    const ai = this.scene.ai;
    if (!ai || !ai.ground.spans.length) return null;
    const view = this.scene.cameras.main.worldView;
    const side = i % 2 === 0 ? -1 : 1;
    const edge = side < 0 ? view.left - 160 : view.right + 160;
    let best: Vec | null = null, bestD = Infinity;
    for (const s of ai.ground.spans) {
      const x = Phaser.Math.Clamp(edge, s.c0 * 32 + 16, (s.c1 + 1) * 32 - 16);
      const offscreen = x < view.left - 40 || x > view.right + 40;
      const d = Math.abs(x - edge) + Math.abs(s.y - this.scene.player.y) * 0.5 + (offscreen ? 0 : 2000);
      if (d < bestD) { bestD = d; best = { x, y: s.y - 2 }; }
    }
    return best;
  }

  private spawnGroup(type: FoeType, count: number, sc: Scaling, index: number): void {
    const squad: Squad = { members: [] };
    const pack = new JackalPack(count);
    const packMembers: Jackal[] = [];
    for (let k = 0; k < count; k++) {
      const spot = isFlyer(type) ? this.flyerSpot(index + k) : this.groundSpot(index + k) ?? this.flyerSpot(index + k);
      const x = spot.x + k * 30, y = spot.y - (isFlyer(type) ? k * 24 : 0);
      const foe = this.make(type, x, y, sc, squad, pack, packMembers);
      if (!foe) continue;
      this.scene.hostileCombat.register(foe);
      this.scene.events.emit('dronesRemaining', this.hostileCounter.add());
    }
  }

  private make(type: FoeType, x: number, y: number, sc: Scaling, squad: Squad, pack: JackalPack, packMembers: Jackal[]): RiggedHostile | null {
    const s = this.scene;
    switch (type) {
      case 'wasp': return new Wasp(s, x, y, sc, squad);
      case 'hornet': return new Hornet(s, x, y, sc);
      case 'heron': return new Heron(s, x, y, sc);
      case 'jackal': return new Jackal(s, x, y, pack, packMembers, sc);
      case 'brood': return new Broodmother(s, x, y - 120, sc);
      case 'manta': return new Manta(s, x, Math.min(y, s.player.y - 360), sc);
      case 'tick': return new Tick(s, x, y);
      case 'longleg': return new Longleg(s, x, y, sc);
      case 'bulwark': return new Bulwark(s, x, y, sc);
      case 'prowler': return new Prowler(s, x, y, sc);
      case 'spotter': return new Spotter(s, x, y, sc);
      case 'ram': return new Ram(s, x, y, sc);
      case 'stilt': return new Stilt(s, x, y, sc);
      case 'scuttler': return new Scuttler(s, x, y - 20);
      case 'burrower': return new Burrower(s, x, y, sc);
    }
  }
}
