# Controls Rebind & Terminal Screen — Design

**Date:** 2026-04-11
**Status:** Implemented

## Problem

- `SHIFT` was the missile key. Browsers intercept Shift for text selection, scroll-up (Shift+Space), and tab focus — causing misfires and lost inputs.
- Controls modal was functionally correct but visually plain: duplicate header, no grouping, no theme cohesion.

## Decisions

### Missile key: `SHIFT → E`

`E` sits adjacent to the A/D movement keys, requires no finger travel from home position, and has zero browser-level conflicts. Common in action games for secondary fire.

Rejected alternatives:
- `F` — also good, slightly further from rest position
- `R` — "rocket" intuition but one row further
- `X` — bottom row, awkward mid-jump

### Controls screen: Terminal Readout

Phosphor-green terminal aesthetic matching the game's GDI/military tone. Single centered column with `>` prefix, key right-aligned, `──` connector, action left-aligned. Highlighted row (missiles / E) in yellow to draw attention to the new binding.

Rejected alternatives:
- HUD Panel (grouped sections, key cap badges) — more complex, slightly off-tone
- Minimal Dark — too close to the old design, not enough visual upgrade

## Changes

| File | Change |
|------|--------|
| `src/entities/Player.ts` | `keyShift → keyE`, `KeyCodes.SHIFT → KeyCodes.E` |
| `src/scenes/UIScene.ts` | Controls hint text: `SHIFT missile → E missile`; `showControlsModal()` full redesign |

## Screen layout

```
GLOBAL DEFENSE INITIATIVE // MECH-IV   (dim green, small)

         [ CONTROLS ]                   (bright green, 38px)

════════════════════════════════        (separator)

>   A / D  ──  LOCOMOTION
>   SPACE  ──  VERTICAL THRUST
>   LMB    ──  TURRET FIRE
>   RMB    ──  RAPID SUPPRESSION
>   E      ──  HOMING MISSILES          (yellow — new key highlighted)
>   Q      ──  NANITE REPAIR
>   ESC    ──  PAUSE / MENU

         press any key to engage_       (blinking, dim)
```

Scanline overlay (black stripes every 4px at 10% opacity) adds CRT texture without a spritesheet.
