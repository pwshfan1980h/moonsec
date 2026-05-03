import { describe, expect, it, vi } from 'vitest';
import {
  BODY_SIZE,
  CONTENT_PIXELS,
  FRAME_PADDING,
  PICKUP_MAGNET_PULL,
  PICKUP_MAGNET_RANGE,
  PICKUP_SIZE,
  getPickupMagnetVelocity,
  getPickupVisual,
  applyFillTintCompat,
  randomIntBetween,
} from '../systems/PickupSystem';

describe('PickupSystem pure helpers', () => {
  it('keeps pickup body geometry aligned with cropped art', () => {
    expect(PICKUP_SIZE).toBe(44);
    expect(CONTENT_PIXELS).toBe(12);
    expect(FRAME_PADDING).toBe(2);
    expect(BODY_SIZE).toBe(33);
  });

  it('selects expected health and fuel frames without tint', () => {
    expect(getPickupVisual('health', () => 0.1)).toEqual({ frame: 36, tint: null });
    expect(getPickupVisual('health', () => 0.9)).toEqual({ frame: 44, tint: null });
    expect(getPickupVisual('fuel', () => 0.1)).toEqual({ frame: 32, tint: null });
    expect(getPickupVisual('fuel', () => 0.9)).toEqual({ frame: 40, tint: null });
  });

  it('selects tinted ammo and score visuals', () => {
    expect(getPickupVisual('ammo', () => 0.1)).toEqual({ frame: 9, tint: 0x00ffff });
    expect(getPickupVisual('ammo', () => 0.9)).toEqual({ frame: 17, tint: 0x00ffff });
    expect(getPickupVisual('score', () => 0.1)).toEqual({ frame: 4, tint: 0xffcc33, points: 100 });
    expect(getPickupVisual('score', () => 0.9)).toEqual({ frame: 12, tint: 0xffcc33, points: 100 });
  });

  it('uses a single random roll per visual selection', () => {
    const roll = vi.fn(() => 0.25);
    expect(getPickupVisual('ammo', roll)).toEqual({ frame: 9, tint: 0x00ffff });
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it('uses Phaser 3 setTintFill when available for spawn flash tint', () => {
    const target = { setTintFill: vi.fn(), setTint: vi.fn(), setTintMode: vi.fn() };
    applyFillTintCompat(target, 0xffffff);
    expect(target.setTintFill).toHaveBeenCalledWith(0xffffff);
    expect(target.setTint).not.toHaveBeenCalled();
  });

  it('falls back to Phaser 4 tint mode API when setTintFill is unavailable', () => {
    const originalPhaser = (globalThis as unknown as { Phaser?: unknown }).Phaser;
    (globalThis as unknown as { Phaser?: unknown }).Phaser = { TintModes: { FILL: 'fill-mode' } };
    const target = { setTint: vi.fn(), setTintMode: vi.fn() };

    applyFillTintCompat(target, 0xffffff);

    expect(target.setTint).toHaveBeenCalledWith(0xffffff);
    expect(target.setTintMode).toHaveBeenCalledWith('fill-mode');
    (globalThis as unknown as { Phaser?: unknown }).Phaser = originalPhaser;
  });

  it('maps deterministic random rolls to inclusive integer ranges', () => {
    expect(randomIntBetween(-140, 140, () => 0)).toBe(-140);
    expect(randomIntBetween(-140, 140, () => 0.999)).toBe(140);
  });

  it('does not magnetize pickups outside range', () => {
    expect(getPickupMagnetVelocity(0, 0, PICKUP_MAGNET_RANGE + 1, 0)).toBeNull();
  });

  it('pulls pickups toward the target and ramps by proximity', () => {
    const far = getPickupMagnetVelocity(0, 0, PICKUP_MAGNET_RANGE, 0)!;
    const near = getPickupMagnetVelocity(0, 0, PICKUP_MAGNET_RANGE / 2, 0)!;

    expect(far.vx).toBeCloseTo(PICKUP_MAGNET_PULL * 0.55);
    expect(far.vy).toBeCloseTo(0);
    expect(near.vx).toBeGreaterThan(far.vx);
    expect(near.vy).toBeCloseTo(0);
  });

  it('handles zero-distance magnet math without NaN', () => {
    const velocity = getPickupMagnetVelocity(10, 20, 10, 20)!;
    expect(Number.isFinite(velocity.vx)).toBe(true);
    expect(Number.isFinite(velocity.vy)).toBe(true);
    expect(velocity).toEqual({ vx: 0, vy: 0 });
  });
});
