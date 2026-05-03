# Moonsec Architecture Cleanup Plan

This plan is meant to keep the game easy to extend after fast AI-assisted iteration.

## Goals

1. Keep scene lifecycle cleanup deterministic.
2. Make enemy/spawner accounting event-driven and reusable.
3. Split large generated scene files into focused helpers without changing gameplay.
4. Keep CI honest: tests must pass before deploy.
5. Remove stale assets/docs when features are removed.

## Current boundaries

### Scenes

- `BootScene` owns loading and animation/texture registration only.
- `GameScene` owns mission lifecycle, physics groups, collision wiring, and high-level events.
- `UIScene` owns screen-space UI and listens to `GameScene` events through tracked subscriptions.
- `OverworldScene` owns campaign node navigation only.

### Systems

- `DroneSpawner` owns wave count, hostile count, boss phase, and wave/level-complete events.
- Dynamic child enemies should emit `hostileSpawned` when they enter the wave after the wave denominator was published.
- Enemies should emit `droneKilled` only when they should reduce the live-hostile count.

### UI event cleanup

UI listeners must be unsubscribed by exact handler reference. Avoid `removeAllListeners()` from another scene; that can erase gameplay listeners owned by `GameScene` or `DroneSpawner`.

## Refactor phases

### Phase 1 — Guardrails

- Run `npm test` in CI before `npm run build`.
- Keep constants tested from production exports, not copied literals.
- Register scene cleanup with Phaser `SHUTDOWN` lifecycle events.

### Phase 2 — Combat accounting

- Use `hostileSpawned` for dynamic adds like carrier swarmlings.
- Consider extracting a `HostileCounter` or `WaveState` helper if more dynamic spawn types are added.
- Add regression tests around carrier/swarmling wave counts.

### Phase 3 — GameScene split

Move these out of `GameScene` in small, behavior-preserving PRs:

- `PickupSystem` — pickup spawn, lifetime, magnet, collection text/audio
- `MissionVfx` — bullet impacts, explosions, chunks, floating text, boss blast visuals
- `MapBuilder` — tilemap ground, base props, background/parallax
- `CollisionRegistry` — weapon/enemy/projectile overlap setup

### Phase 4 — UIScene split

Move these out of `UIScene`:

- `TacticalHudPanel` — ammo/cooldown/nanite bars
- `WaveBanner` — wave text, progress bar, remaining-hostiles label
- `PauseControlsOverlay` — pause and controls modal
- `EndStateOverlay` — game-over and level-complete screens

### Phase 5 — Content additions

Best next gameplay additions after stabilization:

- Mission modifiers per node: EMP storm, ammo scarcity, low gravity, shielded elites
- Unique boss attack per campaign node
- Lightweight post-level reward choice
- Enemy intel/codex on the overworld
- Accessibility/tuning menu: shake, volume sliders, difficulty

## Removal policy

If a feature is removed from `src/`, remove its assets and docs unless they are explicitly part of a planned branch. Keep active experiments in git branches/worktrees, not stranded files on `main`.
