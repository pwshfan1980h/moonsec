export type ActionStatus = 'running' | 'done' | 'failed';

/**
 * One thing an enemy can decide to do. `score` rates how much it wants to do it now
 * (0 = never); the brain runs the best-scoring action, commits to it for at least
 * `minCommit` seconds, and keeps it while it stays competitive.
 */
export interface BrainAction<C> {
  readonly name: string;
  score(ctx: C): number;
  enter?(ctx: C): void;
  update(ctx: C, dt: number): ActionStatus;
  exit?(ctx: C): void;
  /** Seconds the brain stays with this action before re-deciding (unless it finishes). */
  minCommit?: number;
  /** Seconds before this action may be chosen again after it ends. */
  cooldown?: number;
}

/**
 * Utility-scored decision making: think at a fixed rate (staggered per enemy),
 * act every frame. The current action gets a hysteresis bonus so enemies don't dither.
 */
export class UtilityBrain<C> {
  current: BrainAction<C> | null = null;
  private committedFor = 0;
  private thinkIn: number;
  private readonly cooldowns = new Map<string, number>();

  constructor(
    public readonly actions: readonly BrainAction<C>[],
    public readonly thinkInterval = 0.1,
    phase = 0,
    public readonly hysteresis = 0.15,
  ) {
    this.thinkIn = phase * thinkInterval;
  }

  tick(ctx: C, dt: number): void {
    for (const [k, v] of this.cooldowns) {
      if (v - dt <= 0) this.cooldowns.delete(k); else this.cooldowns.set(k, v - dt);
    }
    this.committedFor -= dt;
    this.thinkIn -= dt;
    if (!this.current || (this.thinkIn <= 0 && this.committedFor <= 0)) {
      this.thinkIn = this.thinkInterval;
      this.decide(ctx);
    }
    if (!this.current) return;
    const status = this.current.update(ctx, dt);
    if (status !== 'running') {
      this.end(ctx);
      this.decide(ctx);
    }
  }

  /** Force a re-decision now (e.g. after taking a big hit). */
  interrupt(ctx: C): void {
    this.committedFor = 0;
    this.decide(ctx);
  }

  private decide(ctx: C): void {
    let best: BrainAction<C> | null = null;
    let bestScore = 0;
    for (const a of this.actions) {
      if (this.cooldowns.has(a.name) && a !== this.current) continue;
      let s = a.score(ctx);
      if (a === this.current) s += this.hysteresis;
      if (s > bestScore) { bestScore = s; best = a; }
    }
    if (best === this.current) return;
    this.end(ctx);
    this.current = best;
    if (best) {
      best.enter?.(ctx);
      this.committedFor = best.minCommit ?? 0;
    }
  }

  private end(ctx: C): void {
    const cur = this.current;
    if (!cur) return;
    cur.exit?.(ctx);
    if (cur.cooldown) this.cooldowns.set(cur.name, cur.cooldown);
    this.current = null;
  }
}
