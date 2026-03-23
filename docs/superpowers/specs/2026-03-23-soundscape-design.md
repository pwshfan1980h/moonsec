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
  startLoop(id: LoopId)           — creates looping AudioBufferSourceNode, 50 ms fade-in
  stopLoop(id: LoopId)            — 80 ms fade-out then disconnect
  update(state: AudioUpdateState) — called each frame from GameScene; drives footsteps

  private loops: Map<LoopId, { source: AudioBufferSourceNode; gainNode: GainNode }>
  private noiseBuffer: AudioBuffer   — 1s white noise, generated once on init, reused
  private footstepTimer: number      — ms countdown; fires 'footstep' one-shot when ≤ 0
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
- White noise through bandpass at 900 Hz (Q = 1.5), continuous
- Sub sine at 55 Hz for body/rumble
- 50 ms fade-in on start, 80 ms fade-out on stop

### Missile flight — loop
Started on `fire()`, stopped on impact/expire:
- Sine sweeping 180 → 500 Hz over 1.5 s then holds
- Gain 0.10 (subtle, not competing with weapons)

### Footstep — one-shot, triggered by `update()`
- 12 ms noise burst through highpass at 180 Hz
- Base gain 0.07 ± 20% random jitter per step (prevents repetition)
- Interval: 280 ms while `onGround && moving`

### Unchanged sounds
`rapid`, `turret`, `missile` (launch), `hit`, `hurt`, `jump`, `death`, `drone-shoot`

---

## Integration Points

### `GameScene.update()`
```ts
const body = this.player.body as Phaser.Physics.Arcade.Body;
this.audio.update({
  onGround: this.player.onGround,
  moving: Math.abs(body.velocity.x) > 10,
  delta,
});
```

### `Player.ts` — jetpack block
- Jetpack activates (key held, not on ground, fuel > 0) → `scene.audio.startLoop('jetpack')`
- Jetpack stops (any exit from active state) → `scene.audio.stopLoop('jetpack')`

### `HomingMissile.ts`
- `fire()` → `scene.audio.startLoop('missile-flight')` *(replaces `play('missile')`)*
- Impact/expire → `scene.audio.stopLoop('missile-flight')` + `scene.audio.play('missile-impact')`

### `DroneSpawner.ts`
- Explosion callback: `audio.play('explosion')` — **no call-site change**; `play()` internally routes to `playExplosion()`

### No changes needed
`Drone.ts`, `Turret.ts`, `RapidGun.ts`, `BootScene.ts`

---

## Noise Buffer

Generated once in the `AudioSystem` constructor:

```ts
private initNoiseBuffer(): void {
  const sampleRate = this.ctx.sampleRate;
  const length = sampleRate; // 1 second
  this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
  const data = this.noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
}
```

Reused by all noise layers — no per-sound regeneration.

---

## Files Changed

| File | Change |
|------|--------|
| `src/systems/AudioSystem.ts` | Full refactor — loops, noise, layered explosions, footstep update |
| `src/scenes/GameScene.ts` | Add `audio.update()` call in `update()` |
| `src/entities/Player.ts` | Add `startLoop`/`stopLoop` calls in jetpack block |
| `src/weapons/HomingMissile.ts` | Replace `play('missile')` with loop; add impact call |
