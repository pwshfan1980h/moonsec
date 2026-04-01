# UI Redesign — Larger, Clearer HUD

**Date:** 2026-04-01  
**Status:** Approved

## Summary

Rework all HUD elements in `UIScene.ts` and `constants.ts` to be larger, clearer, and free of visual overlap. The core problem is that bars are too thin (6–10px), text too small (12–13px), and the top-left stat block has no visual grouping — five items crammed into ~80px of vertical space with no breathing room.

## Decisions Made

| Area | Change |
|---|---|
| Top-left bars | Dark panel container, 200px wide bars, HP bar 14px tall, JP/Nanoheal/Nanite 10px tall, 8px gap between rows |
| Top-right bars | Mirror left panel — same container style, MISSILE 14px / TURRET 10px, READY/recharging label |
| SUIT/Pilot pip | No reserved space; they push content down when active (unchanged behavior) |
| Top-center | Score stays hero (28px), WAVE and drones-remaining get more padding — 8px gap between each item (up from 2–4px) |
| Controls hint | Keep at bottom-left, same position — increase font size to 18px |
| Minimap | No changes |

## Architecture

All changes are confined to `src/scenes/UIScene.ts` and `src/constants.ts`. No new files needed.

### Constants changes (`src/constants.ts`)

Add or update:

```
BAR_W  = 200   (was 140 — in UIScene, move to constants)
BAR_H  = 14    (was 10 — primary bar height)
BAR_H2 = 10    (was 6  — secondary bar height)
PAD    = 12    (unchanged)
```

`BAR_W`, `BAR_H`, `BAR_H2` currently live as local `const` inside `UIScene.ts`. They stay local — no need to promote to `constants.ts`.

### UIScene.ts changes

**Top-left panel:**
- Wrap HP/JP/Nanoheal rows in a `Graphics` or `Rectangle` background panel (dark fill `0x000812`, border `0x1a2d40`, rounded via a 9-slice or plain rect)
- Row layout: label left, value right (e.g. `3 / 5`), bar below label, 8px `rowGap` between rows
- HP bar: 200×14px. JP/Nanoheal bars: 200×10px.
- Phaser `Rectangle` objects — same API as today, just new sizes/positions

**Top-right panel:**
- Same panel treatment as left, right-anchored at `W - PAD`
- MISSILE bar: 200×14px. TURRET bar: 200×10px.
- Label row: name left, state text right (`READY` in cyan when full, `recharging` in dim amber while charging)

**Top-center:**
- Score: 28px (was 20px) — no change to position logic
- `waveCounter` y offset: `PAD + 32` (was `PAD + 24`) — 8px more gap
- `dronesRemainingText` y offset: `PAD + 52` (was `PAD + 40`) — 12px more gap

**Controls hint:**
- Font size: `18px` (was `15px`)

## What Is Not Changing

- Minimap size, position, and rendering logic
- Game-over overlay, level-complete overlay, pause overlay
- Boss telegraph overlays
- Wave announcement text
- Kill-streak popup text
- All event listener logic

## Testing

Manual playtest: verify no overlap at 1920×1080, check pilot-ejected state shows SUIT/Pilot pip without clipping the Nanoheal row, verify READY/recharging labels update correctly on weapon fire.
