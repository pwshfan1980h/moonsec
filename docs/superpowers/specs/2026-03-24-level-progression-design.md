# Level Progression Design Spec

> **For agentic workers:** Use superpowers:writing-plans to produce the implementation plan from this spec.

**Goal:** Add two named levels with distinct aesthetics, a boss enemy, a new drone variant per level, new projectile patterns, and a wave-threshold level transition system.

---

## Overview

The game currently has one infinite horizontal level. This spec introduces a two-level progression:

- **Level 1 — SURFACE OPS**: existing horizontal world, waves 1–10, ends with Nexus Boss at wave 10.
- **Level 2 — SUBSURFACE**: new vertical downward-scrolling world, green aesthetic, waves 1–12, ends with Nexus Boss at wave 12.

Beating the boss triggers the level transition. Level 2 applies a global difficulty multiplier on top of the shared WAVE_BRACKETS table.

---

## Level 1 — SURFACE OPS

### Changes to existing game

- Display level name "SURFACE OPS" in UIScene on level start (brief fade-in text, top-center, 2s).
- Wave count cap: wave 10 triggers the boss wave instead of a normal drone wave.
- New enemy at wave 7: **Sentinel** drone (see below).
- After boss death: UIScene shows "LEVEL COMPLETE — DESCENDING TO SUBSURFACE" overlay (2s), fades to black (500ms), then calls `scene.start('Game', { level: 2, mechType })`.

### Sentinel Drone (new enemy, wave 7+)

Uses `Sentinel-sheet.png` (37×29px, 15 frames). Loaded as spritesheet key `'sentinel'` in BootScene. Animated via `buildDroneAnims('sentinel')` → creates `sentinel-hover`, `sentinel-attack`, `sentinel-hurt`, `sentinel-death`. This makes `'sentinel'` a valid `DroneType` alongside `'drone-red'` and `'drone-green'`.

| Stat | Value |
|------|-------|
| HP | 3 (always — ignores bracket `extraHp`) |
| Scale | 2.2× |
| ATTACK_SPEED | 220 px/s |
| SHOOT_INTERVAL | 1400ms |
| Bullet speed | standard bracket value |

**Spawning rule:** From wave 7+, every drone at index `i % 4 === 3` (i.e. 4th, 8th, 12th… per wave) is a Sentinel. Counter resets each wave.

**HP override:** Drone constructor gains an optional `forceHp?: number` parameter. When provided, it overrides the bracket-computed HP. DroneSpawner passes `forceHp: 3` when spawning Sentinels, keeping HP fixed regardless of bracket `extraHp`.

### Nexus Boss (wave 10)

**Sprite:** `Nexus-sheet.png` (25×27px, 18 frames). Loaded as spritesheet key `'nexus'`. Animations built with a custom call in BootScene (5 tags — not the standard 4 — so `buildDroneAnims` is not used; inline `anims.create` calls instead):

- `nexus-hover` (frames 0–3, pingpong, 120ms/frame)
- `nexus-charge` (frames 4–6, pingpong, 100ms/frame) — pre-attack telegraph
- `nexus-attack` (frames 7–10, forward, 80ms/frame)
- `nexus-hurt` (frames 11–12, forward, 100ms/frame)
- `nexus-death` (frames 13–17, forward, 120ms/frame)

**Stats:**

| Stat | Value |
|------|-------|
| HP | 18 |
| Scale | 4.5× |
| Move speed | 50 px/s horizontal drift |
| Charge duration | 1200ms (plays `nexus-charge`, no movement) |
| Fire pattern | 3-bullet fan (±20° spread toward player) |
| Shoot cycle | charge 1200ms → fire → drift 1800ms → repeat |
| Bullet speed | 280 px/s |
| Escort drones | 2 normal `drone-red` drones, spawned at boss creation |

**State machine:** `DRIFT → CHARGE → FIRE → DRIFT` (loops). `HURT` and `DEATH` interrupt from any state.

**Escort respawn:** Boss tracks escort references. On a `delayedCall(20000)` after each escort death, spawns a replacement if total living escorts < 2. Cap: 2 escorts alive at once.

**Death sequence:**
1. Play `nexus-death`.
2. Three staggered `spawnExplosion()` calls at 0ms, 150ms, 300ms with slight X/Y offsets.
3. Drop 3 energy balls at boss position (for Group B resource system — stub as `droneKilled` drops for now).
4. Emit `bossKilled` event (NOT `droneKilled` — boss has its own event).
5. Destroy self.

**Score:** GameScene listens for `bossKilled`, adds 1000 to `this.score`, emits `scoreChange(this.score)`.

### Spread shot (new projectile pattern)

Boss fires 3 bullets simultaneously. In `NexusBoss.fire()`:
```ts
const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
for (const offsetDeg of [-20, 0, 20]) {
  const angle = baseAngle + Phaser.Math.DegToRad(offsetDeg);
  const b = this.scene.droneBullets.get(...) as Phaser.Physics.Arcade.Image;
  // set active, velocity at BULLET_SPEED in direction angle
}
```
Uses existing `bullet-drone` texture and `droneBullets` group — automatically overlaps player via existing setup.

---

## Wave cleared detection

DroneSpawner tracks `dronesAlive`. When `dronesAlive === 0` AND `this.spawning === false` (i.e. the wave has fully spawned and all enemies are dead), emit `waveCleared` event. This event is used by:
- Level 2: camera Y-bound advancement
- Level transition check: `if (waveIndex >= BOSS_WAVE && dronesAlive === 0)` is already covered by boss death

DroneSpawner already checks `dronesAlive` via the `droneKilled` listener in its constructor. Add the `waveCleared` emit there:
```ts
scene.events.on('droneKilled', () => {
  this.dronesAlive = Math.max(0, this.dronesAlive - 1);
  scene.events.emit('dronesRemaining', this.dronesAlive);
  if (this.dronesAlive === 0 && !this.spawning) {
    scene.events.emit('waveCleared', this.waveIndex);
  }
});
```

---

## GameScene — level branching

### `init()` update

```ts
init(data: { mechType?: MechType; level?: number }): void {
  if (data.mechType) this.registry.set('mechType', data.mechType);
  if (data.level !== undefined) this.registry.set('currentLevel', data.level);
  if (data.totalScore !== undefined) this.registry.set('totalScore', data.totalScore);
}
```

### `create()` branching

```ts
const currentLevel = (this.registry.get('currentLevel') as number) ?? 1;
```

- If `currentLevel === 1`: existing world setup (horizontal, blue palette, `makeBackground()`, `makePlatforms()`/`makeStructures()`).
- If `currentLevel === 2`: new world setup (vertical, green palette, `makeBackgroundL2()`, `makeShaftLedges()`).

### Registry values

| Key | Description |
|-----|-------------|
| `'mechType'` | Selected mech, persists across levels |
| `'currentLevel'` | 1 or 2, set in init() |
| `'totalScore'` | Cumulative score carried from Level 1 |

Score is cumulative. On level transition, pass `totalScore: this.score` in the scene start data.

---

## Level 2 — SUBSURFACE

### World layout

| Property | Value |
|----------|-------|
| Width | 1280px (no horizontal scroll — camera X fixed) |
| Height | 4800px |
| Camera | Follows player Y only; X locked to 640 |
| Camera initial bounds | `setBounds(0, 0, 1280, 720)` |
| Progression | On `waveCleared`: `cameraBoundMaxY += 480`, `physics.world.setBounds(0, 0, 1280, cameraBoundMaxY)`, `cameras.main.setBounds(0, 0, 1280, cameraBoundMaxY)` |
| Aesthetic | Background `0x001400`, structures `0x0a2010`, glow `0x00ff66`, lights `0x44ff44` |

### `makeBackgroundL2()`

Same star field approach as `makeBackground()` but with green-tinted stars:
- Solid background: `0x001400`
- Stars: tint `0x88ff88` (far, low alpha) and `0xaaffaa` (near, medium alpha)
- Single `TileSprite` for parallax (vertical scroll factor 0.3)

### `makeShaftLedges()`

Generates wall-anchored ledges alternating left/right, spaced ~200px vertically from y=600 down to y=4400:

```ts
// Even indices: left-anchored; odd: right-anchored
const w = 200 + hash(i) * 140;  // 200–340px wide
const x = i % 2 === 0 ? w / 2 : 1280 - w / 2;
const y = 600 + i * 200 + hash(i + 100) * 80;
this.addStructure(x, y, w);  // reuses existing method, green palette passed as param or via currentLevel flag
```

Total: ~18 ledges. `addStructure()` is extended to accept an optional `palette` argument — when not provided defaults to Level 1 blue colors.

### Camera and scroll control

- `startFollow(player, false, 0.10, 0.10)` for tighter vertical tracking
- On `waveCleared`, advance `cameraBoundMaxY` by 480 (capped at 4800)
- Player's world bounds updated simultaneously — cannot scroll back up

### Bouncing projectiles (Level 2 only)

All bullets spawned from `droneBullets` group in Level 2 bounce once off side walls:

- In GameScene.create() when `currentLevel === 2`:
  ```ts
  // Enable world bounds on bullet group
  this.physics.world.on('worldbounds', (body: Phaser.Physics.Arcade.Body) => {
    const go = body.gameObject as Phaser.Physics.Arcade.Image;
    if (!go?.active) return;
    const bounces = (go.getData('bounces') ?? 0) + 1;
    if (bounces >= 2) {
      go.setActive(false).setVisible(false);
      body.enable = false;
    } else {
      go.setData('bounces', bounces);
    }
  });
  ```
- Individual bullets need `body.onWorldBounds = true` when activated. Set this in the DroneSpawner/NexusBoss bullet spawn code when `currentLevel === 2` (check `this.scene.currentLevel`).
- `setBounce(1)` and `setCollideWorldBounds(true)` set on the bullet body when activated in L2.

### Difficulty multiplier

DroneSpawner applies a L2 multiplier after computing the bracket:
```ts
if (this.scene.currentLevel === 2) {
  bracket = {
    ...bracket,
    attackSpeed:    Math.round(bracket.attackSpeed * 1.2),
    shootInterval:  Math.round(bracket.shootInterval * 0.85),
  };
}
```
NexusBoss constructor also accepts `level: number` and self-applies the same multiplier to its own stats.

### Wave count

12 waves. `BOSS_WAVE_L2 = 12`. Same boss (Nexus) as Level 1 but with multiplied stats.

---

## Level transition: L1 → L2

**Trigger:** `bossKilled` event in GameScene.

**UIScene handler:**
1. Show "LEVEL COMPLETE" overlay (dark rect, depth 60).
2. Display "SURFACE OPS CLEARED" and "DESCENDING TO SUBSURFACE…" text.
3. After 2000ms: fade camera to black over 500ms.
4. After fade: `gameScene.scene.start('Game', { level: 2, mechType, totalScore: score })` and `this.scene.restart()`.

**GameScene handler (bossKilled):**
- Add `+1000` to score, emit `scoreChange`.
- Set `this.isBossDead = true` flag to prevent further wave spawning.

---

## Constants to add to `src/constants.ts`

```ts
export const MAX_WAVES_L1  = 10;
export const BOSS_WAVE_L1  = 10;
export const MAX_WAVES_L2  = 12;
export const BOSS_WAVE_L2  = 12;
export const L2_SPEED_MULT = 1.2;
export const L2_INTERVAL_MULT = 0.85;
```

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/entities/NexusBoss.ts` | New — boss entity, 5-state machine, spread shot, escort management |
| `src/entities/Drone.ts` | Add `'sentinel'` to DroneType union; add `forceHp?: number` constructor param |
| `src/scenes/BootScene.ts` | Load `sentinel` + `nexus` spritesheets; `buildDroneAnims('sentinel')`; inline nexus anim creates |
| `src/scenes/GameScene.ts` | Level branching in init/create; bossKilled handler; L2 world methods; bouncing bullet listener; `currentLevel` public field; `makeBackgroundL2()`; `makeShaftLedges()` |
| `src/scenes/UIScene.ts` | Level name display on start; "LEVEL COMPLETE" screen on bossKilled; scene transition |
| `src/systems/DroneSpawner.ts` | Boss wave detection (BOSS_WAVE); Sentinel at wave 7+; waveCleared emit; L2 difficulty multiplier; `currentLevel` check for bouncing bullets |
| `src/constants.ts` | Add wave/boss/level constants above |
| `public/assets/` | Copy `Nexus-sheet.png`, `Sentinel-sheet.png` from `/Users/devwm8/Projects/pixelart/` |

---

## Verification

1. `npm run build` — zero TypeScript errors
2. Level 1 name "SURFACE OPS" appears at game start (fades in, gone after 2s)
3. Wave 7: every 4th drone is a Sentinel (slightly larger, takes 3 hits)
4. Wave 10: boss spawns with 2 escort drones instead of normal wave
5. Boss plays charge animation before firing 3-bullet spread
6. Killing an escort — boss respawns it after 20s
7. Boss death: 3-burst explosion, +1000 score, "LEVEL COMPLETE" overlay appears
8. Level 2 loads with green palette, vertical camera, wall ledges
9. Wave cleared in L2: camera Y-bound advances downward
10. Drone bullets in L2 bounce off left/right walls once then despawn
11. Score carries over from L1 into L2
12. L2 wave 12: boss spawns again (with L2 multiplied stats)
