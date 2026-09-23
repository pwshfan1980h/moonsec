import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPHICS, blockSize, cameraZoom, nextPreset, parseGraphicsSettings, serializeGraphicsSettings, toggleView,
} from '../render/GraphicsSettings';

describe('GraphicsSettings', () => {
  it('defaults to the crunchy wide look', () => {
    expect(parseGraphicsSettings(null)).toEqual(DEFAULT_GRAPHICS);
    expect(DEFAULT_GRAPHICS).toMatchObject({ preset: 'crunchy', view: 'wide', grid: true, quantize: true, dither: true, scanlines: false });
  });

  it('round-trips through JSON', () => {
    const s = toggleView(nextPreset(DEFAULT_GRAPHICS));
    expect(parseGraphicsSettings(serializeGraphicsSettings(s))).toEqual(s);
  });

  it('survives corrupt storage', () => {
    expect(parseGraphicsSettings('{not json')).toEqual(DEFAULT_GRAPHICS);
    expect(parseGraphicsSettings('{"preset":"bogus","dust":7}')).toEqual(DEFAULT_GRAPHICS);
  });

  it('applies ?gfx= overrides on top of storage', () => {
    const stored = serializeGraphicsSettings({ ...DEFAULT_GRAPHICS, view: 'close' });
    expect(parseGraphicsSettings(stored, 'clean')).toMatchObject({ preset: 'clean', view: 'close', quantize: false, grid: false });
    expect(parseGraphicsSettings(null, 'close,scanlines,nodither')).toMatchObject({ view: 'close', scanlines: true, dither: false });
  });

  it('cycles presets crunchy → clean → low', () => {
    const a = nextPreset(DEFAULT_GRAPHICS), b = nextPreset(a), c = nextPreset(b);
    expect([a.preset, b.preset, c.preset]).toEqual(['clean', 'low', 'crunchy']);
    expect(b).toMatchObject({ haze: false, dust: 0 });
  });

  it('keeps the filter block an integer multiple of the camera zoom', () => {
    expect(cameraZoom(DEFAULT_GRAPHICS)).toBe(1);
    expect(blockSize(DEFAULT_GRAPHICS)).toBe(2);
    const close = toggleView(DEFAULT_GRAPHICS);
    expect(cameraZoom(close)).toBe(1.5);
    expect(blockSize(close)).toBe(3);
    // the 1920×1080 frame divides into whole blocks at both zooms
    for (const s of [DEFAULT_GRAPHICS, close]) {
      expect(1920 % blockSize(s)).toBe(0);
      expect(1080 % blockSize(s)).toBe(0);
    }
  });
});
