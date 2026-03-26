# Level Polish & Feel — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the core gameplay loop with 6 targeted changes: 1920×1080 resolution, camera-viewport spawning from all sides, 3-wave runs, landing sounds, missile launch audio, and level selection.

**Architecture:** Each change is isolated to 1–3 files. Resolution is the most invasive (all scenes), spawn system is the most gameplay-impactful. No new scenes required.

**Tech Stack:** Phaser 3.80, TypeScript, Vite, Web Audio API (procedural sounds)

---

## Change 1: 1920×1080 Resolution

**Files touched:** `src/main.ts`, `src/constants.ts`, `src/scenes/UIScene.ts`, `src/scenes/TitleScene.ts`, `src/scenes/StoryScene.ts`, `src/scenes/MechSelectScene.ts`, `src/scenes/UpgradeCardScene.ts`, `src/scenes/UpgradeTreeScene.ts`, `src/scenes/GameScene.ts`

**Approach:**
- Update game config in `main.ts`: `width: 1920, height: 1080`
- Add `export const GAME_W = 1920` and `export const GAME_H = 1080` to `src/constants.ts`
- In every scene that currently hardcodes `1280`/`720`, replace with `const W = GAME_W, H = GAME_H` (already the pattern in UpgradeTreeScene/UpgradeCardScene — just wrong values)
- L2 world width: `GameScene` creates L2 as a 1280×4800 world — update horizontal dimension to 1920
- `WORLD_WIDTH` in constants stays 6400 (L1 horizontal scroll world — now ~3.3× screen width vs 5× before)
- UIScene: all bar positions, text anchors, minimap position recalculated from `W`/`H`

**Key coordinate changes (UIScene):**
- Minimap: was right-anchored at x=1230 → move to x=1830 (i.e. `W - 90`)
- HUD bars: HP/jetpack bars anchored left (unchanged x); turret/missile/nanite bars right-anchored → shift right anchors by 640px (use `W - <offset>`)
- Wave/score text: centered on `W/2` or anchored to corners with `W`/`H`-relative offsets

**No functional behavior changes** — purely layout.

---

## Change 2: Camera-Viewport Spawning (All Sides)

**Files touched:** `src/systems/DroneSpawner.ts`

**Current behavior:** Drones spawn at world x=0 or x=WORLD_WIDTH (random side), random y. Crawlers similar.

**New behavior:** Spawn relative to the camera's current viewport position.

**Spawn side distribution:**
- Drones: 40% left, 40% right, 20% top (no bottom — ground is solid)
- Crawlers: 50% left, 50% right only (ground-based, y=GROUND_Y)

**Spawn position calculation:**
```ts
import { GAME_W, GAME_H, WORLD_WIDTH, GROUND_Y } from '../constants';

const cam = this.scene.cameras.main;
const vx = cam.scrollX;        // left edge of viewport in world coords
const vy = cam.scrollY;        // top edge of viewport
const MARGIN = 150;            // px outside viewport

// Left side:  x = vx - MARGIN,            y = Phaser.Math.Between(vy, vy + GAME_H - 200)
// Right side: x = vx + GAME_W + MARGIN,   y = Phaser.Math.Between(vy, vy + GAME_H - 200)
// Top side:   x = Phaser.Math.Between(vx, vx + GAME_W), y = vy - MARGIN
```

**Clamping:** Spawn x clamped to `[0, WORLD_WIDTH]`, y clamped to `[-200, GROUND_Y - 50]` to avoid spawning inside geometry.

**Top-spawn velocity bias:** Drones spawned from the top receive an initial `body.setVelocityY(+100)` so they drift downward into the play area instead of hovering above the screen.

**Crawler wave threshold:** The current guard `if (this.waveIndex >= 3)` that gates crawler spawning must be changed to `if (this.waveIndex >= 1)` — otherwise crawlers never appear in a 3-wave run since the boss lands on wave 3.

---

## Change 3: 3 Waves Before Boss + Bracket Rebalance

**Files touched:** `src/constants.ts`

**Wave count:**
```ts
// constants.ts
export const BOSS_WAVE_L1 = 3;  // was 10
export const BOSS_WAVE_L2 = 3;  // was 12
```

Player receives 2 upgrade card picks (after wave 1 clear, after wave 2 clear). Boss spawns on wave 3. No card before boss (`isBossWave()` guard unchanged).

**Bracket rebalance:**

Current `WAVE_BRACKETS` has 4 entries with `minWave` thresholds of approximately `[1, 4, 7, 10]`. All 4 entries are kept — only the `minWave` values change:

```ts
// New minWave values (keep all 4 bracket entries, enemy counts per bracket unchanged):
// bracket 0: minWave = 0   (unreachable — waveIndex starts at 0 but first wave is 1)
// bracket 1: minWave = 1   (wave 1 → mid difficulty)
// bracket 2: minWave = 2   (wave 2 → harder)
// bracket 3: minWave = 3   (wave 3 / boss wave → hardest)
```

The bracket selection logic in DroneSpawner (find highest bracket whose `minWave ≤ waveIndex`) requires no changes — only the data values in `WAVE_BRACKETS` change.

---

## Change 4: Landing Sounds

**Files touched:** `src/systems/AudioSystem.ts`, `src/entities/Player.ts`

**Remove existing hard-landing detection from AudioSystem.ts:**
`AudioSystem.update()` currently detects hard landings (`wasOnGround`/`velocityY` check) and plays `footstep`. That path must be removed — the new Player.ts detection replaces it entirely. Remove the hard-landing block in `AudioSystem.update()` (the block that checks `velocityY` on landing to play footstep at elevated volume).

**Detection in Player.ts — add two class fields:**
```ts
private wasAirborne = false;
private prevVelocityY = 0;
```

**In Player.update(), at the start of the movement block:**
```ts
const body = this.body as Phaser.Physics.Arcade.Body;
const airborne = !body.blocked.down;

if (this.wasAirborne && !airborne) {
  // Landing frame: velocity.y is 0 now, use prev frame's value
  const sound = this.prevVelocityY > 300 ? 'landing-heavy' : 'landing-soft';
  this.scene.audio.play(sound);
}

this.wasAirborne = airborne;
this.prevVelocityY = body.velocity.y;  // capture at end of frame
```

**Procedural sounds in AudioSystem.ts:**

`landing-soft`: Single sine oscillator, 70Hz, 80ms duration, exponential gain decay from 0.3 to 0.

`landing-heavy`: Sine oscillator at 55Hz + white noise node both running in parallel. Noise passed through a `BiquadFilterNode` (lowpass, 200Hz) to produce a thud quality. Total duration 120ms, peak gain 0.5.

Both added to the `SoundId` union type and `VOLUMES` map. Both implemented as procedural Web Audio (no audio files).

---

## Change 5: Missile Flight Audio — Replace Loop with Launch Burst

**Files touched:** `src/systems/AudioSystem.ts`, `src/weapons/HomingMissile.ts`

**AudioSystem.ts — two removals:**
1. Remove `'missile-flight'` from the `LoopId` type union (currently `type LoopId = 'jetpack' | 'missile-flight'` → becomes `type LoopId = 'jetpack'`)
2. Remove the `'missile-flight'` case/branch from the `startLoop()` implementation block

**AudioSystem.ts — one addition:**

Add `missile-launch` to `SoundId` and `VOLUMES`. Implement as a procedural one-shot:
- White noise source node + `BiquadFilterNode` (bandpass)
- Filter frequency sweeps from 2000Hz → 600Hz via `linearRampToValueAtTime` over 350ms
- Gain envelope: immediate full attack, linear decay to 0 over 350ms
- Peak volume: 0.45

**HomingMissile.ts changes:**
```ts
// In fire(): replace startLoop with one-shot
// Before: this.scene.audio.startLoop('missile-flight');
this.scene.audio.play('missile-launch');

// In update(): remove all 3 stopLoop('missile-flight') calls
// (lines: hit-target path, miss path, out-of-bounds path)
```

`missile-impact` and `explosion` sounds unchanged.

---

## Change 6: Level Selection in TitleScene

**Files touched:** `src/scenes/TitleScene.ts`

**Current structure:** `const OPTIONS = ['START GAME', 'STORY', 'UPGRADES'] as const` is a module-level immutable tuple. `navigate()` wraps against `OPTIONS.length`. This must be changed to support dynamic option sets.

**New structure:**

Replace the `const OPTIONS` tuple with a class field:
```ts
private menuState: 'main' | 'levelSelect' = 'main';
private currentOptions: string[] = [];
```

Define two option arrays as constants (not `as const`):
```ts
const MAIN_OPTIONS    = ['START GAME', 'SELECT LEVEL', 'STORY', 'UPGRADES'];
const LEVEL_OPTIONS   = ['L1: SURFACE OPS', 'L2: SUBSURFACE', '[ BACK ]'];
```

On `create()`, set `this.currentOptions = [...MAIN_OPTIONS]` and render. `navigate()` wraps against `this.currentOptions.length`.

**Menu state transitions:**

`confirm()` (the selection handler) switches on `this.menuState`:

- `'main'` + index 0 → `registry.set('currentLevel', 1)`, start `'MechSelect'`
- `'main'` + index 1 → `this.menuState = 'levelSelect'`, `this.currentOptions = [...LEVEL_OPTIONS]`, re-render text objects, reset `selectedIndex = 0`
- `'main'` + index 2 → start `'Story'`
- `'main'` + index 3 → start `'UpgradeTree'`
- `'levelSelect'` + index 0 → `registry.set('currentLevel', 1)`, start `'MechSelect'`
- `'levelSelect'` + index 1 → `registry.set('currentLevel', 2)`, start `'MechSelect'`
- `'levelSelect'` + index 2 → `this.menuState = 'main'`, `this.currentOptions = [...MAIN_OPTIONS]`, re-render, reset `selectedIndex = 0`

**ESC key — add new listener in `create()`:**

TitleScene currently has no ESC listener. Add one:
```ts
this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
  if (this.menuState === 'levelSelect') {
    this.menuState = 'main';
    this.currentOptions = [...MAIN_OPTIONS];
    // re-render text, reset selectedIndex = 0
  }
  // In 'main' state: ESC is a no-op (already at top level)
});
```

**Re-render helper:** Extract a `renderOptions()` method called both from `create()` and whenever `currentOptions` changes. It destroys existing option text objects and recreates them from `currentOptions`, reattaching pointer/keyboard handlers.

**`updateSelection()` — update both `OPTIONS[i]` references:** The existing `updateSelection()` method references the module-level `OPTIONS` constant at two sites (the selected-item label and the unselected-item label). After removing `OPTIONS`, both must be updated to `this.currentOptions[i]`. Alternatively, fold `updateSelection()` into `renderOptions()` so there is a single place that reads `this.currentOptions`.

---

## Out of Scope

- Music
- Exit portals / level advancement changes
- Crawler combat logic
- Non-functional tree upgrades (Air Dash, Grav Boost, etc.)
- L2 playtesting / polish (separate spec after L2 is tested)
