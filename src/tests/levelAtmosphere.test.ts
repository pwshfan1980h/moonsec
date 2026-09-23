import { describe, expect, it } from 'vitest';
import { LEVEL_CONFIGS } from '../data/levelConfigs';
import { ATMOSPHERE } from '../fx/atmosphereRecipes';
import { PALETTE } from '../render/palette';

describe('mission atmosphere content', () => {
  it('gives every mission a transmission for each normal wave', () => {
    for (const config of LEVEL_CONFIGS) {
      expect(config.radioLines.length, config.label).toBeGreaterThanOrEqual(config.waveCount);
      expect(config.radioLines.every((line) => line.trim().length >= 20), config.label).toBe(true);
    }
  });

  it('gives every boss phase a distinct warning', () => {
    const warnings = LEVEL_CONFIGS.map((config) => config.bossWarning);
    expect(new Set(warnings).size).toBe(LEVEL_CONFIGS.length);
    expect(warnings.every((warning) => warning.trim().length >= 20)).toBe(true);
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
