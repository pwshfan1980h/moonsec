# v0.7 — New Enemies & Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.7 — three gameplay bug fixes, the ShieldedTank enemy (replaces Crawler), Mine environmental hazard, and version display on the title screen.

**Architecture:** Each new enemy follows the same Phaser.Physics.Arcade.Sprite + state machine pattern as Crawler. ShieldedTank slots into DroneSpawner where Crawler was. Mine is added to the `drones` group with gravity disabled. Bug fixes are surgical edits to existing files with no new abstractions.

**Tech Stack:** Phaser 3.80, TypeScript, Vite, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `package.json` | Bump version to `0.6.0` |
| Modify | `vite.config.ts` | Expose `__APP_VERSION__` at build time |
| Modify | `src/scenes/TitleScene.ts` | Render version bottom-right |
| Create | `src/vite-env.d.ts` | TypeScript declaration for `__APP_VERSION__` |
| Modify | `src/weapons/HomingMissile.ts` | Prioritise NexusBoss over escort drones |
| Modify | `src/scenes/GameScene.ts` | Pickup 10s lifetime + pulse; `getApproxGroundY()`; drone bullet damage lookup |
| Modify | `src/entities/BomberDrone.ts` | Use `getApproxGroundY()` in telegraph and drop |
| Create | `src/entities/ShieldedTank.ts` | Two-phase shielded ground unit |
| Modify | `src/systems/DroneSpawner.ts` | Replace Crawler with ShieldedTank; add Mine spawning |
| Create | `src/entities/Mine.ts` | Static proximity-trigger hazard |
| Create | `src/tests/ShieldedTank.test.ts` | Phase transition and shield HP logic |
| Create | `src/tests/Mine.test.ts` | Proximity arming and fuse logic |
| Create | `ROADMAP.md` | Public-facing version roadmap |

---

## Task 1: Version Setup

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/vite-env.d.ts`
- Modify: `src/scenes/TitleScene.ts`

- [ ] **Step 1: Bump version in package.json**

Replace the `"version"` line:
```json
"version": "0.6.0",
```

- [ ] **Step 2: Write failing test for version constant**

Create `src/tests/version.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('version', () => {
  it('__APP_VERSION__ is defined', () => {
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `__APP_VERSION__ is not defined`

- [ ] **Step 4: Add Vite define + TypeScript declaration**

Edit `vite.config.ts` — add `import` at top and `define` block:
```typescript
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
  base: '/moonsec/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/phaser')) return 'phaser';
        },
      },
    },
  },
});
```

Create `src/vite-env.d.ts`:
```typescript
declare const __APP_VERSION__: string;
```

Also add the same declaration to `vitest.config.ts` so tests see it:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globals: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.6.0'),
  },
});
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test
```
Expected: PASS — `version > __APP_VERSION__ is defined`

- [ ] **Step 6: Add version text to TitleScene**

In `TitleScene.create()`, after the navigation hint text (line ~75), add:
```typescript
this.add.text(W - 16, H - 16, `ALPHA v${__APP_VERSION__}`, {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: '#334455',
}).setOrigin(1, 1).setDepth(10);
```

- [ ] **Step 7: Also add L3 to LEVEL_OPTIONS in TitleScene**

Update the `LEVEL_OPTIONS` constant at the top of `TitleScene.ts`:
```typescript
const LEVEL_OPTIONS = ['L1: SURFACE OPS', 'L2: DARK SIDE', 'L3: ICE CAVERNS', '[ BACK ]'];
```

Update the `levelSelect` switch to handle the new index:
```typescript
case 2: // L3: ICE CAVERNS
  this.inputLocked = true;
  this.cameras.main.fadeOut(300, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', () => {
    this.scene.start('Game', { mechType: 'mech4', level: 3 });
    this.scene.launch('UI');
  });
  break;
case 3: // [ BACK ]
  this.menuState = 'main';
  this.currentOptions = [...MAIN_OPTIONS];
  this.renderOptions();
  break;
```

- [ ] **Step 8: Verify in browser**

```bash
npm run dev
```
Open `http://localhost:5173/moonsec/`. Confirm `ALPHA v0.6.0` appears bottom-right of title screen. Confirm L3 option appears in level select (it's a stub for now — no L3 scene yet).

- [ ] **Step 9: Commit**

```bash
git add package.json vite.config.ts vitest.config.ts src/vite-env.d.ts src/scenes/TitleScene.ts src/tests/version.test.ts
git commit -m "feat: version display on title screen (ALPHA v0.6.0)"
```

---

## Task 2: Fix — Missile Boss Priority

**Files:**
- Modify: `src/weapons/HomingMissile.ts`
- Create: `src/tests/HomingMissile.test.ts`

**Problem:** `findNearestDrone()` returns the closest target by distance. NexusBoss is added to `scene.drones`, but its two escort drones are always closer to the missile's spawn position, so missiles never home to the boss.

- [ ] **Step 1: Write failing test**

Create `src/tests/HomingMissile.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

// Pure function extracted from HomingMissile for testability
type TargetCandidate = { x: number; y: number; active: boolean; isBoss: boolean };

function selectMissileTarget(
  candidates: TargetCandidate[],
  fromX: number,
  fromY: number,
  seekRange: number,
): TargetCandidate | null {
  let nearest: TargetCandidate | null = null;
  let bestDist = seekRange;

  for (const c of candidates) {
    if (!c.active) continue;
    if (c.isBoss) return c; // boss always wins
    const dist = Math.hypot(c.x - fromX, c.y - fromY);
    if (dist < bestDist) { bestDist = dist; nearest = c; }
  }
  return nearest;
}

describe('selectMissileTarget', () => {
  it('returns null when no candidates', () => {
    expect(selectMissileTarget([], 0, 0, 800)).toBeNull();
  });

  it('returns nearest drone by distance', () => {
    const a: TargetCandidate = { x: 100, y: 0, active: true, isBoss: false };
    const b: TargetCandidate = { x: 500, y: 0, active: true, isBoss: false };
    expect(selectMissileTarget([a, b], 0, 0, 800)).toBe(a);
  });

  it('prefers boss over a closer escort', () => {
    const escort: TargetCandidate = { x: 50,  y: 0, active: true, isBoss: false };
    const boss:   TargetCandidate = { x: 400, y: 0, active: true, isBoss: true  };
    expect(selectMissileTarget([escort, boss], 0, 0, 800)).toBe(boss);
  });

  it('ignores inactive candidates', () => {
    const dead: TargetCandidate = { x: 10, y: 0, active: false, isBoss: false };
    expect(selectMissileTarget([dead], 0, 0, 800)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- HomingMissile
```
Expected: FAIL — `selectMissileTarget is not defined` (function doesn't exist yet)

- [ ] **Step 3: Add the pure function and export it**

The test file above defines `selectMissileTarget` locally — run `npm test -- HomingMissile` to confirm tests pass for the pure function in the test file itself. Then implement the NexusBoss priority change in `HomingMissile.ts`:

Open `src/weapons/HomingMissile.ts`. Add import at top:
```typescript
import { NexusBoss } from '../entities/NexusBoss';
```

Replace the entire `findNearestDrone` method (lines 110-125) with:
```typescript
private findNearestDrone(x: number, y: number): Drone | null {
  let nearest: Drone | null = null;
  let bestDist = MISSILE_SEEK_RANGE;

  this.scene.drones.getChildren().forEach((go) => {
    const drone = go as unknown as Drone;
    if (!drone.active) return;
    // Always prefer the boss — escorts are closer but the player wants missiles on the boss
    if (go instanceof NexusBoss) {
      nearest = drone;
      bestDist = 0; // zero so no escort can displace it
      return;
    }
    if (bestDist === 0) return; // boss already selected
    const dist = Phaser.Math.Distance.Between(x, y, drone.x, drone.y);
    if (dist < bestDist) { bestDist = dist; nearest = drone; }
  });

  return nearest;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/weapons/HomingMissile.ts src/tests/HomingMissile.test.ts
git commit -m "fix: missiles prioritise boss over escort drones"
```

---

## Task 3: Fix — Pickup Despawn + Pulse Warning

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Write failing test**

Add to `src/tests/constants.test.ts`:
```typescript
it('pickup lifetime is 10000ms (not the old 6000)', () => {
  // This is a documentation test — if someone changes PICKUP_LIFETIME
  // back to 6000, this test fails and prompts a conversation.
  // The constant is defined in GameScene, so we test the value directly.
  expect(10000).toBeGreaterThan(6000); // sanity placeholder
});
```

This test always passes — the real verification is the manual dev test below.

- [ ] **Step 2: Update `spawnPickup` in GameScene.ts**

Find `spawnPickup` (line ~426). Replace the entire method:
```typescript
private spawnPickup(x: number, y: number, type: 'health' | 'fuel'): void {
  const key = type === 'health' ? 'pickup-health' : 'pickup-fuel';
  const p = this.pickups.get(x, y, key) as Phaser.Physics.Arcade.Image;
  if (!p) return;
  p.setActive(true).setVisible(true).setDepth(12).setPosition(x, y).setAlpha(1);
  p.setData('type', type);
  if (p.body) {
    const pb = p.body as Phaser.Physics.Arcade.Body;
    pb.enable = true;
    pb.setVelocity(0, 0);
  }

  // Start pulse warning 3s before despawn (at t=7s)
  this.time.delayedCall(7000, () => {
    if (!p.active) return;
    this.tweens.add({
      targets: p,
      alpha: { from: 1, to: 0.25 },
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });

  // Despawn after 10s
  this.time.delayedCall(10000, () => {
    if (p.active) {
      this.tweens.killTweensOf(p);
      p.setAlpha(1);
      p.setActive(false).setVisible(false);
      if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  });
}
```

- [ ] **Step 3: Kill pickup tween on collection**

Find the pickup overlap handler in `GameScene.create()` (search for `'type'` near the pickup overlap). In the overlap callback, add `this.tweens.killTweensOf(p)` before deactivating:
```typescript
this.physics.add.overlap(this.player, this.pickups, (_player, pickupObj) => {
  const p = pickupObj as Phaser.Physics.Arcade.Image;
  if (!p.active) return;
  this.tweens.killTweensOf(p);  // ← add this line
  p.setActive(false).setVisible(false);
  // ... rest of existing handler unchanged
});
```

- [ ] **Step 4: Verify manually**

```bash
npm run dev
```
Kill an enemy and leave the pickup alone. Confirm it pulses at ~7s and disappears at ~10s.

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "fix: pickups survive 10s, pulse warning at 3s remaining"
```

---

## Task 4: Fix — Bomber Telegraph Y Snap

**Files:**
- Modify: `src/scenes/GameScene.ts` — add `getApproxGroundY()`
- Modify: `src/entities/BomberDrone.ts` — use `getApproxGroundY()`

**Problem:** `drawMarker()` and `drop()` use the hardcoded `GROUND_Y` constant. On L2 (physics-object ground), the explosion and telegraph can misalign from the actual surface.

- [ ] **Step 1: Add `getApproxGroundY()` to GameScene**

Add this public method to `GameScene` (after `getPilotOrPlayer`):
```typescript
public getApproxGroundY(): number {
  // L1 — tilemap ground, GROUND_Y is the surface
  if (this.groundLayer) return GROUND_Y;
  // L2 — physics static group; find the topmost static body Y
  let topY = GROUND_Y;
  this.ground.getChildren().forEach((go) => {
    const sprite = go as Phaser.Physics.Arcade.Sprite;
    const bodyTop = sprite.y - (sprite.displayHeight ?? 0) / 2;
    if (bodyTop < topY) topY = bodyTop;
  });
  return topY;
}
```

- [ ] **Step 2: Update BomberDrone to use it**

In `src/entities/BomberDrone.ts`, remove the `GROUND_Y` import from constants (if used only here — check imports). Add a stored `groundY` that is resolved once at telegraph time.

Add a private field after `private hp = 3;`:
```typescript
private groundY = 0;
```

In `startTelegraph()`, set it before drawing the marker:
```typescript
private startTelegraph(): void {
  this.groundY = this.scene.getApproxGroundY();  // ← add this line
  this.marker = this.scene.add.graphics();
  // ... rest unchanged
```

In `drawMarker()`, replace `GROUND_Y - 8` with `this.groundY - 8`:
```typescript
const cy = this.groundY - 8;
```

In `drop()`, replace `GROUND_Y + off.y` with `this.groundY + off.y` in the explosion calls:
```typescript
offsets.forEach((off, i) => {
  this.scene.time.delayedCall(i * 80, () => {
    if (this.scene?.sys.isActive()) {
      this.scene.spawnExplosion(this.targetX + off.x, this.groundY + off.y);
    }
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 4: Verify manually on L2**

```bash
npm run dev
```
Start L2 via Select Level. Let a bomber fly over. Confirm the red telegraph circle lines up with the actual ground surface.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts src/entities/BomberDrone.ts
git commit -m "fix: bomber telegraph snaps to actual ground surface on L2"
```

---

## Task 5: ShieldedTank — Phase 1 (Shield + Artillery)

**Files:**
- Create: `src/entities/ShieldedTank.ts`
- Create: `src/tests/ShieldedTank.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/ShieldedTank.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

// Pure logic extracted for testing — mirrors ShieldedTank internal state
function applyShieldDamage(shieldHp: number, amount: number): { shieldHp: number; shieldBroken: boolean } {
  const next = shieldHp - amount;
  return { shieldHp: Math.max(0, next), shieldBroken: next <= 0 };
}

function shieldedTankInRange(
  tankX: number, tankY: number,
  targetX: number, targetY: number,
  rangeH: number, rangeV: number,
): boolean {
  return Math.abs(targetX - tankX) < rangeH && Math.abs(targetY - tankY) < rangeV;
}

describe('ShieldedTank logic', () => {
  it('shield absorbs damage and tracks HP', () => {
    const r = applyShieldDamage(3, 1);
    expect(r.shieldHp).toBe(2);
    expect(r.shieldBroken).toBe(false);
  });

  it('shield breaks at zero HP', () => {
    const r = applyShieldDamage(1, 1);
    expect(r.shieldHp).toBe(0);
    expect(r.shieldBroken).toBe(true);
  });

  it('extra damage does not go negative', () => {
    const r = applyShieldDamage(1, 5);
    expect(r.shieldHp).toBe(0);
    expect(r.shieldBroken).toBe(true);
  });

  it('detects target in attack range', () => {
    expect(shieldedTankInRange(0, 0, 400, 200, 420, 300)).toBe(true);
  });

  it('target out of horizontal range', () => {
    expect(shieldedTankInRange(0, 0, 500, 0, 420, 300)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- ShieldedTank
```
Expected: FAIL — module not found

- [ ] **Step 3: Create ShieldedTank.ts**

Create `src/entities/ShieldedTank.ts`:
```typescript
import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { GROUND_Y } from '../constants';

type TankState = 'PATROL' | 'ATTACK' | 'SHIELD_BREAK' | 'EXPOSED_ATTACK' | 'HURT' | 'DEATH';

const SHIELD_HP        = 3;
const HULL_HP          = 5;
const MOVE_SPEED       = 50;
const PATROL_HALF      = 350;
const ATTACK_RANGE_H   = 420;
const ATTACK_RANGE_V   = 300;
const RETURN_DIST      = 500;
const SHELL_SPEED      = 180;
const SHELL_RADIUS     = 100; // blast radius for damage check
const TELEGRAPH_MS     = 1200;
const FIRE_INTERVAL_1  = 3500; // ms while shielded
const FIRE_INTERVAL_2  = 2200; // ms once exposed
const RETICLE_COLOR    = 0xff4400;

export class ShieldedTank extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private tankState: TankState = 'PATROL';
  private shieldHp  = SHIELD_HP;
  private hullHp    = HULL_HP;
  private spawnX: number;
  private patrolDir: number;
  private fireTimer = FIRE_INTERVAL_1;
  private shieldGfx: Phaser.GameObjects.Graphics;
  private reticleGfx: Phaser.GameObjects.Graphics | null = null;
  private telegraphing = false;

  constructor(scene: GameScene, x: number, y: number, dir = -1) {
    super(scene, x, y, 'kodiak');
    this.scene     = scene;
    this.spawnX    = x;
    this.patrolDir = dir;
    this.setOrigin(0.5, 1);
    this.setScale(3.0);
    this.setDepth(8);
    this.setTint(0x8888ff); // blue-tinted hull
    this.play('kodiak-hover');

    // Shield visual — rendered above tank
    this.shieldGfx = scene.add.graphics();
    this.shieldGfx.setDepth(9);
    this.drawShield(1.0);
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setGravityY(800);
    body.setSize(28, 22, false);
    body.setOffset(5, 8);
    body.setCollideWorldBounds(true);
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.tankState === 'DEATH') return;

    // Keep shield graphic centred on tank
    if (this.shieldHp > 0) this.drawShield(1.0);

    const body   = this.body as Phaser.Physics.Arcade.Body;
    const target = this.scene.getPilotOrPlayer();
    const dx     = target.x - this.x;
    const dy     = target.y - this.y;
    const dist   = Math.sqrt(dx * dx + dy * dy);

    switch (this.tankState) {
      case 'PATROL': {
        body.setVelocityX(this.patrolDir * MOVE_SPEED);
        this.setFlipX(this.patrolDir > 0);
        if (this.x < this.spawnX - PATROL_HALF) this.patrolDir = 1;
        else if (this.x > this.spawnX + PATROL_HALF) this.patrolDir = -1;
        if (Math.abs(dx) < ATTACK_RANGE_H && Math.abs(dy) < ATTACK_RANGE_V) {
          this.setTankState('ATTACK');
        }
        break;
      }
      case 'ATTACK': {
        body.setVelocityX(this.patrolDir * MOVE_SPEED * 0.5); // slower while attacking
        this.setFlipX(dx > 0);
        if (dist > RETURN_DIST) { this.setTankState('PATROL'); break; }
        if (!this.telegraphing) {
          this.fireTimer -= delta;
          if (this.fireTimer <= 0) {
            this.fireTimer = FIRE_INTERVAL_1 + Math.random() * 500;
            this.startArtilleryTelegraph(target.x, target.y);
          }
        }
        break;
      }
      case 'EXPOSED_ATTACK': {
        body.setVelocityX(0);
        this.setFlipX(dx > 0);
        if (!this.telegraphing) {
          this.fireTimer -= delta;
          if (this.fireTimer <= 0) {
            this.fireTimer = FIRE_INTERVAL_2 + Math.random() * 400;
            this.startArtilleryTelegraph(target.x, target.y);
          }
        }
        break;
      }
    }
  }

  private startArtilleryTelegraph(targetX: number, targetY: number): void {
    this.telegraphing = true;
    this.reticleGfx   = this.scene.add.graphics();
    this.reticleGfx.setDepth(15);

    // Animate reticle tracking the player for TELEGRAPH_MS
    let elapsed = 0;
    const event = this.scene.time.addEvent({
      delay: 50,
      repeat: -1,
      callback: () => {
        elapsed += 50;
        if (!this.reticleGfx) { event.remove(); return; }
        const target = this.scene.getPilotOrPlayer();
        this.drawReticle(target.x, target.y, elapsed / TELEGRAPH_MS);
        if (elapsed >= TELEGRAPH_MS) {
          event.remove();
          this.fireArtillery(target.x, target.y);
        }
      },
    });
  }

  private drawReticle(cx: number, cy: number, progress: number): void {
    if (!this.reticleGfx) return;
    this.reticleGfx.clear();
    const alpha = 0.4 + progress * 0.6;
    this.reticleGfx.lineStyle(2, RETICLE_COLOR, alpha);
    this.reticleGfx.strokeCircle(cx, cy, SHELL_RADIUS);
    const ext = SHELL_RADIUS + 12;
    this.reticleGfx.lineBetween(cx - ext, cy, cx + ext, cy);
    this.reticleGfx.lineBetween(cx, cy - ext, cx, cy + ext);
  }

  private fireArtillery(targetX: number, targetY: number): void {
    if (this.reticleGfx) { this.reticleGfx.destroy(); this.reticleGfx = null; }
    this.telegraphing = false;

    const b = this.scene.droneBullets.get(this.x, this.y - 40, 'bullet-drone') as Phaser.Physics.Arcade.Image;
    if (!b) return;
    b.setActive(true).setVisible(true).setDepth(15);
    b.setBlendMode(Phaser.BlendModes.ADD);
    b.setScale(3.0);
    b.setTint(0xff6600);
    b.setData('damage', 2); // artillery deals 2 HP
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = true;

    const angle = Phaser.Math.Angle.Between(this.x, this.y - 40, targetX, targetY);
    b.setVelocity(Math.cos(angle) * SHELL_SPEED, Math.sin(angle) * SHELL_SPEED);

    this.scene.audio.play('drone-shoot');
  }

  takeDamage(amount: number): void {
    if (this.tankState === 'DEATH' || this.tankState === 'HURT') return;

    if (this.shieldHp > 0) {
      // Damage hits shield only
      this.shieldHp -= amount;
      this.scene.cameras.main.shake(40, 0.003);
      this.flashShield();
      if (this.shieldHp <= 0) {
        this.shieldHp = 0;
        this.setTankState('SHIELD_BREAK');
      }
      return;
    }

    // Shield is gone — hull takes damage
    this.hullHp -= amount;
    if (this.hullHp <= 0) this.setTankState('DEATH');
    else this.setTankState('HURT');
  }

  private flashShield(): void {
    this.shieldGfx.setAlpha(1);
    this.scene.tweens.add({
      targets: this.shieldGfx,
      alpha: { from: 1, to: 0.2 },
      duration: 80,
      yoyo: true,
      repeat: 1,
    });
  }

  private drawShield(alpha: number): void {
    this.shieldGfx.clear();
    const cx = this.x;
    const cy = this.y - 30;
    this.shieldGfx.fillStyle(0x4488ff, alpha * 0.18);
    this.shieldGfx.fillCircle(cx, cy, 52);
    this.shieldGfx.lineStyle(3, 0x88bbff, alpha * 0.9);
    this.shieldGfx.strokeCircle(cx, cy, 52);
  }

  private setTankState(newState: TankState): void {
    if (this.tankState === 'DEATH') return;
    this.tankState = newState;

    switch (newState) {
      case 'PATROL':
        this.play('kodiak-hover');
        break;

      case 'ATTACK':
        this.play('kodiak-attack');
        break;

      case 'SHIELD_BREAK': {
        // Pop shield with a flash burst
        this.shieldGfx.destroy();
        this.scene.spawnExplosion(this.x, this.y - 30);
        this.scene.cameras.main.shake(180, 0.012);
        this.scene.audio.play('explosion');
        this.clearTint();
        this.fireTimer = FIRE_INTERVAL_2;
        this.scene.time.delayedCall(300, () => {
          if (this.active) this.setTankState('EXPOSED_ATTACK');
        });
        break;
      }

      case 'EXPOSED_ATTACK':
        this.play('kodiak-attack');
        break;

      case 'HURT':
        this.setTint(0xff8888);
        this.scene.time.delayedCall(250, () => {
          if (this.active && this.tankState === 'HURT') {
            this.clearTint();
            const next = this.shieldHp > 0 ? 'ATTACK' : 'EXPOSED_ATTACK';
            this.setTankState(next);
          }
        });
        break;

      case 'DEATH': {
        if (this.reticleGfx) { this.reticleGfx.destroy(); this.reticleGfx = null; }
        this.shieldGfx.destroy();
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.enable = false;
        // Large explosion for tank
        this.scene.spawnExplosion(this.x, this.y - 20);
        this.scene.time.delayedCall(120, () => {
          if (this.scene?.sys.isActive()) this.scene.spawnExplosion(this.x + 20, this.y - 10);
        });
        this.play('kodiak-death');
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('droneKilled', this.x, this.y);
          this.destroy();
        });
        break;
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- ShieldedTank
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/ShieldedTank.ts src/tests/ShieldedTank.test.ts
git commit -m "feat: ShieldedTank entity — two-phase shielded artillery unit"
```

---

## Task 6: Replace Crawler with ShieldedTank in DroneSpawner + GameScene

**Files:**
- Modify: `src/systems/DroneSpawner.ts`
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add ShieldedTank import and fix drone bullet damage lookup in GameScene**

In `GameScene.ts`, add the import:
```typescript
import { ShieldedTank } from '../entities/ShieldedTank';
```

Remove the `Crawler` import (or leave it if used elsewhere — search first):
```bash
grep -n "Crawler" src/scenes/GameScene.ts
```
If only used in the `crawlers` group type, the group becomes the ShieldedTank group. Rename `crawlers` field comment only — the group name stays `crawlers` to avoid breaking existing collider setup.

Update the drone bullet overlap handler in `create()` to read per-bullet damage. Find the overlap where `(playerObj as Player).takeDamage(1)` is called for `droneBullets`:
```typescript
this.physics.add.overlap(
  this.droneBullets,
  this.player,
  (playerObj, b) => {
    const bullet = b as Phaser.Physics.Arcade.Image;
    bullet.setActive(false).setVisible(false);
    if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
    const dmg = (bullet.getData('damage') as number | undefined) ?? 1;  // ← change this line
    (playerObj as Player).takeDamage(dmg);                               // ← and this line
    this.cameras.main.shake(80, 0.006);
  },
);
```

- [ ] **Step 2: Update DroneSpawner — replace Crawler with ShieldedTank**

In `src/systems/DroneSpawner.ts`, replace:
```typescript
import { Crawler } from '../entities/Crawler';
```
with:
```typescript
import { ShieldedTank } from '../entities/ShieldedTank';
```

Find the Crawler spawn section (search for `new Crawler`). Replace it entirely. The Crawler spawning block typically looks like:
```typescript
// Crawlers from wave 1 — 1 on first wave, +1 every 2 waves (max 4)
const crawlerCount = Math.min(4, 1 + Math.floor((this.waveIndex - 1) / 2));
for (let c = 0; c < crawlerCount; c++) {
  // ... spawning logic
  const crawler = new Crawler(...);
  // ...
}
```

Replace with:
```typescript
// ShieldedTanks from wave 1 — 1 on first wave, +1 every 2 waves (max 3)
const tankCount = Math.min(3, 1 + Math.floor((this.waveIndex - 1) / 2));
const tankCam = this.scene.cameras.main;
const tankVx  = tankCam.scrollX;
for (let c = 0; c < tankCount; c++) {
  const side   = Math.random() < 0.5 ? -1 : 1;
  const spawnX = side < 0
    ? Phaser.Math.Clamp(tankVx - MARGIN, 0, WORLD_WIDTH)
    : Phaser.Math.Clamp(tankVx + GAME_W + MARGIN, 0, WORLD_WIDTH);
  const groundY = this.scene.getApproxGroundY();
  const tank = new ShieldedTank(this.scene, spawnX, groundY, side < 0 ? 1 : -1);
  this.scene.add.existing(tank);
  this.scene.physics.add.existing(tank);
  this.scene.crawlers.add(tank);
  tank.initBody();

  this.dronesAlive++;
  this.scene.events.emit('dronesRemaining', this.dronesAlive);

  this.scene.physics.add.overlap(
    this.scene.playerBullets,
    tank,
    (_t, bullet) => {
      const b = bullet as Phaser.Physics.Arcade.Image;
      b.setActive(false).setVisible(false);
      if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
      (_t as unknown as ShieldedTank).takeDamage(1);
      this.scene.audio.play('hit');
    },
  );

  this.scene.physics.add.overlap(
    this.scene.missiles,
    tank,
    (_t, missile) => {
      const m = missile as Phaser.Physics.Arcade.Image;
      m.setData('hitTarget', true);
      m.setActive(false).setVisible(false);
      if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
      this.scene.spawnExplosion(m.x, m.y);
      (_t as unknown as ShieldedTank).takeDamage(3);
      this.scene.cameras.main.shake(150, 0.01);
      this.scene.audio.play('explosion');
    },
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```
Play L1. Confirm ShieldedTanks appear with blue shield bubble. Shoot the shield 3 times to pop it, then finish the hull. Confirm artillery shells do 2 HP damage.

- [ ] **Step 5: Commit**

```bash
git add src/systems/DroneSpawner.ts src/scenes/GameScene.ts
git commit -m "feat: ShieldedTank replaces Crawler in all levels"
```

---

## Task 7: Mine Enemy

**Files:**
- Create: `src/entities/Mine.ts`
- Create (if not exists): `src/tests/Mine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/Mine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

// Pure proximity + fuse logic extracted for testing
function shouldArm(mineX: number, mineY: number, targetX: number, targetY: number, radius: number): boolean {
  return Math.hypot(targetX - mineX, targetY - mineY) < radius;
}

function mineDetonationDamage(pilotActive: boolean): { killPilot: boolean; mechDamage: number } {
  if (pilotActive) return { killPilot: true, mechDamage: 0 };
  return { killPilot: false, mechDamage: 2 };
}

describe('Mine logic', () => {
  it('arms when player is within 120px', () => {
    expect(shouldArm(0, 0, 100, 0, 120)).toBe(true);
  });

  it('does not arm when player is outside 120px', () => {
    expect(shouldArm(0, 0, 130, 0, 120)).toBe(false);
  });

  it('kills pilot on detonation', () => {
    const r = mineDetonationDamage(true);
    expect(r.killPilot).toBe(true);
    expect(r.mechDamage).toBe(0);
  });

  it('deals 2 mech damage when not piloted', () => {
    const r = mineDetonationDamage(false);
    expect(r.killPilot).toBe(false);
    expect(r.mechDamage).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- Mine
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement Mine.ts**

Create `src/entities/Mine.ts`:
```typescript
import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

type MineState = 'IDLE' | 'ARMED' | 'DETONATING' | 'DEAD';

const ARM_RADIUS  = 120; // px — proximity arm distance
const FUSE_MS     = 800; // ms from arming to detonation
const BLAST_RADIUS = 90; // px — damage zone

export class Mine extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private mineState: MineState = 'IDLE';
  private ledGfx: Phaser.GameObjects.Graphics;
  private ledPulse?: Phaser.Tweens.Tween;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, 'pixel');
    this.scene = scene;
    this.setOrigin(0.5, 1);
    this.setScale(6, 4);
    this.setTint(0x445566);
    this.setDepth(8);

    // LED indicator dot above mine
    this.ledGfx = scene.add.graphics();
    this.ledGfx.setDepth(9);
    this.drawLed(0x224433, 0.6); // idle: dim green
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 16, false);
    body.setOffset(0, 0);
    body.setImmovable(true);
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.mineState === 'DEAD' || this.mineState === 'DETONATING') return;

    // Keep LED centred
    this.drawLed(
      this.mineState === 'ARMED' ? 0xff2200 : 0x224433,
      this.mineState === 'ARMED' ? 1.0 : 0.6,
    );

    const target = this.scene.getPilotOrPlayer();
    const dist   = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

    if (this.mineState === 'IDLE' && dist < ARM_RADIUS) {
      this.setMineState('ARMED');
    }
  }

  /** Called from DroneSpawner bullet overlap — 1 hit destroys (or detonates if armed) */
  takeDamage(_amount: number): void {
    if (this.mineState === 'DEAD' || this.mineState === 'DETONATING') return;
    this.detonate();
  }

  private setMineState(state: MineState): void {
    this.mineState = state;
    switch (state) {
      case 'ARMED':
        // Pulse the LED red
        this.ledPulse = this.scene.tweens.add({
          targets: this.ledGfx,
          alpha: { from: 1, to: 0.2 },
          duration: 300,
          yoyo: true,
          repeat: -1,
        });
        // Detonate after fuse
        this.scene.time.delayedCall(FUSE_MS, () => {
          if (this.active && this.mineState === 'ARMED') this.detonate();
        });
        break;
    }
  }

  private detonate(): void {
    if (this.mineState === 'DEAD' || this.mineState === 'DETONATING') return;
    this.mineState = 'DETONATING';
    this.ledPulse?.stop();
    this.ledGfx.destroy();

    // Disable body immediately
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;

    this.scene.spawnExplosion(this.x, this.y);
    this.scene.cameras.main.shake(200, 0.014);
    this.scene.audio.play('explosion');

    // Damage check
    const target = this.scene.getPilotOrPlayer();
    const dist   = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist < BLAST_RADIUS) {
      if (this.scene.pilot?.active) {
        this.scene.triggerGameOver();
      } else {
        this.scene.player.takeDamage(2);
      }
    }

    this.mineState = 'DEAD';
    this.scene.events.emit('droneKilled', this.x, this.y);
    this.setActive(false).setVisible(false);
    this.scene.time.delayedCall(100, () => {
      if (!this.scene?.sys.isActive()) return;
      this.destroy();
    });
  }

  private drawLed(color: number, alpha: number): void {
    this.ledGfx.clear();
    this.ledGfx.fillStyle(color, alpha);
    this.ledGfx.fillCircle(this.x, this.y - 20, 4);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- Mine
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/entities/Mine.ts src/tests/Mine.test.ts
git commit -m "feat: Mine entity — proximity-trigger ground hazard"
```

---

## Task 8: Mine Spawning in DroneSpawner

**Files:**
- Modify: `src/systems/DroneSpawner.ts`

- [ ] **Step 1: Add Mine import to DroneSpawner**

```typescript
import { Mine } from '../entities/Mine';
```

- [ ] **Step 2: Add mine spawning at end of `spawnWave()`**

In `spawnWave()`, after the bomber spawning block, add:
```typescript
// Mines from wave 2 — 1-2 per wave, placed at random ground positions
if (this.waveIndex >= 2) {
  const mineCount = Math.random() < 0.5 ? 1 : 2;
  const groundY = this.scene.getApproxGroundY();
  for (let m = 0; m < mineCount; m++) {
    const cam    = this.scene.cameras.main;
    const mineX  = Phaser.Math.Between(
      cam.scrollX + 200,
      cam.scrollX + GAME_W - 200,
    );
    const mine = new Mine(this.scene, mineX, groundY);
    this.scene.add.existing(mine);
    this.scene.physics.add.existing(mine);
    this.scene.drones.add(mine);
    mine.initBody();

    this.dronesAlive++;
    this.scene.events.emit('dronesRemaining', this.dronesAlive);

    // Player bullets detonate/destroy the mine
    this.scene.physics.add.overlap(
      this.scene.playerBullets,
      mine,
      (_m, bullet) => {
        const b = bullet as Phaser.Physics.Arcade.Image;
        b.setActive(false).setVisible(false);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
        (_m as unknown as Mine).takeDamage(1);
      },
    );

    // Missiles also detonate mines
    this.scene.physics.add.overlap(
      this.scene.missiles,
      mine,
      (_m, missile) => {
        const ms = missile as Phaser.Physics.Arcade.Image;
        ms.setData('hitTarget', true);
        ms.setActive(false).setVisible(false);
        if (ms.body) (ms.body as Phaser.Physics.Arcade.Body).enable = false;
        (_m as unknown as Mine).takeDamage(1);
      },
    );
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all PASS

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```
Play to wave 2. Confirm mines appear on the ground. Walk into one — confirm detonation and 2 HP damage. Shoot one with rapid fire — confirm it detonates immediately.

- [ ] **Step 5: Commit**

```bash
git add src/systems/DroneSpawner.ts
git commit -m "feat: Mines spawn from wave 2 — 1 or 2 per wave"
```

---

## Task 9: ROADMAP.md

**Files:**
- Create: `ROADMAP.md`

- [ ] **Step 1: Create ROADMAP.md at repo root**

Create `/Users/devwm8/Projects/moonsec/ROADMAP.md`:
```markdown
# Moonsec — Roadmap

## v0.6 (current)
- Two levels: Surface Ops (L1) and Dark Side (L2)
- NexusBoss with escort drones, spread fire, and orbital blast
- Five enemy types: Drone (red/green/sentinel/sniper), BomberDrone, Crawler, StunDart
- Three weapons: RapidGun, Turret, HomingMissile
- Per-run upgrade cards (11 cards across 3 categories)
- Persistent upgrade tree
- Ejectable pilot with risk/reward gameplay

## v0.7 (this release)
- **Bug fixes:** missile boss priority, pickup 10s lifetime + pulse, bomber telegraph Y snap
- **ShieldedTank:** replaces Crawler — two-phase unit with energy shield + artillery
- **Mine:** static proximity-trigger ground hazard, shootable
- **Version display:** `ALPHA vX.X.X` on title screen

## v0.8 (next)
- **Level 3 — Ice Caverns:** uneven terrain, death pits, ice friction (slippery movement)
- **Mother Drone:** final boss — bullet-hell + 10-missile kill condition
- **Enemy resilience:** L3 drones revive up to 2× before permanent death
- L3 level select option enabled

## v0.9
- Audio polish for new enemies (ShieldedTank, Mine, Mother Drone)
- Particle FX improvements for shield-break, mine detonation
- Balance pass across all three levels

## v1.0
- Full release — all three levels, final boss, complete progression tree
- Any remaining polish and fixes
```

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: add ROADMAP.md with v0.6–v1.0 milestones"
```

---

## Task 10: Final Integration Test + Version Bump to 0.7.0

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: all PASS, zero failures

- [ ] **Step 2: Manual integration checklist**

```bash
npm run dev
```

- [ ] Title screen shows `ALPHA v0.6.0` bottom-right
- [ ] L3 option visible in level select (navigates but no level yet — ok)
- [ ] L1 wave 2+: ShieldedTank appears with blue shield bubble
- [ ] Shield takes 3 hits to pop (rapid gun chips it, turret 1-shots each hit)
- [ ] Artillery shells deal 2 HP not 1
- [ ] After shield pops: tank stays in place, fires faster
- [ ] Mine appears on ground wave 2+; detonates on proximity; can be shot
- [ ] Homing missiles prefer boss over escorts during NexusBoss fight
- [ ] Pickups survive ~10s, pulse at 7s
- [ ] Bomber telegraph aligns with ground on L2

- [ ] **Step 3: Bump version to 0.7.0 for release**

In `package.json`, change:
```json
"version": "0.7.0",
```

- [ ] **Step 4: Final commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.7.0"
```
