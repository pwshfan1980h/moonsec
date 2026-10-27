import { describe, expect, it } from 'vitest';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { ATMOSPHERE } from '../fx/atmosphereRecipes';
import { PALETTE } from '../render/palette';
import { RADIO_LINES } from '../data/radioScript';

const caption = (id: keyof typeof RADIO_LINES) => RADIO_LINES[id].caption;

describe('mission atmosphere content', () => {
  it('gives every mission a voiced transmission for each normal wave', () => {
    for (const config of LEVEL_CONFIGS) {
      expect(config.radioLines.length, config.label).toBeGreaterThanOrEqual(config.waveCount);
      expect(config.radioLines.every((line) => caption(line).trim().length >= 20), config.label).toBe(true);
      expect(caption(config.introLine).length, config.label).toBeGreaterThan(0);
      expect(caption(config.winLine).length, config.label).toBeGreaterThan(0);
    }
  });

  it('gives every boss phase a distinct warning', () => {
    const warnings = LEVEL_CONFIGS.map((config) => config.bossWarning);
    expect(new Set(warnings).size).toBe(LEVEL_CONFIGS.length);
    expect(warnings.every((warning) => caption(warning).trim().length >= 20)).toBe(true);
    expect(warnings.every((warning) => RADIO_LINES[warning].warning)).toBe(true);
  });

  it('gives every mission an atmosphere recipe in palette colours', () => {
    const names = new Set<string>(PALETTE.map((p) => p.name));
    for (const config of LEVEL_CONFIGS) {
      const r = ATMOSPHERE[config.nodeIndex];
      expect(r, config.label).toBeDefined();
      expect(names.has(r.dust)).toBe(true);
      for (const f of r.fog) expect(names.has(f.color), `${config.label} fog`).toBe(true);
      if (r.shafts) expect(names.has(r.shafts.color)).toBe(true);
    }
  });
});
