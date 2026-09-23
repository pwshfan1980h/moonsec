import { describe, expect, it } from 'vitest';
import { parseDevParams } from '../dev/devParams';

describe('parseDevParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parseDevParams('')).toEqual({
      level: undefined, seed: undefined, freeze: undefined, gfx: undefined, boss: false,
      encounter: undefined, rigtest: undefined, perf: false, ui: undefined, armor: undefined, noGuide: false,
    });
  });

  it('parses numbers, strings and flags', () => {
    const p = parseDevParams('?level=2&seed=42&freeze=3000&gfx=clean&boss=1&encounter=1&rigtest=all&ui=pause&armor=8');
    expect(p).toMatchObject({ level: 2, seed: 42, freeze: 3000, gfx: 'clean', boss: true, encounter: 1, rigtest: 'all', ui: 'pause', armor: 8 });
  });

  it('ignores malformed numbers', () => {
    expect(parseDevParams('?level=abc&seed=').level).toBeUndefined();
    expect(parseDevParams('?seed=').seed).toBeUndefined();
  });

  it('skips the pilot guide for harness runs', () => {
    expect(parseDevParams('?freeze=100').noGuide).toBe(true);
    expect(parseDevParams('?perf=1').noGuide).toBe(true);
    expect(parseDevParams('?noguide=1').noGuide).toBe(true);
    expect(parseDevParams('?noguide=0').noGuide).toBe(false);
  });
});
