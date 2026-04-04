# Mother Drone Boss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Mother Drone as the Level 3 wave-3 final boss — missile-only damage, single-file drone lines block missile paths, ramp-up intensity as HP drops.

**Architecture:** Two new entity classes (`LineDrone`, `MotherDrone`) added to the existing `game.drones` group so missile targeting and minimap rendering require zero new wiring. A new `bossProjectiles` physics group added to `GameScene` handles the phase-3+ slow projectiles with three new overlaps. `DroneSpawner` and `MinimapRenderer` get minimal targeted edits.

**Tech Stack:** Phaser 3.80+, TypeScript, Vite. No test framework — TypeScript compilation (`npx tsc --noEmit`) is the type-check gate; browser testing in dev server (`npm run dev`) for functional verification.

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `src/entities/LineDrone.ts` | Horizontal-only drone, no AI, `die()` without `droneKilled` event |
| Create | `src/entities/MotherDrone.ts` | Boss state machine, line spawning, projectile firing, ramp-up |
| Modify | `src/constants.ts` | Add `BOSS_WAVE_L3`, `MAX_WAVES_L3` |
| Modify | `src/scenes/GameScene.ts` | Add `bossProjectiles` group, texture gen, 3 new overlaps |
| Modify | `src/systems/DroneSpawner.ts` | Handle L3 in `isBossWave()` + `spawnWave()`, spawn MotherDrone |
| Modify | `src/ui/MinimapRenderer.ts` | Render `isBoss` entities as pulsing rings |

---

## Task 1: Add L3 constants

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Add constants after the existing L2 lines**

In `src/constants.ts`, after line 48 (`export const L2_INTERVAL_MULT = 0.85;`), add:

```typescript
export const MAX_WAVES_L3     = 3;
export const BOSS_WAVE_L3     = 3;
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/devwm8/Projects/moonsec && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "feat: add L3 wave constants (BOSS_WAVE_L3, MAX_WAVES_L3)"
```

---

## Task 2: Create LineDrone

**Files:**
- Create: `src/entities/LineDrone.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/entities/LineDrone.ts
import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { GAME_W } from '../constants';

export class LineDrone extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;
  // Minimap reads this — false keeps it as a normal red dot
  readonly isBoss = false;

  constructor(scene: GameScene, x: number, y: number) {
    super(scene, x, y, 'drone-red');
    this.scene = scene;
    this.setScale(2.42);
    this.setDepth(8);
    this.play('drone-red-hover');
  }

  initBody(velocityX: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(18, 14, true);
    body.setVelocityX(velocityX);
    // Face travel direction
    this.setFlipX(velocityX > 0);
  }

  /** Called by overlap handlers — deactivates without emitting droneKilled. */
  die(): void {
    if (!this.active) return;
    const emitter = this.scene.add.particles(this.x, this.y, 'pixel', {
      speed:     { min: 40, max: 100 },
      scale:     { start: 1.5, end: 0 },
      tint:      [0xffaa00, 0xff4400],
      lifespan:  300,
      quantity:  5,
      blendMode: 'ADD',
    });
    this.scene.time.delayedCall(300, () => emitter.destroy());
    this.setActive(false).setVisible(false);
    if (this.body) (this.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  /** Required by MinimapRenderer — always HOVER so it renders as a plain dot. */
  getState(): 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DEATH' {
    return 'HOVER';
  }

  // runChildUpdate: true on game.drones calls this every frame
  update(): void {
    if (!this.active) return;
    const cam = this.scene.cameras.main;
    if (this.x < cam.scrollX - 200 || this.x > cam.scrollX + GAME_W + 200) {
      // Off-screen — deactivate silently (no droneKilled, no dronesAlive decrement)
      this.setActive(false).setVisible(false);
      if (this.body) (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/devwm8/Projects/moonsec && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/entities/LineDrone.ts
git commit -m "feat: add LineDrone — horizontal blocker for MotherDrone boss fight"
```

---

## Task 3: Create MotherDrone skeleton (DRIFT, HURT, REPOSITION, DEATH)

**Files:**
- Create: `src/entities/MotherDrone.ts`
- Modify: `src/scenes/GameScene.ts` (property declaration only — full wiring in Task 4)

- [ ] **Step 1: Declare bossProjectiles on GameScene first**

`MotherDrone` references `scene.bossProjectiles`, so GameScene needs the property declared before MotherDrone can compile. In `src/scenes/GameScene.ts`, add to the class property declarations after `pickups` (around line 23):

```typescript
bossProjectiles!: Phaser.Physics.Arcade.Group;
```

- [ ] **Step 2: Create the file**

```typescript
// src/entities/MotherDrone.ts
import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { DroneScaling } from '../systems/DroneSpawner';
import { GAME_W } from '../constants';
import { LineDrone } from './LineDrone';

type MotherState = 'DRIFT' | 'SPAWN_LINE' | 'HURT' | 'REPOSITION' | 'DEATH';

const HP               = 10;
const SCALE            = 4.0;
const DRIFT_SPEED      = 30;   // gentle float during DRIFT state
const HURT_MS          = 400;
const REPOSITION_MS    = 600;
const REPOSITION_DIST  = 300;
const LINE_DRONE_SPEED = 400;  // px/s — at 1920px wide, ~4.8s to cross screen
const LINE_DRONE_SPACING = 90; // px between drones in a line

interface LineConfig {
  spawnInterval: number;       // ms between line spawns
  maxActiveLines: number;      // how many lines on screen at once
  dronesPerLine: number;
  projectileInterval: number | null; // null = no projectiles this phase
}

// Indexed by HP bracket: [10-8, 7-5, 4-2, 1]
const LINE_CONFIGS: LineConfig[] = [
  { spawnInterval: 3500, maxActiveLines: 1, dronesPerLine: 6, projectileInterval: null  },
  { spawnInterval: 2200, maxActiveLines: 2, dronesPerLine: 7, projectileInterval: null  },
  { spawnInterval: 1600, maxActiveLines: 2, dronesPerLine: 8, projectileInterval: 4000  },
  { spawnInterval: 1000, maxActiveLines: 3, dronesPerLine: 9, projectileInterval: 2000  },
];

export class MotherDrone extends Phaser.Physics.Arcade.Sprite {
  declare scene: GameScene;
  readonly isBoss = true;

  private bossState: MotherState = 'DRIFT';
  private hp = HP;
  private repositionDir = 1;
  private activeLines = 0;
  private lineDir: 1 | -1 = 1; // alternates each spawn
  private lineTimer: Phaser.Time.TimerEvent | null = null;
  private projectileTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: GameScene, x: number, y: number, _scaling: DroneScaling) {
    super(scene, x, y, 'sentinel'); // placeholder — L3 will get its own texture
    this.scene = scene;
    this.setScale(SCALE);
    this.setDepth(10);
    this.play('sentinel-hover');
  }

  initBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(28, 22, true);
    body.setCollideWorldBounds(true);
    // Begin attacking after a short intro pause
    this.scene.time.delayedCall(1500, () => this.startLineTimer());
  }

  // ── Ramp-up ─────────────────────────────────────────────────────────────────

  private getLineConfig(): LineConfig {
    if (this.hp >= 8) return LINE_CONFIGS[0];
    if (this.hp >= 5) return LINE_CONFIGS[1];
    if (this.hp >= 2) return LINE_CONFIGS[2];
    return LINE_CONFIGS[3];
  }

  private startLineTimer(): void {
    this.lineTimer?.destroy();
    if (this.bossState === 'DEATH') return;
    const cfg = this.getLineConfig();
    this.lineTimer = this.scene.time.addEvent({
      delay: cfg.spawnInterval,
      callback: this.trySpawnLine,
      callbackScope: this,
      loop: true,
    });
  }

  private startProjectileTimer(): void {
    const cfg = this.getLineConfig();
    if (cfg.projectileInterval === null) return;
    this.projectileTimer?.destroy();
    this.projectileTimer = this.scene.time.addEvent({
      delay: cfg.projectileInterval,
      callback: this.fireProjectile,
      callbackScope: this,
      loop: true,
    });
  }

  // ── Line spawning ────────────────────────────────────────────────────────────

  private trySpawnLine(): void {
    if (this.bossState === 'DEATH' || this.bossState === 'REPOSITION') return;
    const cfg = this.getLineConfig();
    if (this.activeLines >= cfg.maxActiveLines) return;
    this.setState('SPAWN_LINE');
  }

  private spawnLine(): void {
    const cfg = this.getLineConfig();
    const cam = this.scene.cameras.main;
    this.lineDir = (this.lineDir * -1) as 1 | -1;
    const dir = this.lineDir as 1 | -1;
    const velX = dir * LINE_DRONE_SPEED;
    // Start off-screen on the side the line originates from
    const startX = dir > 0
      ? cam.scrollX - LINE_DRONE_SPACING * cfg.dronesPerLine
      : cam.scrollX + GAME_W + LINE_DRONE_SPACING * cfg.dronesPerLine;
    const lineY = this.y + 85;

    this.activeLines++;

    for (let i = 0; i < cfg.dronesPerLine; i++) {
      const x = startX + dir * i * LINE_DRONE_SPACING;
      const ld = new LineDrone(this.scene, x, lineY);
      this.scene.add.existing(ld);
      this.scene.physics.add.existing(ld);
      this.scene.drones.add(ld);
      ld.initBody(velX);

      // Register overlaps per-drone (mirrors NexusBoss escort pattern)
      let c1: Phaser.Physics.Arcade.Collider;
      let c2: Phaser.Physics.Arcade.Collider;

      c1 = this.scene.physics.add.overlap(
        this.scene.playerBullets,
        ld,
        (_ld, bullet) => {
          const b = bullet as Phaser.Physics.Arcade.Image;
          b.setActive(false).setVisible(false);
          if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
          (_ld as unknown as LineDrone).die();
          this.scene.audio.play('hit');
          c1.destroy();
          c2.destroy();
        },
      );

      c2 = this.scene.physics.add.overlap(
        this.scene.missiles,
        ld,
        (_ld, missile) => {
          const m = missile as Phaser.Physics.Arcade.Image;
          m.setData('hitTarget', true);
          m.setActive(false).setVisible(false);
          if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
          this.scene.spawnExplosion(m.x, m.y);
          this.scene.audio.play('explosion');
          (_ld as unknown as LineDrone).die();
          c1.destroy();
          c2.destroy();
        },
      );
    }

    // Decrement activeLines once the last drone has cleared the screen
    const traversalMs = (GAME_W + LINE_DRONE_SPACING * cfg.dronesPerLine * 2) / LINE_DRONE_SPEED * 1000;
    this.scene.time.delayedCall(traversalMs, () => {
      this.activeLines = Math.max(0, this.activeLines - 1);
    });
  }

  // ── Slow projectiles ─────────────────────────────────────────────────────────

  private fireProjectile(): void {
    if (this.bossState === 'DEATH') return;
    const target = this.scene.getPilotOrPlayer();
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const proj = this.scene.bossProjectiles.get(
      this.x, this.y + 30, 'boss-projectile',
    ) as Phaser.Physics.Arcade.Image | null;
    if (!proj) return;
    proj.setActive(true).setVisible(true).setDepth(12);
    const body = proj.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setAllowGravity(false);
      body.enable = true;
      body.setVelocity(Math.cos(angle) * 80, Math.sin(angle) * 80);
    }
    // Auto-cleanup after 15s (projectile falls off screen well before then)
    this.scene.time.delayedCall(15000, () => {
      if (proj.active) {
        proj.setActive(false).setVisible(false);
        if (proj.body) (proj.body as Phaser.Physics.Arcade.Body).enable = false;
      }
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  getState(): 'HOVER' | 'ATTACK' | 'FLEE' | 'HURT' | 'DEATH' {
    if (this.bossState === 'SPAWN_LINE') return 'ATTACK';
    if (this.bossState === 'HURT')       return 'HURT';
    if (this.bossState === 'DEATH')      return 'DEATH';
    return 'HOVER';
  }

  takeDamage(amount: number): void {
    if (this.bossState === 'DEATH' || this.bossState === 'HURT' || this.bossState === 'REPOSITION') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.setState('DEATH');
      return;
    }
    this.setState('HURT');
    // Re-evaluate bracket after HP change
    this.startLineTimer();
    if (this.hp <= 4 && this.projectileTimer === null) {
      this.startProjectileTimer();
    }
  }

  // ── State machine ────────────────────────────────────────────────────────────

  private setState(newState: MotherState): void {
    if (this.bossState === 'DEATH') return;
    this.bossState = newState;
    const body = this.body as Phaser.Physics.Arcade.Body;

    switch (newState) {
      case 'DRIFT':
        this.play('sentinel-hover');
        body.setVelocityX(DRIFT_SPEED * (Math.random() < 0.5 ? 1 : -1));
        break;

      case 'SPAWN_LINE':
        body.setVelocityX(0);
        this.spawnLine();
        this.scene.time.delayedCall(800, () => {
          if (this.bossState === 'SPAWN_LINE') this.setState('DRIFT');
        });
        break;

      case 'HURT':
        this.setTint(0xff8888);
        body.setVelocityX(0);
        this.scene.audio.playAt('hurt', { rate: 0.5, detune: -300, volume: 0.8 });
        this.scene.cameras.main.shake(200, 0.015);
        this.scene.time.delayedCall(HURT_MS, () => {
          this.clearTint();
          if (this.bossState === 'HURT') this.setState('REPOSITION');
        });
        break;

      case 'REPOSITION': {
        body.setVelocityX(0);
        this.repositionDir *= -1;
        const camX = this.scene.cameras.main.scrollX;
        const targetX = Phaser.Math.Clamp(
          this.x + this.repositionDir * REPOSITION_DIST,
          camX + 200,
          camX + GAME_W - 200,
        );
        this.scene.tweens.add({
          targets: this,
          x: targetX,
          duration: REPOSITION_MS,
          ease: 'Quad.easeOut',
          onComplete: () => {
            if (this.bossState !== 'DEATH') this.setState('SPAWN_LINE');
          },
        });
        break;
      }

      case 'DEATH': {
        body.setVelocity(0, 0);
        body.enable = false;
        this.lineTimer?.destroy();
        this.projectileTimer?.destroy();

        const offsets = [{ x: 0, y: 0 }, { x: -50, y: 25 }, { x: 45, y: -20 }];
        offsets.forEach((off, i) => {
          this.scene.time.delayedCall(i * 180, () => {
            this.scene.spawnExplosion(this.x + off.x, this.y + off.y);
            this.scene.audio.playAt('explosion', {
              rate: 0.5, detune: -200 - i * 200, volume: 0.9,
            });
          });
        });

        this.scene.time.delayedCall(540, () => {
          this.scene.events.emit('bossKilled', this.x, this.y);
          this.destroy();
        });
        break;
      }
    }
  }

  update(_time: number, _delta: number): void {
    if (!this.active || this.bossState === 'DEATH') return;
    // Keep within camera bounds during DRIFT
    if (this.bossState === 'DRIFT') {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const camX = this.scene.cameras.main.scrollX;
      if (this.x < camX + 150)            body.setVelocityX(DRIFT_SPEED);
      if (this.x > camX + GAME_W - 150)   body.setVelocityX(-DRIFT_SPEED);
    }
  }
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/devwm8/Projects/moonsec && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.ts src/entities/MotherDrone.ts
git commit -m "feat: add MotherDrone boss — state machine, line spawning, ramp-up, slow projectiles"
```

---

## Task 4: Wire GameScene — bossProjectiles group + overlaps

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Generate the boss-projectile texture**

In `GameScene.create()`, after the `pickup-fuel` texture generation block (around line 117), add:

```typescript
// Boss projectile — large orange orb
const bpg = this.add.graphics();
bpg.fillStyle(0xff6600, 0.9);
bpg.fillCircle(16, 16, 16);
bpg.fillStyle(0xffaa44, 0.6);
bpg.fillCircle(16, 16, 9);
bpg.generateTexture('boss-projectile', 32, 32);
bpg.destroy();
```

- [ ] **Step 2: Create the bossProjectiles physics group**

In `GameScene.create()`, after the `pickups` group creation (around line 173), add:

```typescript
this.bossProjectiles = this.physics.add.group({
  defaultKey: 'boss-projectile',
  maxSize: 10,
  runChildUpdate: false,
  allowGravity: false,
});
```

- [ ] **Step 3: Register the three bossProjectiles overlaps**

After the existing pickup overlap (around line 253), add:

```typescript
// Player bullets destroy boss projectiles
this.physics.add.overlap(
  this.playerBullets,
  this.bossProjectiles,
  (_proj, bullet) => {
    const b = bullet as Phaser.Physics.Arcade.Image;
    b.setActive(false).setVisible(false);
    if (b.body) (b.body as Phaser.Physics.Arcade.Body).enable = false;
    const p = _proj as Phaser.Physics.Arcade.Image;
    p.setActive(false).setVisible(false);
    if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
    this.audio.play('hit');
  },
);

// Boss projectiles hit player
this.physics.add.overlap(
  this.bossProjectiles,
  this.player,
  (projObj, playerObj) => {
    const p = projObj as Phaser.Physics.Arcade.Image;
    if (!p.active) return;
    p.setActive(false).setVisible(false);
    if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
    (playerObj as Player).takeDamage(1);
    this.cameras.main.shake(100, 0.008);
  },
);

// Missiles are intercepted by boss projectiles (projectile blocks missile path)
this.physics.add.overlap(
  this.missiles,
  this.bossProjectiles,
  (projObj, missile) => {
    const m = missile as Phaser.Physics.Arcade.Image;
    m.setData('hitTarget', true);
    m.setActive(false).setVisible(false);
    if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
    const p = projObj as Phaser.Physics.Arcade.Image;
    p.setActive(false).setVisible(false);
    if (p.body) (p.body as Phaser.Physics.Arcade.Body).enable = false;
    this.spawnExplosion(m.x, m.y);
    this.audio.play('explosion');
  },
);
```

- [ ] **Step 4: Verify compilation**

```bash
cd /Users/devwm8/Projects/moonsec && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: add bossProjectiles physics group and overlaps to GameScene"
```

---

## Task 5: Wire DroneSpawner — L3 boss wave

**Files:**
- Modify: `src/systems/DroneSpawner.ts`

- [ ] **Step 1: Add imports**

At the top of `src/systems/DroneSpawner.ts`, update the constants import to include `BOSS_WAVE_L3`:

```typescript
import { GROUND_Y, WORLD_WIDTH, WAVE_BRACKETS, BOSS_WAVE_L1, BOSS_WAVE_L2, BOSS_WAVE_L3, L2_SPEED_MULT, L2_INTERVAL_MULT, GAME_W, GAME_H, PATROL_LANES } from '../constants';
```

Add the MotherDrone import after the NexusBoss import:

```typescript
import { MotherDrone } from '../entities/MotherDrone';
```

- [ ] **Step 2: Update isBossWave() to handle L3**

Replace the existing `isBossWave()` method (lines 52–56):

```typescript
isBossWave(): boolean {
  const currentLevel = (this.scene.registry.get('currentLevel') as number) ?? 1;
  const bossWave = currentLevel === 3 ? BOSS_WAVE_L3
                 : currentLevel === 2 ? BOSS_WAVE_L2
                 : BOSS_WAVE_L1;
  return this.waveIndex >= bossWave;
}
```

- [ ] **Step 3: Update bossWave determination in spawnWave()**

In `spawnWave()`, replace the existing bossWave line (line 73):

```typescript
const bossWave = currentLevel === 3 ? BOSS_WAVE_L3
               : currentLevel === 2 ? BOSS_WAVE_L2
               : BOSS_WAVE_L1;
```

- [ ] **Step 4: Add L3 boss spawn branch inside the boss-wave block**

In `spawnWave()`, find the boss wave block (line 91: `if (this.waveIndex === bossWave) {`). Add an L3 branch **before** the existing NexusBoss spawn code:

```typescript
if (this.waveIndex === bossWave) {
  this.spawning = false;
  const camCentreX = this.scene.cameras.main.scrollX + GAME_W / 2;

  // ── Level 3: Mother Drone ───────────────────────────────────────────
  if (currentLevel === 3) {
    const boss = new MotherDrone(this.scene, camCentreX, 180, bracket);
    this.scene.add.existing(boss);
    this.scene.physics.add.existing(boss);
    this.scene.drones.add(boss);
    boss.initBody();

    // Only missiles damage her — no bullet overlap registered
    this.scene.physics.add.overlap(
      this.scene.missiles,
      boss,
      (b, missile) => {
        const m = missile as Phaser.Physics.Arcade.Image;
        m.setData('hitTarget', true);
        m.setActive(false).setVisible(false);
        if (m.body) (m.body as Phaser.Physics.Arcade.Body).enable = false;
        this.scene.spawnExplosion(m.x, m.y);
        (b as unknown as MotherDrone).takeDamage(1);
        this.scene.cameras.main.shake(200, 0.015);
        this.scene.audio.play('explosion');
        this.scene.spawnFloatingText(
          (b as Phaser.GameObjects.Sprite).x,
          (b as Phaser.GameObjects.Sprite).y - 30,
          '-1', '#ffaa44',
        );
      },
    );

    this.dronesAlive++;
    this.scene.events.emit('dronesRemaining', this.dronesAlive);
    return;
  }

  // ── Level 1 / 2: NexusBoss (existing code — do not modify) ─────────
  const spawnY = currentLevel === 2 ? 200 : 180;
  // ... rest of existing NexusBoss spawn code unchanged ...
```

- [ ] **Step 5: Verify compilation**

```bash
cd /Users/devwm8/Projects/moonsec && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/systems/DroneSpawner.ts
git commit -m "feat: spawn MotherDrone on L3 wave 3 in DroneSpawner"
```

---

## Task 6: MinimapRenderer — boss pulsing rings

**Files:**
- Modify: `src/ui/MinimapRenderer.ts`

- [ ] **Step 1: Add boss rendering branch**

In `MinimapRenderer.ts`, inside the `game.drones.getChildren().forEach` loop (the second one, around line 110), replace the blip rendering block:

```typescript
// Current code to replace:
const dotR = state === 'ATTACK'
  ? 2.5 + Math.sin(time * 0.012) * 1.5
  : 3;
const color = drone.texture.key === 'drone-red' ? 0xff4444 : 0x44ff88;
gfx.fillStyle(color, 1);
gfx.fillCircle(dp.x, dp.y, dotR);
```

Replace with:

```typescript
// Boss renders as three pulsing concentric rings — stands out from drone dots
if ((drone as unknown as { isBoss?: boolean }).isBoss) {
  const r = 6 + Math.sin(time * 0.008) * 2;
  gfx.lineStyle(2, 0xff4444, 0.9);
  gfx.strokeCircle(dp.x, dp.y, r);
  gfx.lineStyle(1, 0xff4444, 0.5);
  gfx.strokeCircle(dp.x, dp.y, r + 6);
  gfx.lineStyle(0.5, 0xff4444, 0.2);
  gfx.strokeCircle(dp.x, dp.y, r + 12);
} else {
  const dotR = state === 'ATTACK'
    ? 2.5 + Math.sin(time * 0.012) * 1.5
    : 3;
  const color = drone.texture.key === 'drone-red' ? 0xff4444 : 0x44ff88;
  gfx.fillStyle(color, 1);
  gfx.fillCircle(dp.x, dp.y, dotR);
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/devwm8/Projects/moonsec && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/MinimapRenderer.ts
git commit -m "feat: render boss entities as pulsing rings on minimap"
```

---

## Task 7: Browser verification

- [ ] **Step 1: Start dev server**

```bash
cd /Users/devwm8/Projects/moonsec && npm run dev
```

- [ ] **Step 2: Trigger L3 wave 3 (quickest path)**

In `GameScene.ts`, temporarily set `currentLevel = 3` and add the console shortcut at the top of `create()`:

```typescript
// TEMP: skip to L3 boss wave for testing
this.registry.set('currentLevel', 3);
```

And in DroneSpawner constructor, temporarily set `this.nextWaveTime = 0` and `this.waveIndex = 2` to skip straight to wave 3.

- [ ] **Step 3: Verify each requirement from the spec**

```
[ ] MotherDrone spawns at top-center on wave 3
[ ] Drone lines fly horizontally, spaced ~90px apart
[ ] Bullets destroy individual LineDrones (gap opens)
[ ] Missile through gap → MotherDrone flashes red, repositions, spawns fresh line
[ ] Missile hitting a LineDrone → missile destroyed, no boss damage
[ ] Bullet aimed directly at MotherDrone → no damage
[ ] HP drops to 4 → orange orbs begin firing downward
[ ] Orb shot with bullet → both destroyed
[ ] HP 1 → visibly more lines, faster spawns
[ ] Final missile hit → 3 explosions → bossKilled event (level transitions)
[ ] Minimap: large pulsing red rings for boss, normal dots for LineDrones
```

- [ ] **Step 4: Remove temp testing code, final commit**

Remove the `currentLevel = 3` override and DroneSpawner skip.

```bash
git add src/scenes/GameScene.ts src/systems/DroneSpawner.ts
git commit -m "test: remove L3 boss wave testing shortcuts"
```

---

## Tuning Reference

All values are first-pass starting points. Adjust after playtesting:

| Constant | Location | Effect |
|---------|----------|--------|
| `LINE_DRONE_SPEED` | `MotherDrone.ts` | How fast lines cross screen |
| `LINE_DRONE_SPACING` | `MotherDrone.ts` | Gap between drones in a line |
| `LINE_CONFIGS[n].spawnInterval` | `MotherDrone.ts` | Time between new lines per phase |
| `LINE_CONFIGS[n].dronesPerLine` | `MotherDrone.ts` | How dense each line is |
| `LINE_CONFIGS[n].projectileInterval` | `MotherDrone.ts` | Projectile fire rate in phase 3+ |
| `REPOSITION_DIST` | `MotherDrone.ts` | How far she moves after each hit |
| `REPOSITION_MS` | `MotherDrone.ts` | How fast she repositions |
| Projectile velocity (`80`) | `MotherDrone.fireProjectile()` | How fast slow shots travel |
