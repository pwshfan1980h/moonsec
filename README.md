# Moonsec

Moonsec is a Phaser 4 / Vite / TypeScript side-scrolling mech shooter set across a branching lunar campaign. You pilot **HARROW**, a skeletal, cursor-tracking biped with jump jets, against a roster of rigged enemies that flank, snipe, burrow and swarm.

## Current state

- **HARROW** player mech: procedural skeleton (IK legs, distance-driven gait, weighted gun tracking), jets, surge dash, repair/relay/EMP/drop-in animations, and graded damage (≤50 smoke, ≤25 sparks, ≤10 limp + fire) on a 100-point armor scale
- **Rigged enemy roster** on the same skeleton framework, each with a real behaviour (see `docs/ENEMIES.md`): WASP squads, HORNET strafing runs, HERON perch snipers, JACKAL packs, BROODMOTHER + MITE swarms, MANTA dive bombers, TICK crawler mines, LONGLEG artillery hexapods, BULWARK shield walkers, PROWLER, SPOTTER, RAM, STILT, SCUTTLER, BURROWER, and WARDEN / NEXUS bosses with destructible parts
- **Moon palette**: 24 colours in `src/render/palette.ts`; every asset and every colour in code is on it (enforced by tests)
- **Crunchy 90s render**: camera filter snaps to a 2px grid, quantizes to the palette with 4×4 Bayer dither, optional scanlines; simulated volumetric dust, fog bands, light shafts and heat haze
- **Icon-first UI**: bitmap MOON font, icon set, key-caps, segmented bars and tick-ring cooldowns; title screen, pixel overworld, pause/upgrade/results screens and an illustrated pilot guide
- Five mission nodes: Surface Ops, Trade Lanes, Deep Facility, Orbital Station, Nexus Core

## Controls

- `A / D` — walk (HARROW faces the cursor; walking away from it backpedals)
- `Shift` (or double-tap `A / D`) — surge dash
- `Space` — jump / jump jets
- left mouse — cannon, right mouse — gatling
- `E` — homing missile, `Q` — nanite repair, hold `F` — bring a cleared relay online
- `H` — pilot guide, `Esc` — pause (graphics `G`, view `V`, sound `M`)

## Development

Use Node 24 (also pinned in `.nvmrc` and CI).

```bash
nvm use
npm ci
npm run dev
npm test
npm run build
npm run art:rig      # rebuild the rig part atlas from src/rig/parts
```

Dev URL switches (`src/dev/devParams.ts`): `?level=N` skips the title, `?seed=`, `?freeze=ms`, `?gfx=crunchy|clean|low`, `?boss=1`, `?encounter=N`, `?armor=8` (see the limp), `?rigtest=all|foes` (rig galleries), `?ui=title|map|pause|upgrade|gameover|complete|guide`, `?noguide=1`.

Verification tools (`tools/shots/`, need `PLAYWRIGHT_CORE` and `CHROME` env vars):

- `node tools/shots/shots.mjs --out .shots/x [--levels 0,2] [--extra "ui=pause"]` — deterministic screenshots; fails on page errors
- `node tools/shots/perf.mjs --levels 0,1,2,3,4` — headed frame-time benchmark (p50 / p95 / frames over 20 ms)
- `node tools/shots/playtest.mjs --level 2` — scripted input playtest captures

Palette tools: `node --import ./tools/register-ts.mjs tools/palette/colorLiterals.ts --write` (literal baseline, must stay 0) and `tools/palette/codemod.ts` (rewrite raw colours to palette names).

## Architecture map

- `src/render/` — palette, retro camera filter, graphics settings
- `src/rig/` — skeleton framework: IK, gait (with limp), aim trackers, damage stages, part DSL, `RigView` / `RigFx`
- `src/ai/` — perception, utility brain, steering, prediction, cover map, ground navigation, attack tokens
- `src/entities/` — `Player` (HARROW), `RiggedHostile` + `foes/` (roster), projectiles, platforms
- `src/fx/` — dust field simulation, atmosphere (fog, shafts, haze)
- `src/balance/` — armor scale, damage and heal tables
- `src/systems/` — spawning (`waveMix`, `DroneSpawner`, `SurfaceMission`), audio, pickups
- `src/ui/` — theme, MOON font, icons, kit widgets, HUD and screens
- `src/scenes/` — Boot → Title → Overworld → Game + UI
- `src/tests/` — pure-module and guardrail tests

See `docs/superpowers/specs/2026-09-23-moonsec-overhaul-design.md` for the overhaul design, `docs/ENEMIES.md` for the roster, `docs/SURFACE_OPS.md` for mission design and `docs/ARCHITECTURE.md` for maintenance boundaries.
