# Level Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two named levels (SURFACE OPS / SUBSURFACE), a Sentinel new enemy, a Nexus Boss with escort drones and spread shots, wave-threshold level transitions, a vertical Level 2 world with bouncing bullets, and reuse existing audio files via Phaser pitch/rate modulation for all new sounds.

**Architecture:** Level branching lives in GameScene.create() gated on `registry.get('currentLevel')`. DroneSpawner owns wave counting, boss wave detection, and Sentinel spawning. NexusBoss is a self-contained entity that manages its own escort loop and sound. UIScene handles all overlays and the scene transition.

**Tech Stack:** Phaser 3.80, TypeScript, Web Audio API (existing loops only), Phaser `soundManager.play(id, { rate, detune, volume })` for all new sound events.

---

## Sound analysis — no new audio files needed

All 10 existing WAV files: `rapid`, `turret`, `hit`, `hurt`, `jump`, `death`, `drone-shoot`, `explosion`, `footstep`, `missile-impact`.

Phaser's `soundManager.play(key, config)` accepts `rate` (playback speed, affects pitch) and `detune` (cents, ±1200 = ±1 octave). This lets us produce distinct sounds from existing files:

| New Event | Source File | Rate | Detune | Volume | Result |
|-----------|-------------|------|--------|--------|--------|
| Boss charge telegraph | `hurt.wav` | 0.5 | -200 | 0.5 | Deep rumble warning |
| Boss spread shot fire | `drone-shoot.wav` | 0.65 | -300 | 0.55 | Fat low drone blast |
| Boss hurt | `hurt.wav` | 0.6 | -400 | 0.85 | Heavy impact |
| Boss death burst ×3 | `explosion.wav` | 0.5 | -200/-400/-600 | 0.9 | Cascading detonation |
| Boss death stinger | `death.wav` | 0.4 | -400 | 0.7 | Slow deep collapse |
| Sentinel fire | `drone-shoot.wav` | 1.3 | +200 | 0.3 | Sharp high snap |
| Level complete stinger | `explosion.wav` | 0.3 | -600 | 0.45 | Low triumphant boom |
| L2 bullet bounce | `hit.wav` | 1.8 | +400 | 0.2 | Quick wall tick |

**Implementation:** Add `playAt(id, opts)` to `AudioSystem` — a thin wrapper over `soundManager.play` that accepts `rate`, `detune`, `volume` overrides. All new sound calls use `this.scene.audio.playAt(...)`.

---

## File map

| File | Role |
|------|------|
| `src/constants.ts` | Add 6 new level/wave constants |
| `src/systems/AudioSystem.ts` | Add `playAt()` modulated play method |
| `src/scenes/BootScene.ts` | Load sentinel + nexus spritesheets; build their anims |
| `src/entities/Drone.ts` | Add `'sentinel'` to DroneType; add `forceHp?` param |
| `src/entities/NexusBoss.ts` | **New** — boss entity, full state machine |
| `src/systems/DroneSpawner.ts` | Boss wave; Sentinel; waveCleared; L2 multiplier |
| `src/scenes/GameScene.ts` | Level branching, bossKilled handler, L2 world, bouncing bullets |
| `src/scenes/UIScene.ts` | Level name flash, LEVEL COMPLETE screen, transition |
| `public/assets/` | Sentinel-sheet.png + Nexus-sheet.png (copied from pixelart/) |

---

## Task 1: Copy assets + add constants

**Files:**
- Modify: `src/constants.ts`
- Shell: copy two PNGs

- [ ] **Step 1: Copy sprite assets**
```bash
cp /Users/devwm8/Projects/pixelart/Sentinel-sheet.png \
   /Users/devwm8/Projects/moonsec/public/assets/Sentinel-sheet.png
cp /Users/devwm8/Projects/pixelart/Nexus-sheet.png \
   /Users/devwm8/Projects/moonsec/public/assets/Nexus-sheet.png
```

- [ ] **Step 2: Add constants to `src/constants.ts`**

Append after the existing WAVE_BRACKETS block:
```ts
export const MAX_WAVES_L1     = 10;
export const BOSS_WAVE_L1     = 10;
export const MAX_WAVES_L2     = 12;
export const BOSS_WAVE_L2     = 12;
export const L2_SPEED_MULT    = 1.2;
export const L2_INTERVAL_MULT = 0.85;
```

- [ ] **Step 3: Build**
```bash
npm run build
```
Expected: `✓ built` with no TS errors.

- [ ] **Step 4: Commit**
```bash
git add public/assets/Sentinel-sheet.png public/assets/Nexus-sheet.png src/constants.ts
git commit -m "feat: add sentinel/nexus assets and level progression constants"
```

---

## Task 2: AudioSystem — `playAt()` modulated method

**Files:**
- Modify: `src/systems/AudioSystem.ts`

- [ ] **Step 1: Add `playAt` method**

In `src/systems/AudioSystem.ts`, add after the existing `play()` method (after line 64):

```ts
playAt(id: SoundId, opts: { rate?: number; detune?: number; volume?: number }): void {
  try {
    this.soundManager.play(id, {
      volume:  opts.volume  ?? VOLUMES[id],
      rate:    opts.rate    ?? 1,
      detune:  opts.detune  ?? 0,
    });
  } catch { /* ignore — sound not yet loaded or context suspended */ }
}
```

- [ ] **Step 2: Build**
```bash
npm run build
```
Expected: `✓ built`.

- [ ] **Step 3: Commit**
```bash
git add src/systems/AudioSystem.ts
git commit -m "feat: add playAt() modulated sound method to AudioSystem"
```

---

## Task 3: BootScene — load Sentinel and Nexus spritesheets

**Files:**
- Modify: `src/scenes/BootScene.ts`

- [ ] **Step 1: Add spritesheet loads in `preload()`**

After `this.load.spritesheet('kodiak', ...)`:
```ts
this.load.spritesheet('sentinel', 'assets/Sentinel-sheet.png', {
  frameWidth: 37, frameHeight: 29,
});
this.load.spritesheet('nexus', 'assets/Nexus-sheet.png', {
  frameWidth: 25, frameHeight: 27,
});
```

- [ ] **Step 2: Add animation builds in `create()`**

After `this.buildDroneAnims('kodiak');`:
```ts
// Sentinel — 4 standard animations (same layout as Viper/Hornet)
this.buildDroneAnims('sentinel');

// Nexus Boss — 5 animations, built inline (non-standard layout)
const fps = (ms: number) => Math.round(1000 / ms);
this.anims.create({
  key: 'nexus-hover',
  frames: this.anims.generateFrameNumbers('nexus', { start: 0, end: 3 }),
  frameRate: fps(120),
  repeat: -1,
  yoyo: true,
});
this.anims.create({
  key: 'nexus-charge',
  frames: this.anims.generateFrameNumbers('nexus', { start: 4, end: 6 }),
  frameRate: fps(100),
  repeat: -1,
  yoyo: true,
});
this.anims.create({
  key: 'nexus-attack',
  frames: this.anims.generateFrameNumbers('nexus', { start: 7, end: 10 }),
  frameRate: fps(80),
  repeat: 0,
});
this.anims.create({
  key: 'nexus-hurt',
  frames: this.anims.generateFrameNumbers('nexus', { start: 11, end: 12 }),
  frameRate: fps(100),
  repeat: 0,
});
this.anims.create({
  key: 'nexus-death',
  frames: this.anims.generateFrameNumbers('nexus', { start: 13, end: 17 }),
  frameRate: fps(120),
  repeat: 0,
});
```

- [ ] **Step 3: Build**
```bash
npm run build
```
Expected: `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add src/scenes/BootScene.ts
git commit -m "feat: load sentinel + nexus spritesheets and build animations"
```

---

## Task 4: Drone.ts — add Sentinel DroneType + forceHp

**Files:**
- Modify: `src/entities/Drone.ts:1-80`

- [ ] **Step 1: Extend DroneType and add forceHp parameter**

Change line 5:
```ts
// OLD:
type DroneType = 'drone-red' | 'drone-green';
// NEW:
export type DroneType = 'drone-red' | 'drone-green' | 'sentinel';
```

Add `'sentinel'` to `HP_MAP` (line 18):
```ts
const HP_MAP = { 'drone-red': 2, 'drone-green': 3, 'sentinel': 3 };
```

Add `forceHp?: number` to the constructor signature (after `variant`):
```ts
constructor(
  scene: GameScene,
  x: number,
  y: number,
  type: DroneType,
  scaling: DroneScaling,
  variant: DroneVariant = 'normal',
  forceHp?: number,
)
```

In the constructor body, after the variant branching block, change the HP assignment to:
```ts
// HP: forceHp overrides bracket extraHp when provided
this.hp = forceHp !== undefined
  ? forceHp
  : HP_MAP[type] + scaling.extraHp;
```

Find the existing line that sets `this.hp` in the normal-variant branch and replace it with the above. The sniper branch already hardcodes `SNIPER_HP` so leave that alone.

**Important:** `DroneType` was previously un-exported. Change `type DroneType` → `export type DroneType` so DroneSpawner can import it.

- [ ] **Step 2: Build**
```bash
npm run build
```
Expected: `✓ built`.

- [ ] **Step 3: Commit**
```bash
git add src/entities/Drone.ts
git commit -m "feat: add sentinel to DroneType, export DroneType, add forceHp param"
```

---

## Task 5: Create `src/entities/NexusBoss.ts`

**Files:**
- Create: `src/entities/NexusBoss.ts`

- [ ] **Step 1: Create the file**

```ts
import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { Drone } from './Drone';
import type { DroneScaling } from '../systems/DroneSpawner';

type BossState = 'DRIFT' | 'CHARGE' | 'FIRE' | 'HURT' | 'DEATH';

const HP             = 18;
const SCALE          = 4.5;
const DRIFT_SPEED    = 50;
const CHARGE_MS      = 1200;
const DRIFT_MS       = 1800;
const BULLET_SPEED   = 280;
const SPREAD_ANGLES  = [-20, 0, 20] as const;
const ESCORT_RESPAWN = 20000;

export class NexusBoss extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;

  private bossState: BossState = 'DRIFT';
  private hp: number;
  private driftDir = -1;
  private phaseTimer = 0;
  private escorts: (Drone | null)[] = [null, null];
  private scaling: DroneScaling;
  private level: number;

  constructor(scene: GameScene, x: number, y: number, scaling: DroneScaling, level = 1) {
    super(scene, x, y, 'nexus');
    this.scene   = scene;
    this.scaling = scaling;
    this.level   = level;

    // Apply L2 multiplier to boss own stats
    if (level === 2) {
      this.scaling = {
        ...scaling,
        attackSpeed:   Math.round(scaling.attackSpeed   * 1.2),
        shootInterval: Math.round(scaling.shootInterval * 0.85),
      };
    }

    this.hp = level === 2 ? Math.round(HP * 1.2) : HP;
    this.setOrigin(0.5, 0.5);
    this.setScale(SCALE);
    this.setDepth(10);
    this.play('nexus-hover');

    // Spawn escorts after a short delay to let physics settle
    scene.time.delayedCall(500, () => this.spawnEscort(0));
    scene.time.delayedCall(800, () => this.spawnEscort(1));
  }

  // Called after physics.add.existing(this)
  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(20, 22, true);
    body.setCollideWorldBounds(true);
  }

  private spawnEscort(slot: number): void {
    if (this.bossState === 'DEATH') return;
    if (!this.active) return;

    const dx  = slot === 0 ? -120 : 120;
    const escort = new Drone(
      this.scene,
      this.x + dx,
      this.y,
      'drone-red',
      this.scaling,
      'normal',
    );
    this.scene.add.existing(escort);
    this.scene.physics.add.existing(escort);
    this.scene.drones.add(escort);

    const body = escort.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    escort.startPatrol(-1);

    // Register bullet overlaps for escort (same as DroneSpawner pattern)
    this.scene.physics.add.overlap(
      this.scene.playerBullets,
      escort,
      (e, bullet) => {
        const b = bullet as Phaser.Physics.Arcade.Image;
        b.setActive(false).setVisible(false);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
        (e as unknown as Drone).takeDamage(1);
        this.scene.audio.play('hit');
        this.scene.spawnFloatingText((e as Phaser.GameObjects.Sprite).x, (e as Phaser.GameObjects.Sprite).y - 20, '-1', '#ffffff');
      },
    );
    this.scene.physics.add.overlap(
      this.scene.missiles,
      escort,
      (e, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnExplosion(m.x, m.y);
        (e as unknown as Drone).takeDamage(3);
        this.scene.cameras.main.shake(150, 0.01);
        this.scene.audio.play('explosion');
        this.scene.spawnFloatingText((e as Phaser.GameObjects.Sprite).x, (e as Phaser.GameObjects.Sprite).y - 20, '-3', '#ffff00');
      },
    );

    this.escorts[slot] = escort;

    // Respawn logic — check if escort died
    const checkRespawn = () => {
      if (this.bossState === 'DEATH' || !this.active) return;
      if (!escort.active) {
        this.escorts[slot] = null;
        this.scene.time.delayedCall(ESCORT_RESPAWN, () => {
          if (this.bossState !== 'DEATH' && this.active) {
            this.spawnEscort(slot);
          }
        });
      } else {
        this.scene.time.delayedCall(1000, checkRespawn);
      }
    };
    this.scene.time.delayedCall(1000, checkRespawn);
  }

  update(_time: number, delta: number): void {
    if (!this.active || this.bossState === 'DEATH') return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    switch (this.bossState) {
      case 'DRIFT': {
        body.setVelocityX(this.driftDir * DRIFT_SPEED);
        // Reverse at camera ±500px from centre
        const camCentreX = this.scene.cameras.main.scrollX + 640;
        if (this.x < camCentreX - 500) this.driftDir = 1;
        if (this.x > camCentreX + 500) this.driftDir = -1;
        this.setFlipX(this.driftDir > 0);

        this.phaseTimer -= delta;
        if (this.phaseTimer <= 0) {
          this.setBossState('CHARGE');
        }
        break;
      }

      case 'CHARGE': {
        body.setVelocityX(0);
        this.phaseTimer -= delta;
        if (this.phaseTimer <= 0) {
          this.fire();
          this.setBossState('FIRE');
        }
        break;
      }

      case 'FIRE':
        // Transition handled in fire() via delayedCall
        break;

      case 'HURT':
        break;
    }
  }

  private fire(): void {
    const target = this.scene.getPilotOrPlayer();
    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);

    for (const offsetDeg of SPREAD_ANGLES) {
      const angle = baseAngle + Phaser.Math.DegToRad(offsetDeg);
      const b = this.scene.droneBullets.get(this.x, this.y, 'bullet-drone') as Phaser.Physics.Arcade.Image;
      if (!b) continue;
      b.setActive(true).setVisible(true).setDepth(14);
      b.setBlendMode(Phaser.BlendModes.ADD);
      const body = b.body as Phaser.Physics.Arcade.Body;
      if (body) {
        body.enable = true;
        // Enable bouncing in L2
        if (this.level === 2) {
          body.setCollideWorldBounds(true);
          body.setBounce(1, 1);
          (body as Phaser.Physics.Arcade.Body).onWorldBounds = true;
          b.setData('bounces', 0);
        }
      }
      b.setVelocity(
        Math.cos(angle) * BULLET_SPEED,
        Math.sin(angle) * BULLET_SPEED,
      );
    }

    // Boss fire sound — modulated drone-shoot (fat low blast)
    this.scene.audio.playAt('drone-shoot', { rate: 0.65, detune: -300, volume: 0.55 });
    this.scene.cameras.main.shake(80, 0.005);

    // Return to DRIFT after attack animation completes
    this.scene.time.delayedCall(600, () => {
      if (this.bossState !== 'DEATH') this.setBossState('DRIFT');
    });
  }

  takeDamage(amount: number): void {
    if (this.bossState === 'DEATH' || this.bossState === 'HURT') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.setBossState('DEATH');
    } else {
      this.setBossState('HURT');
    }
  }

  private setBossState(newState: BossState): void {
    if (this.bossState === 'DEATH') return;
    this.bossState = newState;

    switch (newState) {
      case 'DRIFT':
        this.play('nexus-hover');
        this.phaseTimer = DRIFT_MS;
        break;

      case 'CHARGE':
        this.play('nexus-charge');
        this.phaseTimer = CHARGE_MS;
        // Telegraph sound — deep rumble
        this.scene.audio.playAt('hurt', { rate: 0.5, detune: -200, volume: 0.5 });
        break;

      case 'FIRE':
        this.play('nexus-attack');
        break;

      case 'HURT':
        this.play('nexus-hurt');
        this.setTint(0xff8888);
        this.scene.audio.playAt('hurt', { rate: 0.6, detune: -400, volume: 0.85 });
        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.clearTint();
          if (this.bossState === 'HURT') this.setBossState('DRIFT');
        });
        break;

      case 'DEATH': {
        this.play('nexus-death');
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        (this.body as Phaser.Physics.Arcade.Body).enable = false;

        // Three staggered explosions
        const offsets = [{ x: 0, y: 0 }, { x: -40, y: 20 }, { x: 35, y: -15 }];
        offsets.forEach((off, i) => {
          this.scene.time.delayedCall(i * 150, () => {
            this.scene.spawnExplosion(this.x + off.x, this.y + off.y);
            this.scene.audio.playAt('explosion', {
              rate: 0.5,
              detune: -200 - i * 200,
              volume: 0.9,
            });
          });
        });
        // Final death stinger
        this.scene.time.delayedCall(400, () => {
          this.scene.audio.playAt('death', { rate: 0.4, detune: -400, volume: 0.7 });
        });

        this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          this.scene.events.emit('bossKilled', this.x, this.y);
          this.destroy();
        });
        break;
      }
    }
  }
}
```

**Note:** `DroneScaling` is currently defined as an interface inside `DroneSpawner.ts` but not exported. Task 6 exports it. For now, if the build fails on that import, temporarily inline the type definition in NexusBoss and fix in Task 6.

- [ ] **Step 2: Build**
```bash
npm run build
```
Expected: `✓ built`. If `DroneScaling` import fails, see note above.

- [ ] **Step 3: Commit**
```bash
git add src/entities/NexusBoss.ts
git commit -m "feat: add NexusBoss entity with DRIFT/CHARGE/FIRE/HURT/DEATH states"
```

---

## Task 6: DroneSpawner — Sentinel, boss wave, waveCleared, L2 multiplier

**Files:**
- Modify: `src/systems/DroneSpawner.ts`

- [ ] **Step 1: Export DroneScaling**

In DroneSpawner.ts, change the `DroneScaling` interface from `interface` (unexported) to:
```ts
export interface DroneScaling {
  attackSpeed: number;
  shootInterval: number;
  extraHp: number;
  bulletSpeedMult: number;
}
```

- [ ] **Step 2: Add imports and constants**

Add to the import block at the top:
```ts
import { NexusBoss } from '../entities/NexusBoss';
import type { DroneType } from '../entities/Drone';
import { BOSS_WAVE_L1, BOSS_WAVE_L2, MAX_WAVES_L1, MAX_WAVES_L2, L2_SPEED_MULT, L2_INTERVAL_MULT } from '../constants';
```

Remove the existing `import type { DroneVariant } from '../entities/Drone';` and replace with:
```ts
import type { DroneVariant, DroneType } from '../entities/Drone';
```
(DroneType was un-exported before Task 4 fixed it; now it's safe to import.)

- [ ] **Step 3: Add `isBossWave` check and `waveCleared` event**

In the `droneKilled` listener in the constructor, add the `waveCleared` emit:
```ts
scene.events.on('droneKilled', () => {
  this.dronesAlive = Math.max(0, this.dronesAlive - 1);
  scene.events.emit('dronesRemaining', this.dronesAlive);
  if (this.dronesAlive === 0 && !this.spawning) {
    scene.events.emit('waveCleared', this.waveIndex);
  }
});
// Also listen for bossKilled — boss doesn't emit droneKilled
scene.events.on('bossKilled', () => {
  this.dronesAlive = Math.max(0, this.dronesAlive - 1);
  scene.events.emit('dronesRemaining', this.dronesAlive);
  if (this.dronesAlive === 0 && !this.spawning) {
    scene.events.emit('waveCleared', this.waveIndex);
  }
});
```

- [ ] **Step 4: Add `isBossDead` field and gate on `update()`**

Add field:
```ts
private isBossDead = false;
```

In `update()`, add guard:
```ts
update(time: number, _delta: number): void {
  if (this.spawning || this.isBossDead) return;
  // ... existing logic
}
```

Also add a listener in the constructor:
```ts
scene.events.on('bossKilled', () => { this.isBossDead = true; });
```

- [ ] **Step 5: Rewrite `spawnWave()` to handle boss waves, Sentinels, and L2 multiplier**

Replace the existing `spawnWave()` method body:

```ts
private spawnWave(): void {
  this.spawning = true;
  this.waveIndex++;
  this.scene.events.emit('waveStart', this.waveIndex);

  const currentLevel = (this.scene.registry.get('currentLevel') as number) ?? 1;
  const bossWave     = currentLevel === 2 ? BOSS_WAVE_L2 : BOSS_WAVE_L1;

  // Determine bracket
  let bracket = WAVE_BRACKETS[0];
  for (const b of WAVE_BRACKETS) {
    if (this.waveIndex >= b.minWave) bracket = b;
  }

  // Apply L2 difficulty multiplier
  if (currentLevel === 2) {
    bracket = {
      ...bracket,
      attackSpeed:   Math.round(bracket.attackSpeed   * L2_SPEED_MULT),
      shootInterval: Math.round(bracket.shootInterval * L2_INTERVAL_MULT),
    };
  }

  // Boss wave
  if (this.waveIndex === bossWave) {
    this.spawning = false;
    const camCentreX = this.scene.cameras.main.scrollX + 640;
    const spawnY     = currentLevel === 2 ? 200 : 180;
    const boss = new NexusBoss(this.scene, camCentreX, spawnY, bracket, currentLevel);
    this.scene.add.existing(boss);
    this.scene.physics.add.existing(boss);
    boss.initBody();
    this.scene.drones.add(boss);

    // Register bullet overlaps for boss
    this.scene.physics.add.overlap(
      this.scene.playerBullets,
      boss,
      (b, bullet) => {
        const blt = bullet as Phaser.Physics.Arcade.Image;
        blt.setActive(false).setVisible(false);
        if (blt.body) (blt.body as Phaser.Physics.Arcade.Body).enable = false;
        (b as unknown as NexusBoss).takeDamage(1);
        this.scene.audio.play('hit');
        this.scene.spawnFloatingText((b as Phaser.GameObjects.Sprite).x, (b as Phaser.GameObjects.Sprite).y - 30, '-1', '#ffffff');
      },
    );
    this.scene.physics.add.overlap(
      this.scene.missiles,
      boss,
      (b, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnExplosion(m.x, m.y);
        (b as unknown as NexusBoss).takeDamage(3);
        this.scene.cameras.main.shake(150, 0.01);
        this.scene.audio.play('explosion');
        this.scene.spawnFloatingText((b as Phaser.GameObjects.Sprite).x, (b as Phaser.GameObjects.Sprite).y - 30, '-3', '#ffff00');
      },
    );

    this.dronesAlive++;  // boss counts as one unit
    this.scene.events.emit('dronesRemaining', this.dronesAlive);
    return;
  }

  // Normal wave
  const count = 3 + (this.waveIndex - 1) * 2;
  let spawned = 0;

  const spawnNext = () => {
    if (spawned >= count) {
      this.spawning = false;
      // Check if wave cleared immediately (e.g. 0 drones somehow)
      if (this.dronesAlive === 0) {
        this.scene.events.emit('waveCleared', this.waveIndex);
      }
      return;
    }

    const i        = spawned;
    const camRight = this.scene.cameras.main.scrollX + 1380;
    const spawnX   = Math.min(camRight + 60 + Math.random() * 200, WORLD_WIDTH - 50);
    const lane     = PATROL_LANES[i % PATROL_LANES.length];
    const spawnY   = Math.min(lane, GROUND_Y - 40);

    // Sentinel: every 4th drone from wave 7+
    const isSentinel = this.waveIndex >= 7 && i % 4 === 3;
    // Sniper: every 3rd drone from wave 5+ (only if not sentinel slot)
    const isSniper   = !isSentinel && this.waveIndex >= 5 && i % 3 === 2;
    const variant: DroneVariant = isSniper ? 'sniper' : 'normal';
    const type: DroneType       = isSentinel ? 'sentinel'
                                : (isSniper || i % 2 === 0 ? 'drone-red' : 'drone-green');

    const forceHp = isSentinel ? 3 : undefined;
    const drone   = new Drone(this.scene, spawnX, spawnY, type, bracket, variant, forceHp);
    this.scene.add.existing(drone);
    this.scene.physics.add.existing(drone);
    this.scene.drones.add(drone);

    this.dronesAlive++;
    this.scene.events.emit('dronesRemaining', this.dronesAlive);

    (drone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    drone.startPatrol(i % 2 === 0 ? -1 : 1);

    // Player bullet overlap
    this.scene.physics.add.overlap(
      this.scene.playerBullets,
      drone,
      (d, bullet) => {
        const b = bullet as Phaser.Physics.Arcade.Image;
        b.setActive(false).setVisible(false);
        if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
        (d as unknown as Drone).takeDamage(1);
        this.scene.audio.play('hit');
        this.scene.spawnFloatingText((d as unknown as Drone).x, (d as unknown as Drone).y - 20, '-1', '#ffffff');
        // Sentinel hit sound — sharper
        if (isSentinel) {
          this.scene.audio.playAt('hit', { rate: 1.4, detune: 300, volume: 0.45 });
        }
      },
    );

    // Missile overlap
    this.scene.physics.add.overlap(
      this.scene.missiles,
      drone,
      (d, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnExplosion(m.x, m.y);
        (d as unknown as Drone).takeDamage(3);
        this.scene.cameras.main.shake(150, 0.01);
        this.scene.audio.play('explosion');
        this.scene.spawnFloatingText((d as unknown as Drone).x, (d as unknown as Drone).y - 20, '-3', '#ffff00');
      },
    );

    spawned++;
    this.scene.time.delayedCall(SPAWN_STAGGER, spawnNext);
  };

  spawnNext();

  // Crawlers (existing code — unchanged)
  if (this.waveIndex >= 3) {
    const crawlerCount = Math.min(4, Math.floor((this.waveIndex - 2) / 2) + 1);
    const camRight = this.scene.cameras.main.scrollX + 1380;
    // ... (keep existing crawler loop exactly as-is)
  }
}
```

**Note on sentinel Drone fire sound:** The Sentinel uses the existing `Drone` shoot logic which calls `this.scene.audio.play('drone-shoot')`. To give Sentinels a distinct sound, add a `droneType` check in `Drone.shoot()` and call `playAt` when type is `'sentinel'`. See Task 6 addendum below.

- [ ] **Step 6: Build**
```bash
npm run build
```
Expected: `✓ built`.

- [ ] **Step 7: Commit**
```bash
git add src/systems/DroneSpawner.ts src/entities/NexusBoss.ts
git commit -m "feat: add sentinel spawning, boss wave detection, waveCleared event, L2 multiplier"
```

---

## Task 6 addendum: Sentinel fire sound in Drone.ts

**Files:**
- Modify: `src/entities/Drone.ts` — `shoot()` method

Find the existing `shoot()` method and replace `this.scene.audio.play('drone-shoot')` with:
```ts
if (this.droneType === 'sentinel') {
  this.scene.audio.playAt('drone-shoot', { rate: 1.3, detune: 200, volume: 0.3 });
} else {
  this.scene.audio.play('drone-shoot');
}
```

Commit with Task 6 or separately:
```bash
git add src/entities/Drone.ts
git commit -m "feat: sentinel uses modulated shoot sound (higher pitch)"
```

---

## Task 7: GameScene — level branching, bossKilled, L2 world

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add new fields and update imports**

Add to imports:
```ts
import { WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, GROUND_HEIGHT, PLATFORM_BANDS,
         MAX_WAVES_L1, BOSS_WAVE_L1 } from '../constants';
import { Crawler } from '../entities/Crawler';
```

Add new class fields after `private bgNear`:
```ts
public currentLevel = 1;
private isBossDead = false;
private cameraBoundMaxY = 720;
```

- [ ] **Step 2: Update `init()` to accept level and totalScore**

Replace the existing `init()` method:
```ts
init(data: { mechType?: MechType; level?: number; totalScore?: number }): void {
  if (data.mechType)    this.registry.set('mechType',      data.mechType);
  if (data.level !== undefined)      this.registry.set('currentLevel', data.level);
  if (data.totalScore !== undefined) this.registry.set('totalScore',   data.totalScore);
}
```

- [ ] **Step 3: Update `create()` to reset new fields and branch on level**

At the top of `create()`, after the existing resets, add:
```ts
this.isBossDead      = false;
this.cameraBoundMaxY = 720;
this.currentLevel    = (this.registry.get('currentLevel') as number) ?? 1;
this.score           = (this.registry.get('totalScore')   as number) ?? 0;
```

After the existing `this.score = 0` line (which is now overridden above), in the world setup section replace:
```ts
// --- Background ---
this.makeBackground();

// --- Ground ---
// ... existing ground setup ...

// --- Platforms ---
this.makePlatforms();
```

With:
```ts
if (this.currentLevel === 2) {
  this.physics.world.setBounds(0, 0, 1280, 4800);
  this.makeBackgroundL2();
  this.makeGroundL2();
  this.makeShaftLedges();
} else {
  this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT + 200);
  this.makeBackground();
  // existing ground block
  this.makePlatforms();
}
```

- [ ] **Step 4: Update camera setup for L2**

After the existing `this.cameras.main.startFollow(this.player, false, 0.12, 0.08)` line, replace the camera setup with:
```ts
if (this.currentLevel === 2) {
  this.cameras.main.setBounds(0, 0, 1280, this.cameraBoundMaxY);
  this.cameras.main.startFollow(this.player, false, 0.10, 0.10);
} else {
  this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  this.cameras.main.startFollow(this.player, false, 0.12, 0.08);
}
```

- [ ] **Step 5: Add bossKilled event handler in `create()`**

After the existing `droneKilled` handler block:
```ts
this.events.on('bossKilled', () => {
  this.isBossDead = true;
  this.score += 1000;
  this.events.emit('scoreChange', this.score);
  // Level complete handled by UIScene listening to same event
});
```

- [ ] **Step 6: Add waveCleared handler for L2 camera progression**

After the bossKilled handler:
```ts
this.events.on('waveCleared', () => {
  if (this.currentLevel !== 2) return;
  this.cameraBoundMaxY = Math.min(4800, this.cameraBoundMaxY + 480);
  this.cameras.main.setBounds(0, 0, 1280, this.cameraBoundMaxY);
  this.physics.world.setBounds(0, 0, 1280, this.cameraBoundMaxY);
});
```

- [ ] **Step 7: Add L2 bouncing bullet worldbounds listener**

At the end of `create()`, before the eject key handler:
```ts
if (this.currentLevel === 2) {
  this.physics.world.on('worldbounds', (body: Phaser.Physics.Arcade.Body) => {
    const go = body.gameObject as Phaser.Physics.Arcade.Image;
    if (!go?.active) return;
    const bounces = (go.getData('bounces') ?? 0) + 1;
    if (bounces >= 2) {
      go.setActive(false).setVisible(false);
      body.enable = false;
    } else {
      go.setData('bounces', bounces);
      this.audio.playAt('hit', { rate: 1.8, detune: 400, volume: 0.2 });
    }
  });
}
```

- [ ] **Step 8: Add L2 world methods**

Add these private methods after `makeBackground()`:

```ts
private makeGroundL2(): void {
  // Narrow ground at bottom of shaft
  this.ground = this.physics.add.staticGroup();
  const groundRect = this.add.rectangle(640, 4760, 1280, 80, 0x0a2010).setDepth(4);
  this.ground.add(groundRect);
  this.add.rectangle(640, 4721, 1280, 2, 0x00ff66).setDepth(5);
  // Left/right walls (visual only — world bounds handle physics)
  this.add.rectangle(4, 2400, 8, 4800, 0x0a2010).setDepth(4);
  this.add.rectangle(1276, 2400, 8, 4800, 0x0a2010).setDepth(4);
}

private makeBackgroundL2(): void {
  this.add.rectangle(640, 2400, 1280, 4800, 0x001400).setDepth(0).setScrollFactor(0);

  const makeStar = (count: number, size: number, alpha: number, key: string) => {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x88ff88, alpha);
    for (let i = 0; i < count; i++) {
      gfx.fillRect(
        Phaser.Math.Between(0, 1280),
        Phaser.Math.Between(0, 4800),
        size, size,
      );
    }
    gfx.generateTexture(key, 1280, 720);
    gfx.destroy();
  };

  makeStar(120, 1, 0.3, 'stars-far-l2');
  makeStar(40,  2, 0.6, 'stars-near-l2');

  this.bgFar  = this.add.tileSprite(640, 360, 1280, 720, 'stars-far-l2').setDepth(1).setScrollFactor(0);
  this.bgNear = this.add.tileSprite(640, 360, 1280, 720, 'stars-near-l2').setDepth(2).setScrollFactor(0);
}

private makeShaftLedges(): void {
  if (!this.ground) this.ground = this.physics.add.staticGroup();

  const hash = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;

  for (let i = 0; i < 18; i++) {
    const w = 200 + hash(i) * 140;
    const x = i % 2 === 0 ? w / 2 : 1280 - w / 2;
    const y = 600 + i * 200 + hash(i + 100) * 80;
    this.addStructure(x, y, w, 'green');
  }
}
```

- [ ] **Step 9: Extend `addStructure()` to accept optional palette**

Change the method signature:
```ts
private addStructure(x: number, y: number, w: number, palette: 'blue' | 'green' = 'blue'): void {
```

Add palette-based colour variables at the top of the method:
```ts
const bodyColor = palette === 'green' ? 0x0a2010 : 0x1c2040;
const slabColor = palette === 'green' ? 0x051008 : 0x12122e;
const postColor = palette === 'green' ? 0x1a4028 : 0x2a3a5a;
const glowColor = palette === 'green' ? 0x00ff66 : 0x7799ff;
const accentColor = palette === 'green' ? 0x0a3018 : 0x334466;
const lightColor  = palette === 'green' ? 0x44ff44 : 0xff8800;
```

Replace each hardcoded hex colour in the existing method body with the corresponding variable.

- [ ] **Step 10: Build**
```bash
npm run build
```
Expected: `✓ built`.

- [ ] **Step 11: Commit**
```bash
git add src/scenes/GameScene.ts
git commit -m "feat: GameScene level branching, bossKilled handler, L2 world and bouncing bullets"
```

---

## Task 8: UIScene — level name flash, LEVEL COMPLETE screen, transition

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Add fields**

Add after existing private fields:
```ts
private levelNameText: Phaser.GameObjects.Text | null = null;
private levelCompleteActive = false;
```

- [ ] **Step 2: Show level name on `waveStart` event (first wave only)**

In UIScene's `create()`, find where `game.events.on('waveStart', ...)` is registered. After updating `currentWave`, add:

```ts
game.events.on('waveStart', (wave: number) => {
  this.currentWave = wave;
  this.waveText.setText(`WAVE ${wave}`);

  // Show level name on wave 1 only
  if (wave === 1) {
    const levelNum  = (this.scene.get('Game') as GameScene).currentLevel;
    const levelName = levelNum === 2 ? 'SUBSURFACE' : 'SURFACE OPS';
    const t = this.add.text(640, 80, levelName, {
      fontFamily: 'monospace', fontSize: '22px',
      color: levelNum === 2 ? '#00ff66' : '#6699ff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50).setAlpha(0);
    this.tweens.add({
      targets: t, alpha: 1, duration: 400, yoyo: true, hold: 1200,
      onComplete: () => t.destroy(),
    });
  }
});
```

- [ ] **Step 3: Listen for bossKilled and show LEVEL COMPLETE**

In `create()`, after the `gameOver` event listener:
```ts
game.events.on('bossKilled', () => {
  if (this.levelCompleteActive) return;
  this.levelCompleteActive = true;
  this.showLevelComplete();
});
```

- [ ] **Step 4: Add `showLevelComplete()` method**

```ts
private showLevelComplete(): void {
  const gameScene = this.scene.get('Game') as GameScene;
  const mechType  = gameScene.registry.get('mechType') as string;
  const score     = gameScene.score;
  const level     = gameScene.currentLevel;

  // Overlay
  const bg = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.75).setDepth(60);
  this.add.text(640, 280, 'LEVEL COMPLETE', {
    fontFamily: 'monospace', fontSize: '32px', color: '#00ff88',
  }).setOrigin(0.5).setDepth(61);

  const nextName = level === 1 ? 'DESCENDING TO SUBSURFACE…' : 'ALL CLEAR';
  this.add.text(640, 340, nextName, {
    fontFamily: 'monospace', fontSize: '16px', color: '#aaffcc',
  }).setOrigin(0.5).setDepth(61);

  // Level complete stinger — low triumphant boom
  try {
    this.sound.play('explosion', { volume: 0.45, rate: 0.3, detune: -600 });
  } catch { /* ignore */ }

  // Transition after 2000ms
  this.time.delayedCall(2000, () => {
    this.cameras.main.fade(500, 0, 0, 0, false, (_cam: unknown, progress: number) => {
      if (progress === 1) {
        if (level === 1) {
          // Advance to Level 2
          gameScene.scene.start('Game', {
            level: 2,
            mechType,
            totalScore: score,
          });
          this.scene.restart();
        } else {
          // Victory — restart to Level 1
          gameScene.scene.start('Game', { mechType });
          this.scene.restart();
        }
      }
    });
  });

  void bg; // suppress unused warning
}
```

- [ ] **Step 5: Reset `levelCompleteActive` in UIScene's restart**

In UIScene's `create()`, at the top:
```ts
this.levelCompleteActive = false;
```

- [ ] **Step 6: Build**
```bash
npm run build
```
Expected: `✓ built`.

- [ ] **Step 7: Commit**
```bash
git add src/scenes/UIScene.ts
git commit -m "feat: UIScene level name flash, LEVEL COMPLETE overlay, L1→L2 transition"
```

---

## Task 9: Final integration build and push

- [ ] **Step 1: Full clean build**
```bash
npm run build
```
Expected: `✓ built` — zero TypeScript errors.

- [ ] **Step 2: Verify checklist manually in browser**
```bash
npm run dev
```
- [ ] Level 1 "SURFACE OPS" text fades in on wave 1
- [ ] Wave 7: sentinel drones appear (larger, 3 hits to kill), higher-pitched shoot sound
- [ ] Wave 10: Nexus boss spawns with 2 escorts, drifts slowly
- [ ] Boss plays charge animation + low rumble sound before firing 3-bullet spread
- [ ] Boss hurt plays deep thud; boss death plays 3-burst explosion cascade
- [ ] "LEVEL COMPLETE" overlay appears after boss death → fades to Level 2
- [ ] Level 2 has green background, wall ledges, "SUBSURFACE" text on wave 1
- [ ] Drone bullets in L2 bounce off side walls once (tick sound on bounce)
- [ ] Score carries from L1 → L2

- [ ] **Step 3: Push**
```bash
git push origin main
```
