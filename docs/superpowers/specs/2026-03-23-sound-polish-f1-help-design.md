# Design: Sound Polish + F1 Help Screen

**Date:** 2026-03-23
**Status:** Approved

---

## Context

The game has a solid Web Audio API foundation (9 sounds, oscillator + filter + gain chains) but all sounds are deterministic and several important game events are completely silent. The bottom-of-screen controls hint is too small and cramped to be readable. This spec covers three improvements:

1. **Sound quality** — pitch variation on existing sounds to eliminate mechanical repetition
2. **New sounds** — nanite healing sounds, plus fills for currently-silent events (wave start, drone death, eject/reenter, jetpack hum)
3. **F1 help overlay** — a proper in-game controls reference replacing the 9px hint

**Design constraint:** No shrill sounds. All new sounds must stay warm. High-frequency oscillators are avoided; when used, they're filtered aggressively. Maximum unfiltered frequency: ~600 Hz. Prefer sine and low-filtered square/sawtooth.

---

## Feature 1 — Sound Quality: Pitch Variation

### Goal
Prevent the mechanical same-pitch repetition that makes rapid-fire and repeated hits feel robotic.

### Change to `ToneConfig` (`src/systems/AudioSystem.ts`)

Add optional `pitchVariance` field:

```ts
interface ToneConfig {
  freq: number | [number, number];
  duration: number;
  type: OscillatorType;
  gain: number;
  filterFreq?: number;
  pitchVariance?: number; // ± fraction, e.g. 0.08 = ±8% random jitter per play
}
```

### Change to `play()` method

When `pitchVariance` is set, multiply base frequency by `(1 + (Math.random() * 2 - 1) * pitchVariance)` before applying to the oscillator. For sweep sounds `[start, end]`, apply the same multiplier to both endpoints so the sweep character is preserved.

### Variance values per sound

| Sound | pitchVariance | Rationale |
|-------|--------------|-----------|
| `rapid` | 0.08 | ±8% — machine-gun chatter effect |
| `turret` | 0.05 | ±5% — cannon boom variation |
| `missile` | 0.04 | ±4% — subtle sweep variation |
| `explosion` | 0.15 | ±15% — chaotic impact, each feels unique |
| `hit` | 0.10 | ±10% — bullet impact crunch variation |
| `hurt` | 0.06 | ±6% — damage sting variation |
| `jump` | 0.03 | ±3% — slight, preserves consistent jump feel |
| `death` | 0.00 | none — death should be consistent and weighty |
| `drone-shoot` | 0.08 | ±8% — enemy gun variation |

---

## Feature 2 — New Sounds

### 2a — Nanite Healing Sounds (4 new IDs)

All nanite sounds use sine waves and stay below 450 Hz to feel warm and organic rather than electronic.

**`nanite-activate`** — triggered when Q is pressed and nanite activates
- Freq: 110→330 Hz sweep (low to mid, warm ascending energy)
- Duration: 0.5s
- Type: `sine`
- Gain: 0.18
- FilterFreq: 800 Hz lowpass
- Effect: powering-up energy field

**`nanite-tick`** — triggered every ~600ms during active healing (via existing naniteSparkEvent timer)
- Freq: 350→260 Hz (very short descending — liquid drip)
- Duration: 0.12s
- Type: `sine`
- Gain: 0.07 (very quiet, ambient)
- FilterFreq: 600 Hz lowpass
- Effect: subtle biotech drip sound while healing

**`nanite-complete`** — triggered when `progress >= 1` in Player nanite update
- Freq: 220→440 Hz sweep (clean octave rise)
- Duration: 0.4s
- Type: `sine`
- Gain: 0.16
- No filter (clean sine is warm without filtering)
- Effect: satisfied "healed" resolution chord

**`nanite-ready`** — triggered when `naniteCooldown` transitions from >0 to 0 (emit once)
- Freq: 180 Hz fixed
- Duration: 0.10s
- Type: `sine`
- Gain: 0.10
- FilterFreq: 500 Hz lowpass
- Effect: gentle low thud — "ability available"
- **One-shot trigger mechanism:** Add a `private naniteWasOnCooldown = false` field. In the update loop cooldown branch, set it to `true`. In the ready branch (else), if `naniteWasOnCooldown === true`, play the sound and immediately set `naniteWasOnCooldown = false`. This fires the sound exactly once on the transition frame.

### 2b — Previously-Silent Events (4 new IDs)

**`wave-start`** — triggered in `DroneSpawner` where `waveStart` event is emitted
- Freq: 120→280 Hz sweep
- Duration: 0.3s
- Type: `square`
- Gain: 0.22
- FilterFreq: 500 Hz lowpass (keeps it warm despite square wave)
- Effect: low-frequency alert sweep — "incoming wave"

**`drone-death`** — triggered in `DroneSpawner` bullet-hit overlap callback, after calling `drone.takeDamage(1)`, by checking `(drone as Drone).hp <= 0`. This keeps the logic in DroneSpawner (consistent with where `hit` is played) without routing through Drone internals. Not triggered in the missile overlap callback, which already plays `explosion`.
- Freq: 300→40 Hz sweep (deep descending)
- Duration: 0.20s
- Type: `sawtooth`
- Gain: 0.20
- FilterFreq: 400 Hz lowpass
- Effect: dull pop + power-down crunch

**`eject`** — triggered in `Player.eject()` method
- Freq: 200→80 Hz sweep (descending separation thump)
- Duration: 0.15s
- Type: `square`
- Gain: 0.18
- FilterFreq: 450 Hz lowpass
- Effect: electromagnetic separation burst

**`reenter`** — triggered in `Player.reenter()` method (when pilot rejoins mech)
- Freq: 80→240 Hz sweep (ascending reconnect)
- Duration: 0.15s
- Type: `square`
- Gain: 0.18
- FilterFreq: 450 Hz lowpass
- Effect: power reconnect surge (reverse of eject)

### 2c — Jetpack Sustained Hum (new API)

The jetpack is currently silent during sustained flight. A continuous low rumble adds significant presence.

**Sound profile:**
- Primary: 65 Hz sine, gain 0.10 (low sub-bass rumble)
- Harmonic: 130 Hz sine, gain 0.06 (first harmonic, adds body)
- Both sustained until stopped

**New `AudioSystem` methods:**

```ts
private humNodes: Map<string, { oscs: OscillatorNode[]; gain: GainNode }> = new Map();

startHum(id: string): void
// Creates oscillator(s) + gain node, stores in humNodes map.
// Gain fades in quickly (0 → target over 0.1s).
// No-op if hum with that id is already running.

stopHum(id: string): void
// Fades gain out (target → 0.001 over 0.15s), then disconnects and removes from map.
// No-op if not running.
```

**Trigger locations in `Player.ts`:**
- `startHum('jetpack')` when jetpack activates (first frame: `keySpace down + in air + fuel > 0`, where previous frame had jetpack inactive)
- `stopHum('jetpack')` when jetpack deactivates (on ground OR fuel empty OR space released)
- Also `stopHum('jetpack')` in `Player.destroy()` for cleanup
- Also `stopHum('jetpack')` in `Player.eject()` — the update loop returns early when `!piloting`, so without this the hum is orphaned if the player ejects while the jetpack is active

**`startHum` implementation note:** Must include the same `ctx.state === 'suspended'` resume guard as `play()` for browser autoplay compliance.

---

## Feature 3 — F1 Help Overlay

### Goal
Replace the barely-readable 9px bottom hint with a proper controls reference that players can consult without leaving the game.

### Layout

Centered overlay card, 500×240px, positioned at (400, 225) with depth 45:

```
┌─────────────────────────────────────────┐
│       CONTROLS              F1 / ESC    │
├──────────────────┬──────────────────────┤
│  MOVEMENT        │  WEAPONS             │
│  A / D   Move    │  LMB   Turret        │
│  SPACE   Jump    │  RMB   Rapid fire    │
│  SPACE↑  Jetpack │  SHIFT Missile       │
├──────────────────┼──────────────────────┤
│  MECH            │  SYSTEM              │
│  E       Eject   │  ESC   Pause         │
│  E(near) Reenter │  R     Restart       │
│  Q       Nanite  │  F1    Help          │
└─────────────────────────────────────────┘
```

**Styling:** Dark navy background (`0x050510`, alpha 0.92), 1px cyan border (`0x004466`), monospace font. Section headers in cyan (`#00aacc`). Key labels in white (`#ccddee`). Description text in dim gray (`#556677`).

### Behavior

- F1 key toggles `helpVisible` boolean
- F1 open: show overlay (depth 45)
- F1 close: hide overlay
- ESC while help is open: close help first; if already closed, toggle pause (existing behavior). Modify the ESC handler to check `this.helpVisible` before `togglePause`.
- **F1 while paused:** F1 is silently ignored if the game is paused (`this.paused === true`). Only one overlay is active at a time.
- Game continues running while help is open (not paused)
- **Help auto-hides on game-over:** call `this.helpVisible = false` and hide all help overlay elements as the first line of `showGameOver()` (not only in the `gameOver` event listener — `showGameOver` is the authoritative call site)
- Depth 45 — below pause (50) and game-over (60) overlays

### Bottom hint

Replace current long hint text with:
```
F1 — HELP
```
Same position (bottom-left, 9px monospace, `#334455`), just shorter.

---

## Critical Files

| File | Change |
|------|--------|
| `src/systems/AudioSystem.ts` | Extend `SoundId` union type with 8 new IDs; add `pitchVariance` to ToneConfig; apply jitter in `play()`; add all new TONES entries; add `startHum`/`stopHum` methods with `humNodes` map |
| `src/entities/Player.ts` | Trigger `nanite-activate`, `nanite-tick`, `nanite-complete`, `nanite-ready`, `eject`, `reenter`, jetpack hum start/stop |
| `src/systems/DroneSpawner.ts` | Trigger `wave-start` on wave spawn, trigger `drone-death` on drone bullet-kill (not missile-kill, which already plays `explosion`) |
| `src/scenes/UIScene.ts` | Add F1 help overlay elements and toggle logic, replace bottom hint text |

---

## Sound Trigger Map

| Sound ID | File | Location |
|----------|------|----------|
| `nanite-activate` | Player.ts | keyQ 'down' handler, after setting naniteActive = true |
| `nanite-tick` | Player.ts | inside naniteSparkEvent callback (same 600ms timer) |
| `nanite-complete` | Player.ts | when `progress >= 1`, before `naniteActive = false` |
| `nanite-ready` | Player.ts | in update() ready branch, fire once via `naniteWasOnCooldown` edge-detection flag |
| `wave-start` | DroneSpawner.ts | alongside `scene.events.emit('waveStart', ...)` |
| `drone-death` | DroneSpawner.ts | in bullet-hit overlap callback: after `drone.takeDamage(1)`, check `(drone as Drone).hp <= 0` and play sound (not missile callback) |
| `eject` | Player.ts | in `eject()` method |
| `reenter` | Player.ts | in `reenter()` method (or wherever pilot re-mounts) |
| jetpack start | Player.ts | in update(), when jetpack transitions inactive→active |
| jetpack stop | Player.ts | in update() when jetpack transitions active→inactive; also in `destroy()`; also in `eject()` (pilot leaves mech) |

---

## Verification

1. `npm run build` — 0 TypeScript errors
2. **Pitch variation:** Fire rapid gun repeatedly — each shot sounds slightly different pitch
3. **Nanite sounds:** Take damage → press Q → hear activation sweep → hear gentle ticks during heal → hear completion note when done → hear ready thud when cooldown expires
4. **Wave start:** Wait for wave 2 to begin — hear alert sweep
5. **Drone death:** Kill a drone with rapid bullets (not missile) — hear distinct death pop separate from explosion
6. **Eject/Reenter:** Press E — hear thump; approach mech and press E again — hear reconnect surge
7. **Jetpack:** Hold SPACE in air — hear low rumble start; release/land — rumble fades
8. **F1 help:** Press F1 — overlay appears with two-column layout; press F1 or ESC — closes; game continues running; bottom hint now reads "F1 — HELP"
