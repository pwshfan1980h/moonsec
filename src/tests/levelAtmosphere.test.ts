import { describe, expect, it } from 'vitest';
import { LEVEL_CONFIGS } from '../data/levelConfigs';

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
});
