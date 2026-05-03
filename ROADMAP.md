# Moonsec — Roadmap

## v0.7.x — Stabilization

- Keep CI honest: run `npm test` before production build/deploy.
- Fix scene lifecycle cleanup so restarts and mission transitions do not leak handlers/audio.
- Harden dynamic hostile accounting for carrier/swarmling waves.
- Keep constants tested from production exports.
- Prune stale upgrade/title assets and stale generated files from `main`.
- Add README and architecture notes for future work.

## v0.8 — Campaign polish

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
