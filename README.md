# Moonsec

Moonsec is a Phaser 4 / Vite / TypeScript side-scrolling mech shooter set across a branching lunar campaign.

## Current state

- Surface Ops: playable systems check, three relay encounters, a specialization choice, and a shielded Warden boss
- Five mission nodes: Surface Ops, Trade Lanes, Deep Facility, Orbital Station, Nexus Core
- Trade Lanes flyers navigate around cargo decks and bulkheads, with clear firing lanes and safe arrival positions
- Detailed freight-deck hulls, landing lights, and industrial lift panels
- Branching overworld map between missions
- Multiple enemy families: drones, bombers, carriers/swarmlings, PPC platforms, mines, shielded tanks, boss variants
- Three player weapons: rail/rapid fire, turret fire, homing missiles
- Readable armor/fuel panel, mission readout, compact radar, and a unified weapon/ability dock
- Contextual Q repair prompt whenever damaged armor can be healed; healing progress and recharge countdown
- Illustrated pilot guide, pause menu, and field upgrades selectable by mouse or keyboard
- Procedural music/SFX support through `AudioSystem` / `MusicSystem`

## Controls

- `A / D` — move
- `Shift` (or double-tap `A / D`) — surge dash in your movement direction
- `Space` — jump / jetpack thrust
- left mouse — turret fire
- right mouse — rapid/rail fire
- `E` — homing missile
- `Q` — nanite repair
- hold `F` — restore a cleared Surface Ops relay
- `H` — controls overlay
- `Esc` — pause
- dev only: `?level=N` or number keys `1-5` jump to a mission node

## Development

Use Node 24 (also pinned in `.nvmrc` and CI).

```bash
nvm use
npm ci
npm run dev
npm test
npm run build
```

CI runs both tests and production build before publishing GitHub Pages.

## Architecture map

- `src/scenes/BootScene.ts` — asset preload, animation registration, procedural texture setup
- `src/scenes/GameScene.ts` — core mission orchestration; should stay thin over time
- `src/scenes/UIScene.ts` — HUD, radar, pause/controls/game-over/level-complete overlays
- `src/scenes/OverworldScene.ts` — campaign node selection
- `src/entities/` — player, enemies, hazards, projectiles, moving platforms
- `src/weapons/` — player weapon controllers
- `src/systems/` — audio/music, spawning, debug logging
- `src/data/` — level configuration and map templates
- `src/ui/` — reusable HUD/minimap components
- `src/tests/` — pure/system guardrail tests

See `docs/SURFACE_OPS.md` for mission design, specialization tradeoffs, and local playtest routes.

See `docs/ARCHITECTURE.md` for the cleanup plan and maintenance boundaries.
