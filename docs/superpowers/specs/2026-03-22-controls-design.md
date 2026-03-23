# Controls System — Scheme Switching & Improved Documentation

## Goal

Add a Trackpad preset that replaces RMB (right-click hold for rapid fire) with the F key, allow players to switch between Standard and Trackpad schemes in the pause menu, persist the choice in localStorage, and improve the in-game controls hint to be scheme-aware and complete.

## Architecture

### ControlsManager (`src/systems/ControlsManager.ts`)

A standalone module (no Phaser dependency) that owns the active scheme. Responsible for:

- Reading/writing the scheme to `localStorage` under key `'moonsec-controls'`
- Exposing `getScheme()` and `setScheme()` for UIScene to call when the toggle is pressed
- Exposing `isRapidFireDown(scene: Phaser.Scene): boolean` — returns `true` if RMB is held (Standard) or F key is held (Trackpad)

`RapidGun.update()` calls `isRapidFireDown(this.scene)` instead of `mousePointer.rightButtonDown()` directly. No other game logic changes.

### Scheme type

```ts
export type ControlScheme = 'standard' | 'trackpad';
```

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

Only rapid fire differs between schemes. All other bindings are identical.

## UI Changes

### Bottom hint bar (UIScene)

The existing single-line hint at the bottom-left (`9px` monospace) is:
- Expanded to include the missing `E eject` entry
- Made scheme-aware: shows `RMB rapid` (Standard) or `F rapid` (Trackpad)
- Stored as a `Phaser.GameObjects.Text` field so it can be updated when the scheme changes

### Pause overlay

The existing pause overlay (`PAUSED / ESC to resume`) is replaced with a two-column panel:

**Left column — controls reference (scheme-aware):**
```
CONTROLS
────────────────
A / D       Move
SPACE       Jump / Jetpack
LMB         Turret
RMB / F     Rapid fire  ← shows active key highlighted
SHIFT       Missile
E           Eject / Reenter
ESC         Pause
```

**Right side — scheme toggle button:**
- Text: `[SWITCH TO TRACKPAD]` or `[SWITCH TO STANDARD]` depending on current scheme
- Clicking calls `ControlsManager.setScheme()`, updates `this.hintText`, updates button label, and updates the controls reference text
- Styled as a clickable rectangle with hover tint (matching game palette)

The pause overlay keeps the same depth (50/51) and `ESC to resume` text remains.

## Data Flow

```
localStorage  ──read──▶  ControlsManager.getScheme()
                                │
              ┌─────────────────┼──────────────────────┐
              ▼                 ▼                        ▼
        RapidGun          UIScene hint            Pause panel
     isRapidFireDown()    (on create +           (on create +
                           on toggle)             on toggle)
```

On toggle (pause menu button click):
1. `ControlsManager.setScheme(newScheme)` — writes localStorage
2. `this.hintText.setText(buildHint(newScheme))` — updates bottom bar
3. Pause panel controls text and button label update in place (no scene restart)

## Files

| File | Action |
|---|---|
| `src/systems/ControlsManager.ts` | **Create** — scheme storage + `isRapidFireDown()` |
| `src/weapons/RapidGun.ts` | Modify — use `ControlsManager.isRapidFireDown()` |
| `src/scenes/UIScene.ts` | Modify — scheme-aware hint, pause panel upgrade, toggle button |

## Out of Scope

- Touch/on-screen buttons (no touch screen support planned)
- Full key remapping (two presets cover the real problem)
- Other scheme differences beyond rapid fire
