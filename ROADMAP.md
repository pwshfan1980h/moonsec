# Moonsec — Roadmap

## v0.7.x — Stabilization

- Keep CI honest: run `npm test` before production build/deploy.
- Fix scene lifecycle cleanup so restarts and mission transitions do not leak handlers/audio.
- Harden dynamic hostile accounting for carrier/swarmling waves.
- Keep constants tested from production exports.
- Prune stale upgrade/title assets and stale generated files from `main`.
- Add README and architecture notes for future work.

## Surface Ops vertical slice — implemented

- Playable movement/weapon introduction, with persistent objectives and directional beacons.
- Three authored relay encounters with bounded enemy and attack budgets.
- Telegraphing skirmishers, snipers, and chargers.
- One specialization with explicit weapon/repair tradeoffs; relay resupply between fights.
- Warden boss with shield/exposure cycles, ground sweeps, and locked orbital strikes.
- Dedicated Shift dash, buffered jumps, coyote time, and consistent thrust limits.
- Phaser 4.2, TypeScript 7, Vite 8.2, Vitest 5, and Node 24 in CI.

## v0.8 — Campaign polish

- Playtest Surface Ops with new players and tune time to kill, warning duration, and relay rewards.
- Extend the objective/encounter structure to the other four mission nodes, each with a different mission mechanic.
- Balance all five current mission nodes.
- Give each boss variant at least one unique attack pattern, not just a palette/theme shift.
- Add mission modifiers: EMP storm, ammo scarcity, shielded elites, low gravity, or hazardous terrain.
- Add enemy intel/codex summaries on the overworld.
- Add regression tests for wave progression, dynamic spawns, and scene restart cleanup.

## v0.9 — Refactor without behavior changes

- Extract `PickupSystem` from `GameScene`.
- Extract `MissionVfx` from `GameScene`.
- Extract map/background generation from `GameScene`.
- Extract HUD panels, wave banner, and overlays from `UIScene`.
- Consolidate repeated enemy damage/collision setup.

## v1.0 — Release candidate

- Full five-node campaign tuned end-to-end.
- Final audio/visual polish pass.
- Accessibility/tuning menu: screen shake, volume sliders, difficulty.
- Complete README with screenshots/GitHub Pages link.
- No stale assets, stale worktrees, failing tests, or known lifecycle leaks on `main`.
