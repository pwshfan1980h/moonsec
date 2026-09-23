import { pal } from '../render/palette';
import { describe, expect, it, vi } from 'vitest';
import { HEAL } from '../balance/armor';
import {
  BODY_SIZE,
  CONTENT_PIXELS,
  PICKUP_MAGNET_PULL,
  PICKUP_MAGNET_RANGE,
  PICKUP_SIZE,
  getPickupMagnetVelocity,
  getPickupVisual,
  applyFillTintCompat,
  PickupSystem,
  randomIntBetween,
} from '../systems/PickupSystem';

describe('PickupSystem pure helpers', () => {
  it('sizes the pickup and its body from the kit art', () => {
    expect(CONTENT_PIXELS).toBe(18);
    expect(PICKUP_SIZE).toBe(40); // 18 px + outline, at 2x
    expect(BODY_SIZE).toBe(18);   // frame pixels; the sprite scales it to 36
  });

  it('draws each pickup type from its own world-kit frame with a matching flash', () => {
    expect(getPickupVisual('health')).toEqual({ frame: 'pickupHealth@n', flash: pal('green1') });
    expect(getPickupVisual('fuel')).toEqual({ frame: 'pickupFuel@n', flash: pal('cyan2') });
    expect(getPickupVisual('ammo')).toEqual({ frame: 'pickupAmmo@n', flash: pal('amber1') });
    expect(getPickupVisual('score')).toEqual({ frame: 'pickupScore@n', flash: pal('amber1'), points: 100 });
  });

  it('uses Phaser 4 tint mode API for spawn flash tint', () => {
    const originalPhaser = (globalThis as unknown as { Phaser?: unknown }).Phaser;
    (globalThis as unknown as { Phaser?: unknown }).Phaser = { TintModes: { FILL: 'fill-mode' } };
    const target = { setTintFill: vi.fn(), setTint: vi.fn(), setTintMode: vi.fn() };

    applyFillTintCompat(target, pal('cyan3'));

    expect(target.setTintFill).not.toHaveBeenCalled();
    expect(target.setTint).toHaveBeenCalledWith(pal('cyan3'));
    expect(target.setTintMode).toHaveBeenCalledWith('fill-mode');
    (globalThis as unknown as { Phaser?: unknown }).Phaser = originalPhaser;
  });

  it('still tints when Phaser exposes no fill mode', () => {
    const originalPhaser = (globalThis as unknown as { Phaser?: unknown }).Phaser;
    (globalThis as unknown as { Phaser?: unknown }).Phaser = undefined;
    const target = { setTint: vi.fn(), setTintMode: vi.fn() };

    applyFillTintCompat(target, pal('cyan3'));

    expect(target.setTint).toHaveBeenCalledWith(pal('cyan3'));
    expect(target.setTintMode).not.toHaveBeenCalled();
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

  it('collects the pickup from Phaser group-vs-player overlap order', () => {
    const overlap = vi.fn();
    const scene = {
      physics: { add: { overlap } },
      pickups: { kind: 'pickups' },
      player: {
        kind: 'player',
        heal: vi.fn(),
        refillRapidAmmo: vi.fn(),
        restoreJetpackFuel: vi.fn(),
      },
      tweens: { killTweensOf: vi.fn() },
      audio: { playAt: vi.fn() },
      spawnFloatingText: vi.fn(),
    };
    const pickup = {
      active: true,
      x: 12,
      y: 34,
      body: { enable: true },
      getData: vi.fn((key: string) => key === 'type' ? 'health' : undefined),
      setAlpha: vi.fn(function (this: unknown) { return this; }),
      setActive: vi.fn(function (this: unknown) { return this; }),
      setVisible: vi.fn(function (this: unknown) { return this; }),
    };

    new PickupSystem(scene as any).registerCollectionOverlap();
    const callback = overlap.mock.calls[0][2] as (player: unknown, pickup: unknown) => void;
    callback(scene.player, pickup);

    expect(pickup.setActive).toHaveBeenCalledWith(false);
    expect(scene.player.heal).toHaveBeenCalledWith(HEAL.pickup);
    expect(scene.player.restoreJetpackFuel).not.toHaveBeenCalled();
  });
});
