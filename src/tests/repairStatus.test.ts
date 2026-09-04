import { describe, expect, it } from 'vitest';
import { repairStatus } from '../ui/repairStatus';

describe('repair availability', () => {
  it('prompts for repair after any damage, including above critical health', () => {
    expect(repairStatus(4, 5, 'ready', 1, 20000).usable).toBe(true);
    expect(repairStatus(4.9, 5, 'ready', 1, 20000).label).toBe('READY · PRESS Q');
  });
  it('does not advertise an unusable skill at full armor or after death', () => {
    expect(repairStatus(5, 5, 'ready', 1, 20000)).toMatchObject({ usable: false, label: 'ARMOR FULL' });
    expect(repairStatus(0, 5, 'ready', 1, 20000)).toMatchObject({ usable: false, label: 'OFFLINE' });
  });
  it('keeps repair unavailable throughout healing and recharge, even when still damaged', () => {
    expect(repairStatus(3, 5, 'active', 0.5, 20000)).toMatchObject({ usable: false, label: 'REPAIRING', fill: 0.5 });
    expect(repairStatus(3, 5, 'cooldown', 0.5, 20000)).toMatchObject({ usable: false, label: 'RECHARGE · 10s' });
    expect(repairStatus(3, 5, 'ready', 1, 20000).usable).toBe(true);
  });
  it('uses the current cooldown duration and rounds remaining seconds up', () => {
    expect(repairStatus(3, 5, 'cooldown', 0.21, 10000).label).toBe('RECHARGE · 8s');
  });
});
