# Level Polish & Feel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the gameplay loop with 6 changes: 1920×1080 resolution, camera-viewport spawning from all sides, 3-wave runs, landing sounds, missile launch audio, and level selection.

**Architecture:** Constants-first approach — add GAME_W/GAME_H and rescale all Y-dependent values in Task 1, then cascade through scenes. Each task is independently buildable. No new files required.

**Tech Stack:** Phaser 3.80, TypeScript, Vite, Web Audio API (procedural sounds), vitest

**Spec:** `docs/superpowers/specs/2026-03-25-level-polish-design.md`

---

## File Structure

| File | What changes |
|------|-------------|
| `src/constants.ts` | Add GAME_W/GAME_H; scale GROUND_Y/WORLD_HEIGHT/PLATFORM_BANDS/RADAR; update BOSS_WAVE/WAVE_BRACKETS |
| `src/main.ts` | width: 1920, height: 1080 |
| `src/scenes/GameScene.ts` | L2 world/camera bounds to 1920; cameraBoundMaxY init to 1080 |
| `src/scenes/UIScene.ts` | All hardcoded 1280/720/640 → W/H relative |
| `src/scenes/TitleScene.ts` | Layout + level selection menu (2 tasks) |
| `src/scenes/StoryScene.ts` | 1280/720 → W/H |
| `src/scenes/MechSelectScene.ts` | 1280/720 → W/H, recentre mech boxes |
| `src/scenes/UpgradeCardScene.ts` | Import GAME_W/GAME_H instead of `const W=1280,H=720` |
| `src/scenes/UpgradeTreeScene.ts` | Import GAME_W/GAME_H; rescale COL_X, TIER_Y |
| `src/systems/DroneSpawner.ts` | Camera-viewport spawn; crawler threshold; patrol lanes; sentinel/sniper thresholds |
| `src/systems/AudioSystem.ts` | Remove missile-flight loop; add missile-launch + landing sounds; remove hard-landing block |
| `src/weapons/HomingMissile.ts` | Replace startLoop with play('missile-launch'); remove stopLoop calls |
| `src/entities/Player.ts` | wasAirborne + prevVelocityY fields; landing detection |
| `src/ui/MinimapRenderer.ts` | Any hardcoded 1280/720 screen refs → GAME_W/GAME_H |
| `src/tests/constants.test.ts` | New: verify GAME_W, GAME_H, BOSS_WAVE, WAVE_BRACKETS values |

---

### Task 1: Foundation constants

**Files:**
- Modify: `src/constants.ts`
- Create: `src/tests/constants.test.ts`

- [ ] **Step 1: Write failing tests for the new constant values**

```ts
// src/tests/constants.test.ts
import { describe, it, expect } from 'vitest';
import {
  GAME_W, GAME_H,
  GROUND_Y, WORLD_HEIGHT,
  BOSS_WAVE_L1, BOSS_WAVE_L2,
  WAVE_BRACKETS,
  RADAR_X, RADAR_Y,
} from '../constants';

describe('constants', () => {
  it('resolution is 1920×1080', () => {
    expect(GAME_W).toBe(1920);
    expect(GAME_H).toBe(1080);
  });

  it('GROUND_Y scaled to 1080-height world', () => {
    expect(GROUND_Y).toBe(960);
  });

  it('WORLD_HEIGHT updated', () => {
    expect(WORLD_HEIGHT).toBe(1080);
  });

  it('boss waves set to 3', () => {
    expect(BOSS_WAVE_L1).toBe(3);
    expect(BOSS_WAVE_L2).toBe(3);
  });

  it('WAVE_BRACKETS minWave starts at 0 and ramps 0,1,2,3', () => {
    expect(WAVE_BRACKETS[0].minWave).toBe(0);
    expect(WAVE_BRACKETS[1].minWave).toBe(1);
    expect(WAVE_BRACKETS[2].minWave).toBe(2);
    expect(WAVE_BRACKETS[3].minWave).toBe(3);
  });

  it('bracket selection: wave 1 → bracket 1, wave 2 → bracket 2, wave 3 → bracket 3', () => {
    function selectBracket(wave: number) {
      let b = WAVE_BRACKETS[0];
      for (const br of WAVE_BRACKETS) { if (wave >= br.minWave) b = br; }
      return b;
    }
    expect(selectBracket(1)).toBe(WAVE_BRACKETS[1]);
    expect(selectBracket(2)).toBe(WAVE_BRACKETS[2]);
    expect(selectBracket(3)).toBe(WAVE_BRACKETS[3]);
  });

  it('RADAR_X near right edge of 1920 screen', () => {
    expect(RADAR_X).toBe(1830);
    expect(RADAR_Y).toBe(880);
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npm test -- constants.test.ts
```
Expected: FAIL — `GAME_W is not exported`

- [ ] **Step 3: Update `src/constants.ts`**

Add at the very top (before existing constants):
```ts
// ── Screen / viewport dimensions ────────────────────────────────────────────
export const GAME_W = 1920;
export const GAME_H = 1080;
```

Update these existing lines:
```ts
// Before:
export const WORLD_HEIGHT = 720;
export const GROUND_Y = 640;
export const GROUND_HEIGHT = 80;

export const PLATFORM_BANDS = [
  { yMin: 448, yMax: 512 },
  { yMin: 320, yMax: 400 },
  { yMin: 208, yMax: 288 },
] as const;

export const RADAR_X = 1205;
export const RADAR_Y = 592;

export const MAX_WAVES_L1  = 10;
export const BOSS_WAVE_L1  = 10;
export const MAX_WAVES_L2  = 12;
export const BOSS_WAVE_L2  = 12;

// WAVE_BRACKETS minWave values: 1, 4, 7, 10

// After:
export const WORLD_HEIGHT = 1080;
export const GROUND_Y = 960;        // scaled 640/720 * 1080
export const GROUND_HEIGHT = 120;   // scaled proportionally

export const PLATFORM_BANDS = [
  { yMin: 672, yMax: 768 },   // low   — scaled × 1.5
  { yMin: 480, yMax: 600 },   // mid
  { yMin: 312, yMax: 432 },   // high
] as const;

export const RADAR_X = 1830;        // GAME_W - 90
export const RADAR_Y = 880;

export const MAX_WAVES_L1  = 3;
export const BOSS_WAVE_L1  = 3;
export const MAX_WAVES_L2  = 3;
export const BOSS_WAVE_L2  = 3;

// WAVE_BRACKETS — keep all 4 entries, update minWave only:
{ minWave: 0,  attackSpeed: 160, shootInterval: 2200, extraHp: 0, bulletSpeedMult: 1.0 },
{ minWave: 1,  attackSpeed: 200, shootInterval: 1800, extraHp: 0, bulletSpeedMult: 1.0 },
{ minWave: 2,  attackSpeed: 240, shootInterval: 1500, extraHp: 1, bulletSpeedMult: 1.0 },
{ minWave: 3,  attackSpeed: 280, shootInterval: 1200, extraHp: 1, bulletSpeedMult: 1.2 },
```

- [ ] **Step 4: Run tests — confirm passing**

```bash
npm test -- constants.test.ts
```
Expected: 6 passing

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
```
Expected: `✓ built`

- [ ] **Step 6: Commit**

```bash
git add src/constants.ts src/tests/constants.test.ts
git commit -m "feat: GAME_W/GAME_H constants, scale Y values, 3-wave boss, bracket rebalance"
```

---

### Task 2: Update main.ts + GameScene bounds

**Files:**
- Modify: `src/main.ts`
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Update main.ts game config**

```ts
// src/main.ts — change:
import { GAME_W, GAME_H } from './constants';  // add import

// In config object:
width: GAME_W,   // was 1280
height: GAME_H,  // was 720
```

- [ ] **Step 2: Update GameScene L2 world/camera bounds**

In `src/scenes/GameScene.ts`:

```ts
// Add to existing import from '../constants':
import { WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT, PLATFORM_BANDS, GAME_W, GAME_H } from '../constants';
```

Change line 59:
```ts
this.cameraBoundMaxY = GAME_H;  // was 720
```

Change line 110 (L2 world bounds):
```ts
this.physics.world.setBounds(0, 0, GAME_W, 4800);  // was 1280
```

Change line 236 (L2 camera bounds):
```ts
this.cameras.main.setBounds(0, 0, GAME_W, this.cameraBoundMaxY);  // was 1280
```

In the `waveCleared` handler (lines 296–297):
```ts
this.cameras.main.setBounds(0, 0, GAME_W, this.cameraBoundMaxY);   // was 1280
this.physics.world.setBounds(0, 0, GAME_W, this.cameraBoundMaxY);  // was 1280
```

Also in DroneSpawner.ts line 91 (boss spawn centre X) — fix while in the spawner mindset; update later in Task 7.

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/scenes/GameScene.ts
git commit -m "feat: 1920x1080 game config and GameScene L2 bounds"
```

---

### Task 3: UIScene — rescale all HUD positions

**Files:**
- Modify: `src/scenes/UIScene.ts`

UIScene has all bars and text anchored to absolute `1280`/`720`/`640` values. Replace every hardcoded screen-dimension reference with `W`/`H` constants.

- [ ] **Step 1: Add W/H locals and update right-anchored bars**

Add near the top of `create()`:
```ts
const W = 1920, H = 1080;  // will import from constants after this task
```

Update every right-anchored element. The key variable `mx` (missile bar x anchor):
```ts
const mx = W - BAR_W - PAD - 22;  // was 1280 - BAR_W - PAD - 22
```

Missile label:
```ts
this.missileLabel = this.add.text(W - PAD, my, 'MSL', ...  // was 1280 - PAD
```

Turret label:
```ts
this.turretLabel = this.add.text(W - PAD, ty, 'TRT', ...   // was 1280 - PAD
```

- [ ] **Step 2: Update centred text elements**

Score text:
```ts
this.scoreText = this.add.text(W / 2, PAD, ...        // was 640
this.waveCounter = this.add.text(W / 2, PAD + 20, ... // was 640
this.dronesRemainingText = this.add.text(W / 2, PAD + 32, ... // was 640
```

Wave announcement:
```ts
this.waveText = this.add.text(W / 2, H / 2 - 40, ... // was 640, 320
```

Controls hint:
```ts
this.add.text(PAD, H - PAD, 'A/D move ...              // was 720 - PAD
```

- [ ] **Step 3: Update pause overlay**

```ts
this.pauseBg  = this.add.rectangle(W / 2, H / 2, W, H, ...   // was 640, 360, 1280, 720
this.pauseText = this.add.text(W / 2, H / 2, ...               // was 640, 360
```

- [ ] **Step 4: Update event listeners' text positions**

In `'waveStart'` handler — level name flash:
```ts
const t = this.add.text(W / 2, 80, levelName, ...  // was 640
```

In `'killStreak'` handler:
```ts
const t = this.add.text(W / 2, H / 2, ...          // was 640, 360
```

- [ ] **Step 5: Update showLevelComplete() and showGameOver()**

`showLevelComplete()`:
```ts
this.add.rectangle(W / 2, H / 2, W, H, ...       // was 640, 360, 1280, 720
this.add.text(W / 2, H / 2 - 80, 'LEVEL COMPLETE', ...  // was 640, 280
this.add.text(W / 2, H / 2 - 20, nextName, ...          // was 640, 340
```

`showGameOver()`:
```ts
this.add.rectangle(W / 2, H / 2, W, H, ...             // was 640, 360, 1280, 720
this.add.text(W / 2, H / 2 - 120, 'GAME OVER', ...     // was 640, 240
this.add.text(W / 2, H / 2 - 40, `SCORE: ...`, ...     // was 640, 320
this.add.text(W / 2, H / 2,      `WAVE: ...`, ...      // was 640, 360
this.add.text(W / 2, H / 2 + 48, `${hsPrefix}...`, ... // was 640, 408
this.add.text(W / 2, H / 2 + 136, 'PRESS R TO RESTART', ... // was 640, 496
```

- [ ] **Step 6: Switch W/H from locals to imported constants**

Replace `const W = 1920, H = 1080` with:
```ts
import { GAME_W, GAME_H, PILOT_JETPACK_MAX_FUEL } from '../constants';
// ... in create():
const W = GAME_W, H = GAME_H;
```

- [ ] **Step 7: Build check**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 8: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: UIScene rescaled to 1920x1080"
```

---

### Task 4: TitleScene, StoryScene, MechSelectScene — rescale layouts

**Files:**
- Modify: `src/scenes/TitleScene.ts`
- Modify: `src/scenes/StoryScene.ts`
- Modify: `src/scenes/MechSelectScene.ts`

- [ ] **Step 1: TitleScene — add W/H, update background, stars, logo, menu positions**

Add import at top:
```ts
import { GAME_W, GAME_H } from '../constants';
```

In `create()`, add:
```ts
const W = GAME_W, H = GAME_H;
```

Replace all hardcoded positions:
```ts
// Background:
this.add.rectangle(W / 2, H / 2, W, H, 0x030318)

// Star generation — use W, H:
gfx.fillRect(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), size, size)
gfx.generateTexture(key, W, H)
// also in makeStar calls: 180, 70 counts stay the same

// Star images:
this.add.image(W / 2, H / 2, 'title-stars-far')
this.add.image(W / 2, H / 2, 'title-stars-near')

// Logo:
const logoImage = this.add.image(W / 2, 150, 'logo')
// float tween y: 160 (stays — logo always near top)

// Menu options — y offset scales with H:
const t = this.add.text(W / 2, H * 0.58 + i * 54, label, ...  // was 430 = 720*0.597

// Navigation hint:
this.add.text(W / 2, H - 26, '↑ ↓  NAVIGATE ...  // was 694 = 720-26
```

- [ ] **Step 2: StoryScene — add W/H, update background and text positions**

Read `src/scenes/StoryScene.ts` to find all hardcoded 640/1280/720 references. Replace:
```ts
import { GAME_W, GAME_H } from '../constants';
// In create():
const W = GAME_W, H = GAME_H;
// Background: W/2, H/2, W, H
// Text x: W/2 for centred, PAD for left-aligned
// Continue button: W/2, H - 80
```

- [ ] **Step 3: MechSelectScene — add W/H, update background and box positions**

```ts
import { GAME_W, GAME_H, MECH_STATS } from '../constants';
// In create():
const W = GAME_W, H = GAME_H;
// Background: W/2, H/2, W, H
// Title text: W/2, 48
// centerXs: position mech boxes at 1/3 and 2/3 of W
const centerXs = [Math.round(W * 0.32), Math.round(W * 0.68)];  // was [408, 872]
// centerY: proportional: Math.round(H * 0.49) ≈ 529  (was 352 = 720*0.489)
const centerY = Math.round(H * 0.49);
// "PRESS ENTER to confirm" hint — H - 48
```

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 5: Commit**

```bash
git add src/scenes/TitleScene.ts src/scenes/StoryScene.ts src/scenes/MechSelectScene.ts
git commit -m "feat: rescale TitleScene, StoryScene, MechSelectScene to 1920x1080"
```

---

### Task 5: UpgradeCardScene + UpgradeTreeScene — rescale

**Files:**
- Modify: `src/scenes/UpgradeCardScene.ts`
- Modify: `src/scenes/UpgradeTreeScene.ts`

Both currently set `const W = 1280, H = 720` at the top of `create()`. The fix is mechanical: import GAME_W/GAME_H and use them as the source.

- [ ] **Step 1: UpgradeCardScene — replace local constants**

```ts
import { GAME_W, GAME_H } from '../constants';
// In create():
const W = GAME_W, H = GAME_H;  // was const W = 1280, H = 720
// All W/H usages automatically scale — no other changes needed
```

- [ ] **Step 2: UpgradeTreeScene — replace local constants AND rescale COL_X / TIER_Y**

```ts
import { GAME_W, GAME_H } from '../constants';
// In create():
const W = GAME_W, H = GAME_H;  // was const W = 1280, H = 720
```

The module-level `COL_X` and `TIER_Y` constants are not derived from W/H — update them directly:

```ts
// Before:
const COL_X: Record<string, number> = { offense: 320, defense: 640, mobility: 960 };
const TIER_Y = [160, 280, 400, 520];
const NODE_W = 160;
const NODE_H = 52;

// After (scaled × 1.5 for 1920 wide, adjusted spacing):
const COL_X: Record<string, number> = { offense: 480, defense: 960, mobility: 1440 };
const TIER_Y = [200, 360, 520, 680];
const NODE_W = 200;
const NODE_H = 60;
```

Column headers y: update `90` → `120` to match proportional spacing.
Score bank text y: `44` → `60`.
Title label y: `20` → `28`.
Back button: `40, 40` → `52, 52`.

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 4: Check MinimapRenderer for hardcoded screen references**

Read `src/ui/MinimapRenderer.ts`. Any hardcoded `1280`/`720` screen-space values that aren't already using RADAR_X/RADAR_Y from constants should be updated to use `GAME_W`/`GAME_H`.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/UpgradeCardScene.ts src/scenes/UpgradeTreeScene.ts src/ui/MinimapRenderer.ts
git commit -m "feat: rescale UpgradeCardScene, UpgradeTreeScene, MinimapRenderer to 1920x1080"
```

---

### Task 6: DroneSpawner — camera-viewport spawn + wave rebalancing

**Files:**
- Modify: `src/systems/DroneSpawner.ts`

- [ ] **Step 1: Add GAME_W/GAME_H import and update patrol lanes**

In the imports:
```ts
import { GROUND_Y, WORLD_WIDTH, WAVE_BRACKETS, BOSS_WAVE_L1, BOSS_WAVE_L2,
         L2_SPEED_MULT, L2_INTERVAL_MULT, GAME_W, GAME_H } from '../constants';
```

Update module-level constant:
```ts
// Before:
const PATROL_LANES  = [380, 420, 460, 500, 540];
// After (scaled × 1.5 for GROUND_Y=960):
const PATROL_LANES  = [570, 630, 690, 750, 810];
```

- [ ] **Step 2: Update sentinel/sniper wave thresholds**

In `spawnNext()` (inside `spawnWave()`), around line 154:
```ts
// Before:
const isSentinel = this.waveIndex >= 7 && i % 4 === 3;
const isSniper   = !isSentinel && this.waveIndex >= 5 && i % 3 === 2;
// After (compressed for 3-wave run):
const isSentinel = this.waveIndex >= 2 && i % 4 === 3;
const isSniper   = !isSentinel && this.waveIndex >= 2 && i % 3 === 2;
```

- [ ] **Step 3: Update boss spawn centre X**

In the boss-wave block (around line 91):
```ts
// Before:
const camCentreX = this.scene.cameras.main.scrollX + 640;
// After:
const camCentreX = this.scene.cameras.main.scrollX + GAME_W / 2;
```

- [ ] **Step 4: Replace world-edge drone spawn with camera-viewport spawn**

Replace the existing `spawnX` / `spawnY` calculation in `spawnNext()` (around lines 147–151) and crawler spawn (around line 213) with viewport-relative logic:

```ts
// ── Helper: pick a viewport-relative spawn position ──────────────────────
// (place just outside one of 3 visible edges: left/right/top)
const cam   = this.scene.cameras.main;
const vx    = cam.scrollX;
const vy    = cam.scrollY;
const MARGIN = 150;

// Pick side: 0=left, 1=right, 2=top
const roll = Math.random();
const side = roll < 0.40 ? 0 : roll < 0.80 ? 1 : 2;

let spawnX: number, spawnY: number;
if (side === 0) {
  spawnX = Phaser.Math.Clamp(vx - MARGIN, 0, WORLD_WIDTH);
  spawnY = Phaser.Math.Between(vy, vy + GAME_H - 200);
} else if (side === 1) {
  spawnX = Phaser.Math.Clamp(vx + GAME_W + MARGIN, 0, WORLD_WIDTH);
  spawnY = Phaser.Math.Between(vy, vy + GAME_H - 200);
} else {
  spawnX = Phaser.Math.Clamp(
    Phaser.Math.Between(vx, vx + GAME_W), 0, WORLD_WIDTH
  );
  spawnY = vy - MARGIN;
}

// Clamp Y so drones don't spawn underground
spawnY = Phaser.Math.Clamp(spawnY, -200, GROUND_Y - 50);

const lane = PATROL_LANES[i % PATROL_LANES.length];
// Use lane as patrol target Y, but actual spawn is the viewport-relative position
```

After creating the drone, set initial downward velocity for top-spawned drones:
```ts
if (side === 2) {
  const droneBody = drone.body as Phaser.Physics.Arcade.Body;
  droneBody.setVelocityY(100);
}
```

- [ ] **Step 5: Update crawler spawn to use viewport-relative left/right**

Note: `MARGIN` is declared inside `spawnNext()` in Step 4. The crawler block runs in the outer `spawnWave()` scope, so declare it again (or hoist to the top of `spawnWave()`). Simplest: add `const MARGIN = 150;` at the top of `spawnWave()` (before `spawnNext()` is defined) and remove the inner declaration from Step 4.

Replace crawler `cx` calculation:
```ts
// Before:
const camRight = this.scene.cameras.main.scrollX + 1380;
const cx = Math.min(camRight + 80 + Math.random() * 200, WORLD_WIDTH - 100);

// After (MARGIN=150 declared at top of spawnWave):
const crawlerCam = this.scene.cameras.main;
const cxLeft  = Phaser.Math.Clamp(crawlerCam.scrollX - MARGIN, 0, WORLD_WIDTH);
const cxRight = Phaser.Math.Clamp(crawlerCam.scrollX + GAME_W + MARGIN, 0, WORLD_WIDTH);
const cx = c % 2 === 0 ? cxLeft : cxRight;
```

- [ ] **Step 6: Update crawler wave threshold**

```ts
// Before:
if (this.waveIndex >= 3) {
// After:
if (this.waveIndex >= 1) {
```

- [ ] **Step 7: Build check**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 8: Commit**

```bash
git add src/systems/DroneSpawner.ts
git commit -m "feat: camera-viewport spawning from all sides, 3-wave rebalance in spawner"
```

---

### Task 7: AudioSystem — missile-launch + landing sounds

**Files:**
- Modify: `src/systems/AudioSystem.ts`

- [ ] **Step 1: Update SoundId type — add new sounds**

```ts
// Add to SoundId union:
type SoundId =
  | 'rapid' | 'turret' | 'hit' | 'hurt' | 'jump' | 'death'
  | 'drone-shoot' | 'explosion' | 'footstep' | 'missile-impact'
  | 'nanite-heal' | 'nanite-tick' | 'pickup' | 'eject'
  | 'ui-nav' | 'ui-confirm' | 'level-complete'
  | 'upgrade-pick' | 'upgrade-buy' | 'upgrade-denied'
  | 'missile-launch' | 'landing-soft' | 'landing-heavy';  // ← add these
```

- [ ] **Step 2: Update LoopId type — remove missile-flight**

```ts
// Before:
type LoopId = 'jetpack' | 'missile-flight';
// After:
type LoopId = 'jetpack';
```

- [ ] **Step 3: Add volumes for new sounds**

```ts
// Add to VOLUMES:
'missile-launch': 0.45,
'landing-soft':   0.30,
'landing-heavy':  0.50,
```

- [ ] **Step 4: Remove missile-flight from startLoop()**

Delete the `else if (id === 'missile-flight') { ... }` block (lines 128–138 in AudioSystem.ts). The `startLoop` function body should only contain the `jetpack` branch after this change.

- [ ] **Step 5: Remove hard-landing detection from update()**

Delete the block:
```ts
// Before (lines 173–181) — DELETE this block:
if (!this.wasOnGround && onGround) {
  this.footstepTimer = 280;
  if (velocityY > 180) {
    try {
      this.soundManager.play('footstep', { volume: 0.55 });
    } catch { /* ignore */ }
  }
}
this.wasOnGround = onGround;
```

Also remove the `wasOnGround` field declaration (line 62) and `velocityY` from the `AudioUpdateState` interface (it becomes unused). If `velocityY` is still referenced elsewhere in update(), remove those references too.

**Also update `src/scenes/GameScene.ts`** — find the `this.audio.update({...})` call (around line 379) and remove the `velocityY: pb.velocity.y` property from the object literal. TypeScript will error on excess properties if this is left in after removing it from the interface.

- [ ] **Step 6: Add playProceduralOneShot() private helper and implement new sounds**

Add this private method after `stopLoop()`:

```ts
private playProceduralOneShot(
  freq: number,
  duration: number,
  peakGain: number,
  noiseLayer?: { filterHz: number },
): void {
  try {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;

    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(peakGain, t);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    masterGain.connect(this.ctx.destination);

    // Sine oscillator
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(masterGain);
    osc.start(t);
    osc.stop(t + duration);

    if (noiseLayer) {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(noiseLayer.filterHz, t);
      noiseSrc.connect(lp);
      lp.connect(masterGain);
      noiseSrc.start(t);
      noiseSrc.stop(t + duration);
    }
  } catch { /* ignore */ }
}
```

Add `playMissileLaunch()` private method:
```ts
private playMissileLaunch(): void {
  try {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const DURATION = 0.35;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.linearRampToValueAtTime(0, t + DURATION);
    gain.connect(this.ctx.destination);

    // White noise through bandpass, sweep 2000→600 Hz
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2000, t);
    bp.frequency.linearRampToValueAtTime(600, t + DURATION);
    noiseSrc.connect(bp);
    bp.connect(gain);
    noiseSrc.start(t);
    noiseSrc.stop(t + DURATION);
  } catch { /* ignore */ }
}
```

- [ ] **Step 7: Wire new sounds into play()**

In the `play()` method, add special routing before the `soundManager.play()` call:
```ts
play(id: SoundId): void {
  const now = performance.now();
  const min = this.minInterval[id] ?? 0;
  if (min > 0 && this.lastPlay[id] !== undefined && now - this.lastPlay[id]! < min) return;
  this.lastPlay[id] = now;

  // Procedural sounds — bypass Phaser sound manager
  if (id === 'missile-launch') { this.playMissileLaunch(); return; }
  if (id === 'landing-soft')  { this.playProceduralOneShot(70, 0.08, 0.30); return; }
  if (id === 'landing-heavy') { this.playProceduralOneShot(55, 0.12, 0.50, { filterHz: 200 }); return; }

  try {
    this.soundManager.play(id, { volume: VOLUMES[id] });
  } catch { /* ignore */ }
}
```

- [ ] **Step 8: Build check**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/AudioSystem.ts
git commit -m "feat: missile-launch burst, landing-soft/heavy sounds; remove missile-flight loop"
```

---

### Task 8: HomingMissile + Player — wire audio

**Files:**
- Modify: `src/weapons/HomingMissile.ts`
- Modify: `src/entities/Player.ts`

- [ ] **Step 1: HomingMissile — replace startLoop with one-shot, remove all stopLoop calls**

In `fire()` method:
```ts
// Remove: this.scene.audio.startLoop('missile-flight');
// Add:
this.scene.audio.play('missile-launch');
```

In `update()` method — remove **all three** `stopLoop('missile-flight')` calls. They appear in:
1. The hit-target path (when `obj.getData('hitTarget') === true`)
2. The miss path (comment: `// silent stop — miss`)
3. The out-of-bounds path (comment: `// silent stop — miss (matches cullBullets maxY)`)

Delete each `this.scene.audio.stopLoop('missile-flight');` line.

- [ ] **Step 2: Player.ts — add landing detection fields and logic**

Add two private fields to the `Player` class:
```ts
private wasAirborne = false;
private prevVelocityY = 0;
```

In `Player.update()`, at the very start of the movement block (before existing movement logic), add:
```ts
const body = this.body as Phaser.Physics.Arcade.Body;
const airborne = !body.blocked.down;

if (this.wasAirborne && !airborne) {
  const sound = this.prevVelocityY > 300 ? 'landing-heavy' : 'landing-soft';
  this.scene.audio.play(sound);
}

this.wasAirborne = airborne;
this.prevVelocityY = body.velocity.y;
```

Note: `prevVelocityY` is captured at the end of the frame check (after airborne update) so it reflects the velocity from the previous frame — which is non-zero when falling.

- [ ] **Step 3: Build check + run all tests**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
npm test
```
Expected: build clean, all tests pass (including the new constants test)

- [ ] **Step 4: Commit**

```bash
git add src/weapons/HomingMissile.ts src/entities/Player.ts
git commit -m "feat: missile-launch one-shot in HomingMissile; landing sounds in Player"
```

---

### Task 9: Level selection in TitleScene

**Files:**
- Modify: `src/scenes/TitleScene.ts`

- [ ] **Step 1: Replace module-level OPTIONS constant with two named arrays**

```ts
// Remove:
const OPTIONS = ['START GAME', 'STORY', 'UPGRADES'] as const;

// Add:
const MAIN_OPTIONS  = ['START GAME', 'SELECT LEVEL', 'STORY', 'UPGRADES'];
const LEVEL_OPTIONS = ['L1: SURFACE OPS', 'L2: SUBSURFACE', '[ BACK ]'];
```

- [ ] **Step 2: Add class fields**

```ts
export class TitleScene extends Phaser.Scene {
  private selectedIndex = 0;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private pulseTween?: Phaser.Tweens.Tween;
  private inputLocked = false;
  private menuState: 'main' | 'levelSelect' = 'main';  // ← add
  private currentOptions: string[] = [];                 // ← add
```

- [ ] **Step 3: Add renderOptions() method**

```ts
private renderOptions(): void {
  // Destroy existing option texts
  this.optionTexts.forEach(t => t.destroy());
  this.optionTexts = [];

  const W = GAME_W, H = GAME_H;
  this.currentOptions.forEach((label, i) => {
    const t = this.add.text(W / 2, H * 0.58 + i * 54, label, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#335566',
    }).setOrigin(0.5).setDepth(10)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.selectedIndex = i;
        this.updateSelection();
        this.confirmSelection();
      })
      .on('pointerover', () => {
        if (this.selectedIndex !== i) {
          this.selectedIndex = i;
          this.updateSelection();
        }
      });
    this.optionTexts.push(t);
  });

  this.selectedIndex = 0;
  this.updateSelection();
}
```

- [ ] **Step 4: Update create() to use renderOptions()**

Replace the `OPTIONS.forEach(...)` block and the `this.updateSelection()` call below it with:
```ts
this.currentOptions = [...MAIN_OPTIONS];
this.renderOptions();
```

- [ ] **Step 5: Update navigate() to use currentOptions.length**

```ts
private navigate(dir: number): void {
  if (this.inputLocked) return;
  this.selectedIndex = Phaser.Math.Wrap(
    this.selectedIndex + dir, 0, this.currentOptions.length  // was OPTIONS.length
  );
  this.updateSelection();
  this.sound.play('ui-nav', { volume: 0.25 });
}
```

- [ ] **Step 6: Update updateSelection() to use this.currentOptions**

```ts
private updateSelection(): void {
  this.pulseTween?.stop();
  this.optionTexts.forEach((t, i) => {
    if (i === this.selectedIndex) {
      t.setText('▶  ' + this.currentOptions[i] + '  ◀');  // was OPTIONS[i]
      t.setStyle({ color: '#00ccff', fontSize: '22px' });
      t.setAlpha(1);
      this.pulseTween = this.tweens.add({ ... });
    } else {
      t.setText(this.currentOptions[i]);                    // was OPTIONS[i]
      t.setStyle({ color: '#335566', fontSize: '18px' });
      t.setAlpha(0.8);
    }
  });
}
```

- [ ] **Step 7: Rewrite confirmSelection() with menu state logic**

```ts
private confirmSelection(): void {
  if (this.inputLocked) return;
  this.sound.play('ui-confirm', { volume: 0.40 });
  this.pulseTween?.stop();

  if (this.menuState === 'levelSelect') {
    switch (this.selectedIndex) {
      case 0: // L1
        this.inputLocked = true;
        this.registry.set('currentLevel', 1);
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MechSelect'));
        break;
      case 1: // L2
        this.inputLocked = true;
        this.registry.set('currentLevel', 2);
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MechSelect'));
        break;
      case 2: // BACK
        this.menuState = 'main';
        this.currentOptions = [...MAIN_OPTIONS];
        this.renderOptions();
        break;
    }
    return;
  }

  // menuState === 'main'
  switch (this.selectedIndex) {
    case 0: // START GAME
      this.inputLocked = true;
      this.registry.set('currentLevel', 1);
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MechSelect'));
      break;
    case 1: // SELECT LEVEL
      this.menuState = 'levelSelect';
      this.currentOptions = [...LEVEL_OPTIONS];
      this.renderOptions();
      break;
    case 2: // STORY
      this.inputLocked = true;
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Story'));
      break;
    case 3: // UPGRADES
      this.inputLocked = true;
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('UpgradeTree'));
      break;
  }
}
```

- [ ] **Step 8: Add ESC key listener in create()**

After the existing keyboard listeners in `create()`:
```ts
// ESC — back to main menu from level select (no-op in main state)
this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
  if (this.inputLocked) return;
  if (this.menuState === 'levelSelect') {
    this.menuState = 'main';
    this.currentOptions = [...MAIN_OPTIONS];
    this.renderOptions();
  }
});
```

- [ ] **Step 9: Build check + run all tests**

```bash
npm run build 2>&1 | grep -E "error|✓ built"
npm test
```

- [ ] **Step 10: Commit**

```bash
git add src/scenes/TitleScene.ts
git commit -m "feat: level selection submenu in TitleScene (L1/L2)"
```

---

### Task 10: Final build + push

- [ ] **Step 1: Full test run**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 2: Production build**

```bash
npm run build
```
Expected: clean build, no TypeScript errors, `✓ built`

- [ ] **Step 3: Manual smoke-check list**

Launch the dev server (`npm run dev`) and verify:
- [ ] Title screen fills 1920×1080 without black bars or overflow
- [ ] Level selection submenu appears and ESC returns to main menu
- [ ] L1 game starts via SELECT LEVEL → L1, L2 starts via SELECT LEVEL → L2
- [ ] Drones spawn from left, right, and above the player
- [ ] Crawlers appear from wave 1
- [ ] Boss appears on wave 3 (after 2 upgrade card picks)
- [ ] Missile fires with a short whoosh burst; no sustained sound during flight
- [ ] Landing from a fall plays a thud; light hop plays a softer tap
- [ ] Upgrade tree and mech select screen look correct at new resolution

- [ ] **Step 4: Push**

```bash
git push
```
