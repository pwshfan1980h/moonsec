# MOONSEC — Progression, Audio & Mech Stats Design
**Date:** 2026-03-24
**Status:** Approved for implementation

---

## Overview

Five coordinated features delivered together:

1. **Mech stat differentiation** — Strider and Scout have genuinely different base stats
2. **Audio completion** — 10 new sounds fill all silent events; existing sounds remain untouched
3. **Between-wave upgrade cards** — pick 1 of 3 temporary stat boosts per run after each wave clears
4. **Persistent upgrade tree** — 3-column (Offense / Defense / Mobility) meta-progression screen, saved to localStorage, accessed from TitleScene
5. **MechSelectScene stat panels** — side-by-side stat bars with real sprite art

---

## 1. Mech Stat Differentiation

### Design intent

Strider (`mech`) is the **speed/agility archetype** — fragile but extremely mobile. Despite its "Battle Mech" descriptor in the current scene code, it trades HP for doubled movement and jetpack capability. Scout (`mech4`) is the balanced baseline. This is intentional and not a naming bug.

### Constants (`src/constants.ts`)

Add a `MECH_STATS` map keyed by mechType string. Remove the standalone `WALK_SPEED`, `RUN_SPEED`, and `JETPACK_MAX_FUEL` constants from `Player.ts` — replace with lookups from this map.

```ts
export const MECH_STATS: Record<string, {
  maxHp: number;
  walkSpeed: number;
  runSpeed: number;
  jumpVelocity: number;
  jetpackAccel: number;
  jetpackMaxFuel: number;
}> = {
  mech: {   // STRIDER — speed archetype: fast, high fuel, low HP
    maxHp: 3,
    walkSpeed: 440,       // 2× Scout baseline
    runSpeed: 700,        // 2× Scout baseline
    jumpVelocity: -510,   // unchanged
    jetpackAccel: -1840,  // 2× Scout baseline
    jetpackMaxFuel: 4400, // 2× Scout baseline
  },
  mech4: {  // SCOUT — balanced baseline
    maxHp: 5,
    walkSpeed: 220,
    runSpeed: 350,
    jumpVelocity: -510,
    jetpackAccel: -920,
    jetpackMaxFuel: 2200,
  },
};
```

`PILOT_JETPACK_MAX_FUEL` (2200) in constants.ts is for the ejected pilot suit — it is separate from mech jetpack fuel and is **not replaced** by this map.

### Player.ts

- At construction, read `MECH_STATS[mechType]` and store values on `this` (e.g. `this.walkSpeed`, `this.runSpeed`, `this.jetpackMaxFuel`, `this.maxHp`)
- Replace every hardcoded `220`, `350`, `2200`, `-920` etc. with the stored instance values
- `this.maxHp` must be `readonly` removed (changed to a normal field) so the upgrade tree can mutate it later
- The animation run-threshold check currently uses `WALK_SPEED * 1.4`. After this change it must use `this.walkSpeed * 1.4`. Verify the threshold works for Strider: 440 × 1.4 = 616, against a run speed of 700 — acceptable.
- The `jetpackChange` event must emit the mech-specific max: `this.events.emit('jetpackChange', this.jetpackFuel, this.jetpackMaxFuel)`. If this is not updated, the UIScene jetpack bar will overflow for Strider (4400ms fuel displayed against a 2200ms denominator).

### Upgrade system interaction

Tree and card effects apply additive bonuses on top of the mech base stat at game start (see §3 and §4).

---

## 2. Audio Completion

### New files (already copied to `public/audio/`)

| Key | File | Event |
|-----|------|-------|
| `nanite-heal` | `nanite-heal.wav` | Q key — nanite heal activates |
| `nanite-tick` | `nanite-tick.wav` | Each 600ms spark burst during heal |
| `pickup` | `pickup.wav` | Health or fuel orb collected |
| `eject` | `eject.wav` | E key — pilot ejects from mech |
| `ui-nav` | `ui-nav.wav` | Cursor moves in any menu |
| `ui-confirm` | `ui-confirm.wav` | Menu/mech selection confirmed |
| `level-complete` | `level-complete.wav` | Level complete stinger |
| `upgrade-pick` | `upgrade-pick.wav` | Upgrade card selected between waves |
| `upgrade-buy` | `upgrade-buy.wav` | Permanent tree node purchased |
| `upgrade-denied` | `upgrade-denied.wav` | Cannot afford a tree node |

### Changes required

**`AudioSystem.ts`**
- Add all 10 keys to the `SoundId` union type
- Add entries to `VOLUMES` map (suggested: nanite-heal 0.55, nanite-tick 0.30, pickup 0.50, eject 0.60, ui-nav 0.25, ui-confirm 0.40, level-complete 0.70, upgrade-pick 0.55, upgrade-buy 0.65, upgrade-denied 0.40)
- Add `nanite-tick` to `minInterval` at 550ms (50ms headroom below the 600ms spark timer to prevent double-fire on timer jitter)

**`BootScene.ts`**
- Add all 10 new keys to the `sounds` array

**`Player.ts`**
- Play `nanite-heal` when Q keypress activates the heal
- Play `nanite-tick` in the existing 600ms spark timer callback

**`GameScene.ts`**
- Play `pickup` when health or fuel orb overlap fires (lines ~195–197)
- Play `eject` when `player.eject()` is called (line ~309)

**`UIScene.ts`**
- Replace `playAt('explosion', {rate:0.3, detune:-600, volume:0.45})` with `play('level-complete')`
- Note: the `AudioSystem` instance is accessed via `const gameSceneForAudio = this.scene.get('Game') as GameScene` — this pattern already exists and is unchanged

**`TitleScene.ts`**
- Play `ui-nav` when the cursor index changes (up/down keypress)
- Play `ui-confirm` on ENTER confirm

**`MechSelectScene.ts`**
- Play `ui-nav` on left/right selection change
- Play `ui-confirm` on ENTER confirm

> `upgrade-pick`, `upgrade-buy`, `upgrade-denied` are wired in §3 and §4.

### Audio context note

`AudioSystem` is constructed once in `GameScene` with `this.sound` (the game-level `Phaser.Sound.BaseSoundManager` singleton). When passing the `AudioSystem` instance to `UpgradeCardScene` via scene data, no second `AudioContext` should be created. **Do not construct a new `AudioSystem` inside `UpgradeCardScene`** — pass the existing instance through scene data and call `audio.play(...)` directly on it.

---

## 3. Between-Wave Upgrade Cards

### Scene: `UpgradeCardScene.ts` (new)

Launched **additively** over the paused `GameScene` after each non-boss wave clears. On card pick, the scene shuts itself down and `GameScene` resumes.

**Register in `main.ts`:**
```ts
import { UpgradeCardScene } from './scenes/UpgradeCardScene';
// add to scene array:
UpgradeCardScene,
```

### Trigger (in `GameScene`)

`DroneSpawner` emits `waveCleared` on `this.scene.events`. Update the emit to include the wave index as payload:

```ts
// DroneSpawner.ts — update existing emit:
this.scene.events.emit('waveCleared', this.waveIndex);
```

`GameScene` already has a `waveCleared` listener. Extend it:

```ts
this.events.on('waveCleared', (wave: number) => {
  // Don't launch cards on the boss wave (level-complete flow takes over)
  if (this.spawner.isBossWave()) return;

  this.scene.launch('UpgradeCards', {
    wave,
    audio: this.audio,
    player: this.player,
    runUpgrades: this.registry.get('runUpgrades') ?? [],
  });
  this.scene.pause('Game');

  // Resume when cards scene shuts down
  this.scene.get('UpgradeCards').events.once('shutdown', () => {
    this.scene.resume('Game');
  });
});
```

`DroneSpawner` needs a public `isBossWave(): boolean` method (or expose `waveIndex` publicly) so `GameScene` can guard the boss-wave case. This prevents `UpgradeCardScene` from launching during the level-complete transition.

**`UIScene` note:** `UIScene` continues running while `GameScene` is paused. Its `update()` loop already guards `if (!game.sys.isActive()) return` — this handles the paused state correctly. No changes needed to UIScene for this.

### Card pool (`src/data/upgradeCards.ts`)

```ts
export interface UpgradeCard {
  id: string;
  name: string;
  category: 'offense' | 'defense' | 'mobility';
  icon: string;        // emoji or single char for display
  desc: string;
  statLine: string;
  oneTime: boolean;    // if true, excluded from pool once applied
  apply: (player: Player) => void;
}
```

**Initial pool — 10 cards (Phase 1):**

*Offense (3)*
- `overclock` — OVERCLOCK — reduce `audio.minInterval.rapid` by 25% — "+25% FIRE RATE" — repeatable
- `heavy-round` — HEAVY ROUND — increase turret bullet scale ×1.5 — "+50% TURRET IMPACT" — repeatable
- `dual-missile` — DUAL MISSILE — raise missile count cap by 2 — "+2 MISSILE SLOTS" — oneTime

*Defense (4)*
- `plating` — PLATING — `player.maxHp += 1; player.heal(1)` — "+1 MAX HP" — repeatable (up to 3 times max)
- `nanite-cd` — NANITE CD– — reduce nanite cooldown by 5000ms (floor 5000ms) — "–5s NANITE COOLDOWN" — repeatable
- `reactive-armor` — REACTIVE ARMOR — set `player.damageShield = true` (absorbs next hit, resets per-wave) — "ABSORB 1 HIT" — oneTime
- `regen-boost` — REGEN BOOST — set `player.naniteHealAmount = 2` — "+1 NANITE HEAL" — oneTime

*Mobility (3)*
- `afterburn` — AFTERBURN — `player.jetpackMaxFuel *= 1.4` — "+40% FUEL CAP" — repeatable
- `thrust` — THRUST+ — `player.jetpackAccel *= 1.3` — "+30% JETPACK ACCEL" — repeatable
- `stabiliser` — STABILISER — `player.jumpVelocity *= 1.15` — "+15% JUMP HEIGHT" — oneTime

**Phase 2 cards (not in initial delivery — require prerequisite Player work):**
- `dash` — requires double-tap input detection + cooldown system (not currently in Player)
- `quick-land` — requires per-state jetpack recharge rate differentiation
- `armor-pierce` — requires sentinel shield HP system (not currently in any entity)

### Card presentation

- Black full-screen rectangle overlay, alpha 0.85, depth 70
- Header text: `// WAVE {n} COMPLETE — SELECT UPGRADE //`, depth 71
- 3 cards drawn at random (no duplicates; oneTime cards already applied are excluded)
- Card style A: dark background, cyan border, icon (emoji), name, description, stat line
- Card depth 72+; hover tween: border tint brightens, y –8 over 120ms
- Selection: keyboard 1/2/3 OR pointer click
- On select: play `upgrade-pick`, apply card, push card id to `runUpgrades` array in registry, scene shuts down
- Entry animation: cards start at y+40, alpha 0, tween to final position staggered 80ms apart

### Run state (`RunUpgrades`)

```ts
// Stored on game registry:
this.registry.set('runUpgrades', [] as string[]);   // array of card ids applied this run
```

- `UIScene` sets `this.registry.set('isNewGame', true)` before calling `scene.restart()` on game-over or new game
- `GameScene.create()` reads the flag: if `true`, resets `runUpgrades` to `[]`, then **immediately sets `isNewGame` to `false`**. This prevents the flag persisting into the L1→L2 scene restart and incorrectly wiping mid-run upgrades on level transition.
- On scene restart mid-run (L1→L2 transition), `runUpgrades` is preserved and re-applied.
- `Player` constructor receives the `runUpgrades` array and calls each card's `apply()` function after base stat initialisation.

---

## 4. Persistent Upgrade Tree

### Scene: `UpgradeTreeScene.ts` (new)

Accessed from TitleScene. Full-screen scene with animated particle swirl background.

**Register in `main.ts`:**
```ts
import { UpgradeTreeScene } from './scenes/UpgradeTreeScene';
// add to scene array:
UpgradeTreeScene,
```

### `ProgressionSystem` (`src/systems/ProgressionSystem.ts`, new)

Plain TypeScript class. One instance lives on the game registry for the lifetime of the application.

**Important:** `GameScene` restarts on every level transition (`scene.start('Game', ...)`), which calls `create()` again. Do **not** unconditionally construct a new instance each time. Use a guard:

```ts
// GameScene.create():
if (!this.registry.get('progression')) {
  this.registry.set('progression', new ProgressionSystem());
}
const prog = this.registry.get('progression') as ProgressionSystem;
```

Any scene accesses it the same way:
```ts
const prog = this.registry.get('progression') as ProgressionSystem;
```

```ts
const SAVE_KEY = 'moonsec-progression';
const LEGACY_KEY = 'moonsec-highscore';

export interface SaveData {
  scoreBank: number;
  ownedNodes: string[];
  highScore: number;
}

export class ProgressionSystem {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      return JSON.parse(raw) as SaveData;
    }
    // Migrate from legacy key
    const legacy = localStorage.getItem(LEGACY_KEY);
    return {
      scoreBank: 0,
      ownedNodes: [],
      highScore: legacy ? parseInt(legacy, 10) : 0,
    };
  }

  private save(): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
  }

  get scoreBank(): number { return this.data.scoreBank; }
  get ownedNodes(): string[] { return this.data.ownedNodes; }
  get highScore(): number { return this.data.highScore; }

  addScore(n: number): void {
    this.data.scoreBank += n;
    this.save();
  }

  updateHighScore(score: number): void {
    if (score > this.data.highScore) {
      this.data.highScore = score;
      this.save();
    }
  }

  buyNode(id: string): boolean {
    const node = TREE_NODES.find(n => n.id === id);
    if (!node || this.data.ownedNodes.includes(id)) return false;
    if (this.data.scoreBank < node.cost) return false;
    // Check tier prerequisite
    if (node.tier > 0) {
      const prereq = TREE_NODES.find(n => n.col === node.col && n.tier === node.tier - 1);
      if (prereq && !this.data.ownedNodes.includes(prereq.id)) return false;
    }
    this.data.scoreBank -= node.cost;
    this.data.ownedNodes.push(id);
    this.save();
    return true;
  }
}
```

`UIScene` currently reads/writes `moonsec-highscore` directly. After this change it must call `prog.updateHighScore(score)` and read `prog.highScore` instead. The legacy key migration in `load()` ensures existing high scores are preserved.

### Applying tree effects at game start

`GameScene.create()`, after constructing `Player`, iterates `prog.ownedNodes` and applies effects:

```ts
for (const id of prog.ownedNodes) {
  const node = TREE_NODES.find(n => n.id === id);
  if (!node) continue;
  applyTreeEffect(this.player, node.effect);
}
```

A standalone `applyTreeEffect(player, effect)` function lives in `upgradeTree.ts` alongside the node definitions.

### Score banking

Score is banked at game-over. In `UIScene.showGameOver()` (where `moonsec-highscore` is currently written), add:
```ts
prog.addScore(this.currentScore);
prog.updateHighScore(this.currentScore);
```

`currentScore` is already tracked in UIScene via the `scoreChange` event.

### Animated background

60 particles in two counter-rotating rings, drawn each frame using a single `Phaser.GameObjects.Graphics` object cleared and redrawn in `update()`:

```ts
// Inner ring: 30 particles, cyan, counter-clockwise
// Outer ring: 30 particles, purple, clockwise
// Each particle:
//   angle: base + (speed * time)
//   radius: baseRadius + sin(time * freq + phaseOffset) * 20
//   size: 2px filled circle
// Inner ring: baseRadius=120, speed=0.4–0.7 rad/s
// Outer ring: baseRadius=220, speed=0.2–0.5 rad/s
// Centre: screen centre (640, 360)
// Depth 0; all UI elements depth 10+
```

No sprite assets needed — pure `graphics.fillCircle`. Alpha 0.6 for the outer ring, 0.8 for the inner.

### Layout (`UpgradeTreeScene`)

```
[ ← BACK ]                    UPGRADE TREE                [ SCORE BANK: 12,400 ]

     OFFENSE              DEFENSE              MOBILITY
     ───────              ───────              ────────
    [ RAPID+ ]           [ HP+1 ]             [ FUEL+ ]
         │                   │                    │
    [ TURRET+ ]        [ NANITE CD– ]         [ THRUST+ ]
         │                   │                    │
  [ DUAL MISSILE ]    [ NANITE BURST ]        [ AIR DASH ]
         │                   │                    │
    [ OVERLOAD ]       [ REGEN FIELD ]        [ GRAV BOOST ]
```

Each node is a `Phaser.GameObjects.Rectangle` + `Text`. Visual states:
- **Owned:** bright cyan border `#00ccff`, tinted background
- **Available** (affordable + tier prereq met): white border, normal background
- **Unaffordable** (prereq met, not enough score): dim border, grey text
- **Locked** (tier prereq not met): very dim, padlock indicator

Connector lines between nodes: `Graphics.lineBetween`, dim for locked, bright for owned chain.

### UX interactions

- Click **owned**: no-op
- Click **available + affordable**: call `prog.buyNode(id)`, play `upgrade-buy`, re-render node state, update score bank display
- Click **available + unaffordable**: play `upgrade-denied`, node shakes (tween x ±4 three times over 150ms)
- Click **locked**: no sound, no action
- **ESC** or BACK button: `this.scene.start('Title')`

### Node data (`src/data/upgradeTree.ts`)

```ts
export interface TreeNode {
  id: string;
  col: 'offense' | 'defense' | 'mobility';
  tier: 0 | 1 | 2 | 3;
  name: string;
  desc: string;
  cost: number;
  effect: TreeEffect;
}

export type TreeEffect =
  | { type: 'rapidInterval'; delta: number }     // ms reduction to minInterval
  | { type: 'turretCooldown'; delta: number }    // ms reduction
  | { type: 'missileSlots'; delta: number }      // +N slots
  | { type: 'maxHp'; delta: number }             // +N max HP
  | { type: 'naniteCooldown'; delta: number }    // ms reduction
  | { type: 'naniteBurst' }                      // nanite heal grants 1s of invulnerability on activation
  | { type: 'regenField' }                       // +1 HP every 2 waves cleared
  | { type: 'jetpackFuel'; mult: number }        // multiply jetpackMaxFuel
  | { type: 'jetpackAccel'; mult: number }       // multiply jetpackAccel
  | { type: 'airDash' }                          // enable air dash on double-tap
  | { type: 'gravBoost' }                        // reduce gravity scalar while jetting
  | { type: 'overload' }                         // brief invincibility on 10-kill streak
```

**Node definitions:**

| Tier | Offense (cost) | Defense (cost) | Mobility (cost) |
|------|---------------|----------------|-----------------|
| 0 | RAPID+ — rapidInterval –15ms (500) | HP+1 — maxHp +1 (500) | FUEL+ — jetpackFuel ×1.3 (400) |
| 1 | TURRET+ — turretCooldown –100ms (800) | NANITE CD– — naniteCooldown –5000ms (600) | THRUST+ — jetpackAccel ×1.2 (900) |
| 2 | DUAL MISSILE — missileSlots +2 (1500) | NANITE BURST — naniteBurst: 1s invuln on Q activate (1500) | AIR DASH — airDash (1600) |
| 3 | OVERLOAD — overload (3000) | REGEN FIELD — regenField (2400) | GRAV BOOST — gravBoost (3000) |

---

## 5. MechSelectScene Stat Panels

### Current state

The scene already shows both mechs side-by-side using `centerXs = [408, 872]`. The work here is **additive** — add stat bars and badge labels, update selection visual styling. Do not rewrite the scene layout.

### Sprite display

- STRIDER (`mech` spritesheet, frame 0: 200×150): render at `setScale(0.3)` → 60×45px display size; texture filter `Phaser.Scale.NEAREST`
- SCOUT (`mech4` spritesheet, frame 0: 70×70): render at `setScale(0.7)` → 49×49px display size; texture filter `Phaser.Scale.NEAREST`
- Use `this.add.image(x, y, 'mech').setFrame(0).setScale(0.3)` (Aseprite atlas loaded via `load.aseprite`)

### Stat bars (per mech, 4 bars)

Below the sprite, above the confirm hint. Each bar: label text + background rect + fill rect.

| Bar | Colour | Fill width formula |
|-----|--------|--------------------|
| HP | `0xff3333` | `(stats.maxHp / 5) * BAR_W` — ceiling is Scout's 5HP |
| SPEED | `0xffcc00` | `(stats.walkSpeed / 440) * BAR_W` — ceiling is Strider's 440 |
| JETPACK | `0x2299ff` | `(stats.jetpackMaxFuel / 4400) * BAR_W` — ceiling is Strider's 4400ms |
| NANITE CD | `0x00ff88` | fixed 65% (same both mechs) |

`BAR_W = 120`, `BAR_H = 5`. Bars sit at `centerX – BAR_W/2`.

### Badge labels

Small text next to the stat value, colour-coded:
- Green `▲ 2×` or `▲ +1` for stats above Scout baseline
- Red `▼ –2` for stats below Scout baseline
- Grey `—` for equal

### Selection visual

Selected mech card: border tint `0x00ccff`, alpha 1.0, background `0x08151f`
Unselected: border tint `0x003344`, alpha 0.6, background `0x060f1a`

---

## Scene Flow (updated)

```
TitleScene  [START GAME / STORY / UPGRADES]
  ├─→ START GAME → StoryScene → MechSelectScene → GameScene + UIScene
  ├─→ STORY → StoryScene → MechSelectScene → ...
  └─→ UPGRADES → UpgradeTreeScene → (ESC/BACK) → TitleScene

GameScene (per wave)
  └─ on waveCleared (non-boss wave) → launch UpgradeCardScene (additive)
                                    → pause GameScene
                                    → on UpgradeCardScene shutdown → resume GameScene
```

### TitleScene OPTIONS update

Change:
```ts
const OPTIONS = ['START GAME', 'STORY'] as const;
```
To:
```ts
const OPTIONS = ['START GAME', 'STORY', 'UPGRADES'] as const;
```

Update `confirmSelection()` from two-branch if/else to a three-branch switch (index 0 → start game, index 1 → story, index 2 → upgrade tree).

---

## Files Created / Modified

### New files
- `src/scenes/UpgradeCardScene.ts`
- `src/scenes/UpgradeTreeScene.ts`
- `src/data/upgradeCards.ts`
- `src/data/upgradeTree.ts`
- `src/systems/ProgressionSystem.ts`

### Modified files
- `src/constants.ts` — add `MECH_STATS`
- `src/entities/Player.ts` — use `MECH_STATS`, make `maxHp` mutable, fix `jetpackChange` emit, accept tree/card upgrades
- `src/systems/DroneSpawner.ts` — emit wave index with `waveCleared`; add `isBossWave()` public method
- `src/scenes/BootScene.ts` — add 10 new audio keys to sounds array
- `src/scenes/GameScene.ts` — instantiate ProgressionSystem, apply tree effects, launch UpgradeCardScene, wire pickup/eject audio, manage `isNewGame` registry flag
- `src/scenes/UIScene.ts` — use `level-complete` sound; replace `moonsec-highscore` writes with ProgressionSystem calls; set `isNewGame` flag before restart
- `src/scenes/TitleScene.ts` — add UPGRADES option, update confirmSelection, wire ui-nav/ui-confirm
- `src/scenes/MechSelectScene.ts` — add stat panels, badge labels, selection styling, wire ui-nav/ui-confirm
- `src/systems/AudioSystem.ts` — add 10 new SoundIds + volumes + nanite-tick minInterval
- `src/main.ts` — register `UpgradeCardScene` and `UpgradeTreeScene` in scene array

---

## Out of Scope

- Music / background tracks
- Per-mech upgrade paths (all tree nodes apply to both mechs)
- Cloud save / account system
- Endless mode
- Mech unlock via tree (both mechs remain always available)
- Phase 2 cards: `dash`, `quick-land`, `armor-pierce` (require prerequisite Player systems not in this delivery)
