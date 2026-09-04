import { describe, expect, it } from 'vitest';
import { JumpAssist } from '../systems/JumpAssist';

describe('jump input forgiveness', () => {
  it('accepts a buffered press when landing within 120ms', () => {
    const jump = new JumpAssist();
    expect(jump.update(100, false, true)).toBe(false);
    expect(jump.update(200, true, false)).toBe(true);
    expect(jump.update(216, true, false)).toBe(false);
  });
  it('accepts coyote time but cannot grant a second airborne jump', () => {
    const jump = new JumpAssist();
    jump.update(100, true, false);
    expect(jump.update(180, false, true)).toBe(true);
    expect(jump.update(190, false, true)).toBe(false);
  });
  it('expires late presses and rearms after landing', () => {
    const jump = new JumpAssist();
    jump.update(100, true, false);
    expect(jump.update(250, false, true)).toBe(false);
    expect(jump.update(400, true, false)).toBe(false);
    expect(jump.update(410, true, true)).toBe(true);
    jump.update(430, false, false);
    jump.update(800, true, false);
    expect(jump.update(810, true, true)).toBe(true);
  });
});
