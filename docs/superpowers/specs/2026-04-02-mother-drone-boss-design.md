# Mother Drone Boss — Design Spec

**Date:** 2026-04-02  
**Target version:** v0.8  
**Level:** Level 3 (Ice Caverns) — wave 3 final boss

---

## Context

The current game has `NexusBoss` as the wave-3 final boss for L1 and L2. L3 needs its own boss. The v0.8 roadmap noted "Mother Drone boss (bullet-hell + 10-missile kill)." This spec defines the full design.

The core mechanic: **only homing missiles damage the Mother Drone**, but single-file drone lines fly between her and the player, physically intercepting missiles. The player must shoot gaps in drone lines with the rapid gun before missiles can reach her. This makes bullets and missiles complementary rather than redundant.

---

## New Files

| File | Purpose |
|------|---------|
| `src/entities/MotherDrone.ts` | Boss class — state machine, HP, reposition logic, projectile firing |
| `src/entities/LineDrone.ts` | Minimal drone — flies horizontally at constant speed, no AI, no shooting |

## Modified Files

| File | Change |
|------|--------|
| `src/systems/DroneSpawner.ts` | Spawn `MotherDrone` on L3 wave 3 instead of normal wave |
| `src/scenes/GameScene.ts` | Add `bossProjectiles` physics group; register new overlaps |
| `src/ui/MinimapRenderer.ts` | Render boss as pulsing rings when `drone.isBoss === true` |

---

## MotherDrone State Machine

```
DRIFT ──(spawnTimer)──► SPAWN_LINE ──(line launched)──► DRIFT
  ▲                                                         │
  │                                              (missile hits)
  │                                                         ▼
  └──────────────────────────────── REPOSITION ◄── HURT (400ms flash)
                                        │
                                   (tween done)
                                        ▼
                                   SPAWN_LINE   (immediately — no free window)
                                        │
                                  (hp reaches 0)
                                        ▼
                                      DEATH
```

**Key properties:**
- HP: 10 (missile hits only)
- Scale: 4.0×
- Y position: top 20% of screen, centered horizontally on spawn
- Reposition distance: ±300px sideways (600ms tween, alternating direction)
- Bullet damage: 0 — missile→MotherDrone overlap registered separately from bullet→drones; no special immunity override needed
- On death: 3 staggered explosions → emit `bossKilled`
- `isBoss: true` — read by MinimapRenderer

---

## LineDrone

Simple `Phaser.Physics.Arcade.Sprite` subclass. No state machine, no shooting.

- Spawned staggered 120ms apart from the left or right edge at Mother Drone's Y + 80px
- Travel speed: 180px/s horizontally
- Spacing: 90px between drones in the line
- Destroyed by player bullets (1 hit) or by leaving screen bounds
- Added to `game.drones` group — missiles intercept them automatically, minimap renders them as normal red dots
- `getState()` returns `'HOVER'` always

---

## Ramp-Up Brackets

Brackets activate when MotherDrone HP drops into range. All values are tuning starting points.

| HP | Spawn interval | Max active lines | Drones/line | Slow projectiles |
|----|---------------|-----------------|-------------|-----------------|
| 10–8 | 3.5s | 1 | 6 | none |
| 7–5 | 2.2s | 2 | 7 | none |
| 4–2 | 1.6s | 2 | 8 | 1 every 4s |
| 1 (enraged) | 1.0s | 3 | 9 | 1 every 2s, speed ×1.3 |

Line direction alternates L/R in phase 1; both sides simultaneously from phase 2; random from phase 3.

---

## Large Slow Projectiles (Phase 3+)

Fired from MotherDrone downward toward current player X.

- Speed: 80px/s
- Visual: large glowing orange orb, ~24px radius
- Destroyable by bullets (1 hit) — also intercepts missiles that cross its path
- Ground contact: visual explosion, no damage
- Stored in `game.bossProjectiles` group

**New overlaps in GameScene:**
1. `playerBullets` → `bossProjectiles` — destroy both
2. `player` → `bossProjectiles` — player takes 1 damage, destroy projectile
3. `missiles` → `bossProjectiles` — destroy missile, destroy projectile

---

## Minimap Rendering

`MinimapRenderer.ts` already iterates `game.drones` and calls `getState()`. Add a branch:

```typescript
if ((drone as any).isBoss) {
  // draw 3 concentric rings, radius pulses with sin(time)
  const r = 6 + Math.sin(time * 0.008) * 2;
  gfx.lineStyle(2, 0xff4444, 0.9); gfx.strokeCircle(dp.x, dp.y, r);
  gfx.lineStyle(1, 0xff4444, 0.5); gfx.strokeCircle(dp.x, dp.y, r + 6);
  gfx.lineStyle(0.5, 0xff4444, 0.2); gfx.strokeCircle(dp.x, dp.y, r + 12);
} else { /* existing dot logic */ }
```

---

## DroneSpawner Integration

In `DroneSpawner.ts`, the L3 boss wave branch (mirrors existing NexusBoss spawn at wave 3):

1. Instantiate `MotherDrone` at screen center top
2. Add to `game.drones`
3. Register missile→MotherDrone overlap (GameScene or DroneSpawner)
4. Listen for `bossKilled` to trigger wave-cleared flow

---

## Out of Scope

- New sprite/texture assets — use placeholder or existing drone sprite scaled up
- Audio cues — v0.9 polish pass
- L3 tilemap/environment — separate work item
- New upgrade tree nodes for this boss

---

## Verification

1. Run L3 wave 3 — MotherDrone spawns at top-center
2. Fire rapid gun into drone line — individual drones die, gap opens
3. Fire missile through gap — MotherDrone takes damage, flashes red, repositions, spawns fresh line
4. Fire missile into drone — missile is intercepted (destroyed), no damage to MotherDrone
5. Fire bullet directly at MotherDrone — no damage
6. Drop her to HP 4 — large slow projectiles begin; bullets destroy them
7. Drop to HP 1 — 3 simultaneous lines, faster everything
8. Final missile hit — death sequence, `bossKilled` emitted, level transitions
9. Minimap — large pulsing rings visible, distinct from regular drone dots
