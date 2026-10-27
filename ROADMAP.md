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

## Audio & radio pass — implemented (v0.8.0)

- All sound is static ElevenLabs renders (`docs/AUDIO.md`): 60 effect takes (multi-take weapons,
  impacts and mech footfalls, servos, landings, boot-up, EMP), effect loops, one ambience bed per
  mission theme.
- Training and objectives are voiced radio traffic with squelch, static, ducking and a typed
  caption; HARROW has its own cockpit voice; field crews chatter between fights.
- Streamed score: calm/combat layers per theme, two boss tracks, title, victory/defeat stings.

## Next updates (planned from the audio pass)

Highest value first:

1. **Volume mixer + subtitles.** Music / effects / voice sliders and a captions toggle in the pause
   menu (only a global mute exists today). Persist next to `audioPrefs`.
2. **Positional effects.** Pan and attenuate enemy shots, explosions and footfalls by distance from
   the camera so off-screen threats are audible but not deafening; cap simultaneous instances per id.
3. **Enemy sound identities.** Give each foe (Prowler, Spotter, Ram, Stilt, Burrower, carrier,
   bosses) its own step, attack tell and death render instead of shared `drone-shoot`/`explosion`.
   Pair every telegraph with a distinct audio tell so attacks can be read by ear.
4. **Warden callouts.** HARROW voices each attack telegraph ("sweep", "strike") during the boss and
   Lunar Control reacts to shield breaks and dish destruction.
5. **Campaign radio depth.** Give nodes 1–4 the Surface Ops treatment: objective lines, between-wave
   chatter and reactions per node, plus an overworld briefing when a node is selected.
6. **Adaptive stems.** Run `elevenlabs music separate_stems` on the combat layers and fade drums /
   bass / lead with intensity instead of whole-track crossfades; finetune on the approved tracks so
   regenerated music keeps one style.
7. **Environment reverb.** Convolution send per theme (tight cockpit on the surface, long tail in
   the Deep Facility, dry in orbit) on effects and HARROW's voice.
8. **Surface-aware footsteps.** Regolith vs metal deck takes chosen from the tile under the foot.

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
