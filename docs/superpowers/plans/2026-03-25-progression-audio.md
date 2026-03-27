# Progression, Audio & Mech Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mech stat differentiation, 10 new sounds, between-wave upgrade cards, a persistent upgrade tree, and stat panels to MechSelectScene.

**Architecture:** Pure-logic systems (ProgressionSystem, card/tree data) are extracted into dedicated files and unit-tested with vitest. Phaser scene code is manual-tested in browser. New scenes (UpgradeCardScene, UpgradeTreeScene) are registered in main.ts and launched via Phaser's scene manager. All progression state lives in localStorage via ProgressionSystem; per-run state lives on the Phaser game registry.

**Tech Stack:** Phaser 3.80, TypeScript, Vite 5, vitest (new)

**Spec:** `docs/superpowers/specs/2026-03-24-progression-audio-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/data/upgradeCards.ts` | Card pool definitions + apply functions |
| Create | `src/data/upgradeTree.ts` | Tree node definitions + `applyTreeEffect()` |
| Create | `src/systems/ProgressionSystem.ts` | localStorage save/load, score banking, node purchases |
| Create | `src/scenes/UpgradeCardScene.ts` | Between-wave card pick UI (additive scene) |
| Create | `src/scenes/UpgradeTreeScene.ts` | Persistent upgrade tree UI with particle background |
| Create | `src/tests/ProgressionSystem.test.ts` | Unit tests for ProgressionSystem |
| Create | `src/tests/upgradeCards.test.ts` | Unit tests for card pool |
| Create | `src/tests/upgradeTree.test.ts` | Unit tests for tree nodes + applyTreeEffect |
| Modify | `src/constants.ts` | Add `MECH_STATS` |
| Modify | `src/entities/Player.ts` | Use `MECH_STATS`, fix jetpackChange emit, accept upgrades |
| Modify | `src/systems/AudioSystem.ts` | Add 10 new `SoundId` entries + volumes |
| Modify | `src/systems/DroneSpawner.ts` | Emit wave index with `waveCleared`; add `isBossWave()` |
| Modify | `src/scenes/BootScene.ts` | Add 10 new audio keys to sounds array |
| Modify | `src/scenes/GameScene.ts` | ProgressionSystem init, tree effects, card launch, audio |
| Modify | `src/scenes/UIScene.ts` | level-complete sound, score banking, isNewGame flag |
| Modify | `src/scenes/TitleScene.ts` | Add UPGRADES option + routing |
| Modify | `src/scenes/MechSelectScene.ts` | Stat panels, badge labels, ui-nav/confirm sounds |
| Modify | `src/main.ts` | Register UpgradeCardScene and UpgradeTreeScene |
| Modify | `vite.config.ts` or `vitest.config.ts` | vitest config (new file if needed) |
| Modify | `package.json` | Add vitest dev dependency + test script |

---

## Task 1: Install vitest + write placeholder test

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/tests/smoke.test.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 4: Write smoke test**

Create `src/tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run and confirm green**

```bash
npm test
```
Expected: `1 passed`

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.ts src/tests/smoke.test.ts
git commit -m "chore: add vitest for unit testing"
```

---

## Task 2: MECH_STATS constants + Player.ts stat wiring

**Files:**
- Modify: `src/constants.ts`
- Modify: `src/entities/Player.ts`

- [ ] **Step 1: Add MECH_STATS to constants.ts**

Open `src/constants.ts`. Add after existing exports:

```ts
export const MECH_STATS: Record<string, {
  maxHp: number;
  walkSpeed: number;
  runSpeed: number;
  jumpVelocity: number;
  jetpackAccel: number;
  jetpackMaxFuel: number;
}> = {
  mech: {   // STRIDER — speed archetype: fast, high fuel, low HP
    maxHp: 3,
    walkSpeed: 440,
    runSpeed: 700,
    jumpVelocity: -510,
    jetpackAccel: -1840,
    jetpackMaxFuel: 4400,
  },
  mech4: {  // SCOUT — balanced baseline
    maxHp: 5,
    walkSpeed: 220,
    runSpeed: 350,
    jumpVelocity: -510,
    jetpackAccel: -920,
    jetpackMaxFuel: 2200,
  },
};
```

- [ ] **Step 2: Update Player.ts — store stats from MECH_STATS**

In `src/entities/Player.ts`, import `MECH_STATS`:
```ts
import { MECH_STATS } from '../constants';
```

In the constructor, after `this.mechType = mechType`, add:
```ts
const stats = MECH_STATS[mechType] ?? MECH_STATS['mech4'];
this.maxHp        = stats.maxHp;
this.hp           = stats.maxHp;
this.walkSpeed    = stats.walkSpeed;
this.runSpeed     = stats.runSpeed;
this.jumpVelocity = stats.jumpVelocity;
this.jetpackAccel = stats.jetpackAccel;
this.jetpackMaxFuel = stats.jetpackMaxFuel;
```

Declare these as instance fields (not `readonly`) at the top of the class:
```ts
maxHp: number;
hp: number;
walkSpeed: number;
runSpeed: number;
jumpVelocity: number;
jetpackAccel: number;
jetpackMaxFuel: number;
```

Remove (or comment) the old hardcoded `const WALK_SPEED = 220`, `const RUN_SPEED = 350`, `const JETPACK_MAX_FUEL = 2200` etc. local constants inside Player (the exact names depend on current code — find and replace all usages with `this.walkSpeed`, `this.runSpeed`, `this.jetpackMaxFuel`, `this.jetpackAccel`).

- [ ] **Step 3: Fix jetpackChange event emit**

Find the line where `jetpackChange` is emitted (search for `emit('jetpackChange'`). Change it to use the instance value:
```ts
this.scene.events.emit('jetpackChange', this.jetpackFuel, this.jetpackMaxFuel);
```
This is **critical** — without this, the UIScene jetpack bar will overflow for Strider.

- [ ] **Step 4: Fix animation run threshold**

Find the run animation check (search for `WALK_SPEED` or `* 1.4`). Change to:
```ts
if (Math.abs(vx) > this.walkSpeed * 1.4) {
```

- [ ] **Step 5: Verify build is clean**

```bash
npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 6: Manual smoke test**

Run `npm run dev`. Start a game with each mech. Confirm:
- Strider moves noticeably faster, jetpack lasts much longer, only 3 HP bars
- Scout is baseline (5 HP, normal speed)
- Jetpack bar fills/drains correctly for both

- [ ] **Step 7: Commit**

```bash
git add src/constants.ts src/entities/Player.ts
git commit -m "feat: differentiate Strider/Scout stats via MECH_STATS"
```

---

## Task 3: Audio system expansion

**Files:**
- Modify: `src/systems/AudioSystem.ts`
- Modify: `src/scenes/BootScene.ts`
- Modify: `src/entities/Player.ts`
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/scenes/UIScene.ts`
- Modify: `src/scenes/TitleScene.ts`
- Modify: `src/scenes/MechSelectScene.ts`

- [ ] **Step 1: Expand SoundId type in AudioSystem.ts**

Open `src/systems/AudioSystem.ts`. Extend `SoundId`:
```ts
type SoundId =
  | 'rapid' | 'turret' | 'hit' | 'hurt' | 'jump' | 'death'
  | 'drone-shoot' | 'explosion' | 'footstep' | 'missile-impact'
  | 'nanite-heal' | 'nanite-tick' | 'pickup' | 'eject'
  | 'ui-nav' | 'ui-confirm' | 'level-complete'
  | 'upgrade-pick' | 'upgrade-buy' | 'upgrade-denied';
```

- [ ] **Step 2: Add volume entries**

In the `VOLUMES` map, add:
```ts
'nanite-heal':    0.55,
'nanite-tick':    0.30,
'pickup':         0.50,
'eject':          0.60,
'ui-nav':         0.25,
'ui-confirm':     0.40,
'level-complete': 0.70,
'upgrade-pick':   0.55,
'upgrade-buy':    0.65,
'upgrade-denied': 0.40,
```

- [ ] **Step 3: Add nanite-tick minInterval**

In the `minInterval` map, add:
```ts
'nanite-tick': 550,
```

- [ ] **Step 4: Add 10 keys to BootScene sounds array**

Open `src/scenes/BootScene.ts`. Find the `sounds` array and extend it:
```ts
const sounds = [
  'rapid','turret','hit','hurt','jump','death',
  'drone-shoot','explosion','footstep','missile-impact',
  'nanite-heal','nanite-tick','pickup','eject',
  'ui-nav','ui-confirm','level-complete',
  'upgrade-pick','upgrade-buy','upgrade-denied',
];
```

- [ ] **Step 5: Wire nanite sounds in Player.ts**

In `src/entities/Player.ts`, find where the nanite heal is activated (Q key handler). After the existing heal-start logic, add:
```ts
this.scene.audio.play('nanite-heal');
```

Find the 600ms spark timer callback. Add:
```ts
this.scene.audio.play('nanite-tick');
```

- [ ] **Step 6: Wire pickup and eject sounds in GameScene.ts**

Open `src/scenes/GameScene.ts`. In the health/fuel orb overlap callback (around line 195), add after the `player.heal(1)` / `player.restoreJetpackFuel()` call:
```ts
this.audio.play('pickup');
```

Find where `player.eject()` is called (around line 309). Add before or after the call:
```ts
this.audio.play('eject');
```

- [ ] **Step 7: Replace level-complete stinger in UIScene.ts**

Open `src/scenes/UIScene.ts`. Find:
```ts
gameSceneForAudio?.audio?.playAt('explosion', { rate: 0.3, detune: -600, volume: 0.45 });
```
Replace with:
```ts
gameSceneForAudio?.audio?.play('level-complete');
```

- [ ] **Step 8: Wire UI sounds in TitleScene.ts**

Open `src/scenes/TitleScene.ts`. Find where the cursor index changes on keypress. After changing `selectedIndex`, add:
```ts
this.sound.play('ui-nav', { volume: 0.25 });
```
On ENTER confirm, add:
```ts
this.sound.play('ui-confirm', { volume: 0.40 });
```
(TitleScene doesn't have an AudioSystem instance — use `this.sound` directly.)

- [ ] **Step 9: Wire UI sounds in MechSelectScene.ts**

Similarly in `src/scenes/MechSelectScene.ts`, on left/right selection:
```ts
this.sound.play('ui-nav', { volume: 0.25 });
```
On ENTER confirm:
```ts
this.sound.play('ui-confirm', { volume: 0.40 });
```

- [ ] **Step 10: Verify build**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 11: Manual smoke test**

Run `npm run dev`. Confirm:
- Nanite heal (Q) plays a sound
- Picking up a health/fuel orb plays a sound
- Level complete plays a new stinger (not explosion)
- Menus produce nav/confirm clicks

- [ ] **Step 12: Commit**

```bash
git add src/systems/AudioSystem.ts src/scenes/BootScene.ts \
  src/entities/Player.ts src/scenes/GameScene.ts \
  src/scenes/UIScene.ts src/scenes/TitleScene.ts \
  src/scenes/MechSelectScene.ts
git commit -m "feat: add 10 new SFX — nanite heal/tick, pickup, eject, UI, level complete"
```

---

## Task 4: ProgressionSystem — unit-tested

**Files:**
- Create: `src/systems/ProgressionSystem.ts`
- Create: `src/tests/ProgressionSystem.test.ts`

- [ ] **Step 1: Write tests first**

Create `src/tests/ProgressionSystem.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ProgressionSystem reads/writes localStorage.
// We mock it via vitest's fake environment.

const SAVE_KEY = 'moonsec-progression';
const LEGACY_KEY = 'moonsec-highscore';

// Storage mock
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
    // Re-instantiate to confirm persistence
    const prog2 = new ProgressionSystem();
    expect(prog2.scoreBank).toBe(500);
  });

  it('buyNode deducts cost and records ownership', async () => {
    const { ProgressionSystem } = await import('../systems/ProgressionSystem');
    const prog = new ProgressionSystem();
    prog.addScore(600);
    const ok = prog.buyNode('fuel-plus');   // tier 0 mobility, cost 400
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
    const ok = prog.buyNode('thrust-plus');  // tier 1 mobility — needs fuel-plus first
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
```

- [ ] **Step 2: Run tests — confirm all fail**

```bash
npm test
```
Expected: all ProgressionSystem tests fail with "Cannot find module".

- [ ] **Step 3: Implement ProgressionSystem**

Create `src/systems/ProgressionSystem.ts`:
```ts
import { TREE_NODES } from '../data/upgradeTree';

const SAVE_KEY = 'moonsec-progression';
const LEGACY_KEY = 'moonsec-highscore';

interface SaveData {
  scoreBank: number;
  ownedNodes: string[];
  highScore: number;
}

export class ProgressionSystem {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as SaveData;
      } catch {
        // corrupt save — reset
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    return {
      scoreBank: 0,
      ownedNodes: [],
      highScore: legacy ? parseInt(legacy, 10) : 0,
    };
  }

  private save(): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
  }

  get scoreBank(): number { return this.data.scoreBank; }
  get ownedNodes(): string[] { return [...this.data.ownedNodes]; }
  get highScore(): number { return this.data.highScore; }

  addScore(n: number): void {
    this.data.scoreBank += n;
    this.save();
  }

  updateHighScore(score: number): void {
    if (score > this.data.highScore) {
      this.data.highScore = score;
      this.save();
    }
  }

  buyNode(id: string): boolean {
    const node = TREE_NODES.find(n => n.id === id);
    if (!node) return false;
    if (this.data.ownedNodes.includes(id)) return false;
    if (this.data.scoreBank < node.cost) return false;
    if (node.tier > 0) {
      const prereq = TREE_NODES.find(n => n.col === node.col && n.tier === node.tier - 1);
      if (prereq && !this.data.ownedNodes.includes(prereq.id)) return false;
    }
    this.data.scoreBank -= node.cost;
    this.data.ownedNodes.push(id);
    this.save();
    return true;
  }
}
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npm test
```
Expected: all ProgressionSystem tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/ProgressionSystem.ts src/tests/ProgressionSystem.test.ts
git commit -m "feat: add ProgressionSystem with localStorage persistence and unit tests"
```

---

## Task 5: Upgrade tree data + applyTreeEffect

**Files:**
- Create: `src/data/upgradeTree.ts`
- Create: `src/tests/upgradeTree.test.ts`

- [ ] **Step 1: Write tests first**

Create `src/tests/upgradeTree.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { TREE_NODES, applyTreeEffect } from '../data/upgradeTree';

// Minimal Player mock — only the fields applyTreeEffect touches
function mockPlayer(overrides = {}) {
  return {
    maxHp: 5,
    jetpackMaxFuel: 2200,
    jetpackAccel: -920,
    naniteCooldownMs: 20000,
    naniteHealAmount: 1,
    hasNaniteBurst: false,
    hasAirDash: false,
    hasGravBoost: false,
    hasOverload: false,
    hasRegenField: false,
    missileSlots: 6,
    rapidMinInterval: 60,
    turretCooldownMs: 650,
    ...overrides,
  };
}

describe('TREE_NODES', () => {
  it('has 12 nodes', () => {
    expect(TREE_NODES).toHaveLength(12);
  });

  it('has 4 tiers per column', () => {
    const cols = ['offense', 'defense', 'mobility'] as const;
    for (const col of cols) {
      const nodes = TREE_NODES.filter(n => n.col === col);
      expect(nodes).toHaveLength(4);
      expect(nodes.map(n => n.tier).sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('all nodes have positive cost', () => {
    expect(TREE_NODES.every(n => n.cost > 0)).toBe(true);
  });
});

describe('applyTreeEffect', () => {
  it('rapidInterval reduces rapidMinInterval', () => {
    const p = mockPlayer();
    applyTreeEffect(p as any, { type: 'rapidInterval', delta: 15 });
    expect(p.rapidMinInterval).toBe(45);
  });

  it('maxHp increases maxHp', () => {
    const p = mockPlayer();
    applyTreeEffect(p as any, { type: 'maxHp', delta: 1 });
    expect(p.maxHp).toBe(6);
  });

  it('jetpackFuel multiplies jetpackMaxFuel', () => {
    const p = mockPlayer();
    applyTreeEffect(p as any, { type: 'jetpackFuel', mult: 1.3 });
    expect(p.jetpackMaxFuel).toBeCloseTo(2860);
  });

  it('airDash sets hasAirDash flag', () => {
    const p = mockPlayer();
    applyTreeEffect(p as any, { type: 'airDash' });
    expect(p.hasAirDash).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — confirm fail**

```bash
npm test
```
Expected: upgradeTree tests fail.

- [ ] **Step 3: Implement upgradeTree.ts**

Create `src/data/upgradeTree.ts`:
```ts
import type { Player } from '../entities/Player';

export type TreeEffect =
  | { type: 'rapidInterval';   delta: number }
  | { type: 'turretCooldown';  delta: number }
  | { type: 'missileSlots';    delta: number }
  | { type: 'maxHp';           delta: number }
  | { type: 'naniteCooldown';  delta: number }
  | { type: 'naniteBurst' }
  | { type: 'regenField' }
  | { type: 'jetpackFuel';     mult: number }
  | { type: 'jetpackAccel';    mult: number }
  | { type: 'airDash' }
  | { type: 'gravBoost' }
  | { type: 'overload' };

export interface TreeNode {
  id: string;
  col: 'offense' | 'defense' | 'mobility';
  tier: 0 | 1 | 2 | 3;
  name: string;
  desc: string;
  cost: number;
  effect: TreeEffect;
}

export const TREE_NODES: TreeNode[] = [
  // Offense
  { id: 'rapid-plus',    col: 'offense', tier: 0, name: 'RAPID+',       desc: 'Increases rapid-fire rate',        cost: 500,  effect: { type: 'rapidInterval',  delta: 15 } },
  { id: 'turret-plus',   col: 'offense', tier: 1, name: 'TURRET+',      desc: 'Reduces turret cooldown',          cost: 800,  effect: { type: 'turretCooldown', delta: 100 } },
  { id: 'dual-missile',  col: 'offense', tier: 2, name: 'DUAL MISSILE', desc: 'Two additional missile slots',     cost: 1500, effect: { type: 'missileSlots',   delta: 2 } },
  { id: 'overload',      col: 'offense', tier: 3, name: 'OVERLOAD',     desc: 'Brief invincibility on 10-streak', cost: 3000, effect: { type: 'overload' } },
  // Defense
  { id: 'hp-plus',       col: 'defense', tier: 0, name: 'HP+1',         desc: 'Increases max hull integrity',     cost: 500,  effect: { type: 'maxHp',          delta: 1 } },
  { id: 'nanite-cd',     col: 'defense', tier: 1, name: 'NANITE CD–',   desc: 'Reduces nanite cooldown by 5s',   cost: 600,  effect: { type: 'naniteCooldown', delta: 5000 } },
  { id: 'nanite-burst',  col: 'defense', tier: 2, name: 'NANITE BURST', desc: '1s invulnerability on Q activate', cost: 1500, effect: { type: 'naniteBurst' } },
  { id: 'regen-field',   col: 'defense', tier: 3, name: 'REGEN FIELD',  desc: '+1 HP every 2 waves cleared',     cost: 2400, effect: { type: 'regenField' } },
  // Mobility
  { id: 'fuel-plus',     col: 'mobility', tier: 0, name: 'FUEL+',       desc: 'Expands jetpack fuel capacity',   cost: 400,  effect: { type: 'jetpackFuel',  mult: 1.3 } },
  { id: 'thrust-plus',   col: 'mobility', tier: 1, name: 'THRUST+',     desc: 'Increases jetpack acceleration',  cost: 900,  effect: { type: 'jetpackAccel', mult: 1.2 } },
  { id: 'air-dash',      col: 'mobility', tier: 2, name: 'AIR DASH',    desc: 'Double-tap to dash mid-air',      cost: 1600, effect: { type: 'airDash' } },
  { id: 'grav-boost',    col: 'mobility', tier: 3, name: 'GRAV BOOST',  desc: 'Reduced gravity while jetting',   cost: 3000, effect: { type: 'gravBoost' } },
];

export function applyTreeEffect(player: Player, effect: TreeEffect): void {
  switch (effect.type) {
    case 'rapidInterval':
      player.rapidMinInterval  = Math.max(20, (player.rapidMinInterval ?? 60) - effect.delta);
      break;
    case 'turretCooldown':
      player.turretCooldownMs  = Math.max(200, (player.turretCooldownMs ?? 650) - effect.delta);
      break;
    case 'missileSlots':
      player.missileSlots      = (player.missileSlots ?? 6) + effect.delta;
      break;
    case 'maxHp':
      player.maxHp            += effect.delta;
      break;
    case 'naniteCooldown':
      player.naniteCooldownMs  = Math.max(5000, (player.naniteCooldownMs ?? 20000) - effect.delta);
      break;
    case 'naniteBurst':
      player.hasNaniteBurst    = true;
      break;
    case 'regenField':
      player.hasRegenField     = true;
      break;
    case 'jetpackFuel':
      player.jetpackMaxFuel   *= effect.mult;
      break;
    case 'jetpackAccel':
      player.jetpackAccel     *= effect.mult;
      break;
    case 'airDash':
      player.hasAirDash        = true;
      break;
    case 'gravBoost':
      player.hasGravBoost      = true;
      break;
    case 'overload':
      player.hasOverload       = true;
      break;
  }
}
```

**Note:** The fields `rapidMinInterval`, `turretCooldownMs`, `missileSlots`, `naniteCooldownMs`, `naniteHealAmount`, `hasNaniteBurst`, `hasAirDash`, `hasGravBoost`, `hasOverload`, `hasRegenField` must be added as public fields on `Player.ts` with their defaults. Add them in Player's field declarations:
```ts
rapidMinInterval  = 60;      // ms — matches AudioSystem minInterval.rapid
turretCooldownMs  = 650;     // ms
missileSlots      = 6;
naniteCooldownMs  = 20000;   // ms
naniteHealAmount  = 1;       // HP per nanite heal
hasNaniteBurst    = false;
hasAirDash        = false;
hasGravBoost      = false;
hasOverload       = false;
hasRegenField     = false;
```

Existing `Turret`, `RapidGun`, and `HomingMissile` classes must read from these fields rather than their own hardcoded constants. In `RapidGun.ts`, the `60`ms fire rate check should read `this.scene.player.rapidMinInterval`. In `Turret.ts`, the `650`ms cooldown should read `this.scene.player.turretCooldownMs`. In `HomingMissile.ts`, the `missileCount` cap should read `this.scene.player.missileSlots`.

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npm test
```
Expected: all upgradeTree tests pass.

- [ ] **Step 5: Build check**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/upgradeTree.ts src/tests/upgradeTree.test.ts \
  src/entities/Player.ts src/weapons/RapidGun.ts \
  src/weapons/Turret.ts src/weapons/HomingMissile.ts
git commit -m "feat: upgrade tree node data, applyTreeEffect, player upgrade fields"
```

---

## Task 6: Upgrade card data

**Files:**
- Create: `src/data/upgradeCards.ts`
- Create: `src/tests/upgradeCards.test.ts`

- [ ] **Step 1: Write tests first**

Create `src/tests/upgradeCards.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CARD_POOL } from '../data/upgradeCards';

describe('CARD_POOL', () => {
  it('has 10 cards', () => {
    expect(CARD_POOL).toHaveLength(10);
  });

  it('has at least 3 cards per category', () => {
    const cats = ['offense', 'defense', 'mobility'] as const;
    for (const cat of cats) {
      expect(CARD_POOL.filter(c => c.category === cat).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all cards have non-empty id, name, desc, statLine', () => {
    for (const card of CARD_POOL) {
      expect(card.id.length).toBeGreaterThan(0);
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.desc.length).toBeGreaterThan(0);
      expect(card.statLine.length).toBeGreaterThan(0);
    }
  });

  it('plating card increases maxHp and hp', () => {
    const card = CARD_POOL.find(c => c.id === 'plating')!;
    const player = { maxHp: 3, hp: 3 } as any;
    card.apply(player);
    expect(player.maxHp).toBe(4);
    expect(player.hp).toBe(4);
  });

  it('afterburn card increases jetpackMaxFuel by 40%', () => {
    const card = CARD_POOL.find(c => c.id === 'afterburn')!;
    const player = { jetpackMaxFuel: 2200 } as any;
    card.apply(player);
    expect(player.jetpackMaxFuel).toBeCloseTo(3080);
  });
});
```

- [ ] **Step 2: Run tests — confirm fail**

```bash
npm test
```
Expected: upgradeCards tests fail.

- [ ] **Step 3: Implement upgradeCards.ts**

Create `src/data/upgradeCards.ts`:
```ts
import type { Player } from '../entities/Player';

export interface UpgradeCard {
  id: string;
  name: string;
  category: 'offense' | 'defense' | 'mobility';
  icon: string;
  desc: string;
  statLine: string;
  oneTime: boolean;
  apply: (player: Player) => void;
}

export const CARD_POOL: UpgradeCard[] = [
  // Offense
  {
    id: 'overclock', name: 'OVERCLOCK', category: 'offense', icon: '⚡',
    desc: 'Rapid-fire rate increased for this run',
    statLine: '+25% FIRE RATE', oneTime: false,
    apply: (p) => { p.rapidMinInterval = Math.max(20, Math.round(p.rapidMinInterval * 0.75)); },
  },
  {
    id: 'heavy-round', name: 'HEAVY ROUND', category: 'offense', icon: '🔴',
    desc: 'Turret shots hit harder',
    statLine: '+50% TURRET IMPACT', oneTime: false,
    apply: (p) => { p.turretCooldownMs = Math.max(200, Math.round(p.turretCooldownMs * 0.85)); },
  },
  {
    id: 'dual-missile', name: 'DUAL MISSILE', category: 'offense', icon: '🚀',
    desc: 'Two additional missile slots',
    statLine: '+2 MISSILE SLOTS', oneTime: true,
    apply: (p) => { p.missileSlots += 2; },
  },
  // Defense
  {
    id: 'plating', name: 'PLATING', category: 'defense', icon: '🛡️',
    desc: 'Emergency hull reinforcement',
    statLine: '+1 MAX HP', oneTime: false,
    apply: (p) => { p.maxHp += 1; p.hp = Math.min(p.hp + 1, p.maxHp); },
  },
  {
    id: 'nanite-cd', name: 'NANITE CD–', category: 'defense', icon: '💉',
    desc: 'Nanite cooldown reduced',
    statLine: '–5s NANITE COOLDOWN', oneTime: false,
    apply: (p) => { p.naniteCooldownMs = Math.max(5000, p.naniteCooldownMs - 5000); },
  },
  {
    id: 'reactive-armor', name: 'REACTIVE ARMOR', category: 'defense', icon: '🔰',
    desc: 'Absorbs your next hit this wave',
    statLine: 'ABSORB 1 HIT', oneTime: true,
    apply: (p) => { (p as any).damageShield = true; },
  },
  {
    id: 'regen-boost', name: 'REGEN BOOST', category: 'defense', icon: '➕',
    desc: 'Nanite heal restores more HP',
    statLine: '+1 NANITE HEAL', oneTime: true,
    apply: (p) => { p.naniteHealAmount = Math.min(p.naniteHealAmount + 1, 3); },
  },
  // Mobility
  {
    id: 'afterburn', name: 'AFTERBURN', category: 'mobility', icon: '🔥',
    desc: 'Expanded jetpack fuel capacity',
    statLine: '+40% FUEL CAP', oneTime: false,
    apply: (p) => { p.jetpackMaxFuel = Math.round(p.jetpackMaxFuel * 1.4); },
  },
  {
    id: 'thrust', name: 'THRUST+', category: 'mobility', icon: '💨',
    desc: 'Jetpack acceleration increased',
    statLine: '+30% JETPACK ACCEL', oneTime: false,
    apply: (p) => { p.jetpackAccel = Math.round(p.jetpackAccel * 1.3); },
  },
  {
    id: 'stabiliser', name: 'STABILISER', category: 'mobility', icon: '⬆️',
    desc: 'Jump height increased',
    statLine: '+15% JUMP HEIGHT', oneTime: true,
    apply: (p) => { p.jumpVelocity = Math.round(p.jumpVelocity * 1.15); },
  },
];
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npm test
```
Expected: all upgradeCards tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/upgradeCards.ts src/tests/upgradeCards.test.ts
git commit -m "feat: upgrade card pool data with unit tests"
```

---

## Task 7: DroneSpawner — emit waveIndex + isBossWave()

**Files:**
- Modify: `src/systems/DroneSpawner.ts`

- [ ] **Step 1: Add isBossWave() public method**

Open `src/systems/DroneSpawner.ts`. Find where `BOSS_WAVE_L1` / `BOSS_WAVE_L2` are compared against `this.waveIndex`. Add a public method:

```ts
isBossWave(): boolean {
  const bossWave = this.level === 2 ? BOSS_WAVE_L2 : BOSS_WAVE_L1;
  return this.waveIndex >= bossWave;
}
```

(Import `BOSS_WAVE_L1`, `BOSS_WAVE_L2` from constants if they aren't already.)

- [ ] **Step 2: Emit waveIndex with waveCleared**

Find the existing `waveCleared` emit. Change from:
```ts
this.scene.events.emit('waveCleared');
```
to:
```ts
this.scene.events.emit('waveCleared', this.waveIndex);
```

Make `waveIndex` public (change `private waveIndex` to `waveIndex` — or `readonly waveIndex`).

- [ ] **Step 3: Build check**

```bash
npm run build
```
Expected: no errors (GameScene's existing `waveCleared` listener ignores the payload for now — that's fine).

- [ ] **Step 4: Commit**

```bash
git add src/systems/DroneSpawner.ts
git commit -m "feat: expose waveIndex on waveCleared event and add isBossWave()"
```

---

## Task 8: MechSelectScene stat panels

**Files:**
- Modify: `src/scenes/MechSelectScene.ts`

- [ ] **Step 1: Import MECH_STATS**

Open `src/scenes/MechSelectScene.ts`. Add:
```ts
import { MECH_STATS } from '../constants';
```

- [ ] **Step 2: Add stat bars and badge labels**

The scene already has `centerXs = [408, 872]` for mech positioning. After the existing sprite and name/desc text creation for each mech, add stat bars. Write a helper inside `create()`:

```ts
const BAR_W = 120;
const BAR_H = 5;
const barY0 = 460; // starting Y for first bar row, adjust as needed

const addStatBar = (cx: number, y: number, label: string, fill: number, ratio: number, badge: string, badgeColor: number) => {
  this.add.text(cx - BAR_W / 2, y - 12, label, {
    fontFamily: 'monospace', fontSize: '9px', color: '#5588aa',
  });
  this.add.rectangle(cx, y + BAR_H / 2, BAR_W, BAR_H, 0x0d1f2d).setOrigin(0.5, 0.5);
  this.add.rectangle(cx - BAR_W / 2 + (BAR_W * ratio) / 2, y + BAR_H / 2, BAR_W * ratio, BAR_H, fill).setOrigin(0.5, 0.5);
  this.add.text(cx + BAR_W / 2 + 4, y - 2, badge, {
    fontFamily: 'monospace', fontSize: '8px', color: '#' + badgeColor.toString(16).padStart(6, '0'),
  });
};
```

For each mech (index 0 = Strider, index 1 = Scout), call `addStatBar` four times:

```ts
const mechKeys = ['mech', 'mech4'];
mechKeys.forEach((key, i) => {
  const cx = centerXs[i];
  const stats = MECH_STATS[key];
  const isStrider = key === 'mech';

  // HP bar — ceiling 5 (Scout max)
  addStatBar(cx, barY0,      'HP',       0xff3333, stats.maxHp / 5,
    isStrider ? '▼ –2' : '— 5', isStrider ? 0xff5555 : 0x5588aa);
  // Speed bar — ceiling 440 (Strider max)
  addStatBar(cx, barY0 + 22, 'SPEED',    0xffcc00, stats.walkSpeed / 440,
    isStrider ? '▲ 2×' : '— base', isStrider ? 0x00ff88 : 0x5588aa);
  // Jetpack bar — ceiling 4400 (Strider max)
  addStatBar(cx, barY0 + 44, 'JETPACK',  0x2299ff, stats.jetpackMaxFuel / 4400,
    isStrider ? '▲ 2×' : '— base', isStrider ? 0x00ff88 : 0x5588aa);
  // Nanite CD — same both mechs
  addStatBar(cx, barY0 + 66, 'NANITE CD', 0x00ff88, 0.65,
    '— 20s', 0x5588aa);
});
```

- [ ] **Step 3: Update selection border visuals**

Find where the selected/unselected state is applied. Update to use distinct border colours:
- Selected card border: tint `0x00ccff`, alpha 1.0
- Unselected: tint `0x003344`, alpha 0.6

- [ ] **Step 4: Sprite display using mech atlas**

Replace or supplement the existing sprite display. Use `this.add.image(cx, spriteY, key).setFrame(0)` where `key` is `'mech'` or `'mech4'`. Set scale:
- `'mech'`: `.setScale(0.3)` (60×45)
- `'mech4'`: `.setScale(0.7)` (49×49)

Set texture filter with `.setTexture(key).texture.setFilter(Phaser.Textures.FilterMode.NEAREST)` — or set globally in game config: `render: { pixelArt: true }` (already set in most pixel-art Phaser games; check `src/main.ts`).

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. Open MechSelect. Confirm:
- Both mechs shown side-by-side with stat bars
- Strider shows shorter HP bar (red), full Speed and Jetpack bars with green badges
- Scout shows full HP bar, half Speed and Jetpack bars

- [ ] **Step 6: Commit**

```bash
git add src/scenes/MechSelectScene.ts
git commit -m "feat: MechSelectScene stat panels with comparison bars and badges"
```

---

## Task 9: GameScene integration

**Files:**
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Register new scenes in main.ts**

Open `src/main.ts`. Import and add both new scenes (they don't exist yet — add the imports and the stubs will be created in Tasks 10 and 12; the build will fail until then, so do this step last or create empty stub files first):

Create stub files now so the build won't break:

```bash
echo "import Phaser from 'phaser'; export class UpgradeCardScene extends Phaser.Scene { constructor() { super({ key: 'UpgradeCards' }); } }" > src/scenes/UpgradeCardScene.ts
echo "import Phaser from 'phaser'; export class UpgradeTreeScene extends Phaser.Scene { constructor() { super({ key: 'UpgradeTree' }); } }" > src/scenes/UpgradeTreeScene.ts
```

In `src/main.ts`:
```ts
import { UpgradeCardScene } from './scenes/UpgradeCardScene';
import { UpgradeTreeScene } from './scenes/UpgradeTreeScene';
// add to scene array alongside existing scenes:
// scene: [ BootScene, TitleScene, ..., UpgradeCardScene, UpgradeTreeScene ]
```

- [ ] **Step 2: Init ProgressionSystem in GameScene.create()**

Open `src/scenes/GameScene.ts`. Import:
```ts
import { ProgressionSystem } from '../systems/ProgressionSystem';
```

At the top of `create()`:
```ts
// Init ProgressionSystem once (guard against re-creation on level restart)
if (!this.registry.get('progression')) {
  this.registry.set('progression', new ProgressionSystem());
}
const prog = this.registry.get('progression') as ProgressionSystem;
```

- [ ] **Step 3: Handle isNewGame flag and reset runUpgrades**

Still in `create()`, after the ProgressionSystem init:
```ts
if (this.registry.get('isNewGame')) {
  this.registry.set('runUpgrades', [] as string[]);
  this.registry.set('isNewGame', false);
}
if (!this.registry.get('runUpgrades')) {
  this.registry.set('runUpgrades', [] as string[]);
}
```

- [ ] **Step 4: Apply tree effects to player after construction**

After `this.player = new Player(...)`, add:
```ts
// Apply persistent tree upgrades
import { TREE_NODES, applyTreeEffect } from '../data/upgradeTree';
for (const id of prog.ownedNodes) {
  const node = TREE_NODES.find(n => n.id === id);
  if (node) applyTreeEffect(this.player, node.effect);
}

// Re-apply per-run card upgrades (survive level transitions)
import { CARD_POOL } from '../data/upgradeCards';
const runUpgrades = this.registry.get('runUpgrades') as string[];
for (const id of runUpgrades) {
  const card = CARD_POOL.find(c => c.id === id);
  if (card) card.apply(this.player);
}
```

(Move imports to top of file.)

- [ ] **Step 5: Wire waveCleared → UpgradeCardScene**

Find the existing `waveCleared` listener. Replace it with:
```ts
this.events.on('waveCleared', (wave: number) => {
  if (this.spawner.isBossWave()) return;

  this.scene.launch('UpgradeCards', {
    wave,
    audio: this.audio,
    player: this.player,
  });
  this.scene.pause('Game');

  this.scene.get('UpgradeCards').events.once('shutdown', () => {
    this.scene.resume('Game');
  });
});
```

- [ ] **Step 6: Build check**

```bash
npm run build
```
Expected: no errors (stub scenes exist).

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.ts src/main.ts \
  src/scenes/UpgradeCardScene.ts src/scenes/UpgradeTreeScene.ts
git commit -m "feat: GameScene wires ProgressionSystem, tree effects, card launch, isNewGame"
```

---

## Task 10: UIScene integration

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Import ProgressionSystem type**

Add at top of `src/scenes/UIScene.ts`:
```ts
import type { ProgressionSystem } from '../systems/ProgressionSystem';
```

- [ ] **Step 2: Bank score and update high score on game over**

Find `showGameOver()` in UIScene. Find the block that writes to `moonsec-highscore`. Replace:
```ts
// OLD:
// const best = parseInt(localStorage.getItem('moonsec-highscore') ?? '0', 10);
// if (this.currentScore > best) localStorage.setItem('moonsec-highscore', String(this.currentScore));

// NEW:
const prog = this.registry.get('progression') as ProgressionSystem | undefined;
if (prog) {
  prog.addScore(this.currentScore);
  prog.updateHighScore(this.currentScore);
}
```

Also update the high score display text to read from `prog.highScore` instead of localStorage directly.

- [ ] **Step 3: Set isNewGame flag before restart**

In UIScene, find where `scene.restart()` is called for game-over / new game. Before the restart:
```ts
this.registry.set('isNewGame', true);
```

- [ ] **Step 4: Build and manual test**

```bash
npm run build
npm run dev
```

Play through a run, die, restart. Confirm score accumulates in bank (inspect localStorage `moonsec-progression` in browser devtools).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: UIScene banks score to ProgressionSystem, sets isNewGame on restart"
```

---

## Task 11: TitleScene — add UPGRADES option

**Files:**
- Modify: `src/scenes/TitleScene.ts`

- [ ] **Step 1: Update OPTIONS array**

Open `src/scenes/TitleScene.ts`. Change:
```ts
const OPTIONS = ['START GAME', 'STORY'] as const;
```
To:
```ts
const OPTIONS = ['START GAME', 'STORY', 'UPGRADES'] as const;
```

- [ ] **Step 2: Update confirmSelection routing**

Find `confirmSelection()` (or wherever `selectedIndex` is acted on). Change from two-branch if/else to a switch:
```ts
switch (this.selectedIndex) {
  case 0: // START GAME
    this.sound.play('ui-confirm', { volume: 0.40 });
    this.scene.start('Story');
    break;
  case 1: // STORY
    this.sound.play('ui-confirm', { volume: 0.40 });
    this.scene.start('Story');
    break;
  case 2: // UPGRADES
    this.sound.play('ui-confirm', { volume: 0.40 });
    this.scene.start('UpgradeTree');
    break;
}
```

(Adjust to match whatever the existing routing logic does for START GAME vs STORY.)

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. Navigate to UPGRADES from TitleScene. Confirm it launches (stub UpgradeTreeScene, which is currently empty — that's fine).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/TitleScene.ts
git commit -m "feat: TitleScene adds UPGRADES menu option routing to UpgradeTreeScene"
```

---

## Task 12: UpgradeCardScene — full implementation

**Files:**
- Modify: `src/scenes/UpgradeCardScene.ts` (replace stub)

- [ ] **Step 1: Implement UpgradeCardScene**

Replace the stub at `src/scenes/UpgradeCardScene.ts` with the full implementation:

```ts
import Phaser from 'phaser';
import { CARD_POOL, type UpgradeCard } from '../data/upgradeCards';
import type { Player } from '../entities/Player';
import type { AudioSystem } from '../systems/AudioSystem';

interface CardSceneData {
  wave: number;
  audio: AudioSystem;
  player: Player;
}

const CARD_W   = 160;
const CARD_H   = 220;
const CARD_GAP = 40;
const TOTAL_W  = CARD_W * 3 + CARD_GAP * 2;

export class UpgradeCardScene extends Phaser.Scene {
  private audio!: AudioSystem;
  private player!: Player;

  constructor() {
    super({ key: 'UpgradeCards' });
  }

  init(data: CardSceneData): void {
    this.audio  = data.audio;
    this.player = data.player;
  }

  create(data: CardSceneData): void {
    const { wave } = data;
    const W = 1280, H = 720;

    // Overlay
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85).setDepth(70);

    // Header
    this.add.text(W / 2, 120, `// WAVE ${wave} COMPLETE — SELECT UPGRADE //`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#00ccff',
      letterSpacing: 2,
    }).setOrigin(0.5).setDepth(71);

    // Pick 3 random cards (excluding already-applied oneTime cards)
    const runUpgrades = (this.registry.get('runUpgrades') ?? []) as string[];
    const available = CARD_POOL.filter(c => !(c.oneTime && runUpgrades.includes(c.id)));
    const picks = Phaser.Utils.Array.Shuffle([...available]).slice(0, 3) as UpgradeCard[];

    const startX = W / 2 - TOTAL_W / 2 + CARD_W / 2;
    const cardY   = H / 2 + 20;

    picks.forEach((card, i) => {
      const x = startX + i * (CARD_W + CARD_GAP);
      this.createCard(x, cardY, card, i, runUpgrades);
    });

    // Keyboard shortcuts
    const keys = [
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
    ];
    keys.forEach((key, i) => {
      key.once('down', () => { if (picks[i]) this.pickCard(picks[i], runUpgrades); });
    });
  }

  private createCard(x: number, y: number, card: UpgradeCard, index: number, runUpgrades: string[]): void {
    const startY = y + 40;
    const depth  = 72 + index;

    const bg     = this.add.rectangle(x, startY, CARD_W, CARD_H, 0x0a1a2a).setDepth(depth);
    const border = this.add.rectangle(x, startY, CARD_W, CARD_H, 0x000000, 0)
      .setStrokeStyle(1, 0x00ccff, 0.5).setDepth(depth);

    this.add.text(x, startY - 72, card.icon, { fontSize: '32px' }).setOrigin(0.5).setDepth(depth + 0.1);
    this.add.text(x, startY - 28, card.name, {
      fontFamily: 'monospace', fontSize: '12px', color: '#00ccff', letterSpacing: 1,
    }).setOrigin(0.5).setDepth(depth + 0.1);
    this.add.text(x, startY + 10, card.desc, {
      fontFamily: 'monospace', fontSize: '10px', color: '#5588aa',
      wordWrap: { width: CARD_W - 20 }, align: 'center',
    }).setOrigin(0.5).setDepth(depth + 0.1);
    this.add.text(x, startY + 70, card.statLine, {
      fontFamily: 'monospace', fontSize: '11px', color: '#00ff88',
    }).setOrigin(0.5).setDepth(depth + 0.1);

    // Keyboard hint
    this.add.text(x, startY + 92, `[${index + 1}]`, {
      fontFamily: 'monospace', fontSize: '10px', color: '#334455',
    }).setOrigin(0.5).setDepth(depth + 0.1);

    // Hover
    const hitArea = this.add.rectangle(x, startY, CARD_W, CARD_H, 0x000000, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 0.2);

    hitArea.on('pointerover', () => {
      border.setStrokeStyle(1, 0x00ffcc, 1);
      this.tweens.add({ targets: [bg, border], y: startY - 8, duration: 120, ease: 'Sine.easeOut' });
    });
    hitArea.on('pointerout', () => {
      border.setStrokeStyle(1, 0x00ccff, 0.5);
      this.tweens.add({ targets: [bg, border], y: startY, duration: 120, ease: 'Sine.easeOut' });
    });
    hitArea.on('pointerdown', () => { this.pickCard(card, runUpgrades); });

    // Entry animation
    this.tweens.add({
      targets: [bg, border, hitArea],
      y: { from: startY + 40, to: startY },
      alpha: { from: 0, to: 1 },
      duration: 220,
      delay: index * 80,
      ease: 'Sine.easeOut',
    });
  }

  private pickCard(card: UpgradeCard, runUpgrades: string[]): void {
    card.apply(this.player);
    const updated = [...runUpgrades, card.id];
    this.registry.set('runUpgrades', updated);
    this.audio.play('upgrade-pick');
    this.scene.stop();
  }
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. Play through a wave. After the wave clears (non-boss), confirm:
- Card overlay appears over the paused game
- 3 cards shown with icons, names, descriptions, stat lines
- Hover effects and keyboard shortcuts work
- Picking a card closes the overlay and resumes play
- The chosen upgrade applies (e.g. plating adds an HP bar in UIScene)

- [ ] **Step 4: Commit**

```bash
git add src/scenes/UpgradeCardScene.ts
git commit -m "feat: UpgradeCardScene — between-wave upgrade card pick UI"
```

---

## Task 13: UpgradeTreeScene — full implementation

**Files:**
- Modify: `src/scenes/UpgradeTreeScene.ts` (replace stub)

- [ ] **Step 1: Implement UpgradeTreeScene**

Replace the stub at `src/scenes/UpgradeTreeScene.ts`:

```ts
import Phaser from 'phaser';
import { TREE_NODES, applyTreeEffect, type TreeNode } from '../data/upgradeTree';
import type { ProgressionSystem } from '../systems/ProgressionSystem';

const COL_X: Record<string, number> = { offense: 320, defense: 640, mobility: 960 };
const TIER_Y = [160, 280, 400, 520];
const NODE_W = 160;
const NODE_H = 52;

interface Particle { angle: number; speed: number; baseR: number; freq: number; phase: number; size: number; color: number; alpha: number; ring: 'inner' | 'outer'; }

export class UpgradeTreeScene extends Phaser.Scene {
  private prog!: ProgressionSystem;
  private particles: Particle[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private scoreBankText!: Phaser.GameObjects.Text;
  private nodeObjects = new Map<string, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();

  constructor() {
    super({ key: 'UpgradeTree' });
  }

  create(): void {
    const W = 1280, H = 720;

    this.prog = this.registry.get('progression') as ProgressionSystem;

    // Animated particle background
    this.gfx = this.add.graphics().setDepth(0);
    this.initParticles();

    // Column headers
    const colNames: Record<string, string> = { offense: 'OFFENSE', defense: 'DEFENSE', mobility: 'MOBILITY' };
    const colColors: Record<string, string> = { offense: '#ff6644', defense: '#4499ff', mobility: '#ffcc00' };
    for (const col of ['offense', 'defense', 'mobility']) {
      this.add.text(COL_X[col], 90, colNames[col], {
        fontFamily: 'monospace', fontSize: '12px', color: colColors[col], letterSpacing: 2,
      }).setOrigin(0.5).setDepth(10);
    }

    // Score bank
    this.scoreBankText = this.add.text(W / 2, 40, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#00ff88',
    }).setOrigin(0.5).setDepth(10);
    this.updateScoreDisplay();

    // Title
    this.add.text(W / 2, 40, 'UPGRADE TREE', {
      fontFamily: 'monospace', fontSize: '11px', color: '#334455', letterSpacing: 3,
    }).setOrigin(0.5, 1.5).setDepth(10);

    // Nodes + connectors
    for (const node of TREE_NODES) {
      this.drawConnector(node);
      this.createNode(node);
    }

    // Back button
    const back = this.add.text(40, 40, '[ ← BACK ]', {
      fontFamily: 'monospace', fontSize: '12px', color: '#336677',
    }).setDepth(10).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setStyle({ color: '#00ccff' }));
    back.on('pointerout',  () => back.setStyle({ color: '#336677' }));
    back.on('pointerdown', () => this.scene.start('Title'));

    // ESC key
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      .on('down', () => this.scene.start('Title'));
  }

  private initParticles(): void {
    for (let i = 0; i < 30; i++) {
      this.particles.push({ angle: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 0.3, baseR: 120, freq: 0.5 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2, size: 2, color: 0x00ccff, alpha: 0.8, ring: 'inner' });
    }
    for (let i = 0; i < 30; i++) {
      this.particles.push({ angle: Math.random() * Math.PI * 2, speed: -(0.2 + Math.random() * 0.3), baseR: 220, freq: 0.3 + Math.random() * 0.3, phase: Math.random() * Math.PI * 2, size: 2, color: 0x6600ff, alpha: 0.6, ring: 'outer' });
    }
  }

  private drawConnector(node: TreeNode): void {
    if (node.tier === 0) return;
    const x  = COL_X[node.col];
    const y0 = TIER_Y[node.tier - 1] + NODE_H / 2;
    const y1 = TIER_Y[node.tier]     - NODE_H / 2;
    const owned = this.prog.ownedNodes.includes(node.id);
    this.add.graphics().lineStyle(1, owned ? 0x00ccff : 0x112233, 1)
      .beginPath().moveTo(x, y0).lineTo(x, y1).strokePath()
      .setDepth(9);
  }

  private createNode(node: TreeNode): void {
    const x   = COL_X[node.col];
    const y   = TIER_Y[node.tier];
    const owned = this.prog.ownedNodes.includes(node.id);
    const prereqMet = node.tier === 0 || this.prog.ownedNodes.includes(
      TREE_NODES.find(n => n.col === node.col && n.tier === (node.tier - 1 as 0|1|2|3))?.id ?? ''
    );
    const affordable = prereqMet && this.prog.scoreBank >= node.cost;

    const borderColor = owned ? 0x00ccff : prereqMet ? (affordable ? 0xaaaaaa : 0x444444) : 0x222222;
    const bgColor     = owned ? 0x0d2035 : 0x060f1a;
    const textColor   = owned ? '#00ccff' : prereqMet ? '#aaaaaa' : '#333333';
    const alpha       = prereqMet ? 1 : 0.4;

    const bg = this.add.rectangle(x, y, NODE_W, NODE_H, bgColor)
      .setStrokeStyle(1, borderColor).setAlpha(alpha).setDepth(10);

    const label = this.add.text(x, y - 8, node.name, {
      fontFamily: 'monospace', fontSize: '11px', color: textColor,
    }).setOrigin(0.5).setAlpha(alpha).setDepth(11);

    const costLabel = owned ? '✓' : `${node.cost} pts`;
    this.add.text(x, y + 10, costLabel, {
      fontFamily: 'monospace', fontSize: '9px',
      color: owned ? '#00ff88' : affordable ? '#00ff8877' : '#333333',
    }).setOrigin(0.5).setAlpha(alpha).setDepth(11);

    this.nodeObjects.set(node.id, { bg, label });

    if (owned) return;

    const hit = this.add.rectangle(x, y, NODE_W, NODE_H, 0, 0)
      .setInteractive({ useHandCursor: prereqMet }).setDepth(12);

    if (!prereqMet) return;

    hit.on('pointerover', () => { bg.setStrokeStyle(1, 0x00ffcc); });
    hit.on('pointerout',  () => { bg.setStrokeStyle(1, borderColor); });
    hit.on('pointerdown', () => { this.attemptBuy(node); });
  }

  private attemptBuy(node: TreeNode): void {
    const ok = this.prog.buyNode(node.id);
    if (ok) {
      this.audio('upgrade-buy');
      this.refreshNodes();
      this.updateScoreDisplay();
    } else {
      this.audio('upgrade-denied');
      // Shake the node
      const obj = this.nodeObjects.get(node.id);
      if (obj) {
        this.tweens.add({ targets: obj.bg, x: { from: obj.bg.x - 4, to: obj.bg.x }, duration: 50, yoyo: true, repeat: 2 });
      }
    }
  }

  private audio(id: string): void {
    // UpgradeTreeScene doesn't have an AudioSystem — use Phaser sound manager directly
    try { this.sound.play(id, { volume: id === 'upgrade-buy' ? 0.65 : 0.40 }); } catch { /* ignore */ }
  }

  private refreshNodes(): void {
    // Destroy and re-create all node visuals to reflect new ownership state
    this.nodeObjects.forEach(obj => { obj.bg.destroy(); obj.label.destroy(); });
    this.nodeObjects.clear();
    this.children.list
      .filter(c => (c as any).depth >= 9 && (c as any).depth <= 12)
      .forEach(c => (c as Phaser.GameObjects.GameObject).destroy());
    for (const node of TREE_NODES) {
      this.drawConnector(node);
      this.createNode(node);
    }
  }

  private updateScoreDisplay(): void {
    this.scoreBankText.setText(`⬡ SCORE BANK: ${this.prog.scoreBank.toLocaleString()}`);
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const cx = 640, cy = 360;
    this.gfx.clear();
    for (const p of this.particles) {
      p.angle += p.speed * dt;
      const r = p.baseR + Math.sin(time / 1000 * p.freq + p.phase) * 20;
      const px = cx + Math.cos(p.angle) * r;
      const py = cy + Math.sin(p.angle) * r;
      this.gfx.fillStyle(p.color, p.alpha);
      this.gfx.fillCircle(px, py, p.size);
    }
  }
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. Navigate Title → UPGRADES. Confirm:
- Particle swirl background animates
- Three columns of nodes visible
- Tier 0 nodes clickable; tier 1+ locked until tier 0 bought
- Buying a node deducts score bank, node brightens
- Clicking unaffordable node shakes it
- ESC / BACK returns to Title

Play a run, bank some score, then revisit UPGRADES. Confirm purchased nodes persist across sessions (check localStorage in devtools).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/UpgradeTreeScene.ts
git commit -m "feat: UpgradeTreeScene — persistent upgrade tree with particle swirl background"
```

---

## Task 14: Final integration pass + push

- [ ] **Step 1: Full build**

```bash
npm run build
```
Expected: zero errors, zero warnings.

- [ ] **Step 2: Full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 3: End-to-end smoke test checklist**

Run `npm run dev` and verify:

- [ ] Strider has 3 HP bars, moves 2× faster, jetpack lasts twice as long
- [ ] Scout has 5 HP bars, baseline speed
- [ ] Jetpack HUD bar does not overflow for Strider
- [ ] MechSelect shows side-by-side stat bars with correct badges
- [ ] Nanite heal (Q) plays a sound; each tick plays nanite-tick
- [ ] Picking up a health/fuel orb plays pickup sound
- [ ] Ejecting (E) plays eject sound
- [ ] Level complete plays level-complete sound (not explosion)
- [ ] Menu navigation plays ui-nav; confirm plays ui-confirm
- [ ] After non-boss wave clears → upgrade card overlay appears
- [ ] Picking a card applies the effect (e.g. plating adds HP)
- [ ] Cards persist across L1→L2 transition
- [ ] Cards reset after game-over + new game
- [ ] Title → UPGRADES opens tree scene
- [ ] Particle swirl background animates in tree scene
- [ ] Buying a node deducts score bank and persists to localStorage
- [ ] Tier unlock chain works (can't buy tier 1 without tier 0)
- [ ] Unaffordable node shakes; denied sound plays
- [ ] ESC returns to Title from tree
- [ ] Score from run banks on game-over; persists on page reload

- [ ] **Step 4: Final commit + push**

```bash
git add -A
git commit -m "feat: complete progression/audio/mech-stats — cards, tree, sounds, stat differentiation"
git push
```
