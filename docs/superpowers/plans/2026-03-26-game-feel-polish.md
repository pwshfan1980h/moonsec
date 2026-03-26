# Game Feel Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply six targeted game-feel improvements: drone difficulty tuning, jetpack particle visibility fix + amplification, camera vertical follow, nanite heal visibility fix + label rename, player hit flash, and screen shake on player damage.

**Architecture:** All changes are isolated edits to four source files (`src/constants.ts`, `src/entities/Player.ts`, `src/scenes/GameScene.ts`, `src/scenes/UIScene.ts`). No new files, no new assets. The core issue for particles is depth ordering — mech is at depth 10, and all particle emitters currently render behind it (depth 7–9). Fixes raise emitters above or to the edge of mech depth.

**Tech Stack:** Phaser 3.80.1 (TypeScript), Vite build, Vitest tests. Run tests: `npm test`. Type check: `npx tsc --noEmit`.

---

## File Map

| File | What Changes |
|------|-------------|
| `src/constants.ts` | WAVE_BRACKETS: attackSpeed +15%, bulletSpeedMult raised |
| `src/tests/constants.test.ts` | Add assertions for new WAVE_BRACKETS values |
| `src/entities/Player.ts` | Jetpack emitter depths (9/8/7 → 11/11/9) + configs; nanite emitter depths (9/9 → 12/12) + configs; hit flash replacement |
| `src/scenes/GameScene.ts` | Camera setBounds expanded upward; two startFollow lerp updates; screen shake after drone bullet hit |
| `src/scenes/UIScene.ts` | 'NNT' → 'NANOHEAL' label text |

---

## Task 1 — Drone Difficulty Tuning

**Files:**
- Modify: `src/constants.ts:26-34`
- Modify: `src/tests/constants.test.ts`

Context: `WAVE_BRACKETS` drives drone attack speed, shoot interval, HP, and bullet speed for each wave tier. The bracket is selected in `DroneSpawner.ts` by taking the highest bracket whose `minWave ≤ waveIndex`. The `shootInterval` and `extraHp` values are NOT changing — only `attackSpeed` and `bulletSpeedMult`.

- [ ] **Step 1: Add failing assertions for new bracket values**

  In `src/tests/constants.test.ts`, add a new `it` block after the existing bracket-selection test:

  ```ts
  it('WAVE_BRACKETS attackSpeed and bulletSpeedMult at new difficulty values', () => {
    expect(WAVE_BRACKETS[0].attackSpeed).toBe(185);
    expect(WAVE_BRACKETS[1].attackSpeed).toBe(230);
    expect(WAVE_BRACKETS[2].attackSpeed).toBe(275);
    expect(WAVE_BRACKETS[3].attackSpeed).toBe(320);
    expect(WAVE_BRACKETS[0].bulletSpeedMult).toBe(1.1);
    expect(WAVE_BRACKETS[1].bulletSpeedMult).toBe(1.15);
    expect(WAVE_BRACKETS[2].bulletSpeedMult).toBe(1.2);
    expect(WAVE_BRACKETS[3].bulletSpeedMult).toBe(1.4);
  });
  ```

- [ ] **Step 2: Run tests — expect FAIL**

  ```
  npm test
  ```

  Expected: the new test fails with values like `Expected: 185 Received: 160`.

- [ ] **Step 3: Update WAVE_BRACKETS in `src/constants.ts`**

  Replace lines 30–34 (the four bracket objects):

  ```ts
  export const WAVE_BRACKETS: {
    minWave: number; attackSpeed: number; shootInterval: number;
    extraHp: number; bulletSpeedMult: number;
  }[] = [
    { minWave: 0,  attackSpeed: 185, shootInterval: 2200, extraHp: 0, bulletSpeedMult: 1.1  },
    { minWave: 1,  attackSpeed: 230, shootInterval: 1800, extraHp: 0, bulletSpeedMult: 1.15 },
    { minWave: 2,  attackSpeed: 275, shootInterval: 1500, extraHp: 1, bulletSpeedMult: 1.2  },
    { minWave: 3,  attackSpeed: 320, shootInterval: 1200, extraHp: 1, bulletSpeedMult: 1.4  },
  ];
  ```

- [ ] **Step 4: Run tests — expect PASS**

  ```
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/constants.ts src/tests/constants.test.ts
  git commit -m "feat: increase drone attackSpeed +15% and bulletSpeedMult across all wave brackets"
  ```

---

## Task 2 — Jetpack Particle Depth Fix + Amplification

**Files:**
- Modify: `src/entities/Player.ts:137-173`

Context: `Player` is at `setDepth(10)` (line 108). All three jetpack emitters are currently at depths 7, 8, 9 — behind the mech. The fix raises `jetpackInner` and `jetpackOuter` to depth 11 (above mech, visible flame). `jetpackSmoke` goes to depth 9 (still behind mech, but the smoke is large enough to show below/around the mech feet). Config amplification makes particles dramatically bigger and longer-lived so they're visible even during fast movement.

No automated test is possible for Phaser rendering depth — verify visually after implementation.

- [ ] **Step 1: Replace the three jetpack emitter blocks in `src/entities/Player.ts`**

  Find the block starting at line 137 (`this.jetpackInner = scene.add.particles(0, 0, 'flare', {`) and ending at line 173 (the `.setDepth(7)` line). Replace the entire three-emitter block with:

  ```ts
  // Jetpack flame emitters — orange core + cyan outer glow
  this.jetpackInner = scene.add.particles(0, 0, 'flare', {
    speed:     { min: 80,  max: 200 },
    angle:     { min: 80,  max: 100 },  // downward ±10°
    scale:     { start: 2.5, end: 0 },
    alpha:     { start: 1,   end: 0 },
    tint:      [0xff6600, 0xff2200, 0xffaa00],
    lifespan:  280,
    frequency: 80,
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(11);  // above mech (depth 10)

  this.jetpackOuter = scene.add.particles(0, 0, 'flare', {
    speed:     { min: 50,  max: 130 },
    angle:     { min: 65,  max: 115 }, // downward ±25°
    scale:     { start: 4.0, end: 0 },
    alpha:     { start: 0.6, end: 0 },
    tint:      [0x00aaff, 0x0044ff, 0x44eeff],
    lifespan:  400,
    frequency: 60,
    blendMode: 'ADD',
    emitting:  false,
  }).setDepth(11);  // above mech (depth 10)

  // Jetpack exhaust smoke — intentionally uses 'pixel' (1×1 square) for blocky wispy look;
  // switching to 'flare' would produce an undesirable ~110px soft circle per particle
  this.jetpackSmoke = scene.add.particles(0, 0, 'pixel', {
    speed:     { min: 15, max: 55 },
    angle:     { min: 60, max: 120 }, // downward spread
    scale:     { start: 10.0, end: 0 },
    alpha:     { start: 0.30, end: 0 },
    tint:      [0xaaaaaa, 0x888888, 0xcccccc, 0xffffff],
    lifespan:  1400,
    frequency: 90,
    blendMode: Phaser.BlendModes.NORMAL,
    emitting:  false,
  }).setDepth(9); // behind flame (depth 11), visible below mech feet
  ```

- [ ] **Step 2: Type check**

  ```
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Run tests**

  ```
  npm test
  ```

  Expected: all tests pass (no test covers this code path).

- [ ] **Step 4: Commit**

  ```bash
  git add src/entities/Player.ts
  git commit -m "feat: fix jetpack emitter depths (above mech) and amplify particle configs"
  ```

---

## Task 3 — Nanite Heal Particle Depth Fix + Amplification + Label Rename

**Files:**
- Modify: `src/entities/Player.ts:176-196`
- Modify: `src/scenes/UIScene.ts:106`

Context: Both nanite emitters are at depth 9, behind the mech at depth 10. Fix raises both to depth 12 (above everything). The `naniteAmbient` emitter drifts upward (angle 250–290, roughly "upward" since Phaser angle 270 = straight up). The `naniteSpark` is a burst-mode emitter called via `emitParticle()` rather than continuous — its `quantity` config and the `emitParticle` call argument both need updating from 6 to 12.

UIScene change: `'NNT'` at line 106 → `'NANOHEAL'`.

- [ ] **Step 1: Replace the two nanite emitter blocks in `src/entities/Player.ts`**

  Find the block starting at line 176 (`this.naniteAmbient = scene.add.particles(this.x, this.y - 56, 'flare', {`) through line 196 (`.setDepth(9)` of naniteSpark). Replace with:

  ```ts
  // Nanite heal emitters
  this.naniteAmbient = scene.add.particles(this.x, this.y - 56, 'flare', {
    tint:      [0x00ff88, 0x44ffcc, 0x00ccff],
    speed:     { min: 30, max: 80 },
    angle:     { min: 250, max: 290 }, // upward drift
    lifespan:  600,
    scale:     { start: 2.0, end: 0 },
    frequency: 40,
    blendMode: Phaser.BlendModes.ADD,
    emitting:  false,
  }).setDepth(12);  // above mech (depth 10)

  this.naniteSpark = scene.add.particles(this.x, this.y - 56, 'flare', {
    tint:      [0x00ffff, 0xffffff, 0x44ff88],
    speed:     { min: 80, max: 160 },
    angle:     { min: 0, max: 360 },
    lifespan:  350,
    scale:     { start: 2.0, end: 0 },
    quantity:  12,
    blendMode: Phaser.BlendModes.ADD,
    emitting:  false,
  }).setDepth(12);  // above mech (depth 10)
  ```

- [ ] **Step 2: Update `emitParticle` call in `startNaniteParticles()` in `src/entities/Player.ts`**

  Find line 353:
  ```ts
  this.naniteSpark.emitParticle(6, this.x, this.y - 56);
  ```
  Change `6` to `12`:
  ```ts
  this.naniteSpark.emitParticle(12, this.x, this.y - 56);
  ```

- [ ] **Step 3: Rename label in `src/scenes/UIScene.ts`**

  Find line 106:
  ```ts
  this.naniteLabel = this.add.text(nx, ny, 'NNT', {
  ```
  Change `'NNT'` to `'NANOHEAL'`:
  ```ts
  this.naniteLabel = this.add.text(nx, ny, 'NANOHEAL', {
  ```

- [ ] **Step 4: Type check**

  ```
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Run tests**

  ```
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/entities/Player.ts src/scenes/UIScene.ts
  git commit -m "feat: fix nanite emitter depths (above mech), amplify configs, rename NNT to NANOHEAL"
  ```

---

## Task 4 — Player Hit Flash

**Files:**
- Modify: `src/entities/Player.ts:450-451`

Context: `takeDamage()` already has a tint + delayedCall in the non-lethal else branch (lines 450–451). This is a replacement, not an addition. The new version uses a slightly more red tint (`0xff3333` vs `0xff4444`), shorter duration (150ms vs 200ms), and adds a `!this.dead` guard before `clearTint()` so a death that fires during the delay doesn't try to clear tint on a destroyed sprite.

- [ ] **Step 1: Replace the two hit-flash lines in `src/entities/Player.ts`**

  Find lines 450–451:
  ```ts
  this.setTint(0xff4444);
  this.scene.time.delayedCall(200, () => this.clearTint());
  ```
  Replace with:
  ```ts
  this.setTint(0xff3333);
  this.scene.time.delayedCall(150, () => { if (!this.dead) this.clearTint(); });
  ```

- [ ] **Step 2: Type check**

  ```
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Run tests**

  ```
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add src/entities/Player.ts
  git commit -m "fix: replace player hit flash — 0xff3333, 150ms, dead guard on clearTint"
  ```

---

## Task 5 — Camera Vertical Follow + Screen Shake

**Files:**
- Modify: `src/scenes/GameScene.ts:236` (setBounds)
- Modify: `src/scenes/GameScene.ts:237` (startFollow — initial setup)
- Modify: `src/scenes/GameScene.ts:337` (startFollow — after player reenter)
- Modify: `src/scenes/GameScene.ts:213` (screen shake after takeDamage)

Context:

**Camera bounds** — `WORLD_HEIGHT = GAME_H = 1080`, so the current `setBounds(0, 0, WORLD_WIDTH, 1080)` gives the camera zero vertical scrollroom (scrollY is always 0). Expanding the top by `GAME_H - 120 = 960` gives a scrollY range of [-960, 0]. When the player is at world Y≈420 or above, the camera scrolls up enough that the ground (world Y=960) goes off the bottom of the screen. Both L1 and L2 backgrounds use TileSprites/rectangles at `scrollFactor(0)`, so they always fill the viewport regardless of camera scroll position — no void will appear.

**Camera lerp** — Update only the two player-follow calls (lines 237 and 337). Do NOT change line 344 (pilot follow during ejection sequence). lerpX 0.12→0.20, lerpY 0.08→0.18.

**Screen shake** — Add `this.cameras.main.shake(80, 0.006)` after the `takeDamage(1)` call inside the `droneBullets`→`player` overlap callback (around line 213). The shake fires whenever the overlap is detected; `takeDamage` handles hurtLock and dead guards internally. Shield absorption still triggers the shake — this is intentional (feedback that the shield fired).

Note: No automated test covers Phaser camera or physics. Verify visually.

- [ ] **Step 1: Expand camera bounds in `src/scenes/GameScene.ts`**

  Find line 236:
  ```ts
  this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ```
  Replace with:
  ```ts
  this.cameras.main.setBounds(0, -(GAME_H - 120), WORLD_WIDTH, WORLD_HEIGHT + (GAME_H - 120));
  ```

  Ensure `GAME_H` is imported — it should already be in the existing imports from `'../constants'`.

- [ ] **Step 2: Tighten startFollow lerp at line 237**

  Find (line 237, immediately after the setBounds):
  ```ts
  this.cameras.main.startFollow(this.player, false, 0.12, 0.08);
  ```
  Replace with:
  ```ts
  this.cameras.main.startFollow(this.player, false, 0.20, 0.18);
  ```

- [ ] **Step 3: Tighten startFollow lerp at line 337**

  Find the second player-follow call (inside the pilot→player reenter block, around line 337):
  ```ts
  this.cameras.main.startFollow(this.player, false, 0.12, 0.08);
  ```
  Replace with:
  ```ts
  this.cameras.main.startFollow(this.player, false, 0.20, 0.18);
  ```

  **Important:** There is a third `startFollow` at line 344 that follows `this.pilot` during ejection — leave it unchanged at `(0.12, 0.08)`.

- [ ] **Step 4: Add screen shake to drone bullet hit callback**

  Find the drone bullet overlap callback (around lines 206–215):
  ```ts
  this.physics.add.overlap(
    this.droneBullets,
    this.player,
    (playerObj, b) => {
      const bullet = b as Phaser.Physics.Arcade.Image;
      bullet.setActive(false).setVisible(false);
      if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
      (playerObj as Player).takeDamage(1);
    },
  );
  ```
  Add `this.cameras.main.shake(80, 0.006);` after `takeDamage(1)`:
  ```ts
  this.physics.add.overlap(
    this.droneBullets,
    this.player,
    (playerObj, b) => {
      const bullet = b as Phaser.Physics.Arcade.Image;
      bullet.setActive(false).setVisible(false);
      if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
      (playerObj as Player).takeDamage(1);
      this.cameras.main.shake(80, 0.006);
    },
  );
  ```

- [ ] **Step 5: Type check**

  ```
  npx tsc --noEmit
  ```

  Expected: no errors. If `GAME_H` is not imported, add it to the constants import line.

- [ ] **Step 6: Run tests**

  ```
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src/scenes/GameScene.ts
  git commit -m "feat: camera vertical follow (expanded bounds), tighter lerp, screen shake on drone hit"
  ```
