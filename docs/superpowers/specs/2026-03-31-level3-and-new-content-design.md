# Moonsec — Level 3, New Enemies & Gameplay Improvements
**Date:** 2026-03-31
**Status:** Approved
**Approach:** B — Integrated (extend existing L1→L2 pattern)

---

## Overview

This spec covers four areas:
1. **Bug fixes & gameplay improvements** — four identified issues
2. **New enemies** — ShieldedTank (replaces Crawler) and Mine
3. **Level 3: Ice Caverns** — moon underground, uneven terrain, ice friction, death pits, enemy resilience
4. **Mother Drone** — final boss, bullet-hell + 10-missile kill condition

Versioning is also addressed: the game moves to `v0.7.0` on new enemy release and `v0.8.0` on Level 3 release.

---

## 1. Bug Fixes & Gameplay Improvements

### Fix 1 — Homing missiles ignore the boss
**File:** `src/weapons/HomingMissile.ts`
**Problem:** `findNearestDrone()` only queries `scene.drones.getChildren()`. The `NexusBoss` lives outside that group, so missiles are useless during boss fights unless an escort is alive.
**Fix:** Rename to `findNearestTarget()`. After querying drones, also check `scene.boss` if it exists and `scene.boss.active` is true. Include it as a distance candidate alongside drones. Return the closest valid target. **Prerequisite:** `GameScene` must expose the active boss instance as a public `boss` property (currently the boss is created locally — promote it to a class-level field).

### Fix 2 — Pickup despawn too aggressive
**File:** `src/scenes/GameScene.ts` (pickup spawn logic)
**Problem:** Pickups despawn after 6s. With jetpack movement and uneven terrain, players regularly cannot reach them in time.
**Fix:** Extend lifetime to 10s. At 3s remaining, start a looping alpha tween (`1 → 0.3 → 1`, 400ms cycle) as a visual warning. Cancel tween and destroy on collection.

### Fix 3 — Bomber drone telegraph Y-drift
**File:** `src/entities/BomberDrone.ts`, `startTelegraph()` and `drop()`
**Problem:** The telegraph circle is drawn at the hardcoded `GROUND_Y` constant. On L2 (physics-object ground, not tilemap), the indicator can visually misalign from the actual explosion landing point.
**Fix:** At `drop()` time, raycast downward from the drop X position to find the actual ground contact Y. Use that Y for both the telegraph indicator draw and the explosion damage-zone origin.

### Fix 4 — Upgrade cards reset on L1→L2 transition
**File:** `src/scenes/GameScene.ts`, `init()` and `create()`; `src/data/upgradeCards.ts`
**Problem:** Cards selected in L1 (`OVERCLOCK`, `PLATING`, etc.) are lost when GameScene restarts for L2. Only `totalScore` is passed through `init()`.
**Fix:** Before transitioning to L2, serialize the player's active upgrade flags (all boolean/numeric properties modified by cards) into `this.registry`. In `create()`, after player construction, reapply registry-persisted upgrade values if present. Cards reset only on a true game-over/new-run, not on level transitions.

---

## 2. New Enemies

### 2a. ShieldedTank (replaces Crawler in all levels)

**File:** `src/entities/ShieldedTank.ts` (new), extends ground-movement skeleton from `Crawler.ts`

**Overview:** A space tank on treads with two sequential combat phases. Must defeat the energy shield before the hull can be damaged.

**Phase 1 — Shielded**
- A visible energy shield bubble surrounds the tank (rendered as a tinted circle sprite with alpha)
- Shield HP: 3 hits from any weapon. Bullets spark/flash on contact but deal 0 hull damage
- Movement: slow patrol toward player (`speed: 50 px/s`), same patrol half-distance as Crawler (350px from spawn)
- Attack: fires artillery shells — slow-moving projectiles (`speed: 180 px/s`) with 100px blast radius. Telegraph: a targeting reticle tracks the player's position for 1.2s before firing. Fire interval: 3500ms
- Shell collision damage: 2 HP to mech, instant kill to ejected pilot

**Phase 2 — Exposed**
- Shield pops with a burst particle effect and screen flash
- Tank stops moving, becomes a stationary artillery emplacement
- Fire rate increases: 2200ms interval, slightly tighter arc
- Hull HP: 5. Takes full damage from all weapons
- Destroyed with a larger explosion than standard drones

**States:** `PATROL` → `ATTACK` (same trigger as Crawler: target within 420×300px rectangle) → `SHIELD_BREAK` (transition) → `EXPOSED_ATTACK` → `HURT` → `DEATH`

**Spawn:** Left/right edges at ground level, same logic as Crawler. Wave counts:
- Wave 1: 1 ShieldedTank
- Every 2 waves: +1 ShieldedTank (cap: 3)

**Visual:** Blue/white pulsing shield bubble in phase 1. Dark metal tread chassis visible throughout. Tread animation during movement.

---

### 2b. Mine

**File:** `src/entities/Mine.ts` (new)

**Overview:** A static ground hazard placed by `DroneSpawner`. Does not move. Can be shot to destroy safely, or detonates on player proximity.

**Behavior**
- Spawned at random ground-level X positions within the world bounds, placed during wave spawn stagger
- Idle state: small metallic disc sprite, no animation
- Proximity trigger: arms when player comes within 120px. Visual: slow red pulse (alpha tween)
- Fuse: 0.8s after arming → detonation
- Detonation damage zone: 90px radius, 2 HP to mech, instant kill to ejected pilot
- Can be shot and destroyed before arming (1 hit from any weapon). Shooting an already-armed mine detonates it immediately at its current position — intended as a tactical option

**Spawn rate:** 1–2 per wave from wave 2 onward (L1/L2). In L3 from wave 1.

**Visual:** Small dark disc. Red LED indicator. Arms with red glow pulse. Detonation uses existing explosion particle system.

---

## 3. Level 3 — Ice Caverns

### 3a. World Layout

- **Dimensions:** 6400×1080px (same as L1/L2)
- **Ground:** Tilemap-based (like L1), required for per-tile friction. Ice tileset — pale blue/white tiles with cracked surface detail
- **Terrain profile:** Highly uneven floor, height variance of ~300px across the world. No flat patrol lanes. Raised ice shelves and floating crystal platforms at varying heights
- **Stalactites:** Ceiling-hanging crystal formations as non-collidable visual dressing
- **Death pits:** 5–6 gaps in the floor tilemap of varying widths (50–200px). Falling below `WORLD_HEIGHT - 50` triggers instant death for both mech and ejected pilot — no HP check, no hurt state, straight to death sequence. Same kill path as pilot-hit-by-bomber. Death pits are visually distinct: dark void visible below the ice floor, with a faint blue glow from below
- **Palette:** Deep blue/black background, pale blue/white ice tiles, cyan crystal accents, faint star glow in the void gaps

### 3b. Ice Friction

- Applied via `setFriction(0.05, 1)` on the tilemap layer (very low X friction, normal Y so gravity works correctly)
- Effect: stopping and turning is sluggish — releasing movement keys causes the player to slide before halting
- Air movement via jetpack is **unaffected** — skilled players can use jetpack to bypass slippery ground sections
- On first entering L3, a HUD notification fades in and out: `"Slippery terrain"` — same style as existing messages

### 3c. Encounter Structure

- `DroneSpawner` gains an `encounterMode: true` flag for L3
- Wave size: 4–6 enemies (down from 10+ in L1/L2), but each is individually tougher (`resilience: 2`, see Section 4)
- **4 waves** before the boss (up from 3 in L1/L2)
- L3 enemy roster per wave: mix of drones (with resilience), ShieldedTanks, and Mines. No Crawlers
- Boss wave: wave 4. Spawns `MotherDrone` instead of `NexusBoss`

### 3d. Scene Setup

- `level: 3` flag passed via `init()` the same as L2
- `GameScene.create()` gains a third branch for L3 tilemap, physics setup, death-pit world bounds detection, and ice friction
- `DroneSpawner` constructed with `encounterMode: true` and L3 enemy composition

---

## 4. Enemy Resilience System

**Property:** `resilience: number` on `Drone` and `ShieldedTank` base classes. Defaults to `0` (no change to L1/L2 behavior).

**L3 enemies:** All standard drones in L3 are constructed with `resilience: 2`. ShieldedTanks are explicitly excluded — they already have a two-phase mechanic (shield → exposed hull) which provides equivalent staying power. Giving them resilience on top would result in 4 effective lives, which is too punishing.

**DOWNED state**
- Triggered when HP reaches 0 and `resilience > 0`
- Enemy collapses, stops all movement and shooting, plays a "down" animation
- Decrements `resilience` by 1
- After 4s, revives with 50% max HP, plays white pulse flash
- A small indicator above the enemy shows remaining revivals: `●●` → `●○` → `○○`

**Permanent kill**
- Shooting a DOWNED enemy to 0 HP kills it immediately, bypassing remaining resilience
- Third knockdown (resilience exhausted): full death sequence, larger explosion

**Visual damage states**
- First down: sparking, light smoke
- Second down: heavier damage, dragging animation
- Third knockdown: full destruction

**Scope:** L3 only. Mines have no resilience. Mother Drone uses its own phase system.

---

## 5. Mother Drone (Final Boss, Level 3)

**File:** `src/entities/MotherDrone.ts` (new), parallel to `NexusBoss.ts`

### 5a. Core Mechanic

- **Only homing missiles deal damage.** Rapid gun and turret shots spark off the carapace (0 damage, visual only)
- **10 missiles must land** to kill the boss. Each landed missile counts as 1 hit regardless of upgrade cards
- Missiles only connect during **vulnerability windows** (see below). Missiles fired outside windows are deflected with a visual spark
- The fight is: read the pattern → survive → fire missiles during the window → repeat

### 5b. Phases

**Phase 1 — 10 to 7 missiles remaining**
- Drifts slowly along the cavern ceiling (left/right) at `speed: 40 px/s`
- **Ring burst:** Every 3.5s, fires expanding concentric rings of bullets. Each ring has 2–3 navigable gaps. Player must jump/dodge through a gap
- **Egg clusters:** Drops egg clusters to the ground every 8s. Each hatches into a standard drone after 4s. Adds normal combat pressure alongside bullet hell
- **Vulnerability window:** 3s after each ring burst sequence. Underbelly sac opens and pulses bright. HUD shows `VULNERABLE — FIRE MISSILES`

**Phase 2 — 6 to 4 missiles remaining**
- Movement speed increases to `65 px/s`
- Ring gaps narrow, bullet density increases
- **Sweep beam added:** A telegraphed horizontal laser sweeps top-to-bottom on one side of the screen (red telegraph line, 1.5s warning). Player must be on the opposite side before it fires
- Egg hatch time drops to 2.5s
- Vulnerability window shrinks to 2.5s

**Phase 3 — 3 to 0 missiles remaining**
- Maximum aggression
- **Spiral + cluster combo:** Spiral bullet pattern fires simultaneously with targeted clusters aimed at the player's current position
- Continuous drone spawning (no eggs — drones drop directly, no hatch delay)
- Sweep beams alternate both sides with 1s telegraph
- Vulnerability window appears after each completed heavy attack sequence (spiral + cluster), duration 2s

### 5c. Vulnerability Window

- Triggered: after each major attack sequence completes
- Visual: underbelly sac opens, glows bright white/cyan, body pulses
- HUD: `VULNERABLE — FIRE MISSILES` indicator (same overlay style as boss telegraph)
- Missiles fired outside window: still home to boss normally (homing not disabled), but deflected on contact — spark effect, 0 damage
- Missiles fired inside window: home normally, deal 1 damage per hit, play impact flash on boss

### 5d. Death Sequence

- After 10th missile lands: boss begins 6s staggered explosion sequence across its body
- Screen shakes, stalactites fall (visual only), cavern lighting flickers
- Final large explosion, then cut to end screen / credits

### 5e. Ice Interaction

- Slippery floor means the player must anticipate ring gaps a beat early — can't stop on a dime to reposition
- Jetpack provides the skilled-player escape valve for repositioning mid-pattern

---

## 6. Versioning

**Source of truth:** `version` field in `package.json`

**Build-time exposure:** Vite `define` config exposes `__APP_VERSION__` at build time, read from `package.json`. No manual string to maintain.

**Title screen display:** `TitleScene` renders `ALPHA v{version}` in the bottom-right corner using the existing small HUD font style.

**Roadmap:**

| Version | Content |
|---|---|
| `0.6` (current) | Two levels, NexusBoss, 5 enemy types, upgrade cards + tree |
| `0.7` | Bug fixes (4x), ShieldedTank replaces Crawler, Mines |
| `0.8` | Level 3 Ice Caverns, Mother Drone final boss, enemy resilience, ice friction |
| `0.9` | Polish — audio/FX for new enemies, balance pass |
| `1.0` | Full release — all levels, final boss, complete progression tree |

---

## 7. File Change Summary

### New files
| File | Purpose |
|---|---|
| `src/entities/ShieldedTank.ts` | Two-phase shielded ground tank |
| `src/entities/Mine.ts` | Static proximity-trigger ground hazard |
| `src/entities/MotherDrone.ts` | Final boss — bullet hell + missile-gated |

### Modified files
| File | Change |
|---|---|
| `src/weapons/HomingMissile.ts` | `findNearestDrone()` → `findNearestTarget()`, includes boss ref |
| `src/entities/Drone.ts` | Add `resilience: number` property + `DOWNED` state |
| `src/entities/BomberDrone.ts` | Telegraph Y snapped to actual ground contact, not `GROUND_Y` |
| `src/scenes/GameScene.ts` | L3 branch in `create()`, death-pit detection, card persistence fix, pickup 10s lifetime |
| `src/systems/DroneSpawner.ts` | `encounterMode` flag, L3 enemy composition, Mine spawning |
| `src/scenes/TitleScene.ts` | Version string display bottom-right |
| `src/data/levelData.ts` | L3 Ice Caverns tilemap builder |
| `vite.config.ts` | Expose `__APP_VERSION__` from `package.json` |
| `package.json` | Bump to `0.7.0` (on new enemy release) |
| `ROADMAP.md` | New file at repo root |
