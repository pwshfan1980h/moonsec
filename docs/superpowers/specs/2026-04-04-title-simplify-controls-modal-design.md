# Design: Simplify Title Screen + Add Controls Modal

**Date:** 2026-04-04

## Context

The game is being trimmed to a polished L1-only experience. The title screen has options (SELECT LEVEL, STORY, UPGRADES, RESET DATA) that no longer serve the game. The upgrade system (both the mid-wave card picker and the persistent upgrade tree) adds complexity without payoff at this stage. Players also have no in-game reference for controls.

## Goals

1. Title screen reduced to a single action: START GAME
2. All upgrade systems and scenes removed
3. ProgressionSystem and localStorage persistence removed entirely
4. Controls modal shown at game start so players know their bindings
5. Net result: significant code reduction, cleaner entry flow

---

## Deletions (files removed entirely)

| File | Reason |
|------|--------|
| `src/scenes/StoryScene.ts` | Story option removed from title |
| `src/scenes/UpgradeCardScene.ts` | Mid-wave upgrade picker removed |
| `src/scenes/UpgradeTreeScene.ts` | Persistent upgrade tree removed |
| `src/data/upgradeCards.ts` | No longer referenced |
| `src/data/upgradeTree.ts` | No longer referenced |
| `src/systems/ProgressionSystem.ts` | No persistent data — highscore dropped |
| `src/tests/upgradeCards.test.ts` | Tests for deleted file |
| `src/tests/upgradeTree.test.ts` | Tests for deleted file |
| `src/tests/ProgressionSystem.test.ts` | Tests for deleted file |

---

## TitleScene

- `MAIN_OPTIONS` reduced to `['START GAME']`
- `LEVEL_OPTIONS` and `CONFIRM_OPTIONS` constants deleted
- `menuState` type simplified: remove `'levelSelect'` and `'resetConfirm'` variants — only `'main'` remains, so the field can be removed entirely
- `confirmSelection()` becomes a single action: fade out and start Game
- Navigation guards (`if (this.menuState === 'levelSelect' || ...)`) removed
- Menu rendering still works (single item, no selection needed — just ENTER/SPACE to confirm)

---

## GameScene

Remove all upgrade-related code:

- Imports: `TREE_NODES`, `applyTreeEffect`, `CARD_POOL`, `ProgressionSystem`
- Registry keys: `progression`, `runUpgrades`, `isNewGame` — all reads/writes removed
- `prog.ownedNodes` loop in `create()` — deleted
- Re-apply per-run cards loop in `create()` — deleted
- `waveCleared` event handler that launches `UpgradeCards` scene — deleted (the `waveCleared` event itself can stay; it's emitted by DroneSpawner but no longer consumed)

---

## UIScene

- Remove `ProgressionSystem` import
- Remove `prog.addScore()`, `prog.updateHighScore()`, highscore read in `showGameOver()`
- Remove `isNew` / `prevHighScore` / `highScore` variables
- Remove the "HIGH SCORE" text block from game-over overlay
- Game-over screen shows: GAME OVER title, SCORE, WAVE REACHED, PRESS R TO RESTART

### Controls Modal

Displayed once per game session, shown in UIScene at `waveStart` wave 1, before the wave banner. Full-screen semi-transparent overlay with two-column layout:

**Left column — Mech:**
- A / D — Move
- SPACE — Jump / Jetpack
- RMB hold — Rapid gun
- LMB — Turret
- SHIFT — Missiles
- Q — Nanite heal
- E — Eject pilot

**Right column — Pilot (ejected):**
- A / D — Move
- SPACE — Jump / Jetpack
- LMB hold — Pilot gun
- E — Reenter mech

Dismissed by any key press or mouse click. Wave does not start until dismissed (the waveStart flow is unaffected — drones spawn on their normal timer regardless; modal is purely informational).

---

## main.ts

Remove from scene list: `StoryScene`, `UpgradeCardScene`, `UpgradeTreeScene`

---

## Verification

1. `npm run build` — zero TS errors
2. `npm test` — all remaining tests pass (3 test files deleted, rest unaffected)
3. Title screen shows only START GAME; ENTER starts the game immediately
4. Controls modal appears on wave 1, dismissed by key/click
5. Game-over screen shows score + wave, no highscore line
6. Between waves: no upgrade card picker appears
