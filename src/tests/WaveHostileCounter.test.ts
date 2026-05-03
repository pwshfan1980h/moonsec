import { describe, it, expect } from 'vitest';
import { WaveHostileCounter } from '../systems/WaveHostileCounter';

describe('WaveHostileCounter', () => {
  it('counts dynamic hostile spawns and clamps removals at zero', () => {
    const counter = new WaveHostileCounter();

    expect(counter.add()).toBe(1);
    expect(counter.add(2)).toBe(3);
    expect(counter.remove()).toBe(2);
    expect(counter.remove()).toBe(1);
    expect(counter.remove()).toBe(0);
    expect(counter.remove()).toBe(0);
  });
});
