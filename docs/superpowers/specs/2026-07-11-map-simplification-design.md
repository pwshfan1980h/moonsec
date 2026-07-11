# Map Simplification — Design Spec

**Status:** Proposed replacement for the platform-density and verticality guidance in the older level plans.

**Goal:** Make every mission readable at a glance, give each map one strong traversal identity, and remove moving platforms that exist only to add motion.

## Design rules

1. **Traversal geometry is authored, not random.** Fixed platforms, walls, and gaps are identical for every seed. Seeds may vary tile art and background dressing only.
2. **One main route, one optional route.** The main route is broad and obvious. A shorter or safer upper route may reward jetpack use, but it must reconnect quickly.
3. **No platform confetti.** Prefer a few wide combat decks over many small stepping stones. A platform must provide cover, elevation, a route connection, or a recognizable arena boundary.
4. **Moving platforms are set pieces.** Use at most two in a mission and five in the full campaign. They must fit the fiction (cargo lift, freight elevator, docking arm), serve a specific connection, and have a static or jetpack fallback.
5. **Never make the player wait.** A moving platform cannot be the only way forward. Its cycle should improve positioning rather than gate basic traversal.
6. **Protect combat readability.** Boss arenas do not move. Normal combat spaces need at least one broad landing surface and enough open air for missiles and aerial enemies.
7. **Teach before testing.** Surface Ops establishes ground movement and basic jetpack use. Later maps may ask for more air control, but they do not repeat the same platform ladder at greater density.

## Campaign layout

### 1. Surface Ops — ground assault

**Identity:** A mostly continuous lunar surface with three recognizable combat landmarks.

- Continuous ground is the default route.
- Two fixed, shallow pits break up the run without turning the mission into a precision platformer.
- Four broad terraces total: an early overlook, a central jetpack gate, a defensive roof, and a final approach ledge.
- The jetpack gate has a generous opening and a visible walk-around route.
- No moving platforms.
- No random extra platforms.

The level should feel fast and legible. Verticality is an advantage in combat, not a toll booth.

### 2. Trade Lanes — broken cargo deck

**Identity:** Large cargo-deck sections separated by short void gaps, with an intermittent upper service route.

- Six broad lower-deck sections form the main route.
- Four upper catwalks create optional flanking positions and reconnect to the lower deck within one screen.
- Walls are reduced to two loading gantries so the skyline and firing lanes stay readable.
- Two cargo lifts connect lower and upper decks at authored positions.
- Both lifts are optional: the jetpack and nearby static ledges provide a fallback.
- No procedural platforms.

This is the first map with moving terrain, so the lifts should be visually distinct and easy to predict.

### 3. Deep Facility — compressed tunnel

**Identity:** A grounded corridor with low ceilings, separated chambers, and one dramatic vertical shortcut.

- Continuous ground with two fixed service trenches; neither is lethal because the map is not a void mission.
- Three large overhead maintenance ledges, one per major chamber.
- Two partial-height bulkheads shape combat without dividing the map into platform stacks.
- One freight elevator crosses between the floor and the central maintenance ledge.
- The elevator is an optional shortcut; a static side ledge supports jetpack access.
- No random platforms or pits.

The map's challenge comes from constrained firing space and ground-heavy enemies, not from navigating a forest of ledges.

### 4. Orbital Station — hull breach

**Identity:** Large static hull plates in open space, with a small number of mechanical docking connections.

- Eight large hull sections create a clear left-to-right spine.
- Four upper antenna/service decks provide the optional route.
- Gaps are varied but always readable from the takeoff edge; no blind leaps.
- Two moving docking arms bridge alternate positions near the middle and final third.
- Static lower plates and jetpack routes remain available at both arms.
- No procedural platforms.

Orbital keeps the strongest aerial identity, but broad hull sections—not moving objects—carry most of the traversal.

### 5. Nexus Core — stable boss arena

**Identity:** A sequence of large chambers culminating in an uncluttered final arena.

- Continuous ground and three broad elevated firing shelves.
- Two bulkheads divide the approach into chambers while leaving generous openings.
- No pits, random platforms, or moving platforms.
- The final two-screen arena has one ground plane and two symmetric shelves so boss attacks remain readable.

The finale should test combat mastery rather than platform timing.

## Geometry budget

| Mission | Fixed platform runs | Moving platforms | Random traversal geometry |
|---|---:|---:|---:|
| Surface Ops | 4 plus ground | 0 | 0 |
| Trade Lanes | 10 | 2 cargo lifts | 0 |
| Deep Facility | 4 plus ground | 1 freight elevator | 0 |
| Orbital Station | 12 | 2 docking arms | 0 |
| Nexus Core | 3 plus ground | 0 | 0 |
| **Campaign total** | **33** | **5** | **0** |

The numbers are ceilings, not quotas. During playtesting, remove geometry before adding more.

## Data model

Traversal should be fully described by level data instead of generated globally in `GameScene`.

```ts
export type FixedPlatform = { col: number; row: number; width: number };
export type FixedWall = { col: number; rowStart: number; height: number };
export type FixedGap = { col: number; width: number; depth: number };

export type MovingPlatformSpec = {
  x: number;
  y: number;
  width: number;
  axis: 'x' | 'y';
  travel: number;
  speed: number;
  startForward?: boolean;
};
```

`LevelTemplate` gains `fixedGaps` and loses procedural pit/platform fields. `LevelConfig` replaces `movingPlatforms: boolean` with `movingPlatforms: MovingPlatformSpec[]`.

`GameScene.spawnMovingPlatforms()` loops over the active level's specs. It no longer invents one platform every 300 pixels or adds elevators based on `voidBottom`.

## Presentation

- Moving platforms use mission-specific accent tints and a small directional light or rail so their travel axis is obvious.
- Static routes should differ in silhouette: broad hull plates, catwalks, maintenance shelves, and arena balconies.
- Radar shows moving platforms at their current position, not the midpoint of their travel.
- Background machinery may move freely because it cannot confuse collision or traversal.

## Acceptance criteria

- The full campaign contains no more than five moving platforms.
- Surface Ops and Nexus Core contain none.
- Map geometry is identical for different random seeds.
- Every moving platform has a reachable static/jetpack fallback.
- The critical route never requires waiting for a platform cycle.
- No required landing is narrower than four tiles (128 px).
- A player can identify the next safe landing before leaving the current one.
- Boss arenas contain no moving collision geometry.
- Existing player, projectile, enemy, pickup, radar, and restart behavior remains intact.
