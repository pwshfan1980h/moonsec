import { describe, expect, it } from 'vitest';
import {
  buildMap,
  TMPL_DEEP_FACILITY,
  TMPL_NEXUS_CORE,
  TMPL_ORBITAL,
  TMPL_SURFACE_OPS,
  TMPL_TRADE_LANES,
  type LevelTemplate,
} from '../data/levelData';

const TEMPLATES: [string, LevelTemplate, number][] = [
  ['Surface Ops', TMPL_SURFACE_OPS, 4],
  ['Trade Lanes', TMPL_TRADE_LANES, 10],
  ['Deep Facility', TMPL_DEEP_FACILITY, 4],
  ['Orbital Station', TMPL_ORBITAL, 12],
  ['Nexus Core', TMPL_NEXUS_CORE, 3],
];

describe('authored level layouts', () => {
  it.each(TEMPLATES)('%s stays within its fixed-platform budget', (_name, template, count) => {
    expect(template.fixedPlatforms).toHaveLength(count);
  });

  it.each(TEMPLATES)('%s has no narrow required landing', (_name, template) => {
    expect(template.fixedPlatforms.every(platform => platform.width >= 4)).toBe(true);
  });

  it.each(TEMPLATES)('%s collision geometry does not vary by seed', (_name, template) => {
    expect(buildMap(template, 1)).toEqual(buildMap(template, 0xDEADBEEF));
  });

  it('keeps the opening spawn areas clear of ground gaps', () => {
    for (const [, template] of TEMPLATES) {
      expect(template.fixedGaps.every(gap => gap.col >= 12)).toBe(true);
    }
  });

  it('keeps grounded missions continuous through recessed, nonlethal trenches', () => {
    for (const template of [TMPL_SURFACE_OPS, TMPL_DEEP_FACILITY, TMPL_NEXUS_CORE]) {
      expect(template.hasGround).toBe(true);
      expect(template.fixedGaps.every(gap => gap.depth > 0 && template.groundRow + gap.depth < template.rows)).toBe(true);
    }
  });

  it('keeps Trade Lanes main-deck jumps short and visible', () => {
    const decks = TMPL_TRADE_LANES.fixedPlatforms.slice(0, 6);
    for (let i = 1; i < decks.length; i++) {
      const gap = decks[i].col - (decks[i - 1].col + decks[i - 1].width);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(5);
      expect(Math.abs(decks[i].row - decks[i - 1].row)).toBe(0);
    }
  });

  it('keeps Orbital hull jumps within one readable jetpack move', () => {
    const hull = TMPL_ORBITAL.fixedPlatforms.slice(0, 8);
    for (let i = 1; i < hull.length; i++) {
      const gap = hull[i].col - (hull[i - 1].col + hull[i - 1].width);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(5);
      expect(Math.abs(hull[i].row - hull[i - 1].row)).toBeLessThanOrEqual(4);
    }
  });
});
