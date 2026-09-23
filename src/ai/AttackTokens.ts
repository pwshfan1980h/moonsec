import type { Vec } from './Perception';

export type TokenKind = 'melee' | 'ranged' | 'artillery' | 'bomb';

interface Hold { kind: TokenKind; since: number; priority: number }

/**
 * Attack permission. Only so many enemies may attack at once per kind, which keeps a
 * crowd readable: others reposition, flank or wait. A higher-priority attacker (closer,
 * or a heavier threat) can take a token from a lower one; tokens expire so a stuck
 * holder can't starve the rest.
 */
export class AttackTokens {
  private readonly holders = new Map<object, Hold>();
  /** Slots cooling down after a release: [kind, free-again time]. */
  private cooling: [TokenKind, number][] = [];
  private clock = 0;

  /**
   * @param recovery seconds a slot stays closed after its holder releases it, so volleys
   *   from a crowd are spaced out instead of chaining back-to-back.
   */
  constructor(public pools: Record<TokenKind, number>, public timeout = 5, public recovery: Partial<Record<TokenKind, number>> = {}) {}

  count(kind: TokenKind): number {
    let n = 0;
    for (const h of this.holders.values()) if (h.kind === kind) n++;
    for (const [k] of this.cooling) if (k === kind) n++;
    return n;
  }

  holds(holder: object, kind?: TokenKind): boolean {
    const h = this.holders.get(holder);
    return !!h && (kind === undefined || h.kind === kind);
  }

  acquire(holder: object, kind: TokenKind, now: number, priority = 0): boolean {
    this.expireCooling(now);
    const mine = this.holders.get(holder);
    if (mine?.kind === kind) return true;
    if (mine) this.holders.delete(holder);
    if (this.count(kind) < (this.pools[kind] ?? 0)) {
      this.holders.set(holder, { kind, since: now, priority });
      return true;
    }
    // preempt the weakest holder of this kind if we clearly outrank it
    let weakest: object | null = null, low = Infinity;
    for (const [h, v] of this.holders) if (v.kind === kind && v.priority < low) { low = v.priority; weakest = h; }
    if (weakest && priority >= low + 1) {
      this.holders.delete(weakest);
      this.holders.set(holder, { kind, since: now, priority });
      return true;
    }
    return false;
  }

  release(holder: object): void {
    const h = this.holders.get(holder);
    if (!h) return;
    this.holders.delete(holder);
    const r = this.recovery[h.kind] ?? 0;
    if (r > 0) this.cooling.push([h.kind, this.clock + r]);
  }

  /** Drops tokens held longer than the timeout and reopens recovered slots. */
  update(now: number): void {
    for (const [h, v] of this.holders) if (now - v.since > this.timeout) this.holders.delete(h);
    this.expireCooling(now);
  }

  clear(): void { this.holders.clear(); this.cooling = []; }

  private expireCooling(now: number): void {
    this.clock = Math.max(this.clock, now);
    if (this.cooling.length) this.cooling = this.cooling.filter(([, t]) => t > this.clock);
  }
}

/**
 * Flank positions around the player for a squad. HARROW faces the cursor, so the side it
 * isn't aiming at is the weak side: slots bias there, spread in height.
 */
export function flankSlot(index: number, count: number, player: Vec, playerFacing: 1 | -1, radius: number): Vec {
  const behind = -playerFacing;
  const t = count <= 1 ? 0.5 : index / (count - 1);
  // elevations from just above level (0.15 rad) up to steeply overhead (1.1 rad)
  const e = 0.15 + t * 0.95;
  return { x: player.x + behind * Math.cos(e) * radius, y: player.y - 60 - Math.sin(e) * radius };
}
