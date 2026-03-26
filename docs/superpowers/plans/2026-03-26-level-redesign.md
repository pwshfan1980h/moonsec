# Level Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild both levels for visual quality: larger help text, L1 three-layer lunar-surface parallax with Moon Base props, L2 rebuilt as a cold dark-side surface level.

**Architecture:** All changes isolated to `src/scenes/GameScene.ts` and `src/scenes/UIScene.ts`. No new files. Everything is procedural Phaser Graphics — no new image assets. L2 reuses the same infrastructure as L1 (same helper methods) with different palette/count/damageLevel parameters.

**Tech Stack:** Phaser 3.80, TypeScript, Vite, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-level-redesign-design.md`

---

## File Structure

- Modify: `src/scenes/UIScene.ts` — help text size, L2 level name/color strings
- Modify: `src/scenes/GameScene.ts` — all parallax, props, L2 rebuild changes

No new files required. Phaser scene code cannot be unit-tested without a real WebGL context — TypeScript compilation (`npx tsc --noEmit`) is the automated correctness gate. Existing vitest tests serve as regression guard. Visual verification requires running the dev server.

---

## Task 1: UIScene — Help text size + L2 level name strings

**Files:**
- Modify: `src/scenes/UIScene.ts:154-156, 241-244, 409`

**Note:** These are pure string/value changes. No logic to unit-test. Verification: `npx tsc --noEmit` + visual check in browser.

- [ ] **Step 1: Make the 4 string/value edits in UIScene.ts**

  **Edit 1** — Controls hint text (line ~155): change `fontSize` and `color`:
  ```ts
  // Before:
  this.add.text(PAD, H - PAD, 'A/D move  SPACE jump/jetpack  LMB turret  RMB rapid  SHIFT missile  ESC pause', {
    fontFamily: 'monospace', fontSize: '9px', color: '#334455',
  }).setOrigin(0, 1);

  // After:
  this.add.text(PAD, H - PAD, 'A/D move  SPACE jump/jetpack  LMB turret  RMB rapid  SHIFT missile  ESC pause', {
    fontFamily: 'monospace', fontSize: '15px', color: '#556677',
  }).setOrigin(0, 1);
  ```

  **Edit 2** — L2 level name string (line ~241):
  ```ts
  // Before:
  const levelName = levelNum === 2 ? 'SUBSURFACE' : 'SURFACE OPS';
  // After:
  const levelName = levelNum === 2 ? 'DARK SIDE' : 'SURFACE OPS';
  ```

  **Edit 3** — L2 level name flash color (line ~244):
  ```ts
  // Before:
  color: levelNum === 2 ? '#00ff66' : '#6699ff',
  // After:
  color: levelNum === 2 ? '#aa66ff' : '#6699ff',
  ```

  **Edit 4** — Level-complete transition text in `showLevelComplete()` (line ~409):
  ```ts
  // Before:
  const nextName = level === 1 ? 'DESCENDING TO SUBSURFACE…' : 'ALL CLEAR';
  // After:
  const nextName = level === 1 ? 'DESCENDING TO DARK SIDE…' : 'ALL CLEAR';
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 3: Run existing tests**

  Run: `npx vitest run`
  Expected: all pass

- [ ] **Step 4: Commit**

  ```bash
  git add src/scenes/UIScene.ts
  git commit -m "feat: larger help text, rename L2 level to DARK SIDE with purple flash"
  ```

---

## Task 2: GameScene — Parallax rebuild (fields + makeBackground + makeBackgroundL2 + updateParallax)

**Files:**
- Modify: `src/scenes/GameScene.ts:34-35` (field declarations)
- Modify: `src/scenes/GameScene.ts:440-524` (background methods + updateParallax)

**Important:** The field rename (`bgFar`/`bgNear` → `bgStars`/`bgTerrain`/`bgHaze`) and both background methods must be changed in a single commit — they're mutually dependent. Do all sub-steps before compiling.

- [ ] **Step 1: Rename field declarations (lines 34-35)**

  ```ts
  // Before:
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;

  // After:
  private bgStars!: Phaser.GameObjects.TileSprite;
  private bgTerrain!: Phaser.GameObjects.TileSprite;
  private bgHaze?: Phaser.GameObjects.TileSprite;
  ```

- [ ] **Step 2: Replace makeBackground() (lines 440–467)**

  Replace the entire method body:
  ```ts
  private makeBackground(): void {
    // Sky
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x030318)
      .setDepth(0).setScrollFactor(0);

    // Dedup texture keys on scene restart (instance is reused, not reconstructed)
    for (const key of ['bgStars', 'bgTerrain', 'bgHaze']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }

    // Layer 1: starfield — 420+ 1px dots, random alpha 0.25–0.55
    const starsGfx = this.make.graphics({ x: 0, y: 0, add: false });
    for (let i = 0; i < 420; i++) {
      starsGfx.fillStyle(0xffffff, 0.25 + Math.random() * 0.30);
      starsGfx.fillRect(
        Phaser.Math.Between(0, GAME_W - 1),
        Phaser.Math.Between(0, GROUND_Y - 1),
        1, 1,
      );
    }
    starsGfx.generateTexture('bgStars', GAME_W, GROUND_Y);
    starsGfx.destroy();
    this.bgStars = this.add.tileSprite(GAME_W / 2, GROUND_Y / 2, GAME_W, GROUND_Y, 'bgStars')
      .setDepth(1).setScrollFactor(0);

    // Layer 2: crater terrain silhouette (200px tall, bottom edge at GROUND_Y)
    // Craters are cut into the bottom edge using arc() — darker color overlaid on baseline.
    // Each crater: upper-semicircle arc (slice PI→0 clockwise) centered at y=200 (bottom edge),
    // so the bowl shape cuts upward into the terrain.
    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    const terrainGfx = this.make.graphics({ x: 0, y: 0, add: false });
    terrainGfx.fillStyle(0x0d0d1e, 1);
    terrainGfx.fillRect(0, 0, GAME_W, 200);
    for (let i = 0; i < 7; i++) {
      const cx = hash(i + 200) * GAME_W;
      const cr = 30 + hash(i + 400) * 50;
      // Center at bottom edge (y=200); upper semicircle cuts upward into terrain
      terrainGfx.fillStyle(0x070710, 1);
      terrainGfx.slice(cx, 200, cr, Math.PI, 0, false); // clockwise PI→0 = upper semicircle
      terrainGfx.fillPath();
    }
    terrainGfx.generateTexture('bgTerrain', GAME_W, 200);
    terrainGfx.destroy();
    this.bgTerrain = this.add.tileSprite(GAME_W / 2, GROUND_Y, GAME_W, 200, 'bgTerrain')
      .setDepth(2).setOrigin(0.5, 1).setScrollFactor(0);

    // Layer 3: dust haze — 8-strip vertical gradient (120px tall, bottom edge at GROUND_Y)
    const hazeGfx = this.make.graphics({ x: 0, y: 0, add: false });
    for (let i = 0; i < 8; i++) {
      hazeGfx.fillStyle(0x1a1a2e, (1 - i / 8) * 0.35);
      hazeGfx.fillRect(0, i * 15, GAME_W, 15);
    }
    hazeGfx.generateTexture('bgHaze', GAME_W, 120);
    hazeGfx.destroy();
    this.bgHaze = this.add.tileSprite(GAME_W / 2, GROUND_Y, GAME_W, 120, 'bgHaze')
      .setDepth(3).setOrigin(0.5, 1).setScrollFactor(0);
  }
  ```

- [ ] **Step 3: Replace makeBackgroundL2() (lines 479–505)**

  Replace the entire method body:
  ```ts
  private makeBackgroundL2(): void {
    // Cold dark sky
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x010112)
      .setDepth(0).setScrollFactor(0);

    // Dedup texture keys on restart
    for (const key of ['bgStarsL2', 'bgTerrainL2']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }

    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    // Starfield — 520 dots, cold blue tint #aabbff
    const starsGfx = this.make.graphics({ x: 0, y: 0, add: false });
    for (let i = 0; i < 520; i++) {
      starsGfx.fillStyle(0xaabbff, 0.20 + Math.random() * 0.25);
      starsGfx.fillRect(
        Phaser.Math.Between(0, GAME_W - 1),
        Phaser.Math.Between(0, GROUND_Y - 1),
        1, 1,
      );
    }
    starsGfx.generateTexture('bgStarsL2', GAME_W, GROUND_Y);
    starsGfx.destroy();
    this.bgStars = this.add.tileSprite(GAME_W / 2, GROUND_Y / 2, GAME_W, GROUND_Y, 'bgStarsL2')
      .setDepth(1).setScrollFactor(0);

    // Jagged terrain silhouette — larger craters (arc cuts), angular peaks, cold baseline #080815
    const terrainGfx = this.make.graphics({ x: 0, y: 0, add: false });
    terrainGfx.fillStyle(0x080815, 1);
    terrainGfx.fillRect(0, 0, GAME_W, 200);
    for (let i = 0; i < 8; i++) {
      const cx = hash(i + 500) * GAME_W;
      const cr = 40 + hash(i + 700) * 60;
      // Crater: upper-semicircle arc cut into bottom edge (same pattern as L1, larger radius)
      terrainGfx.fillStyle(0x040410, 1);
      terrainGfx.slice(cx, 200, cr, Math.PI, 0, false);
      terrainGfx.fillPath();
      // Angular peak between craters — triangle protrusion from bottom edge
      const px = hash(i + 800) * GAME_W;
      const ph = 10 + hash(i + 900) * 10;
      terrainGfx.fillStyle(0x0a0a18, 1);
      terrainGfx.fillTriangle(px - 12, 200, px + 12, 200, px, 200 - ph);
    }
    terrainGfx.generateTexture('bgTerrainL2', GAME_W, 200);
    terrainGfx.destroy();
    this.bgTerrain = this.add.tileSprite(GAME_W / 2, GROUND_Y, GAME_W, 200, 'bgTerrainL2')
      .setDepth(2).setOrigin(0.5, 1).setScrollFactor(0);
    // bgHaze intentionally left undefined for L2 (no atmospheric scattering)
  }
  ```

- [ ] **Step 4: Replace updateParallax() (lines 520–524)**

  ```ts
  private updateParallax(): void {
    const sx = this.cameras.main.scrollX;
    this.bgStars.setTilePosition(sx * 0.05, 0);
    this.bgTerrain.setTilePosition(sx * 0.20, 0);
    if (this.bgHaze) this.bgHaze.setTilePosition(sx * 0.35, 0);
  }
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors (if errors appear, all four edits in Steps 1–4 must be consistent)

- [ ] **Step 6: Run existing tests**

  Run: `npx vitest run`
  Expected: all pass

- [ ] **Step 7: Commit**

  ```bash
  git add src/scenes/GameScene.ts
  git commit -m "feat: replace dot-scatter parallax with 3-layer lunar surface (L1) and cold dark-side (L2)"
  ```

---

## Task 3: GameScene — L2 core rebuild + platform system refactor

**Files:**
- Modify: `src/scenes/GameScene.ts` (multiple sections)

**All edits in this task must be committed atomically** — removing `makeShaftLedges()` and updating `addStructure()` type would break TypeScript if the L2 `create()` branch still called `makeShaftLedges()`.

- [ ] **Step 1: Update addStructure() signature — replace 'green' with 'purple' (line 561)**

  Replace the entire `addStructure` method signature and color table:
  ```ts
  // Before:
  private addStructure(x: number, y: number, w: number, palette: 'blue' | 'green' = 'blue'): void {
    const bodyColor   = palette === 'green' ? 0x0a2010 : 0x1c2040;
    const slabColor   = palette === 'green' ? 0x051008 : 0x12122e;
    const postColor   = palette === 'green' ? 0x1a4028 : 0x2a3a5a;
    const glowColor   = palette === 'green' ? 0x00ff66 : 0x7799ff;
    const accentColor = palette === 'green' ? 0x0a3018 : 0x334466;
    const lightColor  = palette === 'green' ? 0x44ff44 : 0xff8800;

  // After:
  private addStructure(x: number, y: number, w: number, palette: 'blue' | 'purple' = 'blue'): void {
    const bodyColor   = palette === 'purple' ? 0x1a0d2e : 0x1c2040;
    const slabColor   = palette === 'purple' ? 0x100820 : 0x12122e;
    const postColor   = palette === 'purple' ? 0x2a1a44 : 0x2a3a5a;
    const glowColor   = palette === 'purple' ? 0xaa66ff : 0x7799ff;
    const accentColor = palette === 'purple' ? 0x3a2255 : 0x334466;
    const lightColor  = palette === 'purple' ? 0xff3355 : 0xff8800;
  ```
  (The rest of addStructure body is unchanged.)

- [ ] **Step 2: Update makePlatforms() signature and internals (lines 526–559)**

  Replace the entire method:
  ```ts
  private makePlatforms(
    palette: 'blue' | 'purple' = 'blue',
    counts: { low: number; mid: number; high: number } = { low: 15, mid: 12, high: 8 },
  ): void {
    this.platformData = [];

    const hash = (n: number): number =>
      ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    const configs = [
      { ...PLATFORM_BANDS[0], count: counts.low,  minW: 100, maxW: 160 },
      { ...PLATFORM_BANDS[1], count: counts.mid,  minW:  80, maxW: 130 },
      { ...PLATFORM_BANDS[2], count: counts.high, minW:  60, maxW: 100 },
    ];

    configs.forEach(({ yMin, yMax, count, minW, maxW }, bandIdx) => {
      const span    = 5600;
      const spacing = span / count;
      let lastX     = 200;

      for (let i = 0; i < count; i++) {
        const seed = bandIdx * 100 + i;
        const rawX = 400 + i * spacing + hash(seed) * spacing * 0.6;
        const w    = minW + hash(seed + 2000) * (maxW - minW);
        const x    = Math.min(
          i === 0 ? rawX : Math.max(lastX + 200, rawX),
          6000 - w / 2,
        );
        lastX = x;
        const y = yMin + hash(seed + 1000) * (yMax - yMin);
        this.platformData.push({ x, y, w });
        this.addStructure(x, y, w, palette);
      }
    });
  }
  ```

- [ ] **Step 3: Delete makeShaftLedges() entirely (lines 507–518)**

  Remove the following method completely:
  ```ts
  private makeShaftLedges(): void {
    if (!this.ground) this.ground = this.physics.add.staticGroup();
    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    for (let i = 0; i < 18; i++) {
      const w = 200 + hash(i) * 140;
      const x = i % 2 === 0 ? w / 2 : GAME_W - w / 2;
      const y = 600 + i * 200 + hash(i + 100) * 80;
      this.addStructure(x, y, w, 'green');
    }
  }
  ```

- [ ] **Step 4: Remove cameraBoundMaxY field declaration (line 38)**

  ```ts
  // Delete this line:
  private cameraBoundMaxY = GAME_H;
  ```

- [ ] **Step 5: Remove cameraBoundMaxY reset in create() (line 59)**

  ```ts
  // Delete this line from the reset block at the top of create():
  this.cameraBoundMaxY = GAME_H;
  ```

- [ ] **Step 6: Update L2 create() branch (lines 110–137)**

  Replace:
  ```ts
  if (this.currentLevel === 2) {
    this.physics.world.setBounds(0, 0, GAME_W, 4800);
    this.makeBackgroundL2();
    this.makeGroundL2();
    this.makeShaftLedges();
  } else {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);
    // --- Background ---
    this.makeBackground();
    // --- Ground ---
    this.ground = this.physics.add.staticGroup();
    ...
    this.makePlatforms();
  }
  ```

  With:
  ```ts
  if (this.currentLevel === 2) {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.makeBackgroundL2();
    this.makeGroundL2();
    this.makePlatforms('purple', { low: 18, mid: 15, high: 10 });
  } else {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);

    // --- Background ---
    this.makeBackground();

    // --- Ground ---
    this.ground = this.physics.add.staticGroup();
    const groundRect = this.add.rectangle(
      WORLD_WIDTH / 2,
      GROUND_Y + GROUND_HEIGHT / 2,
      WORLD_WIDTH,
      GROUND_HEIGHT,
      0x1a1a3a,
    ).setDepth(4);
    this.ground.add(groundRect);
    this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 1, WORLD_WIDTH, 2, 0x4444cc).setDepth(5);

    // --- Platforms ---
    this.makePlatforms();
  }
  ```

- [ ] **Step 7: Update spawn Y (line 174)**

  ```ts
  // Before:
  const spawnY = this.currentLevel === 2 ? 200 : GROUND_Y - 5;
  // After:
  const spawnY = GROUND_Y - 5; // same for both levels — L2 is now a surface level
  ```

- [ ] **Step 8: Simplify camera setup (lines 236–242) — both levels now identical**

  ```ts
  // Before (if/else):
  if (this.currentLevel === 2) {
    this.cameras.main.setBounds(0, 0, GAME_W, this.cameraBoundMaxY);
    this.cameras.main.startFollow(this.player, false, 0.10, 0.10);
  } else {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, false, 0.12, 0.08);
  }

  // After (both levels use surface-level bounds):
  this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  this.cameras.main.startFollow(this.player, false, 0.12, 0.08);
  ```

- [ ] **Step 9: Remove L2 camera expansion from waveCleared handler (lines 293–299)**

  In `this.events.on('waveCleared', ...)`, delete the entire L2 expansion block:
  ```ts
  // Delete these lines:
  if (this.currentLevel === 2) {
    this.cameraBoundMaxY = Math.min(4800, this.cameraBoundMaxY + 480);
    this.cameras.main.setBounds(0, 0, GAME_W, this.cameraBoundMaxY);
    this.physics.world.setBounds(0, 0, GAME_W, this.cameraBoundMaxY);
  }
  ```
  Keep the upgrade card launch block intact.

- [ ] **Step 10: Replace makeGroundL2() body (lines 469–477)**

  Replace the entire method body:
  ```ts
  private makeGroundL2(): void {
    this.ground = this.physics.add.staticGroup();
    const groundRect = this.add.rectangle(
      WORLD_WIDTH / 2,
      GROUND_Y + GROUND_HEIGHT / 2,
      WORLD_WIDTH,
      GROUND_HEIGHT,
      0x0d0a20,
    ).setDepth(4);
    this.ground.add(groundRect);
    // Purple glow line (visual only — not added to physics group)
    this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 1, WORLD_WIDTH, 2, 0x6633cc).setDepth(5);
  }
  ```

- [ ] **Step 11: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors (type errors from cameraBoundMaxY references mean a reference was missed — search for `cameraBoundMaxY` in the file)

- [ ] **Step 12: Run existing tests**

  Run: `npx vitest run`
  Expected: all pass

- [ ] **Step 13: Commit**

  ```bash
  git add src/scenes/GameScene.ts
  git commit -m "feat: L2 rebuilt as surface level, purple platform palette, remove shaft ledges"
  ```

---

## Task 4: GameScene — makeBaseProps() Moon Base props

**Files:**
- Modify: `src/scenes/GameScene.ts` (new method + 2 call sites in create())

**Note:** This task adds a new ~80-line method. The Phaser APIs used:
- `this.add.graphics().setDepth(3.5).setPosition(x, y)` — create a Graphics object at world position
- `g.fillStyle(color, alpha)` — set fill color
- `g.slice(x, y, radius, startAngle, endAngle, anticlockwise)` + `g.fillPath()` — filled pie/arc shape
- `g.lineStyle(width, color, alpha)` + `g.lineBetween(x1, y1, x2, y2)` — line
- `g.fillRect(x, y, w, h)` — filled rectangle (relative to Graphics position)
- `g.fillCircle(x, y, r)` — filled circle
- `g.fillEllipse(x, y, w, h)` — filled ellipse
- `g.setAngle(degrees)` — rotate around the Graphics object's position (set via setPosition)

**Dome semicircle:** `g.slice(0, 0, r, Math.PI, 0, false)` draws a pie from 180° to 0° clockwise (passes through 270°/top), giving the upper half. Call `g.fillPath()` after.

- [ ] **Step 1: Add makeBaseProps() method to GameScene**

  Add the following new private method anywhere after `makeGroundL2()`:

  ```ts
  private makeBaseProps(damageLevel: 'low' | 'high' = 'low'): void {
    const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    // ── Habitat Domes (8) ─────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const x   = Math.max(200, Math.min(6200, 300 + i * 725 + (hash(i + 10) * 400 - 200)));
      const r   = 50 + hash(i + 20) * 50;
      const dmg = damageLevel === 'high' ? hash(i + 30) < 0.67 : hash(i + 30) < 0.33;
      const g   = this.add.graphics().setDepth(3.5).setPosition(x, GROUND_Y);

      // Dome shell — upper semicircle (clockwise arc PI→0 passes through top)
      g.fillStyle(0x12122e, 1);
      g.slice(0, 0, r, Math.PI, 0, false);
      g.fillPath();

      // Inner glow (60% radius)
      g.fillStyle(0x0d0d25, 1);
      g.slice(0, 0, r * 0.6, Math.PI, 0, false);
      g.fillPath();

      // Panel lines — radial from center to rim
      const lineCount = 4 + Math.floor(hash(i + 40) * 3);
      g.lineStyle(1, 0x2a2a50, 1);
      for (let l = 0; l < lineCount; l++) {
        if (dmg && l === 1) continue; // leave a gap for damaged domes
        const a = -Math.PI + (Math.PI * (l + 1)) / (lineCount + 1);
        g.lineBetween(0, 0, Math.cos(a) * r, Math.sin(a) * r);
      }

      // Base plate (at ground level = y:0 in local coords since position is GROUND_Y)
      g.fillStyle(0x1a1a3a, 1);
      g.fillRect(-r - 10, 0, r * 2 + 20, 12);

      // Airlock nub
      g.fillStyle(0x1e1e44, 1);
      g.fillRect(-7, -18, 14, 18);

      // Window dot at upper-center
      g.fillStyle(dmg ? 0xff2200 : 0x4488ff, dmg ? 1 : 0.6);
      g.fillCircle(0, -r * 0.65, 4);

      // Crack for damaged domes
      if (dmg) {
        g.lineStyle(1, 0xff4400, 0.7);
        const crackA = -Math.PI * 0.7;
        g.lineBetween(
          Math.cos(crackA) * r * 0.9, Math.sin(crackA) * r * 0.9,
          Math.cos(crackA) * r * 0.3 + hash(i + 60) * 10 - 5,
          Math.sin(crackA) * r * 0.3,
        );
      }
    }

    // ── Communication Towers (6) ─────────────────────────────────────
    for (let i = 0; i < 6; i++) {
      const x   = Math.max(300, Math.min(6000, 500 + i * 900 + (hash(i + 110) * 300 - 150)));
      const mh  = 80 + hash(i + 120) * 60; // mast height 80–140px
      const dmg = damageLevel === 'high' ? true : hash(i + 130) < 0.5;
      const g   = this.add.graphics().setDepth(3.5).setPosition(x, GROUND_Y);
      if (dmg) g.setAngle(hash(i + 140) * 12 - 6); // −6° to +6° lean

      // Base block
      g.fillStyle(0x1e2040, 1);
      g.fillRect(-10, -10, 20, 10);

      // Mast — drawn upward from origin so setAngle rotates around base
      g.fillStyle(0x1e2040, 1);
      g.fillRect(-3, -mh, 6, mh);

      // Support struts (undamaged towers only)
      if (!dmg) {
        g.lineStyle(1, 0x1a1a38, 1);
        g.lineBetween(0, -mh * 0.6, -25, 0);
        g.lineBetween(0, -mh * 0.6, 25, 0);
      }

      // Dish or broken stub
      if (!dmg) {
        g.fillStyle(0x252545, 1);
        g.fillEllipse(0, -mh, 28, 14);
        g.lineStyle(1, 0x3a3a60, 1);
        g.lineBetween(-14, -mh, 14, -mh);
      } else {
        g.fillStyle(0x252545, 1);
        g.fillEllipse(0, -mh, 14, 6);
        g.lineStyle(1, 0x3a3a60, 1);
        g.lineBetween(-7, -mh, 7, -mh + 5);
      }
    }

    // ── Solar Array Clusters (5) ─────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const cx   = Math.max(300, Math.min(6000, 400 + i * 1100 + (hash(i + 210) * 300 - 150)));
      const cnt  = 3 + Math.floor(hash(i + 220) * 3); // 3–5 panels
      const miss = damageLevel === 'high' ? 0.5 : 0;

      for (let p = 0; p < cnt; p++) {
        if (miss > 0 && hash(i * 100 + p + 230) < miss) continue;
        const px = cx + (p - (cnt - 1) / 2) * 44;

        const g = this.add.graphics().setDepth(3.5);
        g.fillStyle(0x1a1a38, 1);
        g.fillRect(px - 2, GROUND_Y - 40, 4, 40);

        // Panel tilted 30° (rotates around center of rectangle)
        this.add.rectangle(px, GROUND_Y - 40, 32, 10, 0x1a2840)
          .setDepth(3.5).setAngle(30);

        // Panel highlight
        this.add.rectangle(px, GROUND_Y - 44, 30, 1, 0x334466)
          .setDepth(3.6).setAngle(30);
      }
    }
  }
  ```

- [ ] **Step 2: Add call site in the L1 branch of create()**

  After `this.makePlatforms();` in the L1 else-branch, add:
  ```ts
  this.makeBaseProps(); // 'low' damage — default
  ```

- [ ] **Step 3: Add call site in the L2 branch of create()**

  After `this.makePlatforms('purple', { low: 18, mid: 15, high: 10 });` in the L2 if-branch, add:
  ```ts
  this.makeBaseProps('high'); // more damage — dark side is ruined
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 5: Run existing tests**

  Run: `npx vitest run`
  Expected: all pass

- [ ] **Step 6: Visual verification checklist**

  Run: `npm run dev` and open in browser.

  L1 checks:
  - [ ] Starfield — small 1px dots (no blobs), parallax slower than terrain
  - [ ] Crater terrain — dark silhouette at ground level, scrolls faster than stars
  - [ ] Dust haze — subtle gradient strip above ground, scrolls fastest
  - [ ] Props visible at depth between haze and platforms
  - [ ] 8 habitat domes distributed across the world, some damaged with red cracks
  - [ ] 6 comm towers, some tilted, all with masts/dishes/struts
  - [ ] 5 solar clusters with tilted panels
  - [ ] Controls hint text noticeably larger

  L2 checks:
  - [ ] Camera follows player horizontally (no more vertical shaft)
  - [ ] Cold near-black #010112 sky
  - [ ] Cold blue tinted starfield (no green dots)
  - [ ] Purple ground glow line
  - [ ] Purple-glowing platforms
  - [ ] Props more damaged than L1 (2/3 domes cracked, all towers tilted)
  - [ ] Level name flash shows "DARK SIDE" in purple (not green "SUBSURFACE")
  - [ ] Level-complete text says "DESCENDING TO DARK SIDE…"

- [ ] **Step 7: Commit**

  ```bash
  git add src/scenes/GameScene.ts
  git commit -m "feat: add Moon Base props (domes, towers, solar arrays) for L1 and L2"
  ```
