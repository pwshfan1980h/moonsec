# Platforms + Jetpack FX + Radar Minimap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add floating platforms for verticality, dual-flame jetpack particles, and a local radar minimap with enemy blips, sweep line, missile lock, and ping ripples.

**Architecture:** Platforms are `Rectangle` GameObjects added to the existing `StaticGroup` (one-way top collision only). Jetpack particles are two `ParticleEmitter` instances on `Player` toggled via `setEmitting`. The radar is a `MinimapRenderer` class owned by `UIScene`, drawing to a `Graphics` object cleared and redrawn every tick.

**Tech Stack:** Phaser 3.80, TypeScript strict mode, Vite 5. No test framework — verification is `tsc --noEmit` plus visual browser checks. Dev server runs at `http://localhost:5173` via `npm run dev`.

---

## File Map

| File | Change | Responsibility |
|------|--------|----------------|
| `src/constants.ts` | Modify | Add `PLATFORM_BANDS`, radar constants, `MISSILE_SEEK_RANGE` |
| `src/scenes/GameScene.ts` | Modify | Add `platformData[]`, `makePlatforms()` |
| `src/entities/Drone.ts` | Modify | Add `getState()` public getter |
| `src/entities/Player.ts` | Modify | Add jetpack emitters, toggle in `update()`, `destroy()` cleanup |
| `src/ui/MinimapRenderer.ts` | **Create** | All radar drawing logic |
| `src/scenes/UIScene.ts` | Modify | Add `update()`, instantiate `MinimapRenderer` |

---

## Task 1: Expand Constants

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Add platform and radar constants**

Replace the entire file with:

```ts
export const WORLD_WIDTH = 6400;
export const WORLD_HEIGHT = 450;
export const GROUND_Y = 400;       // top surface of ground
export const GROUND_HEIGHT = 50;
export const MECH_SCALE = 0.75;
export const DRONE_SCALE_RED = 2.2;   // Viper 34x24 → ~75x53
export const DRONE_SCALE_GREEN = 2.2; // Hornet 30x25 → ~66x55

// Platform height bands (world Y — lower Y = higher on screen)
export const PLATFORM_BANDS = [
  { yMin: 280, yMax: 320 }, // low   — one jump from ground
  { yMin: 200, yMax: 250 }, // mid   — requires jetpack assist
  { yMin: 130, yMax: 180 }, // high  — full jetpack required
] as const;

// Radar minimap
export const RADAR_WORLD_RADIUS = 320;  // world units visible around player
export const RADAR_SCREEN_RADIUS = 65;  // px radius of drawn circle (right edge = 725+65=790, 10px from 800px canvas)
export const RADAR_X = 725;             // screen-space center X
export const RADAR_Y = 370;             // screen-space center Y

// Must stay in sync with the non-exported SEEK_RANGE const in src/weapons/HomingMissile.ts
export const MISSILE_SEEK_RANGE = 650;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "feat: add platform band, radar, and missile range constants"
```

---

## Task 2: Floating Platforms

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add `platformData` public field and `makePlatforms()` method**

Add the public field declaration near the top of `GameScene` (after the existing private fields):

```ts
platformData: { x: number; y: number; w: number }[] = [];
```

Add the import for `PLATFORM_BANDS` — update the existing constants import line:

```ts
import { WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT, PLATFORM_BANDS } from '../constants';
```

Add the two private methods at the bottom of the class (before the closing `}`):

```ts
private makePlatforms(): void {
  this.platformData = [];

  // Deterministic hash: maps any integer to a stable float in [0, 1)
  const hash = (n: number): number =>
    ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

  const configs = [
    { ...PLATFORM_BANDS[0], count: 15, minW: 100, maxW: 160 },
    { ...PLATFORM_BANDS[1], count: 12, minW:  80, maxW: 130 },
    { ...PLATFORM_BANDS[2], count:  8, minW:  60, maxW: 100 },
  ];

  configs.forEach(({ yMin, yMax, count, minW, maxW }, bandIdx) => {
    const span = 5600; // x from 400 to 6000
    const spacing = span / count;
    let lastX = 0; // track last placed X per band to enforce 200px min gap

    for (let i = 0; i < count; i++) {
      const seed = bandIdx * 100 + i;
      const rawX = 400 + i * spacing + hash(seed) * spacing * 0.6;
      // Enforce 200px minimum gap between adjacent platforms in this band
      const x = i === 0 ? rawX : Math.max(lastX + 200, rawX);
      lastX = x;
      const y = yMin + hash(seed + 1000) * (yMax - yMin);
      const w = minW + hash(seed + 2000) * (maxW - minW);
      this.platformData.push({ x, y, w });
      this.addPlatform(x, y, w);
    }
  });
}

private addPlatform(x: number, y: number, w: number): void {
  const h = 8;
  const rect = this.add.rectangle(x, y, w, h, 0x2a2a5a).setDepth(4);
  this.ground.add(rect);

  // One-way: only the top surface blocks the player
  const body = rect.body as Phaser.Physics.Arcade.StaticBody;
  body.checkCollision.down  = false;
  body.checkCollision.left  = false;
  body.checkCollision.right = false;

  // Glow line — intentionally slightly lighter than ground glow (0x4444cc)
  this.add.rectangle(x, y - h / 2 + 1, w, 2, 0x5555dd).setDepth(5);
}
```

- [ ] **Step 2: Confirm `this.ground` is a StaticGroup**

`addPlatform` accesses `rect.body` immediately after `this.ground.add(rect)`. This only works if `this.ground` is a physics StaticGroup (which auto-creates bodies on `add()`). Confirm in `GameScene.ts` that the declaration reads:

```ts
this.ground = this.physics.add.staticGroup();
```

It does — no change needed. Just confirming before proceeding.

- [ ] **Step 3: Call `makePlatforms()` from `create()`**

In `GameScene.create()`, add a call right after the ground setup block (after the ground glow line at the bottom of the ground section, before the physics groups):

```ts
// --- Platforms ---
this.makePlatforms();
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Visual check — platforms appear**

Open `http://localhost:5173`. Walk/jetpack around the world. You should see:
- ~35 dark blue-grey rectangles at three height tiers
- A subtle `0x5555dd` glow line on top of each
- Player can land on them from above
- Player can jump *through* them from below (one-way)
- Drone bullets pass through without collision

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: add one-way floating platforms across world"
```

---

## Task 3: Drone State Getter

**Files:**
- Modify: `src/entities/Drone.ts`

The radar needs to read a drone's current state to pulse its blip during ATTACK. `droneState` is private — expose it via a getter.

- [ ] **Step 1: Add `getState()` to Drone**

In `src/entities/Drone.ts`, add this method inside the class body (after `startPatrol`):

```ts
getState(): DroneState {
  return this.droneState;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/entities/Drone.ts
git commit -m "feat: expose drone state getter for radar minimap"
```

---

## Task 4: Jetpack Visual Effects

**Files:**
- Modify: `src/entities/Player.ts`

Two `ParticleEmitter` instances (orange inner core + cyan outer glow) fired downward from the mech's thruster when the jetpack is active.

- [ ] **Step 1: Add emitter fields**

In `src/entities/Player.ts`, add two private fields below the existing weapon fields:

```ts
private jetpackInner!: Phaser.GameObjects.Particles.ParticleEmitter;
private jetpackOuter!: Phaser.GameObjects.Particles.ParticleEmitter;
```

- [ ] **Step 2: Create emitters in the constructor**

At the bottom of the constructor (after `this.play('idle')`), add:

```ts
// Jetpack flame emitters — orange core + cyan outer glow
this.jetpackInner = scene.add.particles(0, 0, 'pixel', {
  speed:    { min: 60, max: 120 },
  angle:    { min: 80, max: 100 },  // downward ±10°
  scale:    { start: 2.5, end: 0 },
  alpha:    { start: 1, end: 0 },
  tint:     [0xff6600, 0xff2200, 0xffaa00],
  lifespan: 120,
  frequency: 20,
  blendMode: 'ADD',
  emitting:  false,
}).setDepth(9);

this.jetpackOuter = scene.add.particles(0, 0, 'pixel', {
  speed:    { min: 40, max: 90 },
  angle:    { min: 65, max: 115 }, // downward ±25°
  scale:    { start: 3, end: 0 },
  alpha:    { start: 0.7, end: 0 },
  tint:     [0x00aaff, 0x0044ff, 0x44eeff],
  lifespan: 180,
  frequency: 25,
  blendMode: 'ADD',
  emitting:  false,
}).setDepth(8);
```

- [ ] **Step 3: Toggle emitters in `update()`**

In `update()`, add the emitter update block **before** the `hurtLock` early-return (so the flame shuts off during hurt animation). Insert after the jump/jetpack block and before `if (this.hurtLock > 0)`:

```ts
// --- Jetpack flame ---
// Must be before hurtLock guard so flame turns off during hurt animation
const jetpackActive = space && !this.onGround && this.jetpackFuel > 0;
const thrustX = this.x + (this.flipX ? 12 : -12); // behind mech
const thrustY = this.y - 60;                        // ~53% up from feet
this.jetpackInner.setPosition(thrustX, thrustY).setEmitting(jetpackActive);
this.jetpackOuter.setPosition(thrustX, thrustY).setEmitting(jetpackActive);
```

- [ ] **Step 4: Add `destroy()` override**

Add at the bottom of the class (before the closing `}`):

```ts
destroy(fromScene?: boolean): void {
  this.jetpackInner.destroy();
  this.jetpackOuter.destroy();
  super.destroy(fromScene);
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Visual check — jetpack flame**

Open `http://localhost:5173`. Jump and hold Space mid-air:
- Orange/red particles fire downward from behind the mech torso
- Cyan/blue particles fan out slightly wider
- Both stop immediately when landing or releasing Space
- When facing left, exhaust appears behind the mech (to the right)
- Take damage — flame stops during hurt flash, resumes when hurt ends
- Die and press R to restart — no particle accumulation on subsequent runs

- [ ] **Step 7: Commit**

```bash
git add src/entities/Player.ts
git commit -m "feat: add dual-flame jetpack particle effect (orange core + cyan glow)"
```

---

## Task 5: MinimapRenderer

**Files:**
- Create: `src/ui/MinimapRenderer.ts`

All radar drawing in one focused class. Single public method `draw(time, game)` called every frame.

- [ ] **Step 1: Create `src/ui/MinimapRenderer.ts`**

```ts
import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Drone } from '../entities/Drone';
import {
  RADAR_WORLD_RADIUS,
  RADAR_SCREEN_RADIUS,
  RADAR_X,
  RADAR_Y,
  MISSILE_SEEK_RANGE,
  GROUND_Y,
} from '../constants';

interface Ping {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

export class MinimapRenderer {
  private gfx: Phaser.GameObjects.Graphics;
  private sweepAngle = 0;
  private pings: Ping[] = [];
  private prevInRange = new Set<object>();

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(100);
  }

  draw(time: number, game: GameScene): void {
    const gfx = this.gfx;
    gfx.clear();

    const player = game.player;
    const px = player.x;
    const py = player.y;
    const R  = RADAR_SCREEN_RADIUS;
    const scale = R / RADAR_WORLD_RADIUS;

    // Project a world coordinate to radar screen space
    const proj = (wx: number, wy: number) => ({
      x: RADAR_X + (wx - px) * scale,
      y: RADAR_Y + (wy - py) * scale,
    });

    // Chord half-width at a given screen Y (for clipping horizontal lines)
    const chordHW = (screenY: number): number => {
      const dy = screenY - RADAR_Y;
      return Math.sqrt(Math.max(0, R * R - dy * dy));
    };

    // ── 1. Background + concentric rings ──────────────────────────
    gfx.fillStyle(0x001122, 0.82);
    gfx.fillCircle(RADAR_X, RADAR_Y, R);

    gfx.lineStyle(1, 0x003344, 0.4);
    gfx.strokeCircle(RADAR_X, RADAR_Y, R * 0.5);

    gfx.lineStyle(1, 0x0088aa, 0.7);
    gfx.strokeCircle(RADAR_X, RADAR_Y, R);

    // ── 2. Ground line (clipped to circle) ────────────────────────
    const groundProj = proj(px, GROUND_Y);
    const ghw = chordHW(groundProj.y);
    if (ghw > 0) {
      gfx.lineStyle(1, 0x4444cc, 0.5);
      gfx.lineBetween(RADAR_X - ghw, groundProj.y, RADAR_X + ghw, groundProj.y);
    }

    // ── 3. Platform blips (clipped to circle) ─────────────────────
    for (const plat of game.platformData) {
      const pp = proj(plat.x, plat.y);
      const dy = pp.y - RADAR_Y;
      if (Math.abs(dy) >= R) continue;
      const phw = chordHW(pp.y);
      const half = Math.min((plat.w * scale) / 2, phw);
      if (half <= 0) continue;
      gfx.lineStyle(1, 0x5555dd, 0.6);
      gfx.lineBetween(pp.x - half, pp.y, pp.x + half, pp.y);
    }

    // ── 4. Sweep line ─────────────────────────────────────────────
    this.sweepAngle += 0.04; // ~0.38 full rotations/sec at 60fps
    gfx.lineStyle(1, 0x00ffaa, 0.35);
    gfx.lineBetween(
      RADAR_X,
      RADAR_Y,
      RADAR_X + Math.cos(this.sweepAngle) * R,
      RADAR_Y + Math.sin(this.sweepAngle) * R,
    );

    // ── 5. Enemy blips ────────────────────────────────────────────
    // Find missile lock candidate (nearest active drone within MISSILE_SEEK_RANGE of player)
    let lockTarget: Drone | null = null;
    let lockDist = MISSILE_SEEK_RANGE;

    game.drones.getChildren().forEach((go) => {
      const drone = go as unknown as Drone;
      if (!drone.active) return;
      const d = Phaser.Math.Distance.Between(px, py, drone.x, drone.y);
      if (d < lockDist) { lockDist = d; lockTarget = drone; }
    });

    const currentInRange = new Set<object>();

    game.drones.getChildren().forEach((go) => {
      const drone = go as unknown as Drone;
      if (!drone.active) return;

      const worldDist = Phaser.Math.Distance.Between(px, py, drone.x, drone.y);
      if (worldDist > RADAR_WORLD_RADIUS) return;

      currentInRange.add(drone);

      // Ping ripple when newly entering radar range
      if (!this.prevInRange.has(drone)) {
        const dp = proj(drone.x, drone.y);
        this.pings.push({ x: dp.x, y: dp.y, r: 3, alpha: 0.8 });
      }

      const dp = proj(drone.x, drone.y);
      const screenDist = Phaser.Math.Distance.Between(dp.x, dp.y, RADAR_X, RADAR_Y);
      if (screenDist > R) return;

      // Blip size pulses when attacking
      const state = drone.getState();
      const dotR = state === 'ATTACK'
        ? 2.5 + Math.sin(time * 0.012) * 1.5
        : 3;

      const color = drone.texture.key === 'drone-red' ? 0xff4444 : 0x44ff88;
      gfx.fillStyle(color, 1);
      gfx.fillCircle(dp.x, dp.y, dotR);

      // Missile lock: cyan diamond outline over the lock target
      if (drone === lockTarget) {
        const s = 6;
        gfx.lineStyle(1, 0x00ffff, 1);
        gfx.strokePoints(
          [
            { x: dp.x,     y: dp.y - s },
            { x: dp.x + s, y: dp.y     },
            { x: dp.x,     y: dp.y + s },
            { x: dp.x - s, y: dp.y     },
          ],
          true, // closeShape — draws back to first point
        );
      }
    });

    this.prevInRange = currentInRange;

    // ── 6. Incoming drone bullet blips ────────────────────────────
    gfx.fillStyle(0xff4444, 0.8);
    game.droneBullets.getChildren().forEach((go) => {
      const b = go as Phaser.Physics.Arcade.Image;
      if (!b.active) return;
      const d = Phaser.Math.Distance.Between(px, py, b.x, b.y);
      if (d > RADAR_WORLD_RADIUS) return;
      const bp = proj(b.x, b.y);
      if (Phaser.Math.Distance.Between(bp.x, bp.y, RADAR_X, RADAR_Y) > R) return;
      gfx.fillCircle(bp.x, bp.y, 1.5);
    });

    // ── 7. Player dot + facing arrow ──────────────────────────────
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(RADAR_X, RADAR_Y, 4);

    const arrowAngle = player.flipX ? Math.PI : 0;
    gfx.lineStyle(2, 0x4488ff, 1);
    gfx.lineBetween(
      RADAR_X,
      RADAR_Y,
      RADAR_X + Math.cos(arrowAngle) * 9,
      RADAR_Y + Math.sin(arrowAngle) * 9,
    );

    // ── 8. Ping ripples ───────────────────────────────────────────
    this.pings = this.pings.filter((ping) => {
      if (ping.alpha <= 0) return false;
      gfx.lineStyle(1, 0x00ffaa, ping.alpha);
      gfx.strokeCircle(ping.x, ping.y, ping.r);
      ping.r     += 1.2;
      ping.alpha -= 0.04;
      return true;
    });
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/MinimapRenderer.ts
git commit -m "feat: add MinimapRenderer with sweep, blips, lock, and ping ripples"
```

---

## Task 6: Wire MinimapRenderer into UIScene

**Files:**
- Modify: `src/scenes/UIScene.ts`

Add an `update()` method that re-fetches the GameScene reference each frame (restart-safe) and drives the minimap.

- [ ] **Step 1: Add import and field**

At the top of `src/scenes/UIScene.ts`, add the import:

```ts
import { MinimapRenderer } from '../ui/MinimapRenderer';
import type { GameScene } from './GameScene';
```

Inside the `UIScene` class body, add the private field (alongside the other private fields):

```ts
private minimap!: MinimapRenderer;
```

- [ ] **Step 2: Instantiate in `create()`**

At the **end** of `UIScene.create()` (after all event listeners are set up, before the closing `}`):

```ts
// ── Radar minimap ─────────────────────────────────────────────
this.minimap = new MinimapRenderer(this);
```

- [ ] **Step 3: Add `update()` method**

Add after `create()`:

```ts
update(time: number, _delta: number): void {
  // Re-fetch every frame — restart creates a new GameScene instance
  const game = this.scene.get('Game') as GameScene;
  if (!game || !game.sys.isActive()) return;
  this.minimap.draw(time, game);
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Visual check — full radar**

Open `http://localhost:5173`. Verify:

1. **Radar circle** appears bottom-right, does not overlap existing HUD bars
2. **Sweep line** rotates continuously (~one rotation every 2-3 seconds)
3. **Ground line** appears at the correct relative Y position as you jetpack up and down
4. **Platform bars** visible as short white-blue horizontal ticks when platforms are nearby
5. **Enemy blips** — red for Vipers, green for Hornets — appear as waves arrive
6. **Attack pulse** — blips visibly grow/shrink when drones are in ATTACK state
7. **Missile lock** — cyan diamond highlights the nearest drone within 650 world units
8. **Ping ripple** — brief expanding ring when a new drone enters radar range
9. **Bullet blips** — tiny red dots appear as drone bullets travel nearby
10. **Player arrow** flips direction correctly when moving left vs right
11. **Restart** — press R after game over; radar works correctly in the new run with no stale state

- [ ] **Step 6: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: wire MinimapRenderer into UIScene update loop"
```

---

## Done

All three features are implemented and committed. The full checklist from the spec is now covered:

- Floating platforms (one-way, three height bands)
- Dual-flame jetpack particles with proper cleanup
- Local radar with sweep, enemy blips, attack pulse, missile lock, ping ripples, bullet blips, and player arrow
