# Map Simplification — Implementation Plan

**Goal:** Replace dense procedural platform layouts and globally generated moving platforms with five authored, readable mission layouts.

**Spec:** `docs/superpowers/specs/2026-07-11-map-simplification-design.md`

**Scope:** Map data, moving-platform spawning, radar accuracy, and focused regression tests. This pass does not rebalance enemies, waves, weapons, or backgrounds.

## File map

| File | Change |
|---|---|
| `src/data/levelData.ts` | Make traversal deterministic; author simpler fixed platforms, walls, and gaps for all five maps |
| `src/data/levelConfigs.ts` | Replace the moving-platform boolean with per-level authored specs |
| `src/scenes/GameScene.ts` | Spawn only configured platforms and keep radar positions current |
| `src/entities/MovingPlatform.ts` | Expose compact current geometry for radar/tests if needed |
| `src/ui/MinimapRenderer.ts` | Render moving platforms at their live positions |
| `src/tests/levelData.test.ts` | Replace density tests with deterministic layout and geometry-budget tests |
| `src/tests/levelConfigs.test.ts` | Add campaign moving-platform budget and per-level intent tests |

## Task 1: Lock down the new budgets with tests

- [ ] Add a test that builds every template with two different seeds and asserts identical solid/empty geometry.
- [ ] Assert the fixed-platform ceilings from the spec: 4, 10, 4, 12, and 3 respectively (ground runs are excluded).
- [ ] Assert no authored platform is narrower than four tiles.
- [ ] Assert campaign moving-platform counts are `[0, 2, 1, 2, 0]`.
- [ ] Assert Surface Ops and Nexus Core have no moving collision geometry.
- [ ] Run the new tests and confirm they fail against the current data for the expected reasons.

This task replaces the current tests that reward high platform density. Tests such as “at least eight upper traversal pockets” encode the problem being removed and should not survive unchanged.

## Task 2: Simplify the map schema

- [ ] Add `fixedGaps: { col: number; width: number; depth: number }[]` to `LevelTemplate`.
- [ ] Remove `variation.pitCount`, `pitWidth`, `extraPlatforms`, `platformRows`, and `platformWidth`.
- [ ] Update `buildMap()` to cut only the authored `fixedGaps` after laying ground/fill.
- [ ] Remove random platform placement and collision-attempt logic.
- [ ] Keep the `seed` argument temporarily for API compatibility; document that it is reserved for non-collision tile variation.
- [ ] Run `src/tests/levelData.test.ts`.

Do not combine this task with the layout rewrite. A small schema change makes failures easier to diagnose.

## Task 3: Author the five simplified static layouts

- [ ] **Surface Ops:** continuous ground, two shallow fixed gaps, four broad elevated runs, no stacked platform ladder.
- [ ] **Trade Lanes:** six broad lower decks, four upper catwalks, and two loading gantries. Keep spawn on a large lower deck.
- [ ] **Deep Facility:** continuous ground, two nonlethal service trenches, three maintenance ledges plus one static elevator fallback, and two partial bulkheads.
- [ ] **Orbital Station:** eight large hull plates and four upper service decks. Ensure adjacent safe landings are visible within the camera framing.
- [ ] **Nexus Core:** continuous ground, three broad shelves, two approach bulkheads, no pits, and a clear symmetric final arena.
- [ ] Use comments to name landmarks and route purpose, not merely restate coordinates.
- [ ] Run the level-data tests after each template rather than editing all five before checking them.

Suggested verification helper: render each `number[][]` map to a small text or PNG artifact during development. Do not commit generated previews unless they become a maintained debugging tool.

## Task 4: Make moving platforms authored per mission

- [ ] Define and export `MovingPlatformSpec` from `src/data/levelConfigs.ts` (or a shared data-types file if that keeps imports cleaner).
- [ ] Change `LevelConfig.movingPlatforms` from `boolean` to `MovingPlatformSpec[]`.
- [ ] Configure exactly:
  - Surface Ops: none.
  - Trade Lanes: two vertical cargo lifts at the authored lower/upper route connections.
  - Deep Facility: one vertical freight elevator in the central chamber.
  - Orbital Station: two short-travel horizontal docking arms.
  - Nexus Core: none.
- [ ] Choose travel endpoints that never sweep through static tiles.
- [ ] Keep speeds consistent and predictable (roughly 80–100 px/s); avoid alternating speeds just for variety.
- [ ] Rewrite `GameScene.spawnMovingPlatforms()` as a simple loop over the specs.
- [ ] Delete global spacing/count logic and the `voidBottom`/node-index elevator branch.
- [ ] Register the player collider only when the spec array is non-empty.
- [ ] Run config and collision tests.

## Task 5: Keep radar data truthful

- [ ] Stop adding a moving platform's travel midpoint to static `platformData`.
- [ ] Have `MinimapRenderer` read active moving-platform children and draw their current `x`, `y`, and display width.
- [ ] Keep `platformData` limited to tilemap/static geometry.
- [ ] Confirm destroyed or inactive moving platforms are skipped.
- [ ] Verify a moving radar bar follows a cargo lift through a full cycle.

## Task 6: Automated verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Fix type errors caused by the boolean-to-array config change without widening the scope.
- [ ] Confirm restart tests still pass and moving-platform colliders are not duplicated after a scene restart.

## Task 7: Five-map playtest

Use the existing `?level=N` shortcut and play each node from spawn through at least one complete wave.

- [ ] **Surface Ops:** next landing/route is always obvious; no waiting; jetpack gate has a fallback.
- [ ] **Trade Lanes:** both cargo lifts make spatial sense; lower route remains viable when lifts are badly timed.
- [ ] **Deep Facility:** elevator reads as a shortcut rather than a requirement; bulkheads do not trap ground enemies.
- [ ] **Orbital Station:** every gap is readable before takeoff; docking arms do not become unavoidable death timers.
- [ ] **Nexus Core:** shelves provide useful firing positions without obscuring boss telegraphs.
- [ ] Across all maps, verify enemy navigation, pickup collection, missile targeting, camera follow, radar, and death/restart.
- [ ] Remove any platform that lacks a clear gameplay job. Add geometry only to repair a demonstrated unreachable or unreadable route.

## Completion gate

The work is complete when tests and build pass, each map passes the checklist, and the live game contains no more than five moving platforms across its authored configurations. Do not close the task based on counts alone; the static and jetpack fallback for every moving set piece must be verified in play.
