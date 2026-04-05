# Title Simplification + Controls Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete all upgrade systems, Story, and TitleScene; embed the title overlay directly in UIScene over the live game world; add a controls reference modal at game start.

**Architecture:** BootScene starts Game + UI directly. UIScene renders title elements (logo, mech silhouette, prompt) as scroll-fixed overlays on top of the running game. GameScene stays frozen (`waitingForStart`) until UIScene emits `titleDismissed`. Controls modal appears immediately after title dismissal.

**Tech Stack:** Phaser 3 TypeScript, Vite (`__APP_VERSION__` global inject)

---

## File Map

| Action | File | Change |
|--------|------|--------|
| DELETE | `src/scenes/TitleScene.ts` | Replaced by UIScene inline |
| DELETE | `src/scenes/StoryScene.ts` | Removed |
| DELETE | `src/scenes/UpgradeCardScene.ts` | Removed |
| DELETE | `src/scenes/UpgradeTreeScene.ts` | Removed |
| DELETE | `src/scenes/MechSelectScene.ts` | Unregistered + unused |
| DELETE | `src/data/upgradeCards.ts` | Removed |
| DELETE | `src/data/upgradeTree.ts` | Removed |
| DELETE | `src/systems/ProgressionSystem.ts` | No persistent data |
| DELETE | `src/tests/upgradeCards.test.ts` | Tests deleted file |
| DELETE | `src/tests/upgradeTree.test.ts` | Tests deleted file |
| DELETE | `src/tests/ProgressionSystem.test.ts` | Tests deleted file |
| MODIFY | `src/main.ts` | Remove 4 scene imports + registrations |
| MODIFY | `src/scenes/BootScene.ts` | Start Game+UI directly instead of Title |
| MODIFY | `src/scenes/GameScene.ts` | Remove upgrades, add `waitingForStart`, defer music |
| MODIFY | `src/scenes/UIScene.ts` | Remove progression, simplify game-over, add title overlay + controls modal |

---

### Task 1: Delete obsolete files and clean main.ts

**Files:**
- Delete: `src/scenes/TitleScene.ts`, `src/scenes/StoryScene.ts`, `src/scenes/UpgradeCardScene.ts`, `src/scenes/UpgradeTreeScene.ts`, `src/scenes/MechSelectScene.ts`
- Delete: `src/data/upgradeCards.ts`, `src/data/upgradeTree.ts`
- Delete: `src/systems/ProgressionSystem.ts`
- Delete: `src/tests/upgradeCards.test.ts`, `src/tests/upgradeTree.test.ts`, `src/tests/ProgressionSystem.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Delete the files**

```bash
rm src/scenes/TitleScene.ts src/scenes/StoryScene.ts \
   src/scenes/UpgradeCardScene.ts src/scenes/UpgradeTreeScene.ts \
   src/scenes/MechSelectScene.ts \
   src/data/upgradeCards.ts src/data/upgradeTree.ts \
   src/systems/ProgressionSystem.ts \
   src/tests/upgradeCards.test.ts src/tests/upgradeTree.test.ts \
   src/tests/ProgressionSystem.test.ts
```

- [ ] **Step 2: Update main.ts**

Replace the entire file content:

```ts
import Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#030318',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 600 },
      debug: false,
    },
  },
  scene: [BootScene, GameScene, UIScene],
  pixelArt: true,
  roundPixels: true,
};

new Phaser.Game(config);
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete upgrade systems, Story, Title, MechSelect scenes"
```

---

### Task 2: Update BootScene

**Files:**
- Modify: `src/scenes/BootScene.ts` line 132

- [ ] **Step 1: Change the scene transition in BootScene.create()**

In `src/scenes/BootScene.ts`, replace:
```ts
    this.scene.start('Title');
```
with:
```ts
    this.scene.start('Game', { mechType: 'mech4', level: 1 });
    this.scene.launch('UI');
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: build fails with errors about missing ProgressionSystem/upgrade imports in GameScene and UIScene — that's fine, Task 3 and 4 fix them.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/BootScene.ts
git commit -m "feat: BootScene starts Game+UI directly, skipping TitleScene"
```

---

### Task 3: Remove upgrade code from GameScene and add waitingForStart

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Remove upgrade imports (top of file)**

Replace:
```ts
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { TREE_NODES, applyTreeEffect } from '../data/upgradeTree';
import { CARD_POOL } from '../data/upgradeCards';
```
with nothing — delete all three lines.

- [ ] **Step 2: Add waitingForStart property**

In the class property declarations (around line 45, near `public currentLevel = 1;`), add:
```ts
  private waitingForStart = true;
```

- [ ] **Step 3: Set waitingForStart in init()**

In the `init()` method, add `this.waitingForStart = true;` so it resets on every scene restart:
```ts
  init(data: { mechType?: MechType; level?: number; totalScore?: number }): void {
    if (data.mechType) this.registry.set('mechType', data.mechType);
    if (data.level !== undefined) this.registry.set('currentLevel', data.level);
    if (data.totalScore !== undefined) this.registry.set('totalScore', data.totalScore);
    this.waitingForStart = true;
  }
```

- [ ] **Step 4: Remove progression/upgrade blocks from create()**

Delete these lines from `create()` (currently around lines 84–97 and 192–203):

**Block A** — remove entirely:
```ts
    // Init ProgressionSystem once — guard against re-creation on level restart
    if (!this.registry.get('progression')) {
      this.registry.set('progression', new ProgressionSystem());
    }
    const prog = this.registry.get('progression') as ProgressionSystem;

    // isNewGame flag: set by UIScene before restart; reset run upgrades
    if (this.registry.get('isNewGame')) {
      this.registry.set('runUpgrades', [] as string[]);
      this.registry.set('isNewGame', false);
    }
    if (!this.registry.get('runUpgrades')) {
      this.registry.set('runUpgrades', [] as string[]);
    }
```

**Block B** — remove entirely (appears after player creation):
```ts
    // Apply persistent tree upgrades
    for (const id of prog.ownedNodes) {
      const node = TREE_NODES.find(n => n.id === id);
      if (node) applyTreeEffect(this.player, node.effect);
    }

    // Re-apply per-run card upgrades
    const runUpgrades = (this.registry.get('runUpgrades') as string[]) ?? [];
    for (const id of runUpgrades) {
      const card = CARD_POOL.find(c => c.id === id);
      if (card) card.apply(this.player);
    }
```

**Block C** — remove the waveCleared handler entirely:
```ts
    this.events.on('waveCleared', (wave: number) => {
      // Between-wave upgrade card picker (skip for boss wave)
      if (!this.spawner.isBossWave()) {
        this.scene.launch('UpgradeCards', { wave, audio: this.audio, player: this.player });
        this.scene.pause('Game');
        this.scene.get('UpgradeCards').events.once('shutdown', () => {
          this.scene.resume('Game');
        });
      }
    });
```

- [ ] **Step 5: Defer music start — stop MusicSystem from starting in create()**

Find in `create()`:
```ts
    this.music?.destroy(); // stop music from previous run
    this.music = new MusicSystem();
    this.music.start(0.35);
```
Change to:
```ts
    this.music?.destroy(); // stop music from previous run
    this.music = new MusicSystem();
    // music starts when title is dismissed
```

- [ ] **Step 6: Add titleDismissed listener in create()**

Immediately after the spawner initialization line (`this.spawner = new DroneSpawner(this);`), add:
```ts
    this.events.once('titleDismissed', () => {
      this.waitingForStart = false;
      this.music?.start(0.35);
    });
```

- [ ] **Step 7: Guard update() against waitingForStart**

In the `update()` method, add the guard as the second early-return (after `if (this.isGameOver) return;`):
```ts
  update(time: number, delta: number): void {
    if (this.isGameOver) return;
    if (this.waitingForStart) return;
    this.player.update(time, delta);
    // ... rest unchanged
```

- [ ] **Step 8: Build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: still fails on UIScene ProgressionSystem import — that's fine, Task 4 fixes it.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: GameScene waitingForStart freeze + remove upgrade systems"
```

---

### Task 4: Clean UIScene — remove progression + simplify showGameOver + fix showLevelComplete

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Remove ProgressionSystem import**

Remove line:
```ts
import type { ProgressionSystem } from '../systems/ProgressionSystem';
```

- [ ] **Step 2: Simplify showGameOver()**

Replace the entire `showGameOver()` method with:
```ts
  private showGameOver(): void {
    this.gameOverActive = true;

    const W = GAME_W, H = GAME_H;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(60);

    this.add.text(W / 2, H / 2 - 120, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '96px', color: '#ff2222',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    this.add.text(W / 2, H / 2 - 40, `SCORE: ${this.currentScore}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    this.add.text(W / 2, H / 2, `WAVE: ${this.currentWave}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#8888aa',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    const restartText = this.add.text(W / 2, H / 2 + 80, 'PRESS R TO RESTART', {
      fontFamily: 'monospace', fontSize: '20px', color: '#4488ff',
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(61);

    this.tweens.add({
      targets: restartText,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
```

- [ ] **Step 3: Fix R-key restart handler — remove isNewGame registry write**

Replace the R-key handler in `create()`:
```ts
    this.input.keyboard!.on('keydown-R', () => {
      if (!this.gameOverActive) return;
      const gameScene = this.scene.get('Game');
      this.registry.set('isNewGame', true);
      gameScene.scene.restart();
      this.scene.restart();
    });
```
With:
```ts
    this.input.keyboard!.on('keydown-R', () => {
      if (!this.gameOverActive) return;
      const gameScene = this.scene.get('Game');
      gameScene.scene.restart();
      this.scene.restart();
    });
```

- [ ] **Step 4: Fix showLevelComplete() restart target**

Replace the fade callback in `showLevelComplete()`:
```ts
        if (progress === 1) {
          gameScene.scene.start('Title');
          this.scene.stop();
        }
```
With:
```ts
        if (progress === 1) {
          gameScene.scene.start('Game', { mechType: 'mech4', level: 1 });
          this.scene.restart();
        }
```

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: clean build (zero TS errors). Tests may still reference deleted files.

- [ ] **Step 6: Verify tests**

```bash
npm test 2>&1 | tail -20
```
Expected: all remaining tests pass (the 3 deleted test files are gone, others unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: remove ProgressionSystem from UIScene, simplify game-over screen"
```

---

### Task 5: Add showTitleScreen() to UIScene

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Add titleActive field to class properties**

In the UIScene class property declarations (after `private levelCompleteActive = false;`), add:
```ts
  private titleActive = false;
```

- [ ] **Step 2: Add showTitleScreen() method**

Add this private method to UIScene (before `showLevelComplete()`):

```ts
  private showTitleScreen(): void {
    if (this.titleActive) return;
    this.titleActive = true;

    const W = GAME_W, H = GAME_H;
    const titleObjs: Phaser.GameObjects.GameObject[] = [];

    // Mech silhouette watermark
    const cx = W / 2;
    const s  = H * 0.42;
    const gy = H * 0.75;
    const wm = this.add.graphics().setDepth(49).setScrollFactor(0);
    wm.fillStyle(0xff3311, 0.05);
    wm.fillRect(cx - s * 0.11, gy - s * 0.96, s * 0.22, s * 0.16); // head
    wm.fillRect(cx - s * 0.22, gy - s * 0.78, s * 0.44, s * 0.32); // body
    wm.fillRect(cx - s * 0.38, gy - s * 0.76, s * 0.16, s * 0.24); // left arm
    wm.fillRect(cx + s * 0.22, gy - s * 0.76, s * 0.16, s * 0.24); // right arm
    wm.fillRect(cx - s * 0.19, gy - s * 0.44, s * 0.15, s * 0.44); // left leg
    wm.fillRect(cx + s * 0.04, gy - s * 0.44, s * 0.15, s * 0.44); // right leg
    titleObjs.push(wm);

    // Logo with floating tween
    const logo = this.add.image(W / 2, 150, 'logo').setDepth(50).setScrollFactor(0);
    this.tweens.add({ targets: logo, y: 160, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    titleObjs.push(logo);

    // Start prompt
    const prompt = this.add.text(W / 2, H * 0.58, 'PRESS  ENTER / SPACE  TO START', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ff3311',
    }).setOrigin(0.5).setDepth(51).setScrollFactor(0);
    this.tweens.add({ targets: prompt, alpha: { from: 0.75, to: 1 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    titleObjs.push(prompt);

    // Version watermark
    const ver = this.add.text(W - 16, H - 16, `ALPHA v${__APP_VERSION__}`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#334455',
    }).setOrigin(1, 1).setDepth(50).setScrollFactor(0);
    titleObjs.push(ver);

    // Title music
    const titleMusic = this.sound.add('music-title', { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
    titleMusic.play();
    this.tweens.add({ targets: titleMusic, volume: 0.6, duration: 1500, ease: 'Linear' });

    // Dismiss on ENTER, SPACE, or click
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      this.titleActive = false;
      this.input.keyboard!.off('keydown-ENTER', dismiss);
      this.input.keyboard!.off('keydown-SPACE', dismiss);
      this.input.off('pointerdown', dismiss);

      this.tweens.add({ targets: titleMusic, volume: 0, duration: 600, ease: 'Linear',
        onComplete: () => titleMusic.stop() });

      this.tweens.add({ targets: titleObjs, alpha: 0, duration: 400, ease: 'Power2',
        onComplete: () => titleObjs.forEach(o => o.destroy()) });

      const game = this.scene.get('Game') as GameScene;
      game.events.emit('titleDismissed');
      this.showControlsModal();
    };

    this.input.keyboard!.on('keydown-ENTER', dismiss);
    this.input.keyboard!.on('keydown-SPACE', dismiss);
    this.input.on('pointerdown', dismiss);
  }
```

- [ ] **Step 3: Reset titleActive and call showTitleScreen() in create()**

In the reset block at the top of `create()` (around line 69, where `gameOverActive` etc. are reset), add:
```ts
    this.titleActive = false;
```

Then at the very end of `create()`, after the minimap line:
```ts
    this.minimap = new MinimapRenderer(this);
    this.showTitleScreen();
```

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: zero TS errors. (`__APP_VERSION__` is a Vite-injected global, same usage as deleted TitleScene.)

- [ ] **Step 5: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: inline title screen overlay in UIScene over live game world"
```

---

### Task 6: Add showControlsModal() to UIScene

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Add showControlsModal() method**

Add this private method to UIScene (after `showTitleScreen()`):

```ts
  private showControlsModal(): void {
    const W = GAME_W, H = GAME_H;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };

    push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82).setDepth(60).setScrollFactor(0));

    push(this.add.text(W / 2, H * 0.12, 'CONTROLS', {
      fontFamily: 'monospace', fontSize: '32px', color: '#6699ff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));

    const colY  = H * 0.26;
    const lx    = W * 0.28;   // left column center X
    const rx    = W * 0.70;   // right column center X
    const rowH  = 46;
    const kStyle = { fontFamily: 'monospace', fontSize: '15px', color: '#ffdd44' };
    const aStyle = { fontFamily: 'monospace', fontSize: '15px', color: '#aabbcc' };
    const hStyle = { fontFamily: 'monospace', fontSize: '18px', color: '#ff3311' };

    push(this.add.text(lx, colY, 'MECH', hStyle).setOrigin(0.5).setDepth(61).setScrollFactor(0));
    push(this.add.text(rx, colY, 'PILOT  (EJECTED)', hStyle).setOrigin(0.5).setDepth(61).setScrollFactor(0));

    const mechBindings: [string, string][] = [
      ['A / D',     'Move'],
      ['SPACE',     'Jump / Jetpack'],
      ['RMB hold',  'Rapid gun'],
      ['LMB',       'Turret'],
      ['SHIFT',     'Missiles'],
      ['Q',         'Nanite heal'],
      ['E',         'Eject pilot'],
    ];

    const pilotBindings: [string, string][] = [
      ['A / D',    'Move'],
      ['SPACE',    'Jump / Jetpack'],
      ['LMB hold', 'Pilot gun'],
      ['E',        'Reenter mech'],
    ];

    mechBindings.forEach(([key, action], i) => {
      const y = colY + 44 + i * rowH;
      push(this.add.text(lx - 12, y, key,    kStyle).setOrigin(1, 0.5).setDepth(61).setScrollFactor(0));
      push(this.add.text(lx + 12, y, action, aStyle).setOrigin(0, 0.5).setDepth(61).setScrollFactor(0));
    });

    pilotBindings.forEach(([key, action], i) => {
      const y = colY + 44 + i * rowH;
      push(this.add.text(rx - 12, y, key,    kStyle).setOrigin(1, 0.5).setDepth(61).setScrollFactor(0));
      push(this.add.text(rx + 12, y, action, aStyle).setOrigin(0, 0.5).setDepth(61).setScrollFactor(0));
    });

    const dismissPrompt = push(this.add.text(W / 2, H * 0.90, '[ ANY KEY OR CLICK TO CONTINUE ]', {
      fontFamily: 'monospace', fontSize: '18px', color: '#4488ff',
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0));
    this.tweens.add({ targets: dismissPrompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const dismiss = () => {
      this.input.keyboard!.off('keydown', dismiss);
      this.input.off('pointerdown', dismiss);
      objs.forEach(o => o.destroy());
    };

    this.input.keyboard!.on('keydown', dismiss);
    this.input.on('pointerdown', dismiss);
  }
```

- [ ] **Step 2: Build and test**

```bash
npm run build 2>&1 | tail -20
npm test 2>&1 | tail -10
```
Expected: zero TS errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: controls modal shown after title dismissal"
```

---

### Task 7: Final verification and push

- [ ] **Step 1: Full build + tests**

```bash
npm run build && npm test
```
Expected output:
```
✓ built in ~400ms
Test Files  X passed (X)
Tests       49 passed (49)   ← or fewer if deleted test files reduce count
```

- [ ] **Step 2: Manual checklist**

1. Page loads → live game world renders (background, ground, player idle)
2. Title elements visible on top: logo floating, mech silhouette, "PRESS ENTER / SPACE TO START", version number, title music playing
3. Press ENTER or SPACE → title fades out, controls modal appears
4. Controls modal shows two columns (Mech / Pilot), any key or click dismisses it
5. After modal dismisses → game music starts, wave timer begins, drones spawn
6. Die → GAME OVER overlay shows SCORE + WAVE (no high score line); press R → restarts with title overlay
7. Beat the boss → LEVEL COMPLETE → ALL CLEAR → returns to title overlay on fresh game world

- [ ] **Step 3: Push**

```bash
git push
```
