import type { FlightNavigation } from '../systems/FlightNavigation';
import type { TerrainProbe } from '../fx/terrain';
import { AttackTokens, type TokenKind } from './AttackTokens';
import { CoverMap } from './CoverMap';
import { GroundNav } from './GroundNav';
import type { Noise, Vec } from './Perception';

/** Per-mission defaults for how many enemies may attack at once. */
export const DEFAULT_TOKENS: Record<TokenKind, number> = { melee: 2, ranged: 3, artillery: 1, bomb: 1 };

/**
 * Everything enemy brains share about the level: terrain, flight and ground navigation,
 * cover, attack tokens, and recent noises (gunfire, footfalls) they can hear.
 * Built once per mission by GameScene.
 */
export class AiWorld {
  readonly cover: CoverMap;
  readonly ground: GroundNav;
  readonly tokens: AttackTokens;
  private noiseLog: (Noise & { ttl: number })[] = [];
  /** Seconds of mission time (advanced by update). */
  now = 0;

  constructor(readonly terrain: TerrainProbe, readonly nav: FlightNavigation, tokenPools: Partial<Record<TokenKind, number>> = {}) {
    this.cover = new CoverMap(terrain);
    this.ground = new GroundNav(terrain);
    this.tokens = new AttackTokens({ ...DEFAULT_TOKENS, ...tokenPools });
  }

  update(dt: number): void {
    this.now += dt;
    this.tokens.update(this.now);
    this.noiseLog = this.noiseLog.filter((n) => (n.ttl -= dt) > 0);
  }

  /** Something loud happened (player fire, explosion). Nearby enemies may hear it. */
  noise(x: number, y: number, loudness = 1): void {
    if (this.noiseLog.length < 32) this.noiseLog.push({ x, y, loudness, ttl: 0.25 });
  }

  get noises(): readonly Noise[] { return this.noiseLog; }

  /** Line of sight through terrain (thin ray). */
  lineClear(a: Vec, b: Vec): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(d / 16);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.terrain.solidAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }
}
