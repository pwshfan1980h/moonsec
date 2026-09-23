import { describe, expect, it } from 'vitest';
import { PALETTE } from '../render/palette';
import { ROLE } from '../ui/theme';
import { GLYPHS, GLYPH_H, epx, measure, normalizeText } from '../ui/font/glyphs';
import { ICONS, ICON_NAMES, ICON_SIZE } from '../ui/icons';
import { MenuFocus, buttonVisual, litTicks, pad, ringTicks, segmentRects } from '../ui/kit/logic';

describe('theme', () => {
  it('maps every role to a palette entry', () => {
    const names = new Set<string>(PALETTE.map((p) => p.name));
    for (const v of Object.values(ROLE)) expect(names.has(v)).toBe(true);
  });
});

describe('MOON font', () => {
  it('has well-formed 7-row glyphs covering A–Z, 0–9 and HUD punctuation', () => {
    for (const g of GLYPHS) {
      expect(g.h).toBe(GLYPH_H);
      expect(g.px.length).toBe(g.w * g.h);
    }
    const set = new Set(GLYPHS.map((g) => g.ch));
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-+/%!?()[]<>×') expect(set.has(ch)).toBe(true);
  });

  it('keeps digits tabular', () => {
    const widths = new Set(GLYPHS.filter((g) => /[0-9]/.test(g.ch)).map((g) => g.w));
    expect([...widths]).toEqual([5]);
  });

  it('EPX doubles the glyph and keeps its ink', () => {
    const a = GLYPHS.find((g) => g.ch === 'A')!;
    const b = epx(a);
    expect([b.w, b.h]).toEqual([a.w * 2, a.h * 2]);
    const inkA = a.px.reduce((s, v) => s + v, 0), inkB = b.px.reduce((s, v) => s + v, 0);
    expect(inkB).toBeGreaterThan(inkA * 3);
    expect(inkB).toBeLessThan(inkA * 5);
  });

  it('upper-cases and replaces unknown characters', () => {
    const known = new Set(GLYPHS.map((g) => g.ch));
    expect(normalizeText('Hp 50%', known)).toBe('HP 50%');
    expect(normalizeText('a~b', known)).toBe('A?B');
    const map = new Map(GLYPHS.map((g) => [g.ch, g]));
    expect(measure('II', map)).toBe(3 + 1 + 3);
  });
});

describe('icons', () => {
  it('are all 12×12 masks', () => {
    for (const n of ICON_NAMES) {
      expect(ICONS[n]).toHaveLength(ICON_SIZE);
      for (const row of ICONS[n]) expect(row).toMatch(/^[#.]{12}$/);
    }
  });
});

describe('segmented bar', () => {
  it('fills whole segments then a partial one, all on the 2px grid', () => {
    const r = segmentRects(100, 5, 0.5);
    expect(r).toHaveLength(3);
    for (const s of r) { expect(s.x % 2).toBe(0); expect(s.w % 2).toBe(0); }
    expect(r[2].w).toBeLessThan(r[0].w);
    expect(segmentRects(100, 5, 0)).toHaveLength(0);
    expect(segmentRects(100, 5, 1)).toHaveLength(5);
    const last = segmentRects(100, 5, 1)[4];
    expect(last.x + last.w).toBe(100);
  });
});

describe('tick ring', () => {
  it('lights ticks by progress and is full only when ready', () => {
    expect(litTicks(0, 16)).toBe(0);
    expect(litTicks(0.5, 16)).toBe(8);
    expect(litTicks(0.999, 16)).toBe(15);
    expect(litTicks(1, 16)).toBe(16);
    const t = ringTicks(4, 20);
    expect(t[0]).toEqual({ x: 0, y: -20 });
    expect(t[1]).toEqual({ x: 20, y: 0 });
  });
});

describe('buttons and menus', () => {
  it('maps states to looks', () => {
    expect(buttonVisual('idle', false).panel).toBe('button');
    expect(buttonVisual('idle', true).panel).toBe('button-hot');
    expect(buttonVisual('down', false).dy).toBe(2);
    expect(buttonVisual('disabled', true).panel).toBe('button-off');
  });

  it('moves focus over enabled entries and wraps', () => {
    const enabled = [true, false, true, true];
    const f = new MenuFocus(() => enabled);
    expect(f.index).toBe(0);
    expect(f.move(1)).toBe(2);
    expect(f.move(1)).toBe(3);
    expect(f.move(1)).toBe(0);
    expect(f.move(-1)).toBe(3);
    f.set(1);
    expect(f.index).toBe(3);
  });

  it('pads readouts', () => {
    expect(pad(42, 4)).toBe('0042');
    expect(pad(-3, 2)).toBe('00');
  });
});
