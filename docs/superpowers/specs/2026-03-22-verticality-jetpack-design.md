# Design: Floating Platforms + Jetpack Visual Effects

**Date:** 2026-03-22
**Project:** moonsec (Phaser 3 + TypeScript mech sidescroller)
**Status:** Approved

---

## Overview

Two independent features added in one pass:

1. **Floating Platforms** — scatter ~35 static hover-platforms across the world to reward jetpack traversal and give drones multi-height combat positions.
2. **Jetpack Visual Effects** — dual particle emitters (orange inner core + cyan outer glow) that fire downward from the mech when the jetpack is active.

---

## Feature 1: Floating Platforms

### Architecture

- A new private method `makePlatforms()` called from `GameScene.create()` after ground setup.
- Platforms are `Phaser.GameObjects.Rectangle` instances added to the existing `this.ground` `StaticGroup` (same pattern as the ground rectangle). This means all existing `physics.add.collider(player, ground)` calls cover platforms automatically.
- A `Phaser.GameObjects.Rectangle` glow line (2px, `0x5555dd`) is drawn on top of each platform at the same depth as the ground glow line.

### Platform Layout

- **~35 platforms** distributed across x=400 to x=6000.
- Three height bands:
  - **Low** (y 280–320): ~15 platforms, width 100–160px — reachable with a single jump
  - **Mid** (y 200–250): ~12 platforms, width 80–130px — requires jetpack assist
  - **High** (y 130–180): ~8 platforms, width 60–100px — full jetpack required
- Minimum horizontal gap of 200px between adjacent platforms to ensure navigability.
- Placement is deterministic (hardcoded or seeded random) so layout is consistent each run.

### Drone Interaction

- No drone AI changes needed. Drones use `allowGravity: false` and patrol by `setVelocityX/Y`, so they float through platforms naturally.
- The existing patrol lane Y values in `DroneSpawner.ts` (`[140, 180, 220, 260, 300]`) already overlap all three platform bands. No spawner changes needed.
- Drone bullets pass through platforms (no collider added for `droneBullets` vs platforms). Player bullets also pass through — platforms are terrain only.

### Constants

Add to `constants.ts`:
```ts
export const PLATFORM_BANDS = [
  { yMin: 280, yMax: 320 }, // low
  { yMin: 200, yMax: 250 }, // mid
  { yMin: 130, yMax: 180 }, // high
];
```

### Platform Collision Direction

Each platform body should have `checkCollision.up = false` disabled... actually the opposite: set `checkCollision.down = false` on the *player body* is not the right approach. Instead, on each platform's `StaticBody`, set `checkCollision` so the player can jump through from below but land from above. In Arcade Physics, use:

```ts
const pb = platRect.body as Phaser.Physics.Arcade.StaticBody;
pb.checkCollision.down = false; // allow player to pass through from below
pb.checkCollision.left = false;
pb.checkCollision.right = false;
```

This makes platforms one-way (top-surface only), which is standard for sidescrollers.

### Platform Glow Color

Platform top-edge glow uses `0x5555dd` (intentionally lighter than ground's `0x4444cc`) to visually distinguish platforms from the ground.

### Files Changed

- `src/constants.ts` — add `PLATFORM_BANDS`
- `src/scenes/GameScene.ts` — add `makePlatforms()` private method, call from `create()`

---

## Feature 2: Jetpack Visual Effects

### Architecture

- Two `Phaser.GameObjects.Particles.ParticleEmitter` instances stored as private fields on `Player`:
  - `private jetpackInner: Phaser.GameObjects.Particles.ParticleEmitter`
  - `private jetpackOuter: Phaser.GameObjects.Particles.ParticleEmitter`
- Created in `Player` constructor using `this.scene.add.particles(...)` with `emitting: false`.
- Each frame in `update()`, if the jetpack is actively firing (space held + `!onGround` + `jetpackFuel > 0`):
  - Call `jetpackInner.setPosition(...)` / `jetpackOuter.setPosition(...)` to follow mech
  - Call `.setEmitting(true)` on both emitters
- Otherwise call `.setEmitting(false)` on both. Note: `ParticleEmitter.stop()` does not exist in Phaser 3.80 — use `setEmitting(false)`.
- Emitter toggling is placed **before** the `hurtLock` early-return in `update()` so the flame correctly shuts off during the hurt animation.

### Emitter Configs

**Inner (orange/red — fire core):**
```ts
{
  texture: 'pixel',
  speed: { min: 60, max: 120 },
  angle: { min: 80, max: 100 },   // downward ±10°
  scale: { start: 2.5, end: 0 },
  alpha: { start: 1, end: 0 },
  tint: [0xff6600, 0xff2200, 0xffaa00],
  lifespan: 120,
  frequency: 20,
  blendMode: 'ADD',
  depth: 9,
}
```

**Outer (cyan/blue — thruster glow):**
```ts
{
  texture: 'pixel',
  speed: { min: 40, max: 90 },
  angle: { min: 65, max: 115 },   // downward ±25°
  scale: { start: 3, end: 0 },
  alpha: { start: 0.7, end: 0 },
  tint: [0x00aaff, 0x0044ff, 0x44eeff],
  lifespan: 180,
  frequency: 25,
  blendMode: 'ADD',
  depth: 8,
}
```

### Emitter Position

Mech origin is `(0.5, 1)` (feet at `player.y`). Scale is `0.75`, source frame 200×150px → display 150×112.5px. Thruster nozzle sits at roughly mid-body height, behind center:

```ts
const thrustX = this.x + (this.flipX ? 12 : -12);  // behind mech (left when facing right, right when facing left)
const thrustY = this.y - 60;                         // ~53% up from feet ≈ nozzle/torso height
```

The `flipX` direction logic keeps the emitter visually behind the mech as it changes direction.

### Jetpack Active State

Extract condition into a local bool in `update()` to avoid duplication:
```ts
const jetpackActive = space && !this.onGround && this.jetpackFuel > 0;
```

### Files Changed

- `src/entities/Player.ts` — add two emitter fields, init in constructor, toggle + reposition in `update()`, destroy both in `destroy()` override to prevent leaks on scene restart

### Cleanup / Memory

`Player` must override `destroy()` to clean up emitters:

```ts
destroy(fromScene?: boolean): void {
  this.jetpackInner.destroy();
  this.jetpackOuter.destroy();
  super.destroy(fromScene);
}
```

Without this, scene restart (R key) leaks both `ParticleEmitter` instances.

---

---

## Feature 3: Local Radar Minimap

### Overview

A circular radar HUD element in the bottom-right corner. Shows nearby enemies, incoming bullets, platforms, ground, and a missile lock indicator — all within a fixed world-unit radius centered on the player. Drawn every frame via a cleared `Graphics` object in `UIScene`.

### Architecture

New file: `src/ui/MinimapRenderer.ts` — a plain class (not a Phaser GameObject) that owns a `Phaser.GameObjects.Graphics` instance and exposes a single `draw(time: number)` method called from `UIScene.update()`.

`UIScene` gains an `update()` method and instantiates `MinimapRenderer` in `create()`.

`GameScene` gains a public `platformData: { x: number; y: number; w: number }[]` array populated by `makePlatforms()` so `MinimapRenderer` can read static platform positions without re-scanning the StaticGroup each frame.

No changes to `HomingMissile`. Missile lock target is computed directly in `MinimapRenderer` using the same nearest-drone logic (scan `gameScene.drones`, find active drone within `MISSILE_SEEK_RANGE` world units of player).

**Restart safety:** The `gameScene` reference must be re-fetched every frame in `UIScene.update()` rather than cached at `create()` time. When GameScene restarts, a new instance is created and the old reference goes stale. Pattern:

```ts
update(time: number, delta: number): void {
  const game = this.scene.get('Game') as GameScene;
  if (!game || !game.sys.isActive()) return;
  this.minimap.draw(time, game);
}
```

`MinimapRenderer.draw()` takes `game: GameScene` as a parameter rather than storing it at construction time.

### Constants (add to `constants.ts`)

```ts
export const RADAR_WORLD_RADIUS = 320;   // world units shown around player
export const RADAR_SCREEN_RADIUS = 65;   // px radius of the drawn circle
export const RADAR_X = 725;              // screen center of radar (10px right margin)
export const RADAR_Y = 370;
// Must stay in sync with the non-exported SEEK_RANGE const in src/weapons/HomingMissile.ts
export const MISSILE_SEEK_RANGE = 650;
```

### Coordinate Projection

```ts
worldToRadar(wx: number, wy: number, px: number, py: number): { x: number; y: number } {
  const scale = RADAR_SCREEN_RADIUS / RADAR_WORLD_RADIUS;
  return {
    x: RADAR_X + (wx - px) * scale,
    y: RADAR_Y + (wy - py) * scale,
  };
}
```

Blips outside `RADAR_SCREEN_RADIUS` are skipped (distance check in world space before projecting).

### MinimapRenderer Fields

```ts
private gfx: Phaser.GameObjects.Graphics;
private sweepAngle = 0;                    // radians, incremented each draw()
private pings: { x: number; y: number; r: number; alpha: number }[] = [];
private dronesInRange = new WeakSet<Drone>();  // for ping entry detection
```

### Drawing Layers (in order)

**1. Background + rings**
- Filled circle: `0x001122`, alpha 0.82
- Two concentric ring outlines: `0x003344`, alpha 0.4, at 50% and 100% of `RADAR_SCREEN_RADIUS`
- Border ring: `0x0088aa`, alpha 0.7, 1px stroke

**2. Ground line**
- Horizontal line at projected `GROUND_Y` relative to player, clipped to the radar circle boundary.
- Color `0x4444cc`, alpha 0.5, 1px
- Clipping: compute the chord half-width at the projected Y offset from center using `hw = Math.sqrt(Math.max(0, R² - dy²))` where `R = RADAR_SCREEN_RADIUS` and `dy = projY - RADAR_Y`. Draw `lineBetween(RADAR_X - hw, projY, RADAR_X + hw, projY)`. If `|dy| >= R` the line is fully out of range — skip.

**3. Platform blips**
- Each `platformData` entry: short horizontal bar, width = `Math.min(entry.w * scale, chordWidth)`, height 1px, clipped to circle using the same chord formula.
- Color `0x5555dd`, alpha 0.6

**4. Radar sweep line**
- Angle incremented by `0.04` rad/frame (`~2.3°/frame`, ~0.38 full rotations/sec at 60fps)
- Line from center to edge in direction of sweep angle
- Color `0x00ffaa`, alpha 0.35, 1px

**5. Enemy blips**
- Scan `gameScene.drones.getChildren()` for active drones within `RADAR_WORLD_RADIUS`
- Red dot for `drone-red`, green dot for `drone-green`
- Dot radius: 3px normally; **pulse** when in ATTACK state: `2.5 + Math.sin(time * 0.012) * 1.5`
- Drone state is readable via a new public getter `drone.getState(): DroneState` added to `Drone`
- Missile lock target (nearest active drone within `MISSILE_SEEK_RANGE` of player): draw a 6px diamond outline in cyan (`0x00ffff`) over its blip

**6. Incoming bullet blips**
- Scan `gameScene.droneBullets.getChildren()` for active bullets within `RADAR_WORLD_RADIUS`
- Tiny 1.5px dot, color `0xff4444`, alpha 0.8

**7. Player dot + facing arrow**
- Filled white circle, 4px radius at `(RADAR_X, RADAR_Y)`
- Arrow: 8px line from center in facing direction (`player.flipX ? Math.PI : 0`)
- Arrow color `0x4488ff`

### Ping Ripples

When a new enemy enters radar range (was outside `RADAR_WORLD_RADIUS` last frame, now inside):
- Spawn an expanding circle tween on the radar `Graphics` — BUT Phaser tweens don't animate Graphics draws natively. Instead, maintain a `pings: { x, y, r, alpha }[]` array on `MinimapRenderer`. Each frame, draw each ping as a circle stroke and decrement `alpha` by `0.04`, increment `r` by `1.2`. Remove when `alpha <= 0`.
- Ping color `0x00ffaa`.
- Track which drone IDs are in range using a `Set<number>` keyed on `drone.x + drone.y` ... actually use Phaser's built-in `GameObject` id via `(drone as any)._id` — or simpler: store a `WeakSet<Drone>` of drones currently in range, update each frame.

### Drone State Exposure

Add to `Drone`:
```ts
getState(): DroneState {
  return this.droneState;
}
```

This is the only change to `Drone.ts`.

### Files Changed

- `src/constants.ts` — add radar + seek range constants
- `src/scenes/GameScene.ts` — add `platformData` public array, populate in `makePlatforms()`
- `src/scenes/UIScene.ts` — add `update()`, instantiate `MinimapRenderer`
- `src/entities/Drone.ts` — add `getState()` public getter
- `src/ui/MinimapRenderer.ts` — NEW file (~120 lines)

---

## Out of Scope

- Platform-specific drone spawn logic (not needed, lanes already cover the Y range)
- Slope handling or camera Y expansion (deferred to a future verticality pass)
- Jetpack sound changes
- Platform destructibility
- Full-world minimap (deferred)
- Radar fog-of-war or line-of-sight occlusion

---

## Testing Checklist

**Platforms:**
- [ ] Player can land on low/mid/high platforms from above
- [ ] Player can jump through platforms from below (one-way collision)
- [ ] Drone bullets pass through platforms (no unintended collisions)
- [ ] Player bullets pass through platforms (no unintended collisions)

**Jetpack visuals:**
- [ ] Jetpack flame appears when space held mid-air with fuel
- [ ] Flame stops when landing, fuel exhausted, or space released
- [ ] Flame stops (does not freeze on) during hurt animation
- [ ] Flame position tracks mech correctly when flipped (facing left)
- [ ] Thruster emitter stays visually behind the mech when direction changes
- [ ] No particle emitter memory leak on scene restart (restart with R, verify no accumulation)

**Radar minimap:**
- [ ] Radar circle visible at bottom-right, does not obscure other HUD elements
- [ ] Enemy blips appear and are correctly color-coded (red/green)
- [ ] Enemy blips pulse when in ATTACK state
- [ ] Missile lock diamond appears on nearest in-range drone
- [ ] Missile lock diamond disappears when no drone is in range
- [ ] Ping ripple fires when a new drone enters radar radius
- [ ] Incoming drone bullet blips visible when bullets are within range
- [ ] Player facing arrow points correct direction
- [ ] Sweep line rotates continuously
- [ ] Ground line and platform bars appear at correct relative positions
- [ ] Radar updates correctly after scene restart
