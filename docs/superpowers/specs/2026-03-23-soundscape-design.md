# Soundscape Improvement — Design Spec
**Date:** 2026-03-23
**Status:** Approved

---

## Goal

Deepen the explosion sounds, add a jetpack roar, footsteps, missile flight + impact, and refactor `AudioSystem` to support continuous audio loops alongside the existing one-shot system.

---

## Architecture — `AudioSystem` refactor (Option A)

Single class, extended. No new files.

```
AudioSystem
  play(id: SoundId)               — one-shot sounds, unchanged
  startLoop(id: LoopId)           — creates looping nodes, 50 ms fade-in
                                    no-ops if the loop is already running
                                    resumes suspended AudioContext before creating nodes
  stopLoop(id: LoopId)            — 80 ms fade-out, then disconnect gainNode from
                                    destination (silences all nodes in the loop);
                                    no-ops if not running
  update(state: AudioUpdateState) — called each frame from GameScene; drives footsteps

  private loops: Map<LoopId, { sources: (AudioBufferSourceNode | OscillatorNode)[]; gainNode: GainNode }>
    — sources holds ALL nodes for that loop (e.g. jetpack has 2: noise source + sub osc)
    — stopLoop disconnects gainNode from destination; all sources naturally stop producing output
    — sources are individually stopped (source.stop() / osc.stop()) to release AudioContext resources
  private noiseBuffer: AudioBuffer   — 1s white noise, generated once on init, reused
  private footstepTimer: number      — ms countdown; fires 'footstep' one-shot when ≤ 0
  private wasOnGround: boolean       — tracks previous frame ground state for timer reset
```

```ts
type LoopId = 'jetpack' | 'missile-flight';

interface AudioUpdateState {
  onGround: boolean;
  moving: boolean;   // Math.abs(velocityX) > 10
  delta: number;     // ms
}
```

New `SoundId` entries: `'footstep'`, `'missile-impact'`

**`'missile'` (launch) is retired** — replaced by `startLoop('missile-flight')` on fire. The entry can be removed from `TONES`.

---

## Sound Palette

### Explosions — layered (drone kill, replaces single oscillator)
`play('explosion')` internally routes to private `playExplosion()` — three nodes in parallel:

| Layer | Type | Freq sweep | Duration | Gain |
|-------|------|-----------|----------|------|
| Sub-bass | sine | 80 → 15 Hz | 0.8 s | 0.50 |
| Noise | white noise → lowpass 300 Hz | — | 0.6 s | 0.40 |
| Mid crunch | sawtooth | 120 → 40 Hz | 0.5 s | 0.30 |

### Missile impact — new one-shot (heavier than drone explosion)
Three nodes in parallel via private `playMissileImpact()`:

| Layer | Type | Freq sweep | Duration | Gain |
|-------|------|-----------|----------|------|
| Sub-bass | sine | 60 → 12 Hz | 0.9 s | 0.50 |
| Noise | white noise → lowpass 200 Hz | — | 0.7 s | 0.45 |
| High crack | sawtooth | 300 → 80 Hz | 0.3 s | 0.20 |

### Jetpack — loop
Two nodes, started/stopped via `startLoop('jetpack')` / `stopLoop('jetpack')`:
- White noise `AudioBufferSourceNode` (from shared `noiseBuffer`, `.loop = true`) through bandpass at 900 Hz (Q = 1.5)
- Sub sine `OscillatorNode` at 55 Hz for body/rumble
- Both share one output `GainNode` stored in `loops`
- 50 ms fade-in on start, 80 ms fade-out on stop

### Missile flight — loop
- Sine `OscillatorNode` sweeping 180 → 500 Hz over 1.5 s then holds
- `.loop` is not applicable to oscillators — the sweep is achieved via `linearRampToValueAtTime`; the oscillator simply runs until `stopLoop` disconnects it
- Gain 0.10 (subtle, not competing with weapons)
- **Design constraint:** only one missile may be in flight at a time. This is intentional — the single `LoopId` architecture does not support concurrent missile loops. The 5000 ms cooldown enforces this today; if multi-missile support is ever added, the loop architecture must be revisited (e.g., instance-keyed loop IDs). `startLoop` no-ops if already running, so this is safe given the constraint.

### Footstep — one-shot, triggered by `update()`
- 12 ms noise burst through highpass at 180 Hz
- Base gain 0.07 ± 20% random jitter per step (prevents repetition)
- Interval: 280 ms while `onGround && moving`
- When the player transitions from airborne to grounded (`!wasOnGround && onGround`), `footstepTimer` resets to 280 ms to avoid an immediate step on landing

### Unchanged sounds
`rapid`, `turret`, `hit`, `hurt`, `jump`, `death`, `drone-shoot`

---

## Noise Buffer

Generated once in the `AudioSystem` constructor. Must set `.loop = true` on every `AudioBufferSourceNode` that uses it for continuous sounds (jetpack):

```ts
private initNoiseBuffer(): void {
  const sampleRate = this.ctx.sampleRate;
  const length = sampleRate; // 1 second
  this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
  const data = this.noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
}
```

For one-shot noise bursts (explosion layers, footstep), a fresh `AudioBufferSourceNode` is created pointing at the same buffer without `.loop = true`.

---

## Integration Points

### `GameScene.update()`
```ts
const body = this.player.body as Phaser.Physics.Arcade.Body;
this.audio.update({
  onGround: body.blocked.down,          // use physics body — player.onGround is private
  moving: Math.abs(body.velocity.x) > 10,
  delta,
});
```

### `Player.ts` — all jetpack loop exit paths

`startLoop` is called when the jetpack activates. `stopLoop` must be called at **every** path that ends jetpack activity:

| Location | Condition | Action |
|----------|-----------|--------|
| `update()` jetpack block | key held, not on ground, fuel > 0 | `startLoop('jetpack')` |
| `update()` jetpack block | key released or landed or fuel empty | `stopLoop('jetpack')` |
| `takeDamage()` — hurtLock branch | `hurtLock > 0` early return | `stopLoop('jetpack')` |
| `takeDamage()` — death branch | `dead = true` | `stopLoop('jetpack')` |
| `eject()` | pilot leaves mech | `stopLoop('jetpack')` |

`stopLoop` is safe to call when the loop is not running (no-op), so redundant calls are fine.

### `HomingMissile.ts`

- `fire()` → clear `hitTarget` flag on the pooled object (`m.setData('hitTarget', false)`) **before** `startLoop('missile-flight')` *(replaces retired `play('missile')`)*. Clearing the flag on fire prevents stale `true` values from a previous hit on a recycled pool object.
- In `update()`, when a missile transitions from active to inactive (impact detected):
  - If `obj.getData('hitTarget') === true`: `stopLoop('missile-flight')` + `play('missile-impact')`
- On **out-of-bounds expiry** (world bounds cull): `stopLoop('missile-flight')` only — no impact sound for a miss.

Detecting impact vs. expiry: the overlap callback in `DroneSpawner` deactivates the missile object. `HomingMissile.update()` already filters `this.active` for inactive entries on the next frame. Add the stop/impact call in that filter — check whether the missile was culled by overlap (impact) or by bounds check (expiry) to decide whether to play `'missile-impact'`. A simple flag `obj.hitTarget: boolean` set by the DroneSpawner overlap callback is the cleanest approach.

### `DroneSpawner.ts`
- Explosion callback: `audio.play('explosion')` — **no call-site change**; `play()` internally routes to `playExplosion()`
- Missile overlap callback: set `missileObj.setData('hitTarget', true)` before deactivating, so `HomingMissile.update()` can distinguish impact from expiry

### No changes needed
`Drone.ts`, `Turret.ts`, `RapidGun.ts`, `BootScene.ts`

---

## Files Changed

| File | Change |
|------|--------|
| `src/systems/AudioSystem.ts` | Full refactor — loops, noise, layered explosions, footstep update |
| `src/scenes/GameScene.ts` | Add `audio.update()` call in `update()` |
| `src/entities/Player.ts` | Add `startLoop`/`stopLoop` calls at all 5 jetpack exit paths |
| `src/weapons/HomingMissile.ts` | Replace `play('missile')` with loop; stop + impact on hit, silent stop on expiry |
| `src/systems/DroneSpawner.ts` | Set `hitTarget` data flag on missile in overlap callback |
