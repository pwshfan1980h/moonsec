import { describe, it, expect } from 'vitest';

describe('version', () => {
  it('__APP_VERSION__ is defined', () => {
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__.length).toBeGreaterThan(0);
  });
});
