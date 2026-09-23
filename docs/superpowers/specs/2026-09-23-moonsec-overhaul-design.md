# Moonsec overhaul — design as built

Branch `feat/mech-redesign`. Plan: `docs/superpowers/plans/2026-09-23-moonsec-overhaul.md`. HARROW mockup: `art/mech-redesign/`.

## Decisions

- HARROW is the only player mech; the old `mech` / `mech4` sheets are deleted.
- Facing always follows the cursor. Walking away from the cursor backpedals.
- Armor is on a 100-point scale (`ARMOR_SCALE = 20`), so the number of hits needed to destroy the mech is unchanged from the old 5-point model. Burst, strafe and stick-bomb rounds deal fractions of a legacy hit.
- Every enemy role was kept and given a rigged body and new AI, and ground walkers were added (STILT, SCUTTLER, BURROWER).
- One 24-colour moon palette. There are no raw colours anywhere in `src` (enforced by a test).
- The UI is icons and numbers, with bitmap text only. Longer text appears only in radio messages.

## Systems

### Palette and render (`src/render/`)
- `palette.ts` is the single source of truth. It provides ramps, OKLab nearest-colour matching, `pal()` and `palCss()`.
- `filters/RetroFilter.ts` + `shaders/retro.frag.ts` is a custom Phaser 4 filter (`Filters.Controller` + `BaseFilterShader`) that:
  - snaps to a block grid (2 world units × zoom);
  - quantizes to the palette with 4×4 Bayer dither (exact palette colours never dither);
  - uses binary alpha for UI cameras;
  - optionally adds scanlines.
- `GraphicsSettings.ts` provides the `crunchy` / `clean` / `low` presets, WIDE / CLOSE view, and dust quality. Settings live in `localStorage` and can be overridden with `?gfx=`.
- Tests in `src/tests/palette*.test.ts` and `noRawColors.test.ts` enforce that every PNG asset and every colour in code is on the palette.

### Rig framework (`src/rig/`)
- The core is pure: springs, a two-bone IK solver, a distance-driven gait with pinned feet and a limp modifier, an `AimTracker` (weighted turret feel with arc limits), and damage stages.
- Parts are a code DSL rasterized to one atlas (`npm run art:rig`), with near / far / EMP / far-EMP variants.
- `RigView` renders a rig as a Container of atlas images (it batches). `RigFx` provides socket-bound particles (jets, smoke, sparks, fire, debris).
- `bodies/harrow.ts` is the player rig: gait, two aimers, jets, and the repair / relay / EMP / hurt / drop-in / dead actions. `bodies/enemyRig.ts` is a generic enemy rig driven by `foeSpecs.ts`.

### Damage states
- ≤50: light smoke.
- ≤25: sparks and visor flicker.
- ≤10: critical. The limp modifier eases in: the bad leg takes a shorter stride and drags its toe (sparks and dust), the hip dips, cadence drops, and the torso breach catches fire with heavy smoke and debris.
- Check it with `?armor=8`.

### AI toolkit (`src/ai/`)
Perception (line of sight, vision cone, hearing, last known position), a utility brain, steering and flocking, prediction (lead and landing), a cover map, ground navigation (spans with jump and drop links), and attack tokens with recovery. `AiWorld` is built once per mission. Enemies are `RiggedHostile` subclasses; see `docs/ENEMIES.md`.

### Atmosphere (`src/fx/`)
- `DustField` is a pure semi-Lagrangian density/velocity grid over the view. Feet, landings, jets and explosions stir it, and it is uploaded as a CanvasTexture.
- On top of that: noise fog bands, light shafts that brighten with dust density, and heat haze via the camera displacement filter.

### UI (`src/ui/`)
- `theme.ts` maps UI roles to palette names. The UI is laid out on a 2px grid (960×540 virtual).
- `font/glyphs.ts` defines the MOON font as code: 5×7 caps, proportional, with tabular digits. EPX upscaling gives a smooth 10×14 display face. Both are rasterized to bitmap fonts at boot.
- `icons.ts` is a 12×12 icon set, tinted per role.
- `kit/` holds the widgets: panels (nine-slice), key-caps, segmented bars with a damage trail, tick-ring cooldown meters, and icon buttons with hover / press / focus / disabled states and keyboard menus.
- `screens/` holds the screens:
  - combat HUD and ability dock;
  - pause (resume, controls, graphics, view, sound, map);
  - upgrade cards (stat deltas as arrow + icon + number);
  - results;
  - boss telegraph (hazard icon + evade arrow);
  - radio;
  - pilot guide (a live HARROW portrait with key-caps wired to its sockets).
- `TitleScene`: a dithered Earth, lunar ridges, dust and a light shaft, with HARROW tracking the cursor and lifting off on START. The flow is Boot → Title → Overworld / Game.
- `OverworldScene`: a pre-rendered pixel moon, icon node plates, stepped paths and a bracket reticle.

## Verification
- `npm test` (212 tests), `npm run build`.
- `tools/shots/shots.mjs` takes screenshots of all levels and every `?ui=` screen with no page errors.
- `tools/shots/perf.mjs` (headed Chrome): every level holds 60 fps (p50 16.7 ms, p95 ≤ 18.3 ms from vsync jitter), with at most 1 frame over 20 ms in 15 s.
- An idle-player damage probe measures balance: standing still on wave 1 is survivable for about 30 s. Damage arrives at a readable 3–4 armor/s.
