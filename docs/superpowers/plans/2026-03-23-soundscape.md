# Soundscape Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `AudioSystem` to support continuous loops and layered noise synthesis, adding jetpack roar, footsteps, missile flight/impact, and deeper explosions.

**Architecture:** Single `AudioSystem` class extended with `startLoop`/`stopLoop`/`update()` alongside the existing `play()`. All new sounds are synthesised via Web Audio API nodes — no external audio files. A shared white-noise `AudioBuffer` is generated once on init and reused across all noise layers.

**Tech Stack:** TypeScript, Phaser 3.80, Web Audio API (`AudioContext`, `OscillatorNode`, `AudioBufferSourceNode`, `BiquadFilterNode`, `GainNode`)

**Spec:** `docs/superpowers/specs/2026-03-23-soundscape-design.md`

---

## File Map

| File | Change |
|------|--------|
| `src/systems/AudioSystem.ts` | Full refactor — types, noise buffer, loops map, layered sounds, footstep update |
| `src/scenes/GameScene.ts` | Add `audio.update()` call in `update()` |
| `src/entities/Player.ts` | Add `startLoop`/`stopLoop` at all 5 jetpack exit paths |
| `src/weapons/HomingMissile.ts` | Replace `play('missile')` with loop; impact/expiry stop logic |
| `src/systems/DroneSpawner.ts` | Set `hitTarget` data flag on missile in overlap callback |

---

## Task 1: AudioSystem — types, noise buffer, and structural skeleton

**Files:**
- Modify: `src/systems/AudioSystem.ts`

- [ ] **Step 1: Replace the type definitions and TONES map**

Open `src/systems/AudioSystem.ts`. Replace the entire file with the new skeleton below. This keeps `play()` working exactly as before, removes `'missile'` from TONES, adds `'footstep'` and `'missile-impact'`, and adds the new private fields. The `startLoop`, `stopLoop`, `update`, `playExplosion`, and `playMissileImpact` methods are stubs that will be filled in subsequent tasks.

```typescript
// Procedural audio via Web Audio API — no external files needed

type SoundId =
  | 'rapid' | 'turret' | 'hit' | 'hurt' | 'jump' | 'death'
  | 'drone-shoot' | 'explosion' | 'footstep' | 'missile-impact';

type LoopId = 'jetpack' | 'missile-flight';

interface AudioUpdateState {
  onGround: boolean;
  moving: boolean;   // Math.abs(velocityX) > 10
  delta: number;     // ms
}

interface LoopEntry {
  sources: (AudioBufferSourceNode | OscillatorNode)[];
  gainNode: GainNode;
}

interface ToneConfig {
  freq: number | [number, number];
  duration: number;
  type: OscillatorType;
  gain: number;
  filterFreq?: number;
}

const TONES: Record<SoundId, ToneConfig> = {
  rapid:           { freq: 1400,       duration: 0.04, type: 'sawtooth', gain: 0.10, filterFreq: 3000 },
  turret:          { freq: [180, 60],  duration: 0.18, type: 'square',   gain: 0.25, filterFreq: 600  },
  hit:             { freq: 440,        duration: 0.06, type: 'square',   gain: 0.12, filterFreq: 2000 },
  hurt:            { freq: [880, 220], duration: 0.20, type: 'square',   gain: 0.20, filterFreq: 1500 },
  jump:            { freq: [300, 600], duration: 0.12, type: 'sine',     gain: 0.15 },
  death:           { freq: [440, 55],  duration: 0.60, type: 'sawtooth', gain: 0.35, filterFreq: 800  },
  'drone-shoot':   { freq: 600,        duration: 0.06, type: 'square',   gain: 0.08, filterFreq: 2500 },
  // explosion and missile-impact are handled by layered private methods — these entries
  // are placeholders so the Record type is satisfied; play() routes them internally.
  explosion:       { freq: [80, 15],   duration: 0.8,  type: 'sine',     gain: 0.50 },
  footstep:        { freq: 0,          duration: 0.012,type: 'sine',     gain: 0.07 },
  'missile-impact':{ freq: [60, 12],   duration: 0.9,  type: 'sine',     gain: 0.50 },
};

export class AudioSystem {
  private ctx: AudioContext;
  private lastPlay: Partial<Record<SoundId, number>> = {};
  private minInterval: Partial<Record<SoundId, number>> = {
    rapid: 55,
  };
  private loops = new Map<LoopId, LoopEntry>();
  private noiseBuffer!: AudioBuffer;
  private footstepTimer = 0;
  private wasOnGround = false;

  constructor() {
    this.ctx = new AudioContext();
    this.initNoiseBuffer();
  }

  private initNoiseBuffer(): void {
    const sr = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, sr, sr);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;
  }

  play(id: SoundId): void {
    // Route layered sounds to dedicated methods
    if (id === 'explosion')      { this.playExplosion();      return; }
    if (id === 'missile-impact') { this.playMissileImpact();  return; }
    if (id === 'footstep')       { this.playFootstep();       return; }

    const now = performance.now();
    const min = this.minInterval[id] ?? 0;
    if (min > 0 && this.lastPlay[id] !== undefined && now - this.lastPlay[id]! < min) return;
    this.lastPlay[id] = now;

    const cfg = TONES[id];
    if (!cfg) return;

    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      const t = this.ctx.currentTime;

      osc.type = cfg.type;

      if (Array.isArray(cfg.freq)) {
        osc.frequency.setValueAtTime(cfg.freq[0], t);
        osc.frequency.linearRampToValueAtTime(cfg.freq[1], t + cfg.duration);
      } else {
        osc.frequency.setValueAtTime(cfg.freq, t);
      }

      gainNode.gain.setValueAtTime(cfg.gain, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + cfg.duration);

      if (cfg.filterFreq) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cfg.filterFreq, t);
        osc.connect(filter);
        filter.connect(gainNode);
      } else {
        osc.connect(gainNode);
      }

      gainNode.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + cfg.duration + 0.01);
    } catch {
      // Silently ignore audio errors
    }
  }

  startLoop(_id: LoopId): void { /* Task 3 */ }
  stopLoop(_id: LoopId): void  { /* Task 3 */ }

  update(_state: AudioUpdateState): void { /* Task 4 */ }

  private playExplosion(): void    { /* Task 2 */ }
  private playMissileImpact(): void { /* Task 2 */ }
  private playFootstep(): void     { /* Task 4 */ }
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -6
```

Expected: `✓ built in` — no TypeScript errors. If the build fails because `play('missile')` is still called from `HomingMissile.ts` (it references a now-removed SoundId), that's expected and will be fixed in Task 7. The TS compiler will error on `'missile'` not being in `SoundId` — that's fine for now, we proceed task by task. If you want a clean build at this step, temporarily add `| 'missile'` to `SoundId` and remove it in Task 7.

- [ ] **Step 3: Commit**

```bash
cd /Users/devwm8/Projects/moonsec
git add src/systems/AudioSystem.ts
git commit -m "refactor(audio): skeleton — new types, noise buffer, loop map, route stubs"
```

---

## Task 2: Layered explosion and missile impact

**Files:**
- Modify: `src/systems/AudioSystem.ts` — fill in `playExplosion()` and `playMissileImpact()`

Both methods follow the same pattern: create multiple audio nodes in parallel, all feeding the same destination, with individual gain envelopes. They use a private helper `playNoiseLayer()` to avoid repetition.

- [ ] **Step 1: Add the noise-layer helper and fill in `playExplosion()`**

Replace the `private playExplosion(): void { /* Task 2 */ }` stub with:

```typescript
/** Play a short burst of filtered white noise — used as a layer in explosion/impact sounds */
private playNoiseLayer(filterType: BiquadFilterType, filterFreq: number, duration: number, gain: number): void {
  try {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    // No .loop — one-shot burst

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(gain, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + duration + 0.01);
  } catch { /* ignore */ }
}

/** Play a single oscillator layer — used inside explosion/impact */
private playOscLayer(type: OscillatorType, freqStart: number, freqEnd: number, duration: number, gain: number): void {
  try {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.linearRampToValueAtTime(freqEnd, t + duration);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(gain, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  } catch { /* ignore */ }
}

private playExplosion(): void {
  if (this.ctx.state === 'suspended') this.ctx.resume();
  // Sub-bass
  this.playOscLayer('sine',     80, 15,  0.8, 0.50);
  // Noise rumble through lowpass 300 Hz
  this.playNoiseLayer('lowpass', 300, 0.6, 0.40);
  // Mid crunch
  this.playOscLayer('sawtooth', 120, 40, 0.5, 0.30);
}
```

- [ ] **Step 2: Fill in `playMissileImpact()`**

Replace the `private playMissileImpact(): void { /* Task 2 */ }` stub with:

```typescript
private playMissileImpact(): void {
  if (this.ctx.state === 'suspended') this.ctx.resume();
  // Deep sub-bass
  this.playOscLayer('sine',     60,  12, 0.9, 0.50);
  // Noise through lowpass 200 Hz
  this.playNoiseLayer('lowpass', 200, 0.7, 0.45);
  // High crack
  this.playOscLayer('sawtooth', 300, 80, 0.3, 0.20);
}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -6
```

Expected: `✓ built in` (same caveat from Task 1 about the `'missile'` SoundId if not yet patched).

- [ ] **Step 4: Commit**

```bash
cd /Users/devwm8/Projects/moonsec
git add src/systems/AudioSystem.ts
git commit -m "feat(audio): layered explosion and missile impact sounds"
```

---

## Task 3: `startLoop` and `stopLoop`

**Files:**
- Modify: `src/systems/AudioSystem.ts`

- [ ] **Step 1: Implement `startLoop`**

Replace `startLoop(_id: LoopId): void { /* Task 3 */ }` with:

```typescript
startLoop(id: LoopId): void {
  if (this.loops.has(id)) return; // already running — no-op
  try {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const FADE_IN = 0.05; // 50 ms

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, t);
    gainNode.connect(this.ctx.destination);

    const sources: (AudioBufferSourceNode | OscillatorNode)[] = [];

    if (id === 'jetpack') {
      // White noise through bandpass at 900 Hz (Q=1.5) — the "hiss" of thrust
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;
      noiseSrc.loop = true;                          // must be true — 1s buffer loops
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(900, t);
      bp.Q.setValueAtTime(1.5, t);
      noiseSrc.connect(bp);
      bp.connect(gainNode);
      noiseSrc.start(t);
      sources.push(noiseSrc);

      // Sub-sine at 55 Hz — adds body/rumble
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(55, t);
      subOsc.connect(gainNode);
      subOsc.start(t);
      sources.push(subOsc);

      gainNode.gain.linearRampToValueAtTime(0.35, t + FADE_IN);

    } else if (id === 'missile-flight') {
      // Sine sweeping 180 → 500 Hz over 1.5 s then holds at 500 Hz
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.linearRampToValueAtTime(500, t + 1.5);
      osc.connect(gainNode);
      osc.start(t);
      sources.push(osc);

      gainNode.gain.linearRampToValueAtTime(0.10, t + FADE_IN);
    }

    this.loops.set(id, { sources, gainNode });
  } catch { /* ignore */ }
}
```

- [ ] **Step 2: Implement `stopLoop`**

Replace `stopLoop(_id: LoopId): void { /* Task 3 */ }` with:

```typescript
stopLoop(id: LoopId): void {
  const entry = this.loops.get(id);
  if (!entry) return; // not running — no-op
  this.loops.delete(id);

  try {
    const t = this.ctx.currentTime;
    const FADE_OUT = 0.08; // 80 ms

    entry.gainNode.gain.cancelScheduledValues(t);
    entry.gainNode.gain.setValueAtTime(entry.gainNode.gain.value, t);
    entry.gainNode.gain.linearRampToValueAtTime(0, t + FADE_OUT);

    // Disconnect and stop all source nodes after fade
    setTimeout(() => {
      try {
        entry.gainNode.disconnect();
        for (const src of entry.sources) {
          try { src.stop(); } catch { /* already stopped */ }
          src.disconnect();
        }
      } catch { /* ignore */ }
    }, FADE_OUT * 1000 + 20);
  } catch { /* ignore */ }
}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -6
```

Expected: `✓ built in`

- [ ] **Step 4: Commit**

```bash
cd /Users/devwm8/Projects/moonsec
git add src/systems/AudioSystem.ts
git commit -m "feat(audio): startLoop/stopLoop with fade-in/out — jetpack and missile-flight"
```

---

## Task 4: Footstep `update()` and `playFootstep()`

**Files:**
- Modify: `src/systems/AudioSystem.ts`

- [ ] **Step 1: Implement `playFootstep()`**

Replace `private playFootstep(): void { /* Task 4 */ }` with:

```typescript
private playFootstep(): void {
  try {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const duration = 0.012; // 12 ms burst

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(180, t);

    const gain = this.ctx.createGain();
    // ±20% jitter so steps don't sound identical
    const jitter = 0.8 + Math.random() * 0.4;
    gain.gain.setValueAtTime(0.07 * jitter, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + duration + 0.005);
  } catch { /* ignore */ }
}
```

- [ ] **Step 2: Implement `update()`**

Replace `update(_state: AudioUpdateState): void { /* Task 4 */ }` with:

```typescript
update(state: AudioUpdateState): void {
  const { onGround, moving, delta } = state;

  // Reset timer on landing to avoid an immediate step sound
  if (!this.wasOnGround && onGround) {
    this.footstepTimer = 280;
  }
  this.wasOnGround = onGround;

  if (onGround && moving) {
    this.footstepTimer -= delta;
    if (this.footstepTimer <= 0) {
      this.footstepTimer = 280;
      this.play('footstep');
    }
  } else {
    // Reset timer while airborne or standing still
    this.footstepTimer = Math.min(this.footstepTimer, 280);
  }
}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -6
```

Expected: `✓ built in`

- [ ] **Step 4: Commit**

```bash
cd /Users/devwm8/Projects/moonsec
git add src/systems/AudioSystem.ts
git commit -m "feat(audio): footstep one-shot with 280ms interval, landing reset, gain jitter"
```

---

## Task 5: Wire `audio.update()` into `GameScene`

**Files:**
- Modify: `src/scenes/GameScene.ts`

The player's `onGround` field is `private`, so we read directly from the physics body.

- [ ] **Step 1: Add `audio.update()` call in `GameScene.update()`**

In `src/scenes/GameScene.ts`, find the `update(time: number, delta: number)` method (around line 194). After the existing `this.player.update(time, delta);` line, add:

```typescript
// Drive audio state (footsteps)
const pb = this.player.body as Phaser.Physics.Arcade.Body;
this.audio.update({
  onGround: pb.blocked.down,
  moving: Math.abs(pb.velocity.x) > 10,
  delta,
});
```

- [ ] **Step 2: Build check**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -6
```

Expected: `✓ built in`

- [ ] **Step 3: Commit**

```bash
cd /Users/devwm8/Projects/moonsec
git add src/scenes/GameScene.ts
git commit -m "feat(audio): wire audio.update() into GameScene for footstep driving"
```

---

## Task 6: Jetpack loop calls in `Player.ts`

**Files:**
- Modify: `src/entities/Player.ts`

Five insertion points — all use `this.scene.audio.startLoop` / `this.scene.audio.stopLoop`. Because `stopLoop` is a no-op when no loop is running, redundant stop calls are safe.

- [ ] **Step 1: Jetpack activate / deactivate in `update()`**

In `Player.ts`, find the jetpack block inside `update()` (around line 190-207):

```typescript
} else if (!this.onGround && this.jetpackFuel > 0) {
  this.jetpackFuel -= delta;
  body.setAccelerationY(JETPACK_FORCE);
  body.velocity.y = Math.max(body.velocity.y, -200);
  this.scene.events.emit('jetpackFuel', this.jetpackFuel, JETPACK_MAX_FUEL);
}
```

Change to:

```typescript
} else if (!this.onGround && this.jetpackFuel > 0) {
  this.jetpackFuel -= delta;
  body.setAccelerationY(JETPACK_FORCE);
  body.velocity.y = Math.max(body.velocity.y, -200);
  this.scene.events.emit('jetpackFuel', this.jetpackFuel, JETPACK_MAX_FUEL);
  this.scene.audio.startLoop('jetpack');
}
```

And in the `else` branch (key released or on ground or fuel empty), add a stop. The block immediately after looks like:

```typescript
} else {
  body.setAccelerationY(0);
  if (this.onGround && this.jetpackFuel < JETPACK_MAX_FUEL) {
```

Change to:

```typescript
} else {
  body.setAccelerationY(0);
  this.scene.audio.stopLoop('jetpack');
  if (this.onGround && this.jetpackFuel < JETPACK_MAX_FUEL) {
```

- [ ] **Step 2: Stop jetpack loop in `takeDamage()` — hurtLock and death branches**

In `takeDamage()` (around line 342), the method starts with:

```typescript
takeDamage(amount: number): void {
  if (this.dead || this.hurtLock > 0) return;
```

The `stopLoop` must be **inside** the hurtLock guard so it fires even when the method returns early. Change to:

```typescript
takeDamage(amount: number): void {
  if (this.dead || this.hurtLock > 0) {
    this.scene.audio.stopLoop('jetpack'); // stop loop even on early return (hurtLock active)
    return;
  }
  this.scene.audio.stopLoop('jetpack'); // stop loop on new damage (covers hurt + death branches)
```

Then in the death branch (around line 353), after `this.jetpackOuter.emitting = false;`, add a safety-belt stop:

```typescript
this.scene.audio.stopLoop('jetpack');
```

`stopLoop` is a no-op when the loop is not running, so all three calls are safe regardless of order.

- [ ] **Step 3: Stop jetpack loop in `eject()`**

In `eject()` (around line 316), after `this.jetpackOuter.emitting = false;`, add:

```typescript
this.scene.audio.stopLoop('jetpack');
```

- [ ] **Step 4: Build check**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -6
```

Expected: `✓ built in`

- [ ] **Step 5: Commit**

```bash
cd /Users/devwm8/Projects/moonsec
git add src/entities/Player.ts
git commit -m "feat(audio): jetpack loop start/stop at all 5 exit paths in Player"
```

---

## Task 7: Missile flight loop + impact in `HomingMissile.ts` and `DroneSpawner.ts`

**Files:**
- Modify: `src/weapons/HomingMissile.ts`
- Modify: `src/systems/DroneSpawner.ts`

- [ ] **Step 1: Replace `play('missile')` with loop start in `HomingMissile.fire()`**

In `HomingMissile.ts`, find `fire()` (line 33). After `m.setActive(true).setVisible(true).setDepth(16);`, add:

```typescript
m.setData('hitTarget', false); // clear stale flag from pool re-use
```

Then find line 68:

```typescript
this.scene.audio.play('missile');
```

Replace with:

```typescript
this.scene.audio.startLoop('missile-flight');
```

- [ ] **Step 2: Add loop stop on missile deactivation in `HomingMissile.update()`**

In `update()`, find the filter callback (line 72). The `!obj.active` early-exit block currently is:

```typescript
if (!obj.active) {
  emitter.destroy();
  return false;
}
```

Replace with:

```typescript
if (!obj.active) {
  // hitTarget was set by DroneSpawner overlap — impact vs expiry
  if (obj.getData('hitTarget') === true) {
    this.scene.audio.stopLoop('missile-flight');
    this.scene.audio.play('missile-impact');
  } else {
    this.scene.audio.stopLoop('missile-flight');
  }
  emitter.destroy();
  return false;
}
```

Also find the out-of-bounds expiry block (around line 94):

```typescript
if (obj.x < -100 || obj.x > WORLD_WIDTH + 100 || obj.y < -100 || obj.y > 600) {
  obj.setActive(false).setVisible(false);
  if (obj.body) (obj.body as Phaser.Physics.Arcade.Body).enable = false;
  emitter.destroy();
  return false;
}
```

Replace with:

```typescript
if (obj.x < -100 || obj.x > WORLD_WIDTH + 100 || obj.y < -100 || obj.y > 820) {
  obj.setActive(false).setVisible(false);
  if (obj.body) (obj.body as Phaser.Physics.Arcade.Body).enable = false;
  this.scene.audio.stopLoop('missile-flight'); // silent stop — miss
  emitter.destroy();
  return false;
}
```

Note: the Y bound is updated from `600` to `820` to match `GameScene.cullBullets()` which already uses `maxY = 820` for all other bullet groups. The missile group is not culled by `cullBullets()` — this is the only guard, so it must be consistent.

- [ ] **Step 3: Set `hitTarget` flag in `DroneSpawner` missile overlap callback**

In `DroneSpawner.ts`, find the missile overlap callback (around line 71-83):

```typescript
this.scene.physics.add.overlap(
  this.scene.missiles,
  drone,
  (d, missile) => {
    const m = missile as Phaser.Physics.Arcade.Image;
    m.setActive(false).setVisible(false);
    if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.spawnExplosion(m.x, m.y);
    (d as unknown as Drone).takeDamage(3);
    this.scene.cameras.main.shake(150, 0.01);
    this.scene.audio.play('explosion');
  },
);
```

Change to:

```typescript
this.scene.physics.add.overlap(
  this.scene.missiles,
  drone,
  (d, missile) => {
    const m = missile as Phaser.Physics.Arcade.Image;
    m.setData('hitTarget', true);              // signal HomingMissile.update() to play impact
    m.setActive(false).setVisible(false);
    if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.spawnExplosion(m.x, m.y);
    (d as unknown as Drone).takeDamage(3);
    this.scene.cameras.main.shake(150, 0.01);
    this.scene.audio.play('explosion');
  },
);
```

- [ ] **Step 4: Build check — full clean build**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1
```

Expected: `✓ built in` with no TypeScript errors. The `'missile'` SoundId should no longer exist or be referenced anywhere. If TS complains about the old `SoundId` not including `'missile'`, verify `HomingMissile.ts` no longer calls `play('missile')`.

- [ ] **Step 5: Commit**

```bash
cd /Users/devwm8/Projects/moonsec
git add src/weapons/HomingMissile.ts src/systems/DroneSpawner.ts
git commit -m "feat(audio): missile flight loop, impact sound, hitTarget flag for impact/expiry"
```

---

## Task 8: Push and verify

- [ ] **Step 1: Final build confirmation**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -8
```

Expected output ends with `✓ built in X.XXs`

- [ ] **Step 2: In-game smoke test checklist**

Run `npm run dev`, open the game, and verify each sound manually:

| Action | Expected sound |
|--------|---------------|
| Walk left/right on ground | Rhythmic footstep taps every ~280 ms |
| Jump then land | No footstep immediately on landing; steps resume after 280 ms |
| Hold SPACE while airborne | Continuous jetpack hiss + sub rumble, fades in |
| Release SPACE / hit ground | Jetpack sound fades out quickly |
| Eject from mech (E) | Jetpack sound stops immediately |
| Fire missile (SHIFT) | Rising whine on launch |
| Missile hits drone | Rising whine stops, deep boom impact |
| Missile flies off-screen | Rising whine stops, no boom |
| Drone killed by bullet | Deep layered explosion (heavier than before) |
| Player takes damage | Jetpack sound stops (if active) |

- [ ] **Step 3: Push to origin**

```bash
cd /Users/devwm8/Projects/moonsec && git push origin main
```

---

## Quick Reference — AudioSystem Public API After This Plan

```typescript
audio.play('explosion')        // layered 3-node boom
audio.play('missile-impact')   // heavier 3-node impact
audio.play('footstep')         // called internally by update()
audio.play('rapid' | 'turret' | 'hit' | 'hurt' | 'jump' | 'death' | 'drone-shoot')  // unchanged

audio.startLoop('jetpack')        // from Player.update() jetpack block
audio.stopLoop('jetpack')         // from Player: update, takeDamage, eject

audio.startLoop('missile-flight') // from HomingMissile.fire()
audio.stopLoop('missile-flight')  // from HomingMissile.update() on deactivate

audio.update({ onGround, moving, delta })  // from GameScene.update() each frame
```
