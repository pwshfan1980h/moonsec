/**
 * Dev-only URL switches used for playtesting and the screenshot/perf harness
 * (tools/shots). Parsing is pure so it can be unit-tested; `devParams()` reads
 * the live URL only in dev builds and returns empty params in production.
 */
export interface DevParams {
  level?: number;
  seed?: number;
  /** Freeze simulation this many ms after the level starts (deterministic screenshots). */
  freeze?: number;
  gfx?: string;
  boss: boolean;
  encounter?: number;
  rigtest?: string;
  perf: boolean;
  /** Open a specific UI screen for screenshots (title, pause, upgrade, gameover, complete, guide). */
  ui?: string;
  /** Force player armor to this value (e.g. 8 to see the critical limp). */
  armor?: number;
  /** Skip the first-boot pilot guide. */
  noGuide: boolean;
}

function int(v: string | null): number | undefined {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function str(v: string | null): string | undefined {
  return v === null || v === '' ? undefined : v;
}

function flag(q: URLSearchParams, key: string): boolean {
  const v = q.get(key);
  return v !== null && v !== '0' && v !== 'false';
}

export function parseDevParams(search: string): DevParams {
  const q = new URLSearchParams(search);
  return {
    level: int(q.get('level')),
    seed: int(q.get('seed')),
    freeze: int(q.get('freeze')),
    gfx: str(q.get('gfx')),
    boss: q.get('boss') === '1',
    encounter: int(q.get('encounter')),
    rigtest: str(q.get('rigtest')),
    perf: flag(q, 'perf'),
    ui: str(q.get('ui')),
    armor: int(q.get('armor')),
    noGuide: flag(q, 'noguide') || q.has('freeze') || q.has('perf'),
  };
}

const EMPTY: DevParams = { boss: false, perf: false, noGuide: false };

export function devParams(): DevParams {
  if (!import.meta.env.DEV || typeof window === 'undefined') return EMPTY;
  return parseDevParams(window.location.search);
}
