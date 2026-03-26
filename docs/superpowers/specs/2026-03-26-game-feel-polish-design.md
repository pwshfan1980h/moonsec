# Game Feel Polish — Design Spec

## Goal

Six targeted improvements to game feel: drone difficulty tuning, jetpack particle visibility fix + amplification, camera tighter follow with vertical scroll (ground disappears on ascent), nanite heal particle visibility fix + label rename, player hit flash, and screen shake on player damage.

## Architecture

All changes are isolated to four files: `src/constants.ts`, `src/entities/Player.ts`, `src/scenes/GameScene.ts`, and `src/scenes/UIScene.ts`. No new systems, no new assets.

## Root Cause: Invisible Particles

Both jetpack emitters and nanite emitters are rendered at depth 7–9, behind the mech sprite at depth 10. The mech completely covers them. Fixing depth is the primary fix for both.

---

## Change 1 — Drone Difficulty (src/constants.ts)

Replace WAVE_BRACKETS with:

```ts
export const WAVE_BRACKETS = [
  { minWave: 0,  attackSpeed: 185, shootInterval: 2200, extraHp: 0, bulletSpeedMult: 1.1  },
  { minWave: 1,  attackSpeed: 230, shootInterval: 1800, extraHp: 0, bulletSpeedMult: 1.15 },
  { minWave: 2,  attackSpeed: 275, shootInterval: 1500, extraHp: 1, bulletSpeedMult: 1.2  },
  { minWave: 3,  attackSpeed: 320, shootInterval: 1200, extraHp: 1, bulletSpeedMult: 1.4  },
];
```

Changes from current:
- `attackSpeed`: +~15% across all brackets (160→185, 200→230, 240→275, 280→320)
- `bulletSpeedMult`: raised to 1.1/1.15/1.2/1.4 (was 1.0/1.0/1.0/1.2)
- `shootInterval` and `extraHp`: unchanged

---

## Change 2 — Jetpack Particles (src/entities/Player.ts)

### Problem
All three emitters are at depth 7–9 (below mech depth 10). The mech sprite hides them entirely.

### Fix — depth changes
- `jetpackInner`: `setDepth(9)` → `setDepth(11)` — renders above mech
- `jetpackOuter`: `setDepth(8)` → `setDepth(11)` — renders above mech
- `jetpackSmoke`: `setDepth(7)` → `setDepth(9)` — stays behind mech (smoke trail effect), but large enough to be visible below/around feet

### Amplification — new emitter configs

**jetpackInner** (orange flame core):
```ts
speed:     { min: 80,  max: 200 },
angle:     { min: 80,  max: 100 },
scale:     { start: 2.5, end: 0 },
alpha:     { start: 1,   end: 0 },
tint:      [0xff6600, 0xff2200, 0xffaa00],
lifespan:  280,
frequency: 80,
blendMode: 'ADD',
```

**jetpackOuter** (cyan glow):
```ts
speed:     { min: 50,  max: 130 },
angle:     { min: 65,  max: 115 },
scale:     { start: 4.0, end: 0 },
alpha:     { start: 0.6, end: 0 },
tint:      [0x00aaff, 0x0044ff, 0x44eeff],
lifespan:  400,
frequency: 60,
blendMode: 'ADD',
```

**jetpackSmoke** (wispy background trail):
```ts
speed:     { min: 15, max: 55 },
angle:     { min: 60, max: 120 },
scale:     { start: 10.0, end: 0 },
alpha:     { start: 0.30, end: 0 },
tint:      [0xaaaaaa, 0x888888, 0xcccccc, 0xffffff],
lifespan:  1400,
frequency: 90,
blendMode: Phaser.BlendModes.NORMAL,
```

---

## Change 3 — Camera: Tighter Follow + Vertical Scroll (src/scenes/GameScene.ts)

### Problem
`WORLD_HEIGHT = GAME_H = 1080`, so `setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)` gives zero vertical scrollroom — camera scrollY is locked at 0.

### Fix — camera bounds
Replace `this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)` with:
```ts
this.cameras.main.setBounds(0, -(GAME_H - 120), WORLD_WIDTH, WORLD_HEIGHT + (GAME_H - 120));
```
This expands the camera upward by 960px. Camera scrollY range becomes [-960, 0].

**Effect**: When player is at world Y≈420 or above, camera scrollY ≈ -340 and the ground (world Y=960) is off the bottom of the screen. Background TileSprites at `scrollFactor(0)` always cover the viewport regardless of camera position.

### Fix — lerp values
Replace `startFollow(this.player, false, 0.12, 0.08)` with:
```ts
this.cameras.main.startFollow(this.player, false, 0.20, 0.18);
```
- lerpX: 0.12 → 0.20 (tighter horizontal tracking)
- lerpY: 0.08 → 0.18 (tighter vertical tracking, needed to follow player upward)

This change applies to the single `startFollow` call that both levels now share (after the L2 rebuild).

---

## Change 4 — Nanite Heal: Fix Visibility + Label (src/entities/Player.ts, src/scenes/UIScene.ts)

### Problem
Both nanite emitters are at depth 9, behind the mech at depth 10.

### Fix — depth changes (Player.ts)
- `naniteAmbient`: `setDepth(9)` → `setDepth(12)`
- `naniteSpark`: `setDepth(9)` → `setDepth(12)`

### Amplification — new emitter configs (Player.ts)

**naniteAmbient** (steady ambient glow during heal):
```ts
tint:      [0x00ff88, 0x44ffcc, 0x00ccff],
speed:     { min: 30, max: 80 },
angle:     { min: 250, max: 290 },
lifespan:  600,
scale:     { start: 2.0, end: 0 },
frequency: 40,
blendMode: Phaser.BlendModes.ADD,
```

**naniteSpark** (burst every 600ms, emitParticle quantity 12):
```ts
tint:      [0x00ffff, 0xffffff, 0x44ff88],
speed:     { min: 80, max: 160 },
angle:     { min: 0, max: 360 },
lifespan:  350,
scale:     { start: 2.0, end: 0 },
quantity:  12,
blendMode: Phaser.BlendModes.ADD,
```
The `emitParticle` call in `startNaniteParticles` also changes quantity arg: `emitParticle(12, ...)` (was 6).

### Label (UIScene.ts)
Find the label text `'NNT'` (around line 106) and change to `'NANOHEAL'`.

---

## Change 5 — Player Hit Flash (src/entities/Player.ts)

In `takeDamage()`, in the `else` branch (non-lethal damage, where `hurtLock = 600` is set), add:

```ts
this.setTint(0xff3333);
this.scene.time.delayedCall(150, () => { if (!this.dead) this.clearTint(); });
```

Placed immediately after `this.hurtLock = 600`.

---

## Change 6 — Screen Shake on Player Hit (src/scenes/GameScene.ts)

In the `droneBullets` → `player` overlap callback (currently calls `takeDamage(1)`), add:

```ts
this.cameras.main.shake(80, 0.006);
```

Placed after the `takeDamage` call. This fires only when the hit actually lands (hurt lock and dead guard are inside `takeDamage`). Note: the `damageShield` absorb still triggers the shake — this is acceptable and gives feedback that the shield fired.

---

## File Summary

| File | Changes |
|------|---------|
| `src/constants.ts` | WAVE_BRACKETS attackSpeed + bulletSpeedMult |
| `src/entities/Player.ts` | Jetpack emitter depth + config, nanite emitter depth + config, hit flash tint |
| `src/scenes/GameScene.ts` | Camera bounds + lerp, screen shake overlap |
| `src/scenes/UIScene.ts` | 'NNT' → 'NANOHEAL' label |
