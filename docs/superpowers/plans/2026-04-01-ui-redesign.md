# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `UIScene.ts` so all HUD elements are larger, clearly readable, and free of visual cramping — using dark panel containers to group bars, wider/taller bars, and more spacing throughout.

**Architecture:** All changes are confined to `src/scenes/UIScene.ts`. Local constants at the top of the file are updated; new `Graphics` objects draw panel backgrounds; two new `Text` fields are added (`healthValueText`, `missileStateLabel`). No new files created.

**Tech Stack:** Phaser 3.80, TypeScript, Vite (`npm run build` to type-check, `npm run dev` to run)

---

## File Map

| File | Change |
|---|---|
| `src/scenes/UIScene.ts` | Update constants; rebuild top-left panel; rebuild top-right panel; update center/controls; update event handlers |

---

## Task 1: Update layout constants

**Files:**
- Modify: `src/scenes/UIScene.ts:7-9`

- [ ] **Step 1: Replace the three constants at the top of UIScene.ts**

Current (lines 7–9):
```typescript
const BAR_W = 140;
const BAR_H = 10;
const PAD = 12;
```

Replace with:
```typescript
const BAR_W   = 200;   // bar width (was 140)
const BAR_H   = 14;    // primary bar height: HP, MSL (was 10)
const BAR_H2  = 10;    // secondary bar height: JP, Nanoheal, TRT (was 6)
const PAD     = 12;
const PP      = 10;    // panel internal padding
const LABEL_H = 16;    // vertical space reserved for a label text row
const ROW_GAP = 8;     // gap between bar bottom and next label
```

- [ ] **Step 2: Verify build still compiles**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build
```

Expected: build succeeds (no new errors — old code that still references `BAR_W`/`BAR_H` will just use the new values, which is fine for now).

- [ ] **Step 3: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "refactor: expand UIScene layout constants for larger HUD"
```

---

## Task 2: Rebuild top-left panel (HP, JP, Nanoheal rows)

**Files:**
- Modify: `src/scenes/UIScene.ts` — `create()` lines 71–117, field declarations lines 12–32, event handlers

This task replaces the cramped top-left bars with a dark panel container holding three rows at consistent spacing. Also removes the old `hud-bracket` image for the left side.

- [ ] **Step 1: Add two new private fields to the class**

In the field declarations block (around line 12), add after `private naniteActive = false;`:

```typescript
private healthValueText!: Phaser.GameObjects.Text;
```

- [ ] **Step 2: Replace the HP / JP / Nanoheal section in `create()`**

Remove lines 71–117 (from `// ── Health bar (top-left)` through the end of the Nanoheal block, including the `hud-bracket` image call on line 81). Replace with:

```typescript
// ── LEFT STAT PANEL (top-left) ────────────────────────────────
// Vertical rhythm — same offsets reused by the right panel
const panelX = PAD;                               // 12
const barX   = panelX + PP;                       // 22

const r0LblY = PAD + PP;                          // 22  — row 0 label (HP / MSL)
const r0BarY = r0LblY + LABEL_H;                  // 38  — row 0 bar
const r1LblY = r0BarY + BAR_H + ROW_GAP;          // 60  — row 1 label (JP / TRT)
const r1BarY = r1LblY + LABEL_H;                  // 76  — row 1 bar
const r2LblY = r1BarY + BAR_H2 + ROW_GAP;         // 94  — row 2 label (Nanoheal)
const r2BarY = r2LblY + LABEL_H;                  // 110 — row 2 bar

const panelW = PP + BAR_W + PP;                   // 220
const panelH = r2BarY + BAR_H2 + PP - PAD;        // 118

const leftPanel = this.add.graphics();
leftPanel.fillStyle(0x000812, 0.85);
leftPanel.fillRect(panelX, PAD, panelW, panelH);
leftPanel.lineStyle(1, 0x1a3d5a, 0.8);
leftPanel.strokeRect(panelX, PAD, panelW, panelH);

// HP row
this.healthLabel = this.add.text(barX, r0LblY, 'HP', {
  fontFamily: 'monospace', fontSize: '13px', color: '#ff4444',
});
this.healthValueText = this.add.text(barX + BAR_W, r0LblY, '', {
  fontFamily: 'monospace', fontSize: '11px', color: '#ff4444',
}).setOrigin(1, 0);
this.healthBg   = this.add.rectangle(barX, r0BarY, BAR_W, BAR_H, 0x330000).setOrigin(0, 0);
this.healthFill = this.add.rectangle(barX, r0BarY, BAR_W, BAR_H, 0xff2222).setOrigin(0, 0);

// JP row
this.add.text(barX, r1LblY, 'JETPACK', {
  fontFamily: 'monospace', fontSize: '13px', color: '#44aaff',
});
this.add.rectangle(barX, r1BarY, BAR_W, BAR_H2, 0x001133).setOrigin(0, 0);
this.jetpackBar = this.add.rectangle(barX, r1BarY, BAR_W, BAR_H2, 0x2299ff).setOrigin(0, 0);

// Nanoheal row
this.naniteLabel = this.add.text(barX, r2LblY, 'NANOHEAL', {
  fontFamily: 'monospace', fontSize: '13px', color: '#00cc66',
});
this.naniteBg  = this.add.rectangle(barX, r2BarY, BAR_W, BAR_H2, 0x001a0d).setOrigin(0, 0);
this.naniteBar = this.add.rectangle(barX, r2BarY, BAR_W, BAR_H2, 0x00ff88).setOrigin(0, 0);
```

Note: `r0LblY`…`panelH` are `const` declarations inside `create()`. The right-panel task (Task 4) will reference them, so they must be declared before the right-panel block. `panelX` and `barX` are also used in Task 3 for SUIT positioning — keep them in scope.

- [ ] **Step 3: Update the `healthChange` event handler**

Find the handler (around line 181). Update it to also set the value text and use `BAR_H` (already correct after constants change). Replace the handler body:

```typescript
game.events.on('healthChange', (hp: number, maxHp: number) => {
  this.healthFill.setDisplaySize(BAR_W * (hp / maxHp), BAR_H);
  this.healthValueText.setText(`${hp} / ${maxHp}`);
  if (!this.naniteActive) {
    const t = hp / maxHp;
    this.healthFill.setFillStyle(t > 0.5 ? 0xff2222 : t > 0.25 ? 0xff8800 : 0xff0000);
  }
  if (hp < this.lastHp) {
    this.cameras.main.flash(200, 220, 30, 30, false);
  }
  this.lastHp = hp;
});
```

- [ ] **Step 4: Update the `jetpackFuel` event handler — replace hardcoded `6` with `BAR_H2`**

```typescript
game.events.on('jetpackFuel', (fuel: number, max: number) => {
  this.jetpackBar.setDisplaySize(BAR_W * (fuel / max), BAR_H2);
});
```

- [ ] **Step 5: Update `onNaniteChange` — replace all hardcoded `6` with `BAR_H2`**

The method is at the bottom of the file (~line 426). Change every `setDisplaySize(…, 6)` call to `setDisplaySize(…, BAR_H2)`:

```typescript
// state === 'active':
this.naniteBar.setDisplaySize(BAR_W, BAR_H2);

// state === 'cooldown':
this.naniteBar.setDisplaySize(BAR_W * progress, BAR_H2);

// state === 'ready':
this.naniteBar.setDisplaySize(BAR_W, BAR_H2);
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: rebuild top-left stat panel — wider bars, panel bg, HP value text"
```

---

## Task 3: Reposition SUIT / Pilot pip below the left panel

**Files:**
- Modify: `src/scenes/UIScene.ts` — `create()` SUIT/Pilot pip section and `update()`

The SUIT bar and Pilot pip previously used coordinates relative to the old `sy`/`jy` layout. They now position themselves just below the bottom edge of the left panel (`PAD + panelH`).

- [ ] **Step 1: Replace the SUIT / Pilot pip section in `create()`**

Remove the old SUIT/Pilot pip block (the one that starts with `// ── SUIT jetpack bar (pilot; hidden until ejected)`). Replace with:

```typescript
// ── SUIT jetpack bar / Pilot pip (below left panel, hidden until ejected) ──
const panelBotY = PAD + panelH;    // 130 — bottom edge of left panel
const sy = panelBotY + 8;          // 138 — first row below panel

this.suitLabel = this.add.text(barX, sy, 'SUIT', {
  fontFamily: 'monospace', fontSize: '13px', color: '#aaffaa',
}).setVisible(false);
this.suitBg = this.add.rectangle(barX, sy + LABEL_H, BAR_W, BAR_H2, 0x001100)
  .setOrigin(0, 0).setVisible(false);
this.suitBar = this.add.rectangle(barX, sy + LABEL_H, BAR_W, BAR_H2, 0x44ff44)
  .setOrigin(0, 0).setVisible(false);

const pipY = sy + LABEL_H + BAR_H2 + 6;
this.pilotPip = this.add.rectangle(barX, pipY, 6, 6, 0xff4444)
  .setOrigin(0, 0).setVisible(false);
this.pilotPipLabel = this.add.text(barX + 10, pipY - 2, 'PILOT', {
  fontFamily: 'monospace', fontSize: '12px', color: '#ff4444',
}).setVisible(false);
```

- [ ] **Step 2: Update `suitBar.setDisplaySize` in `update()` — replace hardcoded `6` with `BAR_H2`**

Find the line in `update()` (around line 374):
```typescript
this.suitBar.setDisplaySize(BAR_W * (game.pilot!.jetpackFuel / PILOT_JETPACK_MAX_FUEL), 6);
```

Replace with:
```typescript
this.suitBar.setDisplaySize(BAR_W * (game.pilot!.jetpackFuel / PILOT_JETPACK_MAX_FUEL), BAR_H2);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: reposition SUIT/pilot pip below new left panel"
```

---

## Task 4: Rebuild top-right panel (MSL, TRT rows)

**Files:**
- Modify: `src/scenes/UIScene.ts` — `create()` lines ~118–139, field declarations, event handlers, `update()`

Mirrors the left panel. Adds a `missileStateLabel` text object that shows "READY" / "recharging". Removes old `hud-bracket` images on the right.

- [ ] **Step 1: Add `missileStateLabel` to the class field declarations**

```typescript
private missileStateLabel!: Phaser.GameObjects.Text;
```

- [ ] **Step 2: Replace the MSL / TRT section in `create()`**

Remove the old MSL block (from `// ── Missile cooldown bar (top-right)` through the end of the TRT block, including both `hud-bracket` image calls). Replace with:

```typescript
// ── RIGHT STAT PANEL (top-right) ──────────────────────────────
// Reuses r0LblY, r0BarY, r1LblY, r1BarY from the left-panel block above
const panelRX     = W - PAD - panelW;             // 1688
const barRX       = panelRX + PP;                 // 1698
const rightPanelH = r1BarY + BAR_H2 + PP - PAD;  // 84  (2 rows: MSL + TRT)

const rightPanel = this.add.graphics();
rightPanel.fillStyle(0x000812, 0.85);
rightPanel.fillRect(panelRX, PAD, panelW, rightPanelH);
rightPanel.lineStyle(1, 0x1a3d5a, 0.8);
rightPanel.strokeRect(panelRX, PAD, panelW, rightPanelH);

// MSL row
this.missileLabel = this.add.text(barRX, r0LblY, 'MISSILE', {
  fontFamily: 'monospace', fontSize: '13px', color: '#ffff44',
});
this.missileStateLabel = this.add.text(barRX + BAR_W, r0LblY, 'READY', {
  fontFamily: 'monospace', fontSize: '11px', color: '#00ffff',
}).setOrigin(1, 0);
this.missileBg  = this.add.rectangle(barRX, r0BarY, BAR_W, BAR_H, 0x333300).setOrigin(0, 0);
this.missileBar = this.add.rectangle(barRX, r0BarY, BAR_W, BAR_H, 0xffff00).setOrigin(0, 0);

// TRT row
this.turretLabel = this.add.text(barRX, r1LblY, 'TURRET', {
  fontFamily: 'monospace', fontSize: '13px', color: '#ff8844',
});
this.turretBg  = this.add.rectangle(barRX, r1BarY, BAR_W, BAR_H2, 0x331100).setOrigin(0, 0);
this.turretBar = this.add.rectangle(barRX, r1BarY, BAR_W, BAR_H2, 0xff6600).setOrigin(0, 0);
```

- [ ] **Step 3: Update the `missileCooldown` event handler**

```typescript
game.events.on('missileCooldown', (progress: number) => {
  this.missileBar.setDisplaySize(BAR_W * progress, BAR_H);
  if (progress >= 1) {
    this.missileBar.setFillStyle(0x00ffff);
    this.missileLabel.setColor('#00ffff');
    this.missileStateLabel.setText('READY').setColor('#00ffff');
  } else {
    this.missileBar.setFillStyle(0xffff00);
    this.missileLabel.setColor('#888844');
    this.missileStateLabel.setText('recharging').setColor('#554400');
  }
});
```

- [ ] **Step 4: Update the `turretCooldown` event handler — replace hardcoded `6` with `BAR_H2`**

```typescript
game.events.on('turretCooldown', (progress: number) => {
  this.turretBar.setDisplaySize(BAR_W * progress, BAR_H2);
  if (progress >= 1) {
    this.turretBar.setFillStyle(0xff8844);
    this.turretLabel.setColor('#ff8844');
  } else {
    this.turretBar.setFillStyle(0x663311);
    this.turretLabel.setColor('#664422');
  }
});
```

- [ ] **Step 5: Add `missileStateLabel` to the weapon alpha logic in `update()`**

Find the weapon alpha block (~line 380). Add the new field:

```typescript
const weaponAlpha = pilotActive ? 0.3 : 1.0;
this.missileBar.setAlpha(weaponAlpha);
this.missileBg.setAlpha(weaponAlpha);
this.missileLabel.setAlpha(weaponAlpha);
this.missileStateLabel.setAlpha(weaponAlpha);
this.turretBar.setAlpha(weaponAlpha);
this.turretBg.setAlpha(weaponAlpha);
this.turretLabel.setAlpha(weaponAlpha);
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: rebuild top-right panel — wider bars, panel bg, READY state label"
```

---

## Task 5: Update top-center spacing and controls hint font size

**Files:**
- Modify: `src/scenes/UIScene.ts` — `create()` lines ~141–162

Small targeted changes — score font up to 28px, more gap between center items, controls hint font up to 18px.

- [ ] **Step 1: Replace the score / wave / drones section in `create()`**

Find and replace the block from `// ── Score (top-center)` through `dronesRemainingText`:

```typescript
// ── Score (top-center) ────────────────────────────────────────
this.scoreText = this.add.text(W / 2, PAD, '0', {
  fontFamily: 'monospace', fontSize: '28px', color: '#ffffff',
  align: 'center',
}).setOrigin(0.5, 0);

// ── Persistent wave counter (below score) ─────────────────────
this.waveCounter = this.add.text(W / 2, PAD + 32, '', {
  fontFamily: 'monospace', fontSize: '12px', color: '#666688',
  align: 'center',
}).setOrigin(0.5, 0);

// ── Drones remaining counter (below wave counter) ──────────────
this.dronesRemainingText = this.add.text(W / 2, PAD + 52, '', {
  fontFamily: 'monospace', fontSize: '13px', color: '#ff4444',
  align: 'center',
}).setOrigin(0.5, 0).setAlpha(0);
```

- [ ] **Step 2: Replace the controls hint line**

Find `// ── Controls hint (bottom-left)` and update the font size:

```typescript
// ── Controls hint (bottom-left) ───────────────────────────────
this.add.text(PAD, H - PAD, 'A/D move  SPACE jump/jetpack  LMB turret  RMB rapid  SHIFT missile  ESC pause', {
  fontFamily: 'monospace', fontSize: '18px', color: '#556677',
}).setOrigin(0, 1);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all existing tests pass (no UI logic was changed).

- [ ] **Step 5: Manual playtest**

Run `npm run dev`, open the game, and verify:
- Left panel visible at top-left with HP/JETPACK/NANOHEAL rows separated by clear gaps
- Right panel visible at top-right with MISSILE/TURRET rows
- Score is noticeably larger at top-center; WAVE and drones-remaining have comfortable spacing below it
- Controls hint text is larger at bottom-left
- Eject the pilot: SUIT bar and Pilot pip appear below the left panel without clipping
- Fire missile: READY → recharging label updates correctly
- Nanite heal: bar pulses green correctly
- Game over / level complete overlays still render correctly over the HUD

- [ ] **Step 6: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: larger score text and controls hint, more spacing in top-center"
```
