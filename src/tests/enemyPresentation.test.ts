import { describe, expect, it, vi } from 'vitest';
import { flashEnemyHit, presentEnemyArrival } from '../entities/effects/enemyPresentation';

function spriteMock() {
  const data = new Map<string, unknown>();
  return {
    x: 100,
    y: 200,
    depth: 8,
    active: true,
    setAlpha: vi.fn(function (this: unknown) { return this; }),
    setData: vi.fn((key: string, value: unknown) => { data.set(key, value); }),
    getData: vi.fn((key: string) => data.get(key)),
    setTintFill: vi.fn(),
    clearTint: vi.fn(),
    setTint: vi.fn(),
  };
}

function graphicsMock() {
  return {
    destroyed: false,
    setPosition: vi.fn(function (this: unknown) { return this; }),
    setDepth: vi.fn(function (this: unknown) { return this; }),
    setBlendMode: vi.fn(function (this: unknown) { return this; }),
    lineStyle: vi.fn(),
    lineBetween: vi.fn(),
    strokeCircle: vi.fn(),
    strokeEllipse: vi.fn(),
    destroy: vi.fn(function (this: { destroyed: boolean }) { this.destroyed = true; }),
  };
}

describe('enemy presentation helpers', () => {
  it('restores the family tint after a hit', () => {
    const target = spriteMock();
    let finish: () => void = () => {};
    const scene = { time: { delayedCall: vi.fn((_ms: number, callback: () => void) => { finish = callback; }) } };

    flashEnemyHit(scene as never, target as never, 0xff8800, 90);
    expect(target.setTintFill).toHaveBeenCalledTimes(1);
    finish();
    expect(target.setTint).toHaveBeenCalledWith(0xff8800);
  });

  it('does not let an older hit timer overwrite a newer flash', () => {
    const target = spriteMock();
    const finishes: (() => void)[] = [];
    const scene = { time: { delayedCall: vi.fn((_ms: number, callback: () => void) => { finishes.push(callback); }) } };

    flashEnemyHit(scene as never, target as never, 0xff0000);
    flashEnemyHit(scene as never, target as never, 0x00ff00);
    finishes[0]();
    expect(target.setTint).not.toHaveBeenCalled();
    finishes[1]();
    expect(target.setTint).toHaveBeenCalledWith(0x00ff00);
  });

  it('keeps arrival effects visual-only and destroys their graphics', () => {
    const target = spriteMock();
    const gfx = graphicsMock();
    const tweens: Record<string, unknown>[] = [];
    const scene = {
      add: { graphics: vi.fn(() => gfx) },
      tweens: { add: vi.fn((config: Record<string, unknown>) => { tweens.push(config); }) },
    };

    presentEnemyArrival(scene as never, target as never, 0xff6655, 'air');

    expect(target.setAlpha).toHaveBeenCalledWith(0.25);
    expect(tweens).toHaveLength(2);
    expect(tweens[0].targets).toBe(target);
    expect(tweens[0]).not.toHaveProperty('x');
    expect(tweens[0]).not.toHaveProperty('y');
    expect(tweens[0]).not.toHaveProperty('scale');
    expect(tweens[0]).not.toHaveProperty('scaleX');
    expect(tweens[0]).not.toHaveProperty('scaleY');
    (tweens[1].onComplete as () => void)();
    expect(gfx.destroy).toHaveBeenCalledTimes(1);
  });
});
