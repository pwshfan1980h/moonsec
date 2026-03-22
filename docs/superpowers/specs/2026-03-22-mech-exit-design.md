# Design: Mech Exit — Pilot On Foot

**Date:** 2026-03-22
**Project:** moonsec (Phaser 3 + TypeScript mech sidescroller)
**Status:** Approved
**Inspiration:** MetalWarriors (SNES) — player ejects from mech and runs around as a tiny pilot

---

## Overview

Press **E** to eject the pilot from the mech. The mech freezes in place (invulnerable while empty). The pilot — a small white sphere placeholder, replaced with real art later — drops out and can run, jump, and use a weak personal jetpack. Press **E** again near the mech to re-enter. One drone bullet kills the pilot instantly (game over). Drones retarget to whichever of mech or pilot is closer.

Pass 1 scope only: eject/reenter, pilot movement, pilot death = game over, mech idles, drone retargeting. Button-areas and mech-takes-damage-while-empty are deferred to Pass 2.

---

## Feature 1: Pilot Entity

### New file: `src/entities/Pilot.ts`

Extends `Phaser.Physics.Arcade.Sprite` using a `'pilot_sphere'` texture generated in `GameScene.create()`.

**Texture generation** — call once in `GameScene.create()` before any Pilot is spawned:
```ts
const g = this.make.graphics({ x: 0, y: 0, add: false });
g.fillStyle(0xffffff, 1);
g.fillCircle(8, 8, 8);
g.generateTexture('pilot_sphere', 16, 16);
g.destroy();
```

**Constructor:**
```ts
constructor(scene: Phaser.Scene, x: number, y: number) {
  super(scene, x, y, 'pilot_sphere');
  scene.add.existing(this);
  scene.physics.add.existing(this);
  const body = this.body as Phaser.Physics.Arcade.Body;
  body.setSize(12, 12);
  body.setCollideWorldBounds(true);
  this.setDepth(11);  // Player is depth 10; pilot renders on top
}
```

**Fields:**
```ts
jetpackFuel = 3000;   // ms; drains by delta each frame → ~3 seconds at 60fps
```
No separate `onGround` field — use `(this.body as Phaser.Physics.Arcade.Body).blocked.down` directly, same pattern as `Player`.

**Movement constants (add to `constants.ts`):**
| Constant | Value | Notes |
|----------|-------|-------|
| `PILOT_WALK_SPEED` | 90 | px/s |
| `PILOT_JUMP_VEL` | -280 | px/s, applied once on jump keydown |
| `PILOT_JETPACK_ACCEL` | -1200 | px/s², via `setAccelerationY`. Net with gravity 600 = -600 px/s² upward. |
| `PILOT_JETPACK_MAX_FUEL` | 3000 | ms; ~3 seconds at 60fps |

**`update(cursors: Phaser.Types.Input.Keyboard.CursorKeys, space: Phaser.Input.Keyboard.Key, delta: number)`:**
```ts
update(cursors: Phaser.Types.Input.Keyboard.CursorKeys, space: Phaser.Input.Keyboard.Key, delta: number): void {
  const body = this.body as Phaser.Physics.Arcade.Body;
  const onGround = body.blocked.down;  // same pattern as Player

  // Horizontal movement
  if (cursors.left.isDown) {
    body.setVelocityX(-PILOT_WALK_SPEED);
    this.setFlipX(true);
  } else if (cursors.right.isDown) {
    body.setVelocityX(PILOT_WALK_SPEED);
    this.setFlipX(false);
  } else {
    body.setVelocityX(0);
  }

  // Jump + Jetpack — mirrors Player.ts pattern: outer space.isDown, then inner checks
  if (space.isDown) {
    if (onGround && Phaser.Input.Keyboard.JustDown(space)) {
      body.setVelocityY(PILOT_JUMP_VEL);
    }
  }

  // Jetpack — acceleration-based to overcome gravity (600 px/s²)
  const jetpackActive = space.isDown && !onGround && this.jetpackFuel > 0;
  if (jetpackActive) {
    body.setAccelerationY(PILOT_JETPACK_ACCEL);   // net: -1200 + 600 = -600 px/s² upward
    this.jetpackFuel = Math.max(0, this.jetpackFuel - delta);
  } else {
    body.setAccelerationY(0);
  }
}
```

**Note on `JustDown` and shared Key objects:** `Phaser.Input.Keyboard.JustDown(space)` ensures jump only fires once per press. The `space` Key object passed to `Pilot.update()` is the same underlying object as `Player.keySpace` (Phaser deduplicates by keycode). This is safe because `Player.update()` returns early via `if (!this.piloting) return` when ejected — it never reaches the jump guard — so `JustDown` is not pre-consumed by the mech. **The `!this.piloting` early return in `Player.update()` is a correctness dependency for `JustDown` to work correctly in the pilot.** Do not move it after the jetpack or jump code in `Player.update()`.

**Death:** No HP field. GameScene overlap callback calls `this.events.emit('gameOver')` (see Feature 3).

**Depth:** 11. Player.ts sets depth 10 in its constructor (`this.setDepth(10)`). Pilot must be 11 to avoid z-fighting when overlapping.

---

## Feature 2: Player Eject/Reenter State Machine

### Modify: `src/entities/Player.ts`

**New field:**
```ts
piloting = true;
```

**New public methods (expose state to GameScene):**
```ts
isHurtLocked(): boolean {
  return this.hurtLock > 0;
}
```
(`isDead()` already exists at line 197.)

**Spawn offset:** Mech display at scale 0.75: 150×112.5px, origin (0.5, 1) → feet at `player.y`, top at `player.y - 112.5`. The pilot spawns **beside** the mech (20px to the side) and **just above the mech top** to appear visually outside the mech sprite. Use `this.displayHeight` for precision — at scale 0.75, `displayHeight = 112.5`, so `this.y - (this.displayHeight + 8) ≈ this.y - 120`:

```ts
const PILOT_SPAWN_X_OFFSET = 20;  // pop out to the side (sign determined by flip direction)
// Y: just above mech top — this.y is feet, displayHeight is full sprite height at current scale
```

**`eject(): { x: number; y: number }`**
```ts
eject(): { x: number; y: number } {
  this.piloting = false;
  const body = this.body as Phaser.Physics.Arcade.Body;
  body.setVelocity(0, 0);
  body.setAcceleration(0, 0);
  body.moves = false;                      // freeze mech in place (also freezes mid-air if ejected while airborne)
  body.setCollideWorldBounds(false);       // prevent spurious world-bounds events while frozen
  this.setAlpha(0.45);                     // dark/idle visual
  this.play({ key: 'idle', repeat: -1 }, true);
  this.jetpackInner.emitting = false;
  this.jetpackOuter.emitting = false;
  const spawnX = this.x + (this.flipX ? -PILOT_SPAWN_X_OFFSET : PILOT_SPAWN_X_OFFSET);
  const spawnY = this.y - (this.displayHeight + 8); // just above mech top (~this.y - 120)
  return { x: spawnX, y: spawnY };
}
```

**`reenter(): void`**
```ts
reenter(): void {
  this.piloting = true;
  const body = this.body as Phaser.Physics.Arcade.Body;
  body.moves = true;
  body.setCollideWorldBounds(true);        // restore world bounds
  this.setAlpha(1);
}
```

**Turret pointer listener — add `piloting` guard:**

In the constructor, the existing `pointerdown` listener only guards on `this.dead`. Add a `piloting` check:
```ts
scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
  if (this.dead || !this.piloting) return;   // <-- add !this.piloting
  if (ptr.leftButtonDown()) {
    const wp = scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
    this.turret.fire(this.x, this.y, wp.x, wp.y, scene.time.now);
  }
});
```

**Input guard** — at the top of `update()`, directly after the existing `if (this.dead) return;` check:
```ts
if (!this.piloting) return;
```
This disables all mech inputs (weapons, movement, jetpack, shift/missile) while ejected.

---

## Feature 3: GameScene Wiring

### Modify: `src/scenes/GameScene.ts`

**New public fields:**
```ts
public pilot: Pilot | null = null;
```

**New private fields:**
```ts
private pilotGroundCollider: Phaser.Physics.Arcade.Collider | null = null;
private pilotBulletOverlap: Phaser.Physics.Arcade.Collider | null = null;
private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
private spaceKey!: Phaser.Input.Keyboard.Key;
```

**New public method — `triggerGameOver()`:**

Adds a clean, idempotent game-over trigger callable from within `GameScene` (e.g., from the pilot bullet overlap) without duplicating the `isGameOver` guard:
```ts
public triggerGameOver(): void {
  if (this.isGameOver) return;
  this.isGameOver = true;
  this.events.emit('gameOver');
}
```

**In `create()`:**

1. Capture input keys (Phaser deduplicates key objects — this does not conflict with Player's own captures):
```ts
const kb = this.input.keyboard!;
this.cursors  = kb.createCursorKeys();
this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
```

2. Generate pilot sphere texture:
```ts
const g = this.make.graphics({ x: 0, y: 0, add: false });
g.fillStyle(0xffffff, 1);
g.fillCircle(8, 8, 8);
g.generateTexture('pilot_sphere', 16, 16);
g.destroy();
```

3. Register E key handler (add to existing input setup in `create()`):
```ts
this.input.keyboard!.on('keydown-E', () => {
  if (this.isGameOver) return;

  if (this.pilot) {
    // Try reenter — measure to mech center (player.y - 56 ≈ half display height at scale 0.75)
    const mechCenterY = this.player.y - 56;
    const dist = Phaser.Math.Distance.Between(
      this.pilot.x, this.pilot.y,
      this.player.x, mechCenterY,
    );
    if (dist < 80) {
      this.pilotGroundCollider?.destroy();
      this.pilotBulletOverlap?.destroy();
      this.pilotGroundCollider = null;
      this.pilotBulletOverlap = null;
      this.pilot.destroy();
      this.pilot = null;
      this.player.reenter();
      this.cameras.main.startFollow(this.player, true, 0.12, 0.08);
    }
  } else {
    // Try eject
    if (this.player.isDead() || this.player.isHurtLocked()) return;
    const spawnPos = this.player.eject();
    this.pilot = new Pilot(this, spawnPos.x, spawnPos.y);
    this.cameras.main.startFollow(this.pilot, true, 0.12, 0.08);

    // Ground collider — uses body.blocked.down, but Pilot still needs collider for physics resolution
    this.pilotGroundCollider = this.physics.add.collider(this.pilot, this.ground);

    // Bullet overlap
    this.pilotBulletOverlap = this.physics.add.overlap(
      this.droneBullets,
      this.pilot,
      (_pilotObj, bulletObj) => {
        if (!this.pilot?.active) return;
        const bullet = bulletObj as Phaser.Physics.Arcade.Image;
        bullet.setActive(false).setVisible(false);
        if (bullet.body) (bullet.body as Phaser.Physics.Arcade.Body).enable = false;
        this.triggerGameOver();
      },
    );
  }
});
```

**In `update()`** — add after `this.player.update(time, delta)`:
```ts
if (this.pilot?.active) {
  this.pilot.update(this.cursors, this.spaceKey, delta);
}
```

**`getPilotOrPlayer()` — public method for drone targeting:**
```ts
public getPilotOrPlayer(): { x: number; y: number } {
  if (this.pilot?.active) return { x: this.pilot.x, y: this.pilot.y };
  return { x: this.player.x, y: this.player.y };
}
```

**Imports to add:** `import { Pilot } from '../entities/Pilot';`

**Note for implementers:** Do NOT add the ground collider inside `Pilot.ts` — `ground` is private to `GameScene`. All physics wiring lives in `GameScene`.

**Camera during ejection:** `cameras.main.startFollow(this.pilot)` switches the camera to follow the pilot on eject, and `cameras.main.startFollow(this.player)` restores it on reenter.

**Note on `triggerGameOver()` vs. Player.takeDamage():** `Player.takeDamage()` retains its own direct `this.scene.events.emit('gameOver')` call (via a delayed call). `triggerGameOver()` is added for use by the pilot bullet path only. Both paths converge correctly — `isGameOver` is set by the `game.events.on('gameOver', ...)` listener in `create()`. No changes to `Player.takeDamage()` are needed.

---

## Feature 4: Drone Retargeting

### Modify: `src/entities/Drone.ts`

**In `update()`, ATTACK state** — replace `const player = this.scene.player` and all subsequent `player.x/y` references with `getPilotOrPlayer()`:

Current code (lines 47–48, 64–65):
```ts
const player = this.scene.player;
const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
// ...
const dx = player.x - this.x;
```

Replace with:
```ts
const target = this.scene.getPilotOrPlayer();
const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
// ...
const dx = target.x - this.x;
```

**In `shoot()`** — current code at line 94–95:
```ts
const player = this.scene.player;
const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
```

Replace with:
```ts
const target = this.scene.getPilotOrPlayer();
const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
```

This ensures bullets aim at the pilot when ejected, not the frozen mech.

Patrol/HOVER logic is unchanged.

---

## Feature 5: UIScene HUD

### Modify: `src/scenes/UIScene.ts`

**Import to add:**
```ts
import { PILOT_JETPACK_MAX_FUEL } from '../constants';
```

**New private fields** (add alongside existing field declarations):
```ts
private suitLabel!: Phaser.GameObjects.Text;
private suitBg!: Phaser.GameObjects.Rectangle;
private suitBar!: Phaser.GameObjects.Rectangle;
private pilotPip!: Phaser.GameObjects.Rectangle;
private pilotPipLabel!: Phaser.GameObjects.Text;
```

**Note:** `missileBg` and `turretBg` are **already declared and assigned** in the live `UIScene.ts` (lines 13/20 declarations, lines 74/85 assignments). No changes needed for those fields.

**In `create()`** — add SUIT bar and pilot pip after the existing jetpack bar section (`jy` and local variables `hx`, `hy` are in scope at this point in `create()`):
```ts
// ── SUIT jetpack bar (pilot, shown only when ejected) ─────────
const sy = jy + 14;  // below JP bar
this.suitLabel = this.add.text(hx, sy, 'SUIT', {
  fontFamily: 'monospace', fontSize: '10px', color: '#aaffaa',
}).setVisible(false);
this.suitBg = this.add.rectangle(hx + BAR_W / 2 + 22, sy + 4, BAR_W, 6, 0x001100)
  .setOrigin(0.5, 0.5).setVisible(false);
this.suitBar = this.add.rectangle(hx + 22, sy, BAR_W, 6, 0x44ff44)
  .setOrigin(0, 0).setVisible(false);

// ── Pilot HP pip (shown only when ejected) ────────────────────
this.pilotPip = this.add.rectangle(hx, sy + 12, 6, 6, 0xff4444)
  .setOrigin(0, 0).setVisible(false);
this.pilotPipLabel = this.add.text(hx + 10, sy + 10, 'PILOT', {
  fontFamily: 'monospace', fontSize: '9px', color: '#ff4444',
}).setVisible(false);
```

**In `update()`** — extend the existing update method:
```ts
update(time: number, _delta: number): void {
  if (this.gameOverActive) return;
  const game = this.scene.get('Game') as GameScene;
  if (!game || !game.sys.isActive()) return;
  this.minimap.draw(time, game);

  // Pilot HUD
  const pilotActive = !!game.pilot?.active;

  this.suitLabel.setVisible(pilotActive);
  this.suitBg.setVisible(pilotActive);
  this.pilotPip.setVisible(pilotActive);
  this.pilotPipLabel.setVisible(pilotActive);
  if (pilotActive) {
    this.suitBar.setVisible(true);
    this.suitBar.setDisplaySize(BAR_W * (game.pilot!.jetpackFuel / PILOT_JETPACK_MAX_FUEL), 6);
  } else {
    this.suitBar.setVisible(false);
  }

  // Dim mech weapon bars while ejected
  const weaponAlpha = pilotActive ? 0.3 : 1.0;
  this.missileBar.setAlpha(weaponAlpha);
  this.missileBg.setAlpha(weaponAlpha);
  this.missileLabel.setAlpha(weaponAlpha);
  this.turretBar.setAlpha(weaponAlpha);
  this.turretBg.setAlpha(weaponAlpha);
  this.turretLabel.setAlpha(weaponAlpha);
}  // end update()

---

## Feature 6: MinimapRenderer — Pilot-Centered Radar

### Modify: `src/ui/MinimapRenderer.ts`

The minimap currently reads `game.player` for the radar center (`px`, `py`). When the pilot is ejected, the camera follows the pilot, but the radar remains centered on the frozen mech — the player sees terrain around the pilot on screen but the minimap shows terrain around the mech. Fix: use `getPilotOrPlayer()` as the radar center.

**In `draw()`** — replace lines 34–36:
```ts
// Before:
const player = game.player;
const px = player.x;
const py = player.y;

// After:
const player = game.player;                       // still needed for facing arrow fallback
const radarCenter = game.getPilotOrPlayer();
const px = radarCenter.x;
const py = radarCenter.y;
```

**Facing arrow** — the arrow at the center dot represents the current active entity's facing direction. Replace line 172:
```ts
// Before:
const arrowAngle = player.flipX ? Math.PI : 0;

// After:
const facing = game.pilot?.active ? game.pilot : game.player;
const arrowAngle = facing.flipX ? Math.PI : 0;
```

The center dot (white circle at `RADAR_X, RADAR_Y`) represents whichever entity is active — no change needed to the dot itself.

No other changes to `MinimapRenderer.ts`.

---

## State Machine Summary

```
PILOTING ──[E pressed, not hurt/dead]──────────────────────────▶ EJECTED
EJECTED  ──[E pressed, within 80px of mech center (y-56)]──────▶ PILOTING
EJECTED  ──[drone bullet overlaps pilot, pilot.active == true]──▶ GAME OVER
```

Edge cases:
- Eject blocked during hurt (`isHurtLocked()`) or dead (`isDead()`) state
- E key handler guarded by `if (this.isGameOver) return;`
- Collider and overlap stored as `pilotGroundCollider`/`pilotBulletOverlap` and destroyed on re-entry
- Bullet overlap callback guarded by `pilot.active` check to prevent double-fire
- `triggerGameOver()` is idempotent via `isGameOver` guard
- Camera follows pilot when ejected; restores to mech on reenter
- Mech turret `pointerdown` listener guarded by `!this.piloting`

---

## Out of Scope (Pass 2)

- Empty mech taking damage while pilot is out
- Button-area targets the pilot can interact with
- Hatch opening animation on eject
- Pilot picking up power-ups
- Pilot blip on radar as a distinct dot color (radar already centers on pilot; adding a labeled blip is future)

---

## Files Changed

| File | Change |
|------|--------|
| `src/constants.ts` | Add `PILOT_WALK_SPEED`, `PILOT_JUMP_VEL`, `PILOT_JETPACK_ACCEL`, `PILOT_JETPACK_MAX_FUEL` |
| `src/entities/Pilot.ts` | NEW — sphere texture constructor, walk/jump/jetpack, `update()` |
| `src/entities/Player.ts` | Add `piloting`, `eject()`, `reenter()`, `isHurtLocked()`, input guard, turret pointer guard |
| `src/entities/Drone.ts` | Replace `scene.player` target with `getPilotOrPlayer()` in `update()` and `shoot()` |
| `src/scenes/GameScene.ts` | `public pilot`, `triggerGameOver()`, `cursors`/`spaceKey` fields, texture gen, E key handler, camera switch, `getPilotOrPlayer()` |
| `src/scenes/UIScene.ts` | Import constant, new fields (turretBg, missileBg, suit/pilot), SUIT bar + pip in `create()`, extend `update()` |
| `src/ui/MinimapRenderer.ts` | Use `getPilotOrPlayer()` as radar center; facing arrow uses active entity's `flipX` |

---

## Testing Checklist

**Eject/reenter:**
- [ ] Press E ejects pilot beside mech (20px to side, just above mech top ~120px above feet), mech dims to alpha 0.45
- [ ] Pilot spawns clear of ground and mech body (does not teleport into terrain)
- [ ] Camera switches to follow pilot on eject
- [ ] Eject blocked during hurt animation (mech flashes, E does nothing)
- [ ] Eject blocked when mech is dead
- [ ] Walk pilot within 80px of mech center, press E — mech restores, pilot destroyed, camera returns to mech
- [ ] After re-entry, mech responds to all inputs normally
- [ ] Left-click (turret) does not fire while ejected

**Pilot movement:**
- [ ] Pilot walks left/right at reduced speed (slower than mech)
- [ ] Pilot jumps from ground (single press, space key)
- [ ] Pilot cannot jump while airborne
- [ ] Pilot jetpack fires while mid-air with fuel — pilot actually moves upward
- [ ] Pilot jetpack stops at fuel exhaustion (~3 seconds)
- [ ] Pilot collides with ground and platforms (lands on top surfaces)

**Death and game over:**
- [ ] One drone bullet hit on pilot → game over screen
- [ ] Mech takes no damage while pilot is out
- [ ] No crash or double-game-over if two bullets hit in the same frame

**Drone retargeting:**
- [ ] Drones move toward pilot when ejected (if pilot is closer)
- [ ] Drone bullets aim at pilot position (not frozen mech)
- [ ] Drones retarget mech immediately when pilot re-enters

**HUD:**
- [ ] SUIT jetpack bar appears only while ejected
- [ ] SUIT bar depletes as jetpack is used (~3 seconds to empty)
- [ ] PILOT HP pip visible while ejected, hidden otherwise
- [ ] Mech cooldown bars visibly dimmed while ejected, restored on re-entry
