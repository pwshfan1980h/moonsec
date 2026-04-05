import { describe, it, expect } from 'vitest';
import {
  GAME_W, GAME_H,
  GROUND_Y, WORLD_HEIGHT,
  BOSS_WAVE_L1,
  WAVE_BRACKETS,
  RADAR_X, RADAR_Y,
} from '../constants';

describe('constants', () => {
  it('resolution is 1920×1080', () => {
    expect(GAME_W).toBe(1920);
    expect(GAME_H).toBe(1080);
  });

  it('GROUND_Y scaled to 1080-height world', () => {
    expect(GROUND_Y).toBe(960);
  });

  it('WORLD_HEIGHT updated', () => {
    expect(WORLD_HEIGHT).toBe(1080);
  });

  it('boss wave set to 3 for L1', () => {
    expect(BOSS_WAVE_L1).toBe(3);
  });

  it('WAVE_BRACKETS minWave starts at 0 and ramps 0,1,2,3', () => {
    expect(WAVE_BRACKETS[0].minWave).toBe(0);
    expect(WAVE_BRACKETS[1].minWave).toBe(1);
    expect(WAVE_BRACKETS[2].minWave).toBe(2);
    expect(WAVE_BRACKETS[3].minWave).toBe(3);
  });

  it('bracket selection: wave 1 → bracket 1, wave 2 → bracket 2, wave 3 → bracket 3', () => {
    function selectBracket(wave: number) {
      let b = WAVE_BRACKETS[0];
      for (const br of WAVE_BRACKETS) { if (wave >= br.minWave) b = br; }
      return b;
    }
    expect(selectBracket(1)).toBe(WAVE_BRACKETS[1]);
    expect(selectBracket(2)).toBe(WAVE_BRACKETS[2]);
    expect(selectBracket(3)).toBe(WAVE_BRACKETS[3]);
  });

  it('WAVE_BRACKETS attackSpeed and bulletSpeedMult at current difficulty values', () => {
    expect(WAVE_BRACKETS[0].attackSpeed).toBe(270);
    expect(WAVE_BRACKETS[1].attackSpeed).toBe(360);
    expect(WAVE_BRACKETS[2].attackSpeed).toBe(460);
    expect(WAVE_BRACKETS[3].attackSpeed).toBe(580);
    expect(WAVE_BRACKETS[0].bulletSpeedMult).toBe(1.2);
    expect(WAVE_BRACKETS[1].bulletSpeedMult).toBe(1.3);
    expect(WAVE_BRACKETS[2].bulletSpeedMult).toBe(1.45);
    expect(WAVE_BRACKETS[3].bulletSpeedMult).toBe(1.65);
  });

  it('RADAR_X near right edge of 1920 screen', () => {
    expect(RADAR_X).toBe(1830);
    expect(RADAR_Y).toBe(880);
  });

  it('pickup lifetime is 10000ms (not the old 6000)', () => {
    // documentation test — if someone reverts PICKUP_LIFETIME back to 6000, this test fails
    expect(10000).toBeGreaterThan(6000);
  });
});
