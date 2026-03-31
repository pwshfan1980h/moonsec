# v0.8 — Level 3 Ice Caverns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.8 — Level 3 Ice Caverns with uneven terrain, death pits, ice friction, enemy resilience, and the Mother Drone final boss (bullet-hell + 10-missile kill).

**Architecture:** Extends the L1→L2 level flag pattern in `GameScene`. New constants `BOSS_WAVE_L3 = 4` and `L3_*` added to `constants.ts`. Enemy resilience is a `resilience` property + `DOWNED` state on `Drone`. `MotherDrone` is a new entity class parallel to `NexusBoss`. `DroneSpawner` gets an `encounterMode` flag for smaller, stronger waves.

**Prerequisite:** v0.7 plan must be complete. `ShieldedTank`, `Mine`, `getApproxGroundY()` must exist.

**Tech Stack:** Phaser 3.80, TypeScript, Vite, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/constants.ts` | Add `BOSS_WAVE_L3`, `L3_*` constants |
| Modify | `src/entities/Drone.ts` | Add `resilience` prop + `DOWNED` state |
| Create | `src/data/levelData.ts` (new export) | `buildLevel3Map()` — ice cavern tilemap |
| Modify | `src/scenes/GameScene.ts` | L3 branch in `create()`, death-pit detection, ice friction collider |
| Modify | `src/systems/DroneSpawner.ts` | `encounterMode` flag, L3 wave composition, `BOSS_WAVE_L3` |
| Create | `src/entities/MotherDrone.ts` | Final boss — 3 phases, vulnerability windows, 10-missile kill |
| Modify | `src/scenes/UIScene.ts` | Handle `motherTelegraph` event for vulnerability HUD indicator |
| Modify | `package.json` | Bump to `0.8.0` on completion |
| Create | `src/tests/Drone.resilience.test.ts` | Resilience + DOWNED state logic |
| Create | `src/tests/MotherDrone.test.ts` | Phase thresholds and missile counter logic |

---

## Task 1: Constants for Level 3

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Write failing test**

Add to `src/tests/constants.test.ts`:
```typescript
import { BOSS_WAVE_L3 } from '../constants';

it('BOSS_WAVE_L3 is 4', () => {
  expect(BOSS_WAVE_L3).toBe(4);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- constants
```
Expected: FAIL — `BOSS_WAVE_L3` not exported

- [ ] **Step 3: Add constants**

Open `src/constants.ts`. Add after the existing `BOSS_WAVE_L2` line:
```typescript
export const BOSS_WAVE_L3      = 4;
export const L3_SPEED_MULT     = 1.3;   // faster enemies than L2
export const L3_INTERVAL_MULT  = 0.80;  // 20% faster fire rate
export const L3_ENCOUNTER_SIZE = 5;     // enemies per encounter wave
export const L3_GROUND_Y       = 920;   // ice cavern floor baseline
```

- [ ] **Step 4: Run tests**

```bash
npm test -- constants
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts src/tests/constants.test.ts
git commit -m "feat: add L3 constants (BOSS_WAVE_L3, encounter size, ice floor)"
```

---

## Task 2: Enemy Resilience — DOWNED State on Drone

**Files:**
- Modify: `src/entities/Drone.ts`
- Create: `src/tests/Drone.resilience.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/Drone.resilience.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

// Pure resilience state machine logic
type DroneState = 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DOWNED' | 'DEATH';

function applyDroneDamage(
  hp: number, amount: number, resilience: number, currentState: DroneState,
): { hp: number; resilience: number; nextState: DroneState } {
  if (currentState === 'DEATH' || currentState === 'HURT' || currentState === 'DOWNED') {
    return { hp, resilience, nextState: currentState };
  }
  const nextHp = hp - amount;
  if (nextHp > 0) return { hp: nextHp, resilience, nextState: 'HURT' };
  // hp <= 0
  if (resilience > 0) return { hp: 0, resilience: resilience - 1, nextState: 'DOWNED' };
  return { hp: 0, resilience: 0, nextState: 'DEATH' };
}

function applyDownedDamage(
  hp: number, maxHp: number, amount: number, resilience: number,
): { hp: number; resilience: number; nextState: DroneState } {
  const nextHp = hp - amount;
  if (nextHp <= 0) return { hp: 0, resilience, nextState: 'DEATH' };
  return { hp: nextHp, resilience, nextState: 'DOWNED' };
}

describe('Drone resilience', () => {
  it('transitions to DOWNED when HP hits 0 and resilience > 0', () => {
    const r = applyDroneDamage(1, 1, 2, 'HOVER');
    expect(r.nextState).toBe('DOWNED');
    expect(r.resilience).toBe(1);
  });

  it('transitions to DEATH when HP hits 0 and resilience is 0', () => {
    const r = applyDroneDamage(1, 1, 0, 'HOVER');
    expect(r.nextState).toBe('DEATH');
  });

  it('shooting downed enemy to 0 HP kills permanently', () => {
    const r = applyDownedDamage(1, 3, 1, 1);
    expect(r.nextState).toBe('DEATH');
  });

  it('downed enemy with HP remaining stays DOWNED', () => {
    const r = applyDownedDamage(3, 3, 1, 1);
    expect(r.nextState).toBe('DOWNED');
  });

  it('ignores damage while already DOWNED from takeDamage path', () => {
    const r = applyDroneDamage(2, 1, 1, 'DOWNED');
    expect(r.nextState).toBe('DOWNED'); // no state change from normal path
    expect(r.hp).toBe(2); // hp unchanged (DOWNED has its own damage path)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- resilience
```
Expected: FAIL — module not found

- [ ] **Step 3: Add resilience to Drone.ts**

Open `src/entities/Drone.ts`.

Add `'DOWNED'` to the DroneState type (line ~5):
```typescript
type DroneState = 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DOWNED' | 'DEATH';
```

Add `resilience` as a constructor parameter and property. Find the class field declarations and add:
```typescript
resilience: number;   // how many times this drone can be knocked down before dying permanently
private reviveTimer?: Phaser.Time.TimerEvent;
private reviveIndicator?: Phaser.GameObjects.Text;
```

Update the constructor signature to accept `resilience`:
```typescript
constructor(
  scene: GameScene,
  x: number, y: number,
  type: DroneType,
  scaling: DroneScaling,
  variant: DroneVariant = 'normal',
  forceHp?: number,
  resilience = 0,        // ← add this parameter
) {
  // ... existing body ...
  this.resilience = resilience;
}
```

Update `takeDamage()`:
```typescript
takeDamage(amount: number): void {
  if (this.droneState === 'DEATH' || this.droneState === 'HURT') return;

  // Downed — this path handles shooting a downed enemy
  if (this.droneState === 'DOWNED') {
    this.hp -= amount;
    if (this.hp <= 0) this.setDroneState('DEATH');
    return;
  }

  this.hp -= amount;
  if (this.hp <= 0) {
    if (this.resilience > 0) {
      this.resilience--;
      this.setDroneState('DOWNED');
    } else {
      this.setDroneState('DEATH');
    }
  } else {
    this.setDroneState('HURT');
  }
}
```

Add `DOWNED` case to `setDroneState()`. Insert before the `DEATH` case:
```typescript
case 'DOWNED': {
  // Stop all movement
  const body = this.body as Phaser.Physics.Arcade.Body;
  body.setVelocity(0, 0);
  this.setTint(0x888888);

  // Revive indicator (dots above enemy)
  const dots = '●'.repeat(this.resilience) + '○';
  this.reviveIndicator = this.scene.add.text(this.x, this.y - 50, dots, {
    fontFamily: 'monospace', fontSize: '10px', color: '#ffaa00',
  }).setDepth(25).setOrigin(0.5);

  // Revive after 4s unless shot dead first
  this.reviveTimer = this.scene.time.delayedCall(4000, () => {
    if (!this.active || this.droneState !== 'DOWNED') return;
    this.reviveIndicator?.destroy();
    this.reviveIndicator = undefined;
    this.hp = Math.ceil(this.maxHp * 0.5);
    this.clearTint();
    // Flash white on revive
    this.setTint(0xffffff);
    this.scene.time.delayedCall(200, () => { if (this.active) this.clearTint(); });
    this.setDroneState('HOVER');
  });
  break;
}
```

Add `maxHp` as a field (store the initial HP value):

In the constructor, after `this.hp = ...`, add:
```typescript
this.maxHp = this.hp;
```

And add the field declaration:
```typescript
private maxHp = 0;
```

Clean up revive timer and indicator in `DEATH` case — add inside the DEATH block before `this.destroy()`:
```typescript
this.reviveTimer?.remove();
this.reviveIndicator?.destroy();
```

Also update the revive indicator Y in `update()` to follow the drone (add to the top of `update()`):
```typescript
if (this.reviveIndicator) {
  this.reviveIndicator.setPosition(this.x, this.y - 50);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/Drone.ts src/tests/Drone.resilience.test.ts
git commit -m "feat: enemy resilience — DOWNED state with revival timer"
```

---

## Task 3: Level 3 Tilemap Builder

**Files:**
- Modify: `src/data/levelData.ts` — add `buildLevel3Map()` export

- [ ] **Step 1: Read the top of levelData.ts to understand the existing buildLevel1Map pattern**

```bash
head -60 src/data/levelData.ts
```

- [ ] **Step 2: Add `buildLevel3Map()` export**

Open `src/data/levelData.ts`. Add at the end of the file:

```typescript
/**
 * Level 3 — Ice Caverns
 * Highly uneven terrain, 5–6 death pits, ice tile aesthetics.
 * World: 6400×1080. Floor baseline: L3_GROUND_Y (920).
 * Gaps in the floor are death pits — player falls to void below WORLD_HEIGHT-50.
 */
export function buildLevel3Map(scene: Phaser.Scene): {
  map: Phaser.Tilemaps.Tilemap;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
} {
  // --- Tilemap data ---
  // 200 columns × 13 rows at 32×32 px = 6400×416px covering the lower portion of the world.
  // Row 0 (top of map) = y: 664px (i.e. WORLD_HEIGHT 1080 - map height 416).
  // Tile 1 = solid ice tile; tile -1 = empty (void/gap = death pit).

  const COLS = 200;
  const ROWS = 13;
  const TILE = 32;

  // Build a flat floor with dips and pits
  // Strategy: generate per-column heights, then mark pits as -1.
  const colHeight: number[] = new Array(COLS).fill(3); // default 3 tiles tall at bottom

  // Raise terrain in irregular bands to create uneven surface
  // Each entry: [startCol, endCol, extraRows]
  const hills: [number, number, number][] = [
    [10,  25,  3],
    [40,  55,  5],
    [70,  80,  2],
    [90, 110,  4],
    [130, 145, 6],
    [160, 175, 3],
  ];
  for (const [s, e, extra] of hills) {
    for (let c = s; c <= e && c < COLS; c++) {
      colHeight[c] = 3 + extra;
    }
  }

  // Death pits — columns where tile is completely absent
  // Each entry: [startCol, endCol]
  const pits: [number, number][] = [
    [28,  33],
    [60,  65],
    [83,  90],
    [115, 122],
    [148, 155],
    [178, 185],
  ];
  const pitSet = new Set<number>();
  for (const [s, e] of pits) {
    for (let c = s; c <= e; c++) pitSet.add(c);
  }

  // Build tile data array (row-major, ROWS × COLS)
  const data: number[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < COLS; col++) {
      if (pitSet.has(col)) {
        rowData.push(-1); // void
      } else {
        const solidFrom = ROWS - colHeight[col];
        rowData.push(row >= solidFrom ? 1 : -1);
      }
    }
    data.push(rowData);
  }

  // Create tilemap from data
  const map = scene.make.tilemap({
    data,
    tileWidth: TILE,
    tileHeight: TILE,
  });

  // Use the existing tileset (same pixel tile asset, tinted blue in GameScene)
  const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
  const groundLayer = map.createLayer(0, tileset, 0, ROWS * TILE * (-1) + 1080)!;
  groundLayer.setCollisionByExclusion([-1]);
  groundLayer.setDepth(2);

  return { map, groundLayer };
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all PASS (no new tests needed for a data builder — coverage comes from the L3 integration play-test)

- [ ] **Step 4: Commit**

```bash
git add src/data/levelData.ts
git commit -m "feat: buildLevel3Map() — ice cavern tilemap with death pits"
```

---

## Task 4: GameScene — Level 3 Branch

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add L3 import**

At the top of `GameScene.ts`, add:
```typescript
import { buildLevel3Map } from '../data/levelData';
import { L3_GROUND_Y } from '../constants';
```

(Adjust the `buildLevel1Map` import line to also export `buildLevel3Map` if it's a named export from the same module.)

- [ ] **Step 2: Add L3 branch to `create()`**

The existing `create()` has:
```typescript
if (this.currentLevel === 2) {
  // L2 setup
} else {
  // L1 setup
}
```

Change to:
```typescript
if (this.currentLevel === 3) {
  this.setupLevel3();
} else if (this.currentLevel === 2) {
  // existing L2 setup unchanged
} else {
  // existing L1 setup unchanged
}
```

- [ ] **Step 3: Add `setupLevel3()` private method**

Add this method to `GameScene`:
```typescript
private setupLevel3(): void {
  this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);
  this.makeBackgroundL3();

  this.ground = this.physics.add.staticGroup();
  this.groundLayer = undefined;
  const { groundLayer } = buildLevel3Map(this);
  this.groundLayer = groundLayer;

  // Ice friction — very low X friction so the player slides
  this.groundLayer.setFriction(0.05, 1.0);

  // Platforms — fewer, more spaced, on ice shelves
  this.makePlatforms('blue', { low: 3, mid: 2, high: 2 });
}
```

- [ ] **Step 4: Add `makeBackgroundL3()` private method**

```typescript
private makeBackgroundL3(): void {
  // Deep blue/black background
  this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x010510)
    .setDepth(0).setScrollFactor(0);

  // Remove stale texture keys on scene restart
  for (const key of ['bgStarsL3', 'bgCrystals']) {
    if (this.textures.exists(key)) this.textures.remove(key);
  }

  // Starfield (same as L1 but tinted blue)
  const starsGfx = this.make.graphics({ x: 0, y: 0 }, false);
  for (let i = 0; i < 300; i++) {
    starsGfx.fillStyle(0x8899ff, 0.15 + Math.random() * 0.25);
    starsGfx.fillRect(
      Phaser.Math.Between(0, GAME_W - 1),
      Phaser.Math.Between(0, L3_GROUND_Y - 1),
      1, 1,
    );
  }
  starsGfx.generateTexture('bgStarsL3', GAME_W, L3_GROUND_Y);
  starsGfx.destroy();
  this.bgStars = this.add.tileSprite(GAME_W / 2, L3_GROUND_Y / 2, GAME_W, L3_GROUND_Y, 'bgStarsL3')
    .setDepth(1).setScrollFactor(0);

  // Blue void below the ground pits (death zone visual)
  this.add.rectangle(GAME_W / 2, GAME_H, GAME_W * 4, 300, 0x000510)
    .setDepth(0).setScrollFactor(0);
}
```

- [ ] **Step 5: Add death pit detection to `update()`**

In `GameScene.update()`, after `this.player.update(time, delta)`, add:
```typescript
// Death pit — falling below world triggers instant death
if (this.player.y > WORLD_HEIGHT - 50 && !this.isGameOver) {
  this.triggerGameOver();
}
if (this.pilot?.active && this.pilot.y > WORLD_HEIGHT - 50 && !this.isGameOver) {
  this.triggerGameOver();
}
```

- [ ] **Step 6: Add "Slippery terrain" notification**

In `setupLevel3()`, after `this.groundLayer.setFriction(...)`, add:
```typescript
// Notify player of ice physics on first entry
this.time.delayedCall(1500, () => {
  if (this.scene?.isActive('UI')) {
    this.events.emit('hudMessage', 'Slippery terrain');
  }
});
```

In `UIScene.ts`, add a listener for `'hudMessage'` that displays a fading text in the centre of the screen (similar to existing wave notifications).

- [ ] **Step 7: Also add L3 collider for ShieldedTanks**

In `create()` L3 branch (inside `setupLevel3()` or just after), ensure ground collider includes tanks:
```typescript
// These are added after setupLevel3() so they reference this.groundLayer:
this.physics.add.collider(this.player, this.ground);
if (this.groundLayer) this.physics.add.collider(this.player, this.groundLayer);
this.physics.add.collider(this.crawlers, this.ground);
if (this.groundLayer) this.physics.add.collider(this.crawlers, this.groundLayer);
```
(These already exist in `create()` — confirm they run after `setupLevel3()` is called, which they do because `setupLevel3()` is called before the physics group/collider section.)

- [ ] **Step 8: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 9: Verify in browser**

```bash
npm run dev
```
Select L3 from level select. Confirm ice tilemap appears, player slides on the ground, falls kill the player.

- [ ] **Step 10: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: GameScene Level 3 branch — ice caverns, death pits, ice friction"
```

---

## Task 5: DroneSpawner — Level 3 Encounter Mode

**Files:**
- Modify: `src/systems/DroneSpawner.ts`

- [ ] **Step 1: Add L3 constants to DroneSpawner imports**

```typescript
import {
  GROUND_Y, WORLD_WIDTH, WAVE_BRACKETS, BOSS_WAVE_L1, BOSS_WAVE_L2, BOSS_WAVE_L3,
  L2_SPEED_MULT, L2_INTERVAL_MULT, L3_SPEED_MULT, L3_INTERVAL_MULT,
  L3_ENCOUNTER_SIZE, L3_GROUND_Y,
  GAME_W, GAME_H, PATROL_LANES
} from '../constants';
```

- [ ] **Step 2: Update `isBossWave()` to handle L3**

```typescript
isBossWave(): boolean {
  const currentLevel = (this.scene.registry.get('currentLevel') as number) ?? 1;
  const bossWave = currentLevel === 3 ? BOSS_WAVE_L3
                 : currentLevel === 2 ? BOSS_WAVE_L2
                 : BOSS_WAVE_L1;
  return this.waveIndex >= bossWave;
}
```

- [ ] **Step 3: Update `spawnWave()` — L3 difficulty multiplier**

In `spawnWave()`, after the L2 multiplier block, add:
```typescript
if (currentLevel === 3) {
  bracket = {
    ...bracket,
    attackSpeed:   Math.round(bracket.attackSpeed   * L3_SPEED_MULT),
    shootInterval: Math.round(bracket.shootInterval * L3_INTERVAL_MULT),
  };
}
```

- [ ] **Step 4: Update bossWave lookup in `spawnWave()`**

Replace:
```typescript
const bossWave = currentLevel === 2 ? BOSS_WAVE_L2 : BOSS_WAVE_L1;
```
With:
```typescript
const bossWave = currentLevel === 3 ? BOSS_WAVE_L3
               : currentLevel === 2 ? BOSS_WAVE_L2
               : BOSS_WAVE_L1;
```

- [ ] **Step 5: L3 encounter size**

In `spawnWave()`, where `count` is determined, update the logic to use `L3_ENCOUNTER_SIZE` for L3:
```typescript
// Enemy count: L3 uses small encounters; L1/L2 scale up with wave index
const count = currentLevel === 3
  ? L3_ENCOUNTER_SIZE
  : 10 + (this.waveIndex - 1) * 5;
```

- [ ] **Step 6: L3 drones spawn with resilience: 2**

In `spawnWave()`, find where `new Drone(...)` is called. Update the constructor call to pass resilience based on level:
```typescript
const droneResilience = currentLevel === 3 ? 2 : 0;
const drone = new Drone(this.scene, spawnX, finalSpawnY, type, bracket, variant, forceHp, droneResilience);
```

- [ ] **Step 7: L3 boss wave — spawn MotherDrone instead of NexusBoss**

In the boss wave block:
```typescript
if (this.waveIndex === bossWave) {
  this.spawning = false;
  const camCentreX = this.scene.cameras.main.scrollX + GAME_W / 2;

  if (currentLevel === 3) {
    // Import at top of file: import { MotherDrone } from '../entities/MotherDrone';
    const boss = new MotherDrone(this.scene, camCentreX, 120, bracket);
    this.scene.add.existing(boss);
    this.scene.physics.add.existing(boss);
    this.scene.drones.add(boss);
    boss.initBody();

    // Only missiles damage the Mother Drone
    this.scene.physics.add.overlap(
      this.scene.missiles,
      boss,
      (_b, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnExplosion(m.x, m.y);
        (_b as unknown as MotherDrone).takeMissileHit();
        this.scene.cameras.main.shake(200, 0.015);
        this.scene.audio.play('explosion');
      },
    );

    // Player bullets spark off but do 0 damage
    this.scene.physics.add.overlap(
      this.scene.playerBullets,
      boss,
      (_b, bullet) => {
        const b = bullet as Phaser.Physics.Arcade.Image;
        b.setActive(false).setVisible(false);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
        // No damage — just visual spark
        this.scene.spawnFloatingText(
          (_b as unknown as MotherDrone).x,
          (_b as unknown as MotherDrone).y,
          'DEFLECT',
          '#446688',
        );
      },
    );

    this.dronesAlive++;
    return;
  }

  // L1/L2 — existing NexusBoss spawn code below (unchanged)
  // ...
}
```

Add import at top:
```typescript
import { MotherDrone } from '../entities/MotherDrone';
```

- [ ] **Step 8: Also update HomingMissile to prefer MotherDrone**

Open `src/weapons/HomingMissile.ts`. Add import:
```typescript
import { MotherDrone } from '../entities/MotherDrone';
```

In `findNearestDrone()`, after the `NexusBoss` check, add MotherDrone check:
```typescript
if (go instanceof NexusBoss || go instanceof MotherDrone) {
  nearest = drone;
  bestDist = 0;
  return;
}
```

- [ ] **Step 9: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add src/systems/DroneSpawner.ts src/weapons/HomingMissile.ts
git commit -m "feat: DroneSpawner L3 encounter mode — resilient drones, MotherDrone boss"
```

---

## Task 6: MotherDrone — Skeleton + Phase 1 (Ring Bursts + Egg Clusters)

**Files:**
- Create: `src/entities/MotherDrone.ts`
- Create: `src/tests/MotherDrone.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/MotherDrone.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

function getMotherPhase(missilesRemaining: number): 1 | 2 | 3 {
  if (missilesRemaining > 6) return 1;
  if (missilesRemaining > 3) return 2;
  return 3;
}

function isVulnerable(vulnerableUntil: number, now: number): boolean {
  return now < vulnerableUntil;
}

describe('MotherDrone logic', () => {
  it('phase 1 when 10 missiles remain', () => {
    expect(getMotherPhase(10)).toBe(1);
  });

  it('phase 1 when 7 missiles remain', () => {
    expect(getMotherPhase(7)).toBe(1);
  });

  it('phase 2 when 6 missiles remain', () => {
    expect(getMotherPhase(6)).toBe(2);
  });

  it('phase 2 when 4 missiles remain', () => {
    expect(getMotherPhase(4)).toBe(2);
  });

  it('phase 3 when 3 missiles remain', () => {
    expect(getMotherPhase(3)).toBe(3);
  });

  it('phase 3 when 0 missiles remain', () => {
    expect(getMotherPhase(0)).toBe(3);
  });

  it('vulnerable when within window', () => {
    expect(isVulnerable(1000, 500)).toBe(true);
  });

  it('not vulnerable after window', () => {
    expect(isVulnerable(1000, 1001)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- MotherDrone
```
Expected: FAIL

- [ ] **Step 3: Create MotherDrone.ts — skeleton + Phase 1**

Create `src/entities/MotherDrone.ts`:
```typescript
import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { DroneScaling } from '../systems/DroneSpawner';
import { GAME_W, WORLD_WIDTH } from '../constants';

type MotherState = 'DRIFT' | 'ATTACK_RING' | 'OPEN_WINDOW' | 'VULNERABLE' | 'ATTACK_BEAM' | 'ATTACK_SPIRAL' | 'DEATH';

const MISSILE_KILLS_NEEDED  = 10;
const DRIFT_SPEED_P1        = 40;
const DRIFT_SPEED_P2        = 65;
const DRIFT_SPEED_P3        = 85;
const RING_INTERVAL_P1      = 3500;
const RING_INTERVAL_P2      = 2500;
const RING_INTERVAL_P3      = 2000;
const EGG_INTERVAL_P1       = 8000;
const EGG_INTERVAL_P2       = 5000;
const WINDOW_DURATION_P1    = 3000;
const WINDOW_DURATION_P2    = 2500;
const WINDOW_DURATION_P3    = 2000;
const BULLET_SPEED          = 300;

export class MotherDrone extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private motherState: MotherState = 'DRIFT';
  private missilesRemaining        = MISSILE_KILLS_NEEDED;
  private driftDir                 = 1;
  private phaseTimer               = 0;
  private driftDuration            = 2000;
  private ringTimer                = 0;
  private eggTimer                 = 0;
  private vulnerableUntil          = 0;
  private beamUsedThisPhase        = false;

  // Belly sac visual for vulnerability window
  private sacGfx: Phaser.GameObjects.Graphics;

  constructor(scene: GameScene, x: number, y: number, _scaling: DroneScaling) {
    super(scene, x, y, 'sentinel'); // use sentinel sprite as placeholder
    this.scene = scene;
    this.setScale(6.0);
    this.setDepth(8);
    this.setTint(0x224488);
    this.play('sentinel-hover');

    this.sacGfx = scene.add.graphics();
    this.sacGfx.setDepth(9);
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(60, 40, false);
    body.setOffset(0, 0);
    body.setCollideWorldBounds(true);
  }

  get phase(): 1 | 2 | 3 {
    if (this.missilesRemaining > 6) return 1;
    if (this.missilesRemaining > 3) return 2;
    return 3;
  }

  get isVulnerable(): boolean {
    return this.scene.time.now < this.vulnerableUntil;
  }

  /** Called from DroneSpawner missile overlap — only deals damage inside window */
  takeMissileHit(): void {
    if (!this.isVulnerable) return; // deflect outside window
    this.missilesRemaining--;
    this.scene.spawnFloatingText(this.x, this.y - 30, `${this.missilesRemaining} LEFT`, '#00ffff');
    this.scene.cameras.main.shake(100, 0.008);
    if (this.missilesRemaining <= 0) {
      this.setMotherState('DEATH');
    }
  }

  update(time: number, delta: number): void {
    if (!this.active || this.motherState === 'DEATH') return;

    // Keep sac graphic centred
    this.drawSac(this.isVulnerable);

    this.phaseTimer -= delta;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const driftSpeed = this.phase === 1 ? DRIFT_SPEED_P1
                     : this.phase === 2 ? DRIFT_SPEED_P2
                     : DRIFT_SPEED_P3;

    switch (this.motherState) {
      case 'DRIFT': {
        body.setVelocityX(this.driftDir * driftSpeed);
        // Bounce off world edges
        const cam = this.scene.cameras.main;
        if (this.x < cam.scrollX + 150) this.driftDir = 1;
        if (this.x > cam.scrollX + GAME_W - 150) this.driftDir = -1;
        this.setFlipX(this.driftDir < 0);

        // Periodic ring attack
        this.ringTimer -= delta;
        if (this.ringTimer <= 0) {
          const interval = this.phase === 1 ? RING_INTERVAL_P1
                         : this.phase === 2 ? RING_INTERVAL_P2
                         : RING_INTERVAL_P3;
          this.ringTimer = interval + Math.random() * 500;
          this.fireRingBurst();
        }

        // Periodic egg drop (phases 1 and 2)
        if (this.phase < 3) {
          this.eggTimer -= delta;
          if (this.eggTimer <= 0) {
            const eggInterval = this.phase === 1 ? EGG_INTERVAL_P1 : EGG_INTERVAL_P2;
            this.eggTimer = eggInterval + Math.random() * 1000;
            this.dropEggCluster();
          }
        }

        // Phase 2+: also do beam attack periodically
        if (this.phase >= 2 && !this.beamUsedThisPhase) {
          if (Math.random() < 0.003 * delta) { // ~30% chance per second
            this.beamUsedThisPhase = true;
            this.fireSweepBeam();
          }
        }

        // Phase 3: continuous drone drops instead of eggs
        if (this.phase === 3 && this.eggTimer <= 0) {
          this.eggTimer = 3000 + Math.random() * 1000;
          this.spawnDroneDirectly();
        }
        break;
      }

      case 'OPEN_WINDOW': {
        body.setVelocityX(0);
        // Transition to VULNERABLE
        this.setMotherState('VULNERABLE');
        break;
      }

      case 'VULNERABLE': {
        body.setVelocityX(0);
        if (!this.isVulnerable) {
          this.beamUsedThisPhase = false;
          this.setMotherState('DRIFT');
        }
        break;
      }
    }
  }

  private fireRingBurst(): void {
    const ringCount  = this.phase === 1 ? 2 : this.phase === 2 ? 3 : 4;
    const gapCount   = this.phase === 1 ? 3 : 2;
    const gapSize    = (Math.PI * 2) / (ringCount * 8) * gapCount;

    for (let ring = 0; ring < ringCount; ring++) {
      const ringDelay = ring * 180;
      this.scene.time.delayedCall(ringDelay, () => {
        if (!this.active) return;
        const bulletCount = 16;
        for (let i = 0; i < bulletCount; i++) {
          const angle = (i / bulletCount) * Math.PI * 2;
          // Skip gap angles
          const isGap = (i % Math.floor(bulletCount / gapCount)) < 2;
          if (isGap) continue;

          const b = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image;
          if (!b) continue;
          b.setActive(true).setVisible(true).setDepth(14);
          b.setBlendMode(Phaser.BlendModes.ADD);
          b.setTint(0x4488ff);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
          b.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
        }
      });
    }

    // Open vulnerability window after rings
    const windowDuration = this.phase === 1 ? WINDOW_DURATION_P1
                         : this.phase === 2 ? WINDOW_DURATION_P2
                         : WINDOW_DURATION_P3;
    const openAt = ringCount * 180 + 400;
    this.scene.time.delayedCall(openAt, () => {
      if (!this.active) return;
      this.openVulnerabilityWindow(windowDuration);
    });
  }

  private openVulnerabilityWindow(duration: number): void {
    this.vulnerableUntil = this.scene.time.now + duration;
    this.setMotherState('VULNERABLE');
    this.scene.events.emit('motherTelegraph', { duration, type: 'vulnerable' });
  }

  private fireSweepBeam(): void {
    // Telegraph: red vertical line on one side for 1.5s, then fire
    const cam   = this.scene.cameras.main;
    const side  = Math.random() < 0.5 ? 'left' : 'right';
    const beamX = side === 'left'
      ? cam.scrollX + 100
      : cam.scrollX + GAME_W - 100;

    // Emit telegraph to UI
    this.scene.events.emit('motherTelegraph', { duration: 1500, type: 'beam', side, beamX });

    this.scene.time.delayedCall(1500, () => {
      if (!this.active) return;
      // Fire a column of bullets from top to bottom at beamX
      const BULLET_ROWS = 12;
      for (let row = 0; row < BULLET_ROWS; row++) {
        const b = this.scene.droneBullets.get(beamX, -50 + row * 40, 'bullet-drone') as Phaser.Physics.Arcade.Image;
        if (!b) continue;
        b.setActive(true).setVisible(true).setDepth(14);
        b.setBlendMode(Phaser.BlendModes.ADD);
        b.setTint(0xff4400);
        b.setScale(2.5);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
        b.setVelocity(0, BULLET_SPEED * 0.7);
      }
      // Open vulnerability window after beam
      const windowDuration = this.phase === 2 ? WINDOW_DURATION_P2 : WINDOW_DURATION_P3;
      this.openVulnerabilityWindow(windowDuration);
    });
  }

  private fireSpiral(): void {
    const totalBullets = 24;
    const offsetStart  = Math.random() * Math.PI * 2;
    for (let i = 0; i < totalBullets; i++) {
      this.scene.time.delayedCall(i * 50, () => {
        if (!this.active) return;
        const angle = offsetStart + (i / totalBullets) * Math.PI * 4; // two full rotations
        const b = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image;
        if (!b) return;
        b.setActive(true).setVisible(true).setDepth(14);
        b.setBlendMode(Phaser.BlendModes.ADD);
        b.setTint(0xaa44ff);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
        b.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
      });
    }

    // Also fire targeted clusters at player
    const target = this.scene.getPilotOrPlayer();
    const CLUSTER = 5;
    for (let i = 0; i < CLUSTER; i++) {
      this.scene.time.delayedCall(200 + i * 80, () => {
        if (!this.active) return;
        const t = this.scene.getPilotOrPlayer();
        const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, t.x, t.y);
        const spread    = (i - 2) * 0.15;
        const b = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image;
        if (!b) return;
        b.setActive(true).setVisible(true).setDepth(14);
        b.setBlendMode(Phaser.BlendModes.ADD);
        b.setTint(0xff6622);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;
        b.setVelocity(
          Math.cos(baseAngle + spread) * BULLET_SPEED,
          Math.sin(baseAngle + spread) * BULLET_SPEED,
        );
      });
    }

    void target; // used inside delayedCall closures above
    // Open vulnerability window after spiral completes
    this.scene.time.delayedCall(totalBullets * 50 + 600, () => {
      if (!this.active) return;
      this.openVulnerabilityWindow(WINDOW_DURATION_P3);
    });
  }

  private dropEggCluster(): void {
    const EGG_HATCH_MS = this.phase === 1 ? 4000 : 2500;
    const eggCount     = 2 + Math.floor(Math.random() * 2); // 2-3 eggs
    for (let e = 0; e < eggCount; e++) {
      const dropX = this.x + Phaser.Math.Between(-80, 80);
      // Eggs drop as fast-falling bullets that stop at ground level and hatch
      const egg = this.scene.droneBullets.get(dropX, this.y + 30, 'pixel') as Phaser.Physics.Arcade.Image;
      if (!egg) continue;
      egg.setActive(true).setVisible(true).setDepth(14);
      egg.setTint(0x44ff88);
      egg.setScale(4, 4);
      if (egg.body) {
        const eb = egg.body as Phaser.Physics.Arcade.Body;
        eb.enable = true;
        eb.setGravityY(600);
      }
      // Hatch: spawn drone at landing position after delay
      this.scene.time.delayedCall(EGG_HATCH_MS, () => {
        if (!this.active || !this.scene?.sys.isActive()) return;
        egg.setActive(false).setVisible(false);
        if (egg.body) (egg.body as Phaser.Physics.Arcade.Body).enable = false;
        // Spawn a standard drone at the egg's last position
        this.scene.events.emit('spawnResilientDrone', egg.x, egg.y);
      });
    }
  }

  private spawnDroneDirectly(): void {
    this.scene.events.emit('spawnResilientDrone', this.x + Phaser.Math.Between(-120, 120), this.y + 80);
  }

  private drawSac(open: boolean): void {
    this.sacGfx.clear();
    if (open) {
      this.sacGfx.fillStyle(0x00ffff, 0.7);
      this.sacGfx.fillCircle(this.x, this.y + 20, 18);
      this.sacGfx.lineStyle(3, 0xffffff, 1.0);
      this.sacGfx.strokeCircle(this.x, this.y + 20, 18);
    } else {
      this.sacGfx.fillStyle(0x224466, 0.3);
      this.sacGfx.fillCircle(this.x, this.y + 20, 12);
    }
  }

  private setMotherState(state: MotherState): void {
    if (this.motherState === 'DEATH') return;
    this.motherState = state;

    switch (state) {
      case 'DRIFT':
        this.play('sentinel-hover');
        break;

      case 'VULNERABLE':
        this.play('sentinel-hover');
        this.scene.audio.play('boss-telegraph'); // reuse existing telegraph sound
        break;

      case 'DEATH': {
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.enable = false;
        this.sacGfx.destroy();

        // 6s staggered death sequence
        const explodeOffsets = [
          { x: 0, y: 0, t: 0 }, { x: -60, y: -20, t: 400 }, { x: 60, y: 20, t: 700 },
          { x: 0, y: -40, t: 1100 }, { x: -40, y: 30, t: 1500 }, { x: 50, y: -10, t: 2000 },
          { x: 0, y: 0, t: 2800 }, { x: -20, y: -50, t: 3400 }, { x: 30, y: 20, t: 4200 },
        ];
        explodeOffsets.forEach(({ x, y, t }) => {
          this.scene.time.delayedCall(t, () => {
            if (!this.scene?.sys.isActive()) return;
            this.scene.spawnExplosion(this.x + x, this.y + y);
            this.scene.cameras.main.shake(300, 0.02);
            this.scene.audio.play('explosion');
          });
        });

        // Final: emit bossKilled after sequence
        this.scene.time.delayedCall(5000, () => {
          this.scene.events.emit('bossKilled', this.x, this.y);
          this.setActive(false).setVisible(false);
          this.destroy();
        });
        break;
      }
    }
  }
}
```

- [ ] **Step 4: Handle `spawnResilientDrone` event in GameScene**

In `GameScene.create()`, add an event listener for egg hatching. Add this after the spawner is created:
```typescript
this.events.on('spawnResilientDrone', (x: number, y: number) => {
  const { Drone } = await import('./entities/Drone'); // or use a stored ref
  // Actually: import at top of GameScene.ts and spawn inline:
});
```

Since dynamic imports are complex, add this import at the top of `GameScene.ts`:
```typescript
import { Drone } from '../entities/Drone';
```

And add the listener in `create()`:
```typescript
this.events.on('spawnResilientDrone', (x: number, y: number) => {
  if (!this.sys.isActive()) return;
  const bracket = WAVE_BRACKETS[WAVE_BRACKETS.length - 1]; // max difficulty
  const d = new Drone(this, x, y, 'drone-red', bracket, 'normal', undefined, 0);
  this.add.existing(d);
  this.physics.add.existing(d);
  this.drones.add(d);
  (d.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  d.startPatrol(-1);

  this.physics.add.overlap(this.playerBullets, d, (_d, bullet) => {
    const b = bullet as Phaser.Physics.Arcade.Image;
    b.setActive(false).setVisible(false);
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
    (_d as unknown as Drone).takeDamage(1);
    this.audio.play('hit');
  });
  this.physics.add.overlap(this.missiles, d, (_d, missile) => {
    const m = missile as Phaser.Physics.Arcade.Image;
    m.setData('hitTarget', true);
    m.setActive(false).setVisible(false);
    if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
    this.spawnExplosion(m.x, m.y);
    (_d as unknown as Drone).takeDamage(3);
    this.audio.play('explosion');
  });
});
```

Also add the WAVE_BRACKETS import to GameScene if not already present:
```typescript
import { WAVE_BRACKETS } from '../constants';
```

- [ ] **Step 5: Handle `motherTelegraph` in UIScene**

In `UIScene.ts`, add listener for `motherTelegraph` event emitted from MotherDrone. This event signals either a vulnerability window or a beam warning.

Find where `bossTelegraph` is handled in `UIScene.ts` and add alongside it:
```typescript
gameScene.events.on('motherTelegraph', (data: { duration: number; type: string; side?: string }) => {
  if (data.type === 'vulnerable') {
    // Flash "VULNERABLE — FIRE MISSILES"
    this.showMotherAlert('VULNERABLE — FIRE MISSILES', '#00ffff', data.duration);
  } else if (data.type === 'beam') {
    this.showMotherAlert(`⚠ BEAM ${(data.side ?? '').toUpperCase()} SIDE`, '#ff4400', 1500);
  }
});
```

Add `showMotherAlert()` method to UIScene:
```typescript
private showMotherAlert(msg: string, color: string, duration: number): void {
  // Destroy previous if still showing
  this.motherAlertText?.destroy();
  const W = GAME_W, H = GAME_H;
  this.motherAlertText = this.add.text(W / 2, H * 0.3, msg, {
    fontFamily: 'monospace',
    fontSize: '22px',
    color,
  }).setOrigin(0.5).setDepth(50).setScrollFactor(0);

  this.tweens.add({
    targets: this.motherAlertText,
    alpha: { from: 1, to: 0 },
    duration: 400,
    delay: duration - 400,
    onComplete: () => { this.motherAlertText?.destroy(); this.motherAlertText = undefined; },
  });
}
```

Add `private motherAlertText?: Phaser.GameObjects.Text;` to UIScene class fields.

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/entities/MotherDrone.ts src/tests/MotherDrone.test.ts src/scenes/GameScene.ts src/scenes/UIScene.ts
git commit -m "feat: MotherDrone final boss — bullet-hell, 3 phases, 10-missile kill"
```

---

## Task 7: Phase 3 Spiral Attack Integration

**Files:**
- Modify: `src/entities/MotherDrone.ts`

- [ ] **Step 1: Wire spiral attack into Phase 3 DRIFT loop**

In `MotherDrone.update()`, in the `DRIFT` case, after the `beamUsedThisPhase` check, add a spiral trigger for phase 3:

```typescript
// Phase 3: occasional spiral attack in addition to rings
if (this.phase === 3 && !this.beamUsedThisPhase) {
  if (Math.random() < 0.002 * delta) { // ~12% chance per second
    this.beamUsedThisPhase = true;
    this.fireSpiral();
  }
}
```

Also reset `beamUsedThisPhase` at the end of each vulnerability window (already done in the `VULNERABLE → DRIFT` transition where `this.beamUsedThisPhase = false` is set).

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```
Play L3 to wave 4. Confirm:
- Phase 1: slow drift, ring bursts with gaps, eggs hatching into drones, vulnerability window opens, missiles deal damage inside window only
- Phase 2 (after 4 missiles): beam warning on one side, speed increases
- Phase 3 (after 7 missiles): spiral + clusters, direct drone spawning
- 10th missile: death sequence starts

- [ ] **Step 4: Commit**

```bash
git add src/entities/MotherDrone.ts
git commit -m "feat: MotherDrone Phase 3 spiral attack wired into update loop"
```

---

## Task 8: Final Integration + Version Bump

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 2: Full L3 play-test checklist**

```bash
npm run dev
```

- [ ] L3 loads with blue/black ice tilemap
- [ ] Floor is uneven — multiple height levels visible
- [ ] 5–6 death pits visible — falling into one kills instantly
- [ ] Player slides noticeably on ice (sluggish stopping)
- [ ] "Slippery terrain" message appears at start
- [ ] Wave 1–3: 5 enemies per wave, drones have resilience (revive up to 2×)
- [ ] Downed drones show revive dots indicator and get up after 4s
- [ ] Shooting a downed drone kills it permanently
- [ ] ShieldedTanks and Mines appear in L3
- [ ] Wave 4: MotherDrone spawns on ceiling
- [ ] Ring bursts have navigable gaps
- [ ] Rapid gun shows DEFLECT floaters on boss
- [ ] Vulnerability window opens after rings — "VULNERABLE" HUD indicator appears
- [ ] Missiles deal damage only during window
- [ ] Phase 2 transition at 6 missiles remaining — beam warning appears
- [ ] Phase 3 transition at 3 missiles remaining — spiral + continuous drones
- [ ] 10th missile lands: staggered 6s death sequence
- [ ] Score += 1000 on boss kill, level complete

- [ ] **Step 3: Bump version to 0.8.0**

In `package.json`:
```json
"version": "0.8.0",
```

- [ ] **Step 4: Update ROADMAP.md to mark v0.8 as current**

In `ROADMAP.md`, change `## v0.8 (next)` to `## v0.8 (current)`.

- [ ] **Step 5: Final commit**

```bash
git add package.json ROADMAP.md
git commit -m "chore: bump to v0.8.0 — Level 3 Ice Caverns complete"
```
