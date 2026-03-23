# Controls System — Scheme Switching & Improved Documentation

## Goal

Add a Trackpad preset that replaces RMB (right-click hold for rapid fire) with the F key, allow players to switch between Standard and Trackpad schemes in the pause menu, persist the choice in localStorage, and improve the in-game controls hint to be scheme-aware and complete.

## Architecture

### ControlsManager (`src/systems/ControlsManager.ts`)

Owns the active scheme and the cached F key object.

```ts
export type ControlScheme = 'standard' | 'trackpad';

export function buildHint(scheme: ControlScheme): string  // free exported function
export class ControlsManager {
  static init(scene: GameScene): void       // called once from GameScene.create(); creates + caches fKey
  static getScheme(): ControlScheme         // reads localStorage 'moonsec-controls', defaults 'standard'
  static setScheme(s: ControlScheme): void  // writes localStorage
  static isRapidFireDown(): boolean         // fKey.isDown OR mousePointer.rightButtonDown() per scheme
}
```

`buildHint` is a free exported function in `ControlsManager.ts` so both ControlsManager and UIScene can use it:

```ts
export function buildHint(scheme: ControlScheme): string {
  const rapid = scheme === 'trackpad' ? 'F rapid' : 'RMB rapid';
  return `A/D move  SPACE jump/jetpack  LMB turret  ${rapid}  SHIFT missile  E eject  ESC pause`;
}
```

Because `isRapidFireDown()` needs a `Phaser.Input.Keyboard.Key` object (created once via `addKey()`), the manager must be initialised with a scene before use. `GameScene.create()` calls `ControlsManager.init(this)` as the first statement after `new AudioSystem()`. The cached `fKey` is a module-level variable inside `ControlsManager.ts`.

### Bindings

| Action | Standard | Trackpad |
|---|---|---|
| Move | A/D + Arrows | same |
| Jump / Jetpack | Space | same |
| Turret (slow, aimed) | LMB click | same |
| **Rapid fire (hold)** | **RMB hold** | **F hold** |
| Missile | Shift | same |
| Eject / Reenter mech | E | same |
| Pause | Esc | same |

Only rapid fire differs between schemes.

## File Changes

### `src/systems/ControlsManager.ts` — Create

New file. Full API described above. No other dependencies besides Phaser types (imported as `import type Phaser from 'phaser'` to avoid bundling the whole library) and `GameScene` (imported as `import type { GameScene }`).

### `src/weapons/RapidGun.ts` — Modify

Add import:
```ts
import { ControlsManager } from '../systems/ControlsManager';
```

Replace the `mousePointer.rightButtonDown()` call in `update()`:
```ts
// Before:
if (!this.scene.input.mousePointer.rightButtonDown()) return;
// After:
if (!ControlsManager.isRapidFireDown()) return;
```

### `src/scenes/GameScene.ts` — Modify

Add import:
```ts
import { ControlsManager } from '../systems/ControlsManager';
```

In `create()`, add as first line after `this.audio = new AudioSystem();`:
```ts
ControlsManager.init(this);
```

### `src/scenes/UIScene.ts` — Modify

Add imports:
```ts
import { ControlsManager, buildHint, type ControlScheme } from '../systems/ControlsManager';
```

**New field declarations** (add alongside existing pause fields at lines 32–34):
```ts
private hintText!: Phaser.GameObjects.Text;
private pauseControlsText!: Phaser.GameObjects.Text;
private schemeBtn!: Phaser.GameObjects.Rectangle;
private schemeBtnLabel!: Phaser.GameObjects.Text;
```

**Hint text** — in `create()`, replace the existing anonymous `this.add.text(...)` at line 124 (controls hint) with:
```ts
this.hintText = this.add.text(PAD, 450 - PAD, buildHint(ControlsManager.getScheme()), {
  fontFamily: 'monospace', fontSize: '9px', color: '#334455',
}).setOrigin(0, 1);
```

**Pause panel additions** — at the end of the existing pause overlay block (after `pauseText` is created, before the closing of the `create()` listeners section):

```ts
// Controls reference (left side of pause overlay)
this.pauseControlsText = this.add.text(180, 150,
  this.buildPauseControls(ControlsManager.getScheme()), {
  fontFamily: 'monospace', fontSize: '11px', color: '#8888cc',
  lineSpacing: 6,
}).setDepth(51).setVisible(false);

// Scheme toggle button — depth 52 so it renders above the controls text
this.schemeBtn = this.add.rectangle(600, 225, 160, 36, 0x112233)
  .setDepth(52).setVisible(false).setInteractive();
this.schemeBtnLabel = this.add.text(600, 225,
  this.schemeBtnText(ControlsManager.getScheme()), {
  fontFamily: 'monospace', fontSize: '10px', color: '#4488ff',
  align: 'center',
}).setOrigin(0.5, 0.5).setDepth(52).setVisible(false);

this.schemeBtn.on('pointerover', () => this.schemeBtn.setFillStyle(0x224466));
this.schemeBtn.on('pointerout',  () => this.schemeBtn.setFillStyle(0x112233));
this.schemeBtn.on('pointerdown', () => {
  const next: ControlScheme = ControlsManager.getScheme() === 'standard' ? 'trackpad' : 'standard';
  ControlsManager.setScheme(next);
  this.hintText.setText(buildHint(next));
  this.pauseControlsText.setText(this.buildPauseControls(next));
  this.schemeBtnLabel.setText(this.schemeBtnText(next));
});
```

Where the two local helpers (called with `this.`) are private methods of `UIScene`:
```ts
private buildPauseControls(scheme: ControlScheme): string {
  const rapid = scheme === 'trackpad' ? 'F           Rapid fire' : 'RMB         Rapid fire';
  return [
    'A / D       Move',
    'SPACE       Jump / Jetpack',
    'LMB         Turret',
    rapid,
    'SHIFT       Missile',
    'E           Eject / Reenter',
    'ESC         Pause / Resume',
  ].join('\n');
}

private schemeBtnText(scheme: ControlScheme): string {
  return scheme === 'standard' ? 'TRACKPAD MODE' : 'STANDARD MODE';
}
```

**Updated `togglePause()`** — add `setVisible` calls for all three new objects:
```ts
private togglePause(): void {
  this.paused = !this.paused;
  if (this.paused) {
    this.scene.pause('Game');
    this.pauseBg.setVisible(true);
    this.pauseText.setVisible(true);
    this.pauseControlsText.setVisible(true);
    this.schemeBtn.setVisible(true);
    this.schemeBtnLabel.setVisible(true);
  } else {
    this.scene.resume('Game');
    this.pauseBg.setVisible(false);
    this.pauseText.setVisible(false);
    this.pauseControlsText.setVisible(false);
    this.schemeBtn.setVisible(false);
    this.schemeBtnLabel.setVisible(false);
  }
}
```

## Data Flow

```
localStorage  ──read──▶  ControlsManager.getScheme()
                                │
              ┌─────────────────┼──────────────────────┐
              ▼                 ▼                        ▼
        RapidGun          UIScene hintText         Pause panel
     isRapidFireDown()    buildHint(scheme)         buildPauseControls()
                                                    schemeBtnText()
```

On toggle (pause menu button click):
1. `ControlsManager.setScheme(next)` — writes localStorage
2. `this.hintText.setText(buildHint(next))` — updates bottom bar
3. `this.pauseControlsText.setText(buildPauseControls(next))` — updates panel
4. `this.schemeBtnLabel.setText(this.schemeBtnText(next))` — updates button label

## Out of Scope

- Touch/on-screen buttons (no touch screen support planned)
- Full key remapping (two presets cover the real problem)
- Other scheme differences beyond rapid fire
