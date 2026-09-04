import { describe, it, expect } from 'vitest';
import {
  GAME_W, GAME_H,
  GROUND_Y, WORLD_HEIGHT,
  WAVE_BRACKETS,
  RADAR_X, RADAR_Y,
  PICKUP_LIFETIME_MS,
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

  it('WAVE_BRACKETS difficulty ramps monotonically (values tuned, but the ramp is the invariant)', () => {
    // Exact numbers move with game-feel tuning passes; what must hold is that each
    // bracket is harder than the last — faster pursuit, faster bullets, more HP —
    // and that every value stays positive.
    for (let i = 0; i < WAVE_BRACKETS.length; i++) {
      expect(WAVE_BRACKETS[i].attackSpeed).toBeGreaterThan(0);
      expect(WAVE_BRACKETS[i].bulletSpeedMult).toBeGreaterThan(0);
      expect(WAVE_BRACKETS[i].shootInterval).toBeGreaterThan(0);
      if (i > 0) {
        expect(WAVE_BRACKETS[i].attackSpeed).toBeGreaterThan(WAVE_BRACKETS[i - 1].attackSpeed);
        expect(WAVE_BRACKETS[i].bulletSpeedMult).toBeGreaterThan(WAVE_BRACKETS[i - 1].bulletSpeedMult);
        expect(WAVE_BRACKETS[i].shootInterval).toBeLessThan(WAVE_BRACKETS[i - 1].shootInterval);
      }
    }
  });

  it('RADAR_X near right edge of 1920 screen', () => {
    expect(RADAR_X).toBe(1770);
    expect(RADAR_Y).toBe(830);
  });

  it('pickup lifetime is 10000ms (not the old 6000)', () => {
    // documentation test — if someone reverts PICKUP_LIFETIME back to 6000, this test fails
    expect(PICKUP_LIFETIME_MS).toBe(10000);
    expect(PICKUP_LIFETIME_MS).toBeGreaterThan(6000);
  });
});
