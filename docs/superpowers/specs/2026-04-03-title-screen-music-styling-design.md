# Title Screen Music & Styling

**Date:** 2026-04-03

## Overview

Add a real music track to the title screen and restyle the UI to match the mech4 (red/grey heavy combat mech). The space-backdrop aesthetic is preserved; only accent colours and the mech watermark are added.

---

## Audio

### File relocation

- Source: `/Users/devwm8/Projects/assets/audio/music-loops/Sketchbook 2025-12-11_BREAKDOWN.ogg`
- Destination: `public/audio/music-title.ogg`
- Action: copy (not move) into the moonsec project

### Loading

In `BootScene.preload()`, add:

```ts
this.load.audio('music-title', 'audio/music-title.ogg');
```

### TitleScene playback

- On `create()`:
  - If a `music-title` sound is already playing (user navigated to a sub-scene and returned), do nothing — let it continue mid-track
  - Otherwise: `this.sound.add('music-title', { loop: true, volume: 0 })`, then tween volume to `0.6` over `1500ms`
- Store the reference as `private titleMusic: Phaser.Sound.BaseSound | null`

### Transition bleed (music continues into next scene)

- When the user selects any menu item, do **not** stop the title music — it keeps playing through the 300ms camera fade
- Each receiving scene stops it on `create()`:
  - `GameScene`, `StoryScene`, `UpgradeTreeScene` each call a shared helper or inline code to find the `music-title` sound and tween its volume to `0` over `800ms`, then call `.stop()`
  - This produces a brief overlap: title music + new scene audio for ~800ms, then silence on the title track

---

## Visual

### Logo SVG (`public/assets/logo.svg`)

- Linear gradient: top stop `#00ccff` → bottom stop `#ff3311` (was `#0066ff`)
- Glow filter colour: shift `feGaussianBlur` result tint toward red — achieved by keeping the filter as-is (colour-agnostic blur) but the changed fill colour does the work

### TitleScene colour changes

| Element | Before | After |
|---|---|---|
| Selected menu item colour | `#00ccff` | `#ff3311` |
| Unselected items | `#335566` | `#335566` (no change) |
| Navigation hint | `#334455` | `#334455` (no change) |

Only the selected/active accent colour changes. The dark steel-blue unselected text creates contrast against the red highlight.

### Mech watermark

Drawn procedurally in `TitleScene.create()` using Phaser `Graphics`, placed at depth `1.5` (above the star layers at depth 1 and 2, below everything else at depth 10).

- Colour: `0xff3311`, alpha `0.05`
- Centred on screen, approximately half screen height tall
- Shape (rectangles approximating mech4 silhouette):
  - Head: small rect, centred top
  - Body: wider rect below head
  - Left arm / Right arm: narrow rects flanking body
  - Left leg / Right leg: narrow rects below body, slight outward angle

No extra sprite assets required.

---

## Affected Files

| File | Change |
|---|---|
| `public/audio/music-title.ogg` | New file (copied from source) |
| `public/assets/logo.svg` | Gradient bottom stop `#0066ff` → `#ff3311` |
| `src/scenes/BootScene.ts` | Add `load.audio('music-title', ...)` |
| `src/scenes/TitleScene.ts` | Add music playback, mech watermark, swap `#00ccff` → `#ff3311` |
| `src/scenes/GameScene.ts` | Fade out and stop `music-title` on `create()` |
| `src/scenes/StoryScene.ts` | Fade out and stop `music-title` on `create()` |
| `src/scenes/UpgradeTreeScene.ts` | Fade out and stop `music-title` on `create()` |
