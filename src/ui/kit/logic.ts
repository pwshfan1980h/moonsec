/**
 * Pure UI logic behind the kit widgets (segmented bars, tick rings, buttons, menus),
 * kept free of Phaser so it can be unit-tested.
 */

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Filled rectangles for a segmented bar. The bar is `segments` equal cells separated by
 * `gap` px; the last lit cell is partially filled. Widths snap to `unit` so every edge
 * stays on the UI pixel grid.
 */
export function segmentRects(w: number, segments: number, t: number, gap = 2, unit = 2): { x: number; w: number }[] {
  const n = Math.max(1, Math.floor(segments));
  const cell = (w - gap * (n - 1)) / n;
  const lit = Math.max(0, Math.min(1, t)) * n;
  const out: { x: number; w: number }[] = [];
  for (let i = 0; i < n && i < lit; i++) {
    const x0 = Math.round((i * (cell + gap)) / unit) * unit;
    const full = Math.round(((i + 1) * (cell + gap) - gap) / unit) * unit - x0;
    const part = Math.min(1, lit - i);
    const fw = part >= 1 ? full : Math.floor((full * part) / unit) * unit;
    if (fw > 0) out.push({ x: x0, w: fw });
  }
  return out;
}

/** Number of lit ticks in a tick ring (cooldown meter). Full only at exactly 1. */
export function litTicks(progress: number, n: number): number {
  if (progress >= 1) return n;
  return Math.max(0, Math.min(n - 1, Math.floor(progress * n)));
}

/** Tick centres around a ring, starting at 12 o'clock, clockwise; snapped to the grid. */
export function ringTicks(n: number, radius: number, unit = 2): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    out.push({ x: Math.round((Math.cos(a) * radius) / unit) * unit, y: Math.round((Math.sin(a) * radius) / unit) * unit });
  }
  return out;
}

export type ButtonState = 'idle' | 'hover' | 'down' | 'disabled';

export interface ButtonVisual {
  panel: 'button' | 'button-hot' | 'button-down' | 'button-off';
  ink: 'ink' | 'accent' | 'inkFaint' | 'well';
  /** Pixel offset for the pressed look. */
  dy: number;
}

/** How a button looks in each state; focus (keyboard) looks like hover. */
export function buttonVisual(state: ButtonState, focused: boolean): ButtonVisual {
  if (state === 'disabled') return { panel: 'button-off', ink: 'inkFaint', dy: 0 };
  if (state === 'down') return { panel: 'button-down', ink: 'ink', dy: 2 };
  if (state === 'hover' || focused) return { panel: 'button-hot', ink: 'ink', dy: 0 };
  return { panel: 'button', ink: 'accent', dy: 0 };
}

/**
 * Keyboard focus for a vertical/horizontal menu. Skips disabled entries, wraps around,
 * and remembers the pointer's last hover so mouse and keys agree.
 */
export class MenuFocus {
  index = 0;
  constructor(private readonly enabled: () => readonly boolean[]) {
    this.index = this.first();
  }

  private first(): number {
    const e = this.enabled();
    const i = e.indexOf(true);
    return i < 0 ? 0 : i;
  }

  move(dir: 1 | -1): number {
    const e = this.enabled();
    if (!e.some(Boolean)) return this.index;
    let i = this.index;
    for (let k = 0; k < e.length; k++) {
      i = (i + dir + e.length) % e.length;
      if (e[i]) break;
    }
    this.index = i;
    return i;
  }

  set(i: number): void { if (this.enabled()[i]) this.index = i; }
}

/** Zero-padded integer for readouts. */
export function pad(n: number, width: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, '0');
}
