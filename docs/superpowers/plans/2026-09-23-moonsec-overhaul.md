# Moonsec Overhaul — HARROW, Rigged Enemies, Moon Palette, 90s Render Pipeline, UI

## Context
The HARROW mockup (branch `feat/mech-redesign`, `art/mech-redesign/mockup.src.html`) was approved. The ask now is to ship it and push the whole game to the same standard:
- HARROW becomes the only player mech. The old `mech` and `mech4` are deleted.
- Enemies use the same skeleton framework, with real behaviour. No patrol-back-and-forth, straight flyovers, dumb homing boids or motionless turrets.
- Graded damage on 100-point armor. At ≤10 the mech limps and shows fire, smoke and sparks.
- One limited moon palette that everything adheres to.
- A crunchy 90s render look (pixel grid, palette dither, volumetric dust, heat haze).
- A UI overhaul: icons and meaningful buttons instead of text walls, bitmap fonts, and a proper start screen.

User decisions:
- 100-point armor.
- Facing always follows the cursor.
- Keep every enemy role, with new rigged bodies, new AI, and 2–3 added ground walkers.
- The old mech is deleted.

Survey facts that shape the plan:
- Every enemy is an `Arcade.Sprite` with a hand-written `switch(state)` AI.
- `FlightNavigation` is only built for Trade Lanes (`GameScene.ts:179`).
- Six enemy types patrol, fly straight, home dumbly or stand still.
- The UI palette is duplicated in 6 places, and there are 8 copy-pasted panel variants.
- There is no title screen. `BootScene.ts:146` jumps straight into the Game scene.
- Phaser 4.2.1 removed `postFX`/`preFX`, so `GameScene.ts:622` `postFX?.addGlow` is a silent no-op. The replacement is a Filters system: `camera.filters.internal/external`, `gameObject.enableFilters()`, and `FilterList.addBlocky / addDisplacement / addQuantize / addGlow / addMask / addColorMatrix / add(controller)`.
- Custom filters are `Phaser.Filters.Controller` plus `Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader`, registered via game config `renderNodes` (see `node_modules/phaser/src/core/Config.js:486` and `renderer/webgl/renderNodes/filters/FilterDisplacement.js` for binding a second texture).
- Available objects: `Shader`, `NoiseSimplex2D` (`setRenderToTexture`), `nineslice`, `DynamicTexture`, and `RetroFont`/`BitmapText`.

## Global rules (decide once, used everywhere)
- **Pixel grid.**
  - 1 virtual pixel (vpx) = 2 world units. All art is authored native and shown at 2×.
  - A camera `Blocky` filter (size = 2 × zoom) snaps everything to the grid, including rotated rig parts, particles and parallax.
  - Zoom is 1.0 ("WIDE", default, 960×540 virtual) or 1.5 ("CLOSE", 640×360). The current `setZoom(1.2)` goes.
  - Camera scroll is snapped to even units: a manual lerp follow replaces `startFollow` at `GameScene.ts:265`.
  - Graphics lines must be ≥2 units wide.
- **Palette.** 24 entries in `src/render/palette.ts`, the single source of truth. Everything else (the `.gpl`, `.hex` and LUT texture) is generated from it.

  | Group | Colours | Use |
  |---|---|---|
  | void | `#06070f` | background |
  | hull/lunar 1–7 | `#0e1019 #1b1e2c #282c3f #3b4159 #57607d #8690b0 #c3cbe2` | hulls, outlines, panels |
  | regolith | `#3a3431 #625950 #978b7c` | ground, dust, rock |
  | cold blue | `#0b1233 #1a2d5c #34579a` | sky, facility, shadows |
  | cyan (player) | `#1d4a63 #2a7fa3 #6de3ff #dffaff` | visor, jets, UI accent (`#dffaff` is the only "white") |
  | amber (ordnance/warn) | `#9a5f22 #ffb347` | ordnance, hazard trim, warnings |
  | green (repair) | `#1f7a4d #66ff99` | repair only |
  | hostile | `#8a1a3c #ff3a5c` | enemy eyes, enemy fire, telegraphs |

- **Armor.** `ARMOR_SCALE = 20`, max 100. Damage stages: ≤50 light smoke; ≤25 sparks and visor flicker; ≤10 CRITICAL (limp, fire at the torso breach, heavy smoke, debris, toe-drag sparks).
- **Bodies.** Enemies stay `Arcade.Sprite` subclasses with the sprite hidden, so the `Hostile` interface, groups and overlaps keep working, and a `RigView` follows them.
  - Default back end: a Container of Images from one shared `rig` atlas, so everything batches.
  - Player and bosses: a DynamicTexture back end, for silhouette effects, ghosts and portraits.
- **UI language.** Icons and key-caps instead of sentences. Numbers and labels use a bitmap pixel font. Text is only used where icons can't carry the meaning (mission briefings, radio).

## Phases (each is a PR that leaves the game playable)

### P0 — Verification harness
- `tools/shots/shots.mjs`:
  - playwright-core from `$PLAYWRIGHT_CORE`, headless shell with `--use-angle=swiftshader --enable-unsafe-swiftshader`;
  - loads `/?level=N&seed=&freeze=&gfx=&ui=`, waits for `window.__moonsecReady`, saves `.shots/<phase>/*.png`;
  - fails if `__moonsecErrors` is non-empty.
- `tools/shots/perf.mjs`: headed Chrome, `game.loop.actualFps`, p50/p95 frame time, count of frames over 20 ms.
- `src/dev/devParams.ts`: a pure parser, with tests.
- `GameScene.ts:177`: seed from `?seed`. `?freeze` pauses time and physics.
- Commit this plan as `docs/superpowers/plans/2026-09-23-moonsec-overhaul.md`.

### P1 — Palette definition and enforcement
- New: `src/render/palette.ts` (`PALETTE`, `P` tokens, `pal()`, `palCss()`, `nearestIndex()`, `RAMPS` incl. `hullFar`/`emp`/`hostile`).
- New: `tools/palette/export.ts` (Node 24 runs TS; writes `art/palette/moonsec.gpl`/`.hex`/swatch).
- New: `tools/palette/remap.lua` (Aseprite `ChangePixelFormat` to indexed with the palette, ordered or no dither) and `remap-all.sh`, run via the `$ASEPRITE` env var. Check the CLI parameter names against the installed 1.3.18 first.
- Remap `industrial-tileset{,-blue,-violet}.png`, `collectables.png` and `flare.svg` onto the palette at ×2.
- Tests:
  - `palette.test.ts`;
  - `paletteAssets.test.ts`: every opaque pixel in `public/assets/*.png` is a palette colour. A shrink-only allowlist covers the old enemy sheets. Uses a small `node:zlib` PNG reader in `tools/palette/pngPalette.ts`;
  - `noRawColors.test.ts`: per-file baseline count of `0x…`/`#…` literals outside `palette.ts` and `ui/theme.ts`. The count may only go down and must reach 0 by P10.

### P2 — Render pipeline ("crunchy 90s") and graphics settings — spike this early
- `src/render/filters/PaletteFilter.ts`: a controller plus a `FilterPaletteNode extends BaseFilterShader`, with the frag in `src/render/shaders/palette.frag.ts`.
  - Nearest and second-nearest palette colour from a 24×1 `palette-lut` canvas texture built from `PALETTE`, blended with a 4×4 Bayer threshold at vpx resolution.
  - Palette colours pass through exactly; alpha is preserved for the UI camera.
  - Uses `#pragma phaserTemplate(...)` and `outTexCoord`.
  - Register it in `main.ts` via `renderNodes`.
- `ScanlineFilter` (optional, off by default).
- `src/render/RenderPipeline.ts`: `installWorldPipeline`/`installUiPipeline` set up the camera external chain: Displacement (haze), Vignette, `addBlocky({size: 2*zoom})`, PaletteFilter, Scanline. Guarded on `renderer.type === Phaser.WEBGL`.
- `src/render/GraphicsSettings.ts` (pure, localStorage `moonsec.gfx`, `?gfx=` override):
  - presets `crunchy` (default), `clean`, `low`;
  - toggles: view WIDE/CLOSE, scanlines, dither, haze, dust quality.
  - A GRAPHICS row goes in the pause menu.
- `main.ts`: background becomes the void colour and `image-rendering: pixelated` is added. `GameScene`: zoom from settings, snapped follow, delete the dead `postFX` at 622, backgrounds use `pal()`.
- Budget: the post chain takes ≤2 ms on an integrated GPU. Fallback if the palette pass is slow: a CPU-baked 32³ LUT.
- Spike exit rule: if the custom filter isn't working in about 2 days, ship built-in `addQuantize({dither:true})` plus Blocky and move on.
- Tests: `GraphicsSettings.test.ts`, `ditherMath.test.ts` (a JS mirror of the shader's pick logic), `RenderPipeline.test.ts` (filter order; nothing added on Canvas).
- Acceptance: 0 off-palette pixels in `crunchy` screenshots, no scroll shimmer, and perf within budget.

### P3 — 100-point armor (can run in parallel after P1)
- New `src/balance/armor.ts` with `ARMOR_SCALE`, `DAMAGE.*`, `HEAL.*`, `DAMAGE_STAGES` and a pure `damageStage(hp)`.

  | Damage source | Points | Heal source | Points |
  |---|---|---|---|
  | drone bullet | 20 | nanite | 20 (40 with `repair-core`) |
  | PPC round | 60 | relay | 20 |
  | bomber / mine | 40 | armor upgrade | +20 max and +20 current |
  | tank shell | 40 | pickups | scaled |
  | Nexus blast | 60 | | |

- Route every call site through the table:
  - `Player.ts` (29-30, 114, 222, 373, 455, 498-500, 528);
  - `CollisionRegistry` (drone bullets, boss projectiles, PPC rounds);
  - `BomberDrone`, `Mine`, `SurfaceWarden`, `NexusBoss`, `Swarmling`, `SurfaceEnemy`, `ShieldedTank`;
  - `PickupSystem`, `SurfaceMission` relay;
  - `SurfaceEnemy.ts:51`, `Drone.ts:148`;
  - `UIScene` 586-596 and 869-871;
  - `PlayerHud` thresholds, `repairStatus.ts`, `dev/playtest.ts`.
- Tests: rewrite `repairStatus.test.ts` (98/50/25/10), add `armor.test.ts`, and update `Player.upgrades.test.ts` and `CollisionRegistry.test.ts`. The number of hits needed to die stays the same.

### P4 — Shared rig framework `src/rig/` (4a pure core, 4b view and assets)
- **Pure core**, Phaser-free and canvas-free, ported from `mockup.src.html` 444-1172 with preallocated `Float32Array` poses:

  | File | Contents |
  |---|---|
  | `math.ts` | shared maths and springs |
  | `types.ts` | `RigDef`, `PartDef`, `Pose` |
  | `sliceDef.ts` | Aseprite slices: name = part, pivot = joint, `sock.<name>` = socket, slice user-data = `parent=…;z=…;chain=…` |
  | `ik.ts` | 2-bone solver plus an optional digitigrade third segment |
  | `gait.ts` | see below |
  | `aim.ts` | ω 16, max 9 rad/s, arc clamp, 18% torso pitch share |
  | `pose.ts` | `solvePose`, `socketWorld` |
  | `actions.ts` | timed blends: repair, relay, emp, hurt, dash, dropIn, dead |
  | `damage.ts` | stage → smoke/spark/fire/debris rates plus a `limpWeight` that eases in over 400 ms |
  | `flyer.ts` | thruster pods counter acceleration, wing bank, rotor spin, turret yaw/pitch |
  | `wobble.ts` | chained-spring antennae, cables, tails |

- **`gait.ts` in detail.**
  - Phase advances with distance travelled, and planted feet are pinned in world space. A backpedal runs the phase in reverse.
  - Presets: `BIPED`, `QUAD_TROT`, `HEX_TRIPOD`, `CRAWLER_WAVE`.
  - Footfall and toe-drag events are written to a ring buffer.
  - **`LimpModifier`** (blended by `limpWeight`):
    - bad-leg stride ×0.55 and stance ×0.7;
    - good-leg stance ×1.25;
    - bad-leg lift ×0.15 (drag, with toe-drag sparks and dust);
    - 3 vpx hip dip on bad-leg stance;
    - torso roll toward the bad side;
    - cadence ×0.8;
    - optional speed penalty ×0.9, off by default.
- **View `rig/view/`.**
  - `RigAtlas.ts`: loads the `rig` multi-atlas and `rig-defs.json`, and merges them with TS overrides in `rig/defs/*.ts`.
  - `RigView.ts`: Container back end. Near/far/EMP frame variants, `flash()` via `setTintFill`.
  - `RigTextureView.ts`: DynamicTexture back end. The silhouette scanline via `enableFilters().filters.internal.addMask`, EMP/death via `addColorMatrix`, the outline pulse via `addGlow`, and `snapshot()` for surge ghosts and portraits.
  - `RigFx.ts`: socket-bound emitters for jets, smoke, sparks, fire, debris, muzzle and casings. Reuses the `pixel`/`flare` textures from `BootScene.makeTextures` and the emitter configs at `Player.ts:159-218`.
- **Pipeline.**
  - `tools/rig/build-atlas.sh`: Aseprite `--split-layers --list-slices --sheet-pack --trim --extrude`, then the palette remap. Far and EMP variants come from ramp-shift palettes.
  - `tools/rig/merge.ts` produces `public/assets/rig.png/json` and `rig-defs.json`.
  - Move `harrow-parts.aseprite` to `art/rigs/`, add `sock.*` slices, and repaint it in the palette.
- Dev `?rigtest=all` scene.
- Tests: `ik`, `gait` (planted foot drifts <0.5 px over 3 cycles; limp asymmetry, hip dip and cadence; backpedal), `aim`, `springs`, `damage` (50/25/10 boundaries), `sliceDef` (fixture JSON), `pose` (flip), `flyer`. Budget ≤0.06 ms per rig.

### P5 — HARROW player integration and deleting the old mechs
- **`Player.ts`.**
  - Drop `MECH_CONFIG`/`MechType` (15-24). The sprite goes invisible and owns `rig: RigTextureView`, the gait, the cannon and gatling aimers, and the action layer.
  - Body size comes from `HARROW_BODY` (replaces `GameScene.ts:251-256`).
- **Facing.**
  - `facing = sign(pointerWorld.x − x)` with a 6 px dead zone and 120 ms hysteresis. Moving against it gives a backpedal.
  - `flipX` is kept in sync for `MinimapRenderer.ts:201`.
  - The missile launches toward the cursor side. Surge goes in the move direction, else facing.
- **New API.**
  - `getSocketWorld(name)`, `getAimPoint()`, `facing`.
  - `tickPresentation(dt)` always runs, including when `GameScene` early-returns on `isGameOver`, so the death animation and wreck keep ticking.
- **Mapping to rig actions.** `empStun` → emp, Q → repair, hurtLock → hurt plus a knockback spring, death → dead (the 1500 ms `gameOver` delay is kept), F → relay (`SurfaceMission.ts:129-145` emits a new `relayProgress` event), and a drop-in at mission start and respawn.
- **Weapons spawn from sockets:** `RapidGun.ts:34-35`, `Turret.ts:24-25`, `HomingMissile.ts:41-44`, using the aimer angle.
- **Aim points.** Enemy aims (`Drone.ts:275,293`, `Carrier.ts:70`, `NexusBoss.ts:204`, `SurfaceEnemy.ts:59-70`, `GameScene.getPlayerPos` 429), the `PickupSystem.ts:108` magnet and `PlayerHud.ts:79` all use `getAimPoint()`/`HARROW_BODY.visualH`.
- **Surge.** `spawnSurgeGhost`/`Trail`/`Shockwave` (`GameScene.ts:470-578`) use `rig.snapshot()` and sockets.
- **Damage stages** drive `RigFx` and the limp. The HUD bar blinks hostile below 10. A dev `?armor=8` param forces the critical state.
- **Delete:**
  - `public/assets/mech-sheet.*` and `mech4-sheet.*`;
  - `BootScene.ts:50-51,91-92,147`;
  - `MECH_STATS` (becomes `PLAYER_STATS`);
  - the mechType plumbing in `OverworldScene.ts:5,36,53,58,526,531`, `GameScene.ts:69-70,136,240` and `UIScene.ts:1236`;
  - the BASTION leftovers, which are archived in `art/`.
- Tests: `facingFromPointer`, `surgeDir`, `harrowDef` (every gameplay socket exists), and updated `Player.upgrades`/`HomingMissile` tests.
- Acceptance: `grep -rn "mech4\|MechType\|MECH_CONFIG" src` is empty, and every action checks out in a scripted playtest.

### P6 — Dust, atmosphere, heat haze (after P5)
- **`src/fx/DustSystem.ts`.**
  - Pooled emitters with dithered palette puff textures and low gravity (~40). Puffs billow from scale 0.3 to 1.4 and settle over 1.6–3 s.
  - API: `footstep`, `landing` (a ring of puffs), `jetWash` (raycast to the ground within 160, then a sideways sheet), `impact`, `burrow`, `debris`.
  - Cap: 600/400/200 per preset.
- **`src/fx/DustField.ts`** (pure) plus `DustFieldView.ts`: the "volumetric" layer.
  - A 240×135 density grid at 30 Hz: semi-Lagrangian advection, decay and blur.
  - Jets push dust away and walkers kick it up.
  - It is uploaded to a CanvasTexture, upscaled 8×, and dithered by the palette pass. ≤0.8 ms CPU.
- **`src/fx/AtmosphereLayers.ts`.**
  - 2–3 parallax fog layers per level from `NoiseSimplex2D.setRenderToTexture`, re-rendered every 4th frame, shown as tileSprites.
  - Recipes live in a new `atmosphere` field in `levelConfigs.ts`, and they replace `bgHaze`/`bgDust` (`GameScene.ts:769,904`).
- **`src/fx/LightShafts.ts`:** a custom `Shader` god-ray cone × scrolling noise × DustField density, at most 6 on screen.
- **`src/fx/HeatHaze.ts`:** a `haze-map` DynamicTexture (neutral 128,128) stamped at jets, explosions and PPC charges, which drives the camera Displacement filter. The filter is only active while a stamp exists.
- Tests: `DustField` (decay, mass conservation, jet clearing), `jetWash`, and an extended `levelAtmosphere.test.ts`.

### P7 — Enemy AI toolkit and `RiggedHostile` base (after P4)
- **Pure `src/ai/`.**

  | Module | Purpose |
  |---|---|
  | `Perception.ts` | LOS raycast, vision cone, hearing (`playerFired`, footfall), decaying last-known position, search instead of wall-hacking |
  | `Blackboard.ts` + `UtilityBrain.ts` | scored actions with commit time, cooldown and hysteresis; ticks at 8–12 Hz, staggered |
  | `Steering.ts` + `Boids.ts` | steering behaviours; role-weighted flocks |
  | `Predict.ts` | lead target, `predictLanding` with gravity 600 and the jetpack, `groundHeightAt` |
  | `CoverMap.ts` | cover points with a protect side, perches and overhangs, built from `mapTiles` |
  | `GroundNav.ts` | walkable spans plus jump/drop links, and a surface graph for ceiling crawlers |
  | `AttackTokens.ts` + `SquadCoordinator` | generalises `SurfaceMission`'s attacker slots: pools `{melee, ranged, artillery, bomb}` per mission, preemption, flank slots biased to the player's unaimed side |

- **`entities/RiggedHostile.ts`.** An abstract `Arcade.Sprite` implementing `Hostile`, holding the rig, brain, perception and `radar: {kind, isBoss}`. The `HitPart` sub-hitbox follows a socket, is registered through `HostileCombat.register`, and emits `partDestroyed`.
- **`GameScene.ts:179`:** always builds `FlightNavigation`, `CoverMap` and `GroundNav` into `scene.ai`, with at most 4 BFS per frame plus a cache.
- **Other changes.**
  - `enemyPresentation.ts` accepts rigs; breakup scatters the real rig parts.
  - `juggernautDeath.ts` is generalised into `rigDeath.ts`.
  - `MinimapRenderer` reads `radar.kind`.
  - Remove the dead `bossProjectiles` group (or feed it from P8e) and the Drone `resilience` code.
- Tests: Perception, UtilityBrain, Steering, Boids, Predict, CoverMap, GroundNav and AttackTokens, plus the existing FlightNavigation tests. Nav data builds in ≤30 ms per level.

### P8 — Enemy roster (8a–8e; each PR re-bodies one family and deletes its old sheet)
Rules: hull ramp plus the hostile colour for eyes and telegraphs only. Every attack has a readable telegraph and an SFX cue. Brains live in `ai/brains/<name>.brain.ts` (pure, tested).

- **8a Flyers.**

  | New unit | Replaces | Body | Behaviour |
  |---|---|---|---|
  | **WASP** | Viper drone | pod-thruster flyer, chin turret, wobble tail | squads of 2–4: a suppressor holds a firing position and flankers take the unaimed side via terrain; evade-roll, regroup at cover, search the last known position |
  | **HORNET** | Hornet drone | swept-wing harrier | curved strafing runs through the blind side, then loops out |
  | **HERON** | sniper drone | long-boom sniper | perches; a lagging laser sight holds 0.8 s (you can break LOS); relocates after every shot |
  | **JACKAL** | StunDart | pack of 3 | circles, two feint charges, the real strike comes from the opposite side (EMP), then scatters; retreats if it loses 2 members |

  Delete the Viper, Hornet and Dart sheets.
- **8b Carrier, swarm and bomber.**
  - **BROODMOTHER** (Carrier): holds 700–900 standoff behind terrain and opens its hangar (a destructible HitPart) to launch waves; the swarm docks to repair.
  - **MITE** (Swarmling): screeners wall off the Broodmother; biters latch onto HARROW sockets and deal damage over time until shaken off by a surge or jet burst.
  - **MANTA** (Bomber):
    - flies a racetrack at altitude;
    - telegraphs a dive with a wing fold and a reticle at `predictLanding`;
    - drops a stick of 3 bombs along the path;
    - only spawns where there is ground (fixes the Orbital bug).
- **8c Ground threats.**
  - **TICK** (Mine): a crawler mine that burrows with dust and a sensor nub, unburrows on perception, hops to the predicted landing (can be shot mid-hop), then a 0.6 s arm beep. In void levels it clings to hull plates and ceilings.
  - **LONGLEG** (PPC): a hexapod artillery spider that walks between perches, braces with a charge beam and heat haze, fires, then relocates. Its legs are HitParts.
  - **BULWARK** (ShieldedTank): a reverse-joint walker tank that moves cover to cover, braces its frontal shield slab to fire artillery, and must be flanked. The shield is a HitPart.
- **8d Surface roles and new walkers.**
  - `SurfaceEnemy` is split up and moved onto shared tokens:
    - **PROWLER** (skirmisher): cover-peek bursts.
    - **SPOTTER** (sniper): deploys its tripod legs, fires with a laser lag, relocates.
    - **RAM** (charger): head-down scrape telegraph, then a straight charge (jump to dodge); hitting a wall stuns it with its back exposed.
    - target → an animated relay mast.
  - New walkers (floor levels 0/2/4 and hull plates in 3):
    - **STILT**: a tall stilt-walker that strides over you and fires down. Destroying a knee HitPart topples it.
    - **SCUTTLER**: a centipede crawler on walls and ceilings that drops on your predicted position. It sheds segments as it takes damage.
    - **BURROWER**: a dust-mound telegraph travels toward you, then it erupts under your predicted position with a ring shot.
- **8e Bosses** (multi-part `RigTextureView`).
  - **Warden fortress:**
    - two sweep-arm HitParts; destroying one removes its half of the sweep;
    - an uplink dish HitPart; destroying it ends the column phase;
    - the core is exposed while the arms are down;
    - total hp equals the legacy 32.
  - **Nexus flyer:**
    - four thruster-pod HitParts; losing pods makes it list and slow and unlocks a desperation pattern;
    - keeps the triple shot and the telegraphed half-screen blast;
    - WASP escorts;
    - variants become palette ramp swaps;
    - feeds the `bossProjectiles` group.

  Delete the Kodiak, Sentinel, Juggernaut and Nexus sheets.
- **Spawning.**
  - `DroneSpawner.ts` picks types from a per-`enemyMix` table filtered by level capabilities (`hasGround`, `hasCeiling`, `voidBottom`) instead of slot index. `WAVE_BRACKETS` scaling is kept. Squads spawn as units.
  - `SurfaceMission.ts` and `data/surfaceMission.ts` use the new roles, with the token pool replacing `SURFACE_MAX_ATTACKERS`.
- Tests: one brain test per enemy; a capability test (no MANTA, TICK, STILT or BURROWER in void-only arenas); updated `Mine`, `Drone.navigation`, `enemyPresentation`, `HostileCombat` and `CollisionRegistry` tests.

### P9 — UI overhaul: icons, bitmap text, start screen (after P1; parallel with P4–P8)
- **`src/ui/theme.ts`** is derived only from `palette.ts`. It replaces the UIScene `COL` tokens and the duplicate palettes in PlayerHud, MinimapRenderer, Overworld and Boot, and puts spacing on a 2 px grid.
- **Art** in `art/ui/*.aseprite`, remapped to the palette and exported at ×2:
  - 9-slice panels (`panel`, `inset`, `alert`, `bevel`) through `this.add.nineslice`;
  - an **icon set**: turret, gatling, missile, repair, surge, jets/fuel, armor, relay, ammo, wave, kills, score, pause, settings, audio, graphics, controls;
  - key-cap sprites (LMB, RMB, E, Q, Shift, Space, F, Esc);
  - mission and enemy glyphs for radar and overworld.
- **Bitmap fonts** `moon8`/`moon16`, authored in Aseprite and loaded as BitmapText or RetroFont, shown at 2×. Remove the Google Fonts link from `index.html` and every `add.text` in UI code.
- **Kit `src/ui/kit/`:**
  - `panel.ts` (nineslice), `bracket.ts` (replaces the 6 hand-drawn copies), `keycap.ts`;
  - `iconButton.ts`: icon, key-cap, hover/press/disabled states, mouse and keyboard focus, and a tooltip that appears on hover only;
  - `bar.ts`: segmented bar with a partial segment, damage trail and blink; replaces `drawBarFrame`/`paintBar`/PlayerHud `drawBar`;
  - `meter.ts`: radial cooldown ring around an icon.
- **De-text every screen.** UIScene is split into `ui/screens/*.ts` while re-skinning:
  - **HUD.** Replace "MECH / SYSTEM STATUS", "INTEGRITY" and "SPACE / THRUST" with an armor icon plus a segmented bar with a bitmap number, and a fuel icon plus a bar.
  - **Ability dock.** Icon cards (weapon icon, key-cap, cooldown ring, ammo number) replace the title and state strings. The repair cue is a pulsing green icon, not "Q RESTORE ARMOR".
  - **Score, wave and kills** become icon plus number.
  - **Objectives** become an icon and distance-marker beacon; the text brief shows only on the radio panel.
  - **Boss telegraph** is a hazard icon plus a direction glyph instead of "[!] INCOMING [!] / EVADE".
  - **Pause** is an icon button column (resume, controls, graphics, audio, quit).
  - **Upgrade picker:** cards with a large icon, a stat delta glyph (e.g. +20 armor), and 1/2/3 key-caps.
  - **Game over / level complete:** a large glyph and stats as icon rows; restart and continue are buttons.
  - **Controls guide:** a HARROW portrait (`rig.snapshot`, ×4) with key-caps connected by leader lines to the parts they control, instead of paragraphs.
  - **Radar** uses glyph blips by `radar.kind`. The static layer is cached in a DynamicTexture and only the dots redraw.
- **Start screen (new `TitleScene`, Boot → Title → Overworld).**
  - A pixel MOONSEC logo redrawn in Aseprite (replaces the unused `logo.svg`).
  - HARROW idling on a regolith ridge with P6 dust, fog and a light shaft; the earth and moon backdrop in the palette; jets flare when you start.
  - Icon-button menu: START (new or continue), CONTROLS, GRAPHICS, AUDIO. Keyboard and mouse. Music plays through `MusicSystem` after the first input (autoplay policy).
  - `BootScene.ts:146` starts Title instead of Game. `?level=` still skips straight to Game in dev.
  - The loading bar uses the kit.
- **Overworld redo.** The moon is pre-rendered pixel art (dithered terminator). Nodes are pixel icon sprites with stepped path lines, the cursor is a pixel reticle, and the header text becomes icon plus number. Remove the mech select.
- The UI camera gets Blocky 2 plus the palette once everything is on the grid.
- Tests: `theme.test.ts` (every colour is a palette entry), `bar.test.ts`, `iconButton` state logic (pure), and `noRawColors` = 0 for `ui/`. Screens are captured via `?ui=title|pause|upgrade|gameover|complete|guide`.

### P10 — Consolidate
The raw-colour baseline is 0 and the asset allowlist is empty. Tune particle caps and brain Hz with `perf.mjs` on every level and preset. Update the spec and READMEs.

## Order
P0 → P1 → P2 → P4 → P5 → P6.
P3 can run any time after P1, but must land before P5.
P4 → P7 → P8a → 8b → 8c → 8d → 8e.
P9a (kit, fonts, icons) can start after P1. P9b (HUD) needs P3. P9c (title) needs P5 and P6.
P10 last.

## Risks and fallbacks
- **The custom filter API is new.** Spike it in P2 with the built-in `Quantize` + `Blocky` fallback ready.
- **Blocky erases 1 px detail.** Enforce the ×2 rule and ≥2 px lines, with a lint for uniform 2×2 blocks.
- **Headless WebGL.** Needs swiftshader. Measure performance only in headed Chrome.
- **Canvas fallback.** Degrades to `clean`.
- **AI CPU with nav in every mission.** Staggered brains plus a BFS budget.
- **Art volume (16+ rigs).** Share part kits across families.
- **Difficulty.** WIDE zoom and smarter AI change balance. Retune the token pools per mission in `levelConfigs`, and keep the limp speed penalty off.

**Cut order if scope shrinks:**
1. scanlines and CLOSE view;
2. the DustField simulation;
3. light shafts and haze;
4. BURROWER, then SCUTTLER wall walking;
5. HitParts on non-bosses;
6. the overworld redo (a re-skin only);
7. the texture back end for bosses.

**Never cut:** the palette pipeline, HARROW with graded damage and the limp, the AI toolkit, a new behaviour for every role, the icon UI, and the title screen.

## Verification
- `npm test` and `npm run build` on every PR. Pure modules (rig, ai, fx sim, palette, settings, armor, UI state) carry the logic tests.
- `node tools/shots/shots.mjs`: all 5 levels × presets, plus `?rigtest=all` and the `?ui=` screens. The palette audit must show 0 off-palette pixels with scanlines off, and `__moonsecErrors` must be empty.
- `node tools/shots/perf.mjs` (headed): p95 ≤16.7 ms and <1% of frames over 20 ms on every level. Post chain ≤2 ms, dust ≤2 ms, AI ≤1.5 ms, 25 rigs ≤1.5 ms.
- Manual playtest per phase via `npm run dev` with `?level=N`, `?encounter=`, `?boss=1` and `?armor=8`. Checks:
  - walk, backpedal, limp;
  - jets, surge, three weapons from their muzzles;
  - repair, relay, EMP, death and drop-in;
  - each enemy family's telegraphs and behaviours;
  - title → overworld → mission → game over → restart.
