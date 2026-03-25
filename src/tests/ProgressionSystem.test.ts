import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SAVE_KEY = 'moonsec-progression';
const LEGACY_KEY = 'moonsec-highscore';

const store: Record<string, string> = {};
const mockStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};

beforeEach(() => {
  mockStorage.clear();
  vi.stubGlobal('localStorage', mockStorage);
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProgressionSystem', () => {
  it('starts with empty save', async () => {
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    expect(prog.scoreBank).toBe(0);
    expect(prog.ownedNodes).toEqual([]);
    expect(prog.highScore).toBe(0);
  });

  it('migrates legacy highscore key', async () => {
    mockStorage.setItem(LEGACY_KEY, '4200');
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    expect(prog.highScore).toBe(4200);
    expect(prog.scoreBank).toBe(0);
  });

  it('addScore increments bank and persists', async () => {
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    prog.addScore(500);
    expect(prog.scoreBank).toBe(500);
    const prog2 = new ProgressionSystem();
    expect(prog2.scoreBank).toBe(500);
  });

  it('buyNode deducts cost and records ownership', async () => {
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    prog.addScore(600);
    const ok = prog.buyNode('fuel-plus');
    expect(ok).toBe(true);
    expect(prog.scoreBank).toBe(200);
    expect(prog.ownedNodes).toContain('fuel-plus');
  });

  it('buyNode refuses if insufficient score', async () => {
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    prog.addScore(100);
    const ok = prog.buyNode('fuel-plus');
    expect(ok).toBe(false);
    expect(prog.ownedNodes).toHaveLength(0);
  });

  it('buyNode refuses locked tier without prerequisite', async () => {
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    prog.addScore(9999);
    const ok = prog.buyNode('thrust-plus');
    expect(ok).toBe(false);
  });

  it('buyNode allows tier 1 after tier 0 owned', async () => {
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    prog.addScore(9999);
    prog.buyNode('fuel-plus');
    const ok = prog.buyNode('thrust-plus');
    expect(ok).toBe(true);
  });

  it('updateHighScore only updates when higher', async () => {
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    prog.updateHighScore(1000);
    prog.updateHighScore(500);
    expect(prog.highScore).toBe(1000);
  });
});
