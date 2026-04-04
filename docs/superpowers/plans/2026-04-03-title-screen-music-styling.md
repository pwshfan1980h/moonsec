# Title Screen Music & Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a looping OGG music track to the title screen and restyle it to match the red/grey mech4 colour palette.

**Architecture:** Copy the audio file into `public/audio/`, load it in BootScene alongside other sounds, play it looping in TitleScene with a fade-in, and let it bleed through scene transitions — receiving scenes fade it out over 800ms. Visual changes are confined to the SVG logo gradient and two colour constants in TitleScene.

**Tech Stack:** Phaser 3 (`this.sound` global SoundManager, `this.tweens`), SVG, TypeScript

---

## Files

| File | Action |
|---|---|
| `public/audio/music-title.ogg` | Create — copy from source |
| `public/assets/logo.svg` | Modify — swap gradient bottom stop |
| `src/scenes/BootScene.ts` | Modify — add audio load |
| `src/scenes/TitleScene.ts` | Modify — music playback, mech watermark, accent colour |
| `src/scenes/GameScene.ts` | Modify — fade out title music on create |
| `src/scenes/StoryScene.ts` | Modify — fade out title music on create |
| `src/scenes/UpgradeTreeScene.ts` | Modify — fade out title music on create |

---

### Task 1: Copy audio file and register it in BootScene

**Files:**
- Create: `public/audio/music-title.ogg`
- Modify: `src/scenes/BootScene.ts`

- [ ] **Step 1: Copy the OGG file**

```bash
cp "/Users/devwm8/Projects/assets/audio/music-loops/Sketchbook 2025-12-11_BREAKDOWN.ogg" \
   /Users/devwm8/Projects/moonsec/public/audio/music-title.ogg
```

Verify it landed:
```bash
ls -lh /Users/devwm8/Projects/moonsec/public/audio/music-title.ogg
```

- [ ] **Step 2: Load it in BootScene**

In `src/scenes/BootScene.ts`, after the `for` loop that loads the WAV sound effects (after line 33), add:

```ts
    // Title screen music loop
    this.load.audio('music-title', 'audio/music-title.ogg');
```

- [ ] **Step 3: Verify build compiles**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add public/audio/music-title.ogg src/scenes/BootScene.ts
git commit -m "feat: add title music asset and load in BootScene"
```

---

### Task 2: Play title music in TitleScene with fade-in

**Files:**
- Modify: `src/scenes/TitleScene.ts`

- [ ] **Step 1: Add the `titleMusic` property**

In `src/scenes/TitleScene.ts`, add a private field to the class (after the existing private fields around line 10-14):

```ts
  private titleMusic: Phaser.Sound.WebAudioSound | null = null;
```

- [ ] **Step 2: Start music in `create()`**

At the end of `create()` in `src/scenes/TitleScene.ts`, before the closing brace (after the fade-in tween, around line 109), add:

```ts
    // Title music — guard against restart when returning from sub-scenes
    const existing = this.sound.getAll('music-title') as Phaser.Sound.WebAudioSound[];
    if (!existing.some(s => s.isPlaying)) {
      this.titleMusic = this.sound.add('music-title', { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
      this.titleMusic.play();
      this.tweens.add({
        targets: this.titleMusic,
        volume: 0.6,
        duration: 1500,
        ease: 'Linear',
      });
    } else {
      this.titleMusic = existing[0];
    }
```

- [ ] **Step 3: Verify build compiles**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Open the game in the browser. Navigate to the title screen. Confirm:
- Music begins playing within ~1.5s of the title screen appearing
- Music loops without a gap
- Navigating to SELECT LEVEL (sub-menu) and back does NOT restart the track

- [ ] **Step 5: Commit**

```bash
git add src/scenes/TitleScene.ts
git commit -m "feat: title screen music — looping OGG with fade-in"
```

---

### Task 3: Music bleed — receiving scenes fade out title track

**Files:**
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/scenes/StoryScene.ts`
- Modify: `src/scenes/UpgradeTreeScene.ts`

The fade-out snippet is the same in all three. Add it at the **top of each scene's `create()` method**, before any other setup.

- [ ] **Step 1: Add fade-out to GameScene**

At the top of `create()` in `src/scenes/GameScene.ts` (line 58, right after the opening brace):

```ts
    // Fade out title music if it carried through the transition
    for (const m of this.sound.getAll('music-title') as Phaser.Sound.WebAudioSound[]) {
      if (m.isPlaying) {
        this.tweens.add({ targets: m, volume: 0, duration: 800, ease: 'Linear',
          onComplete: () => m.stop() });
      }
    }
```

- [ ] **Step 2: Add fade-out to StoryScene**

At the top of `create()` in `src/scenes/StoryScene.ts` (line 34, right after the opening brace):

```ts
    // Fade out title music if it carried through the transition
    for (const m of this.sound.getAll('music-title') as Phaser.Sound.WebAudioSound[]) {
      if (m.isPlaying) {
        this.tweens.add({ targets: m, volume: 0, duration: 800, ease: 'Linear',
          onComplete: () => m.stop() });
      }
    }
```

- [ ] **Step 3: Add fade-out to UpgradeTreeScene**

At the top of `create()` in `src/scenes/UpgradeTreeScene.ts` (line 34, right after the opening brace):

```ts
    // Fade out title music if it carried through the transition
    for (const m of this.sound.getAll('music-title') as Phaser.Sound.WebAudioSound[]) {
      if (m.isPlaying) {
        this.tweens.add({ targets: m, volume: 0, duration: 800, ease: 'Linear',
          onComplete: () => m.stop() });
      }
    }
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /Users/devwm8/Projects/moonsec && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Manual smoke test**

Start game, go to title. Confirm music plays. Then:
- Start game → music should fade out over ~800ms while game audio starts
- Return to title (die / level complete) → music should resume
- Go to Story → music fades out
- Go to Upgrades → music fades out

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts src/scenes/StoryScene.ts src/scenes/UpgradeTreeScene.ts
git commit -m "feat: fade out title music on scene transition (bleed effect)"
```

---

### Task 4: Logo SVG — swap gradient to cyan → red

**Files:**
- Modify: `public/assets/logo.svg`

- [ ] **Step 1: Update the gradient stop**

In `public/assets/logo.svg`, find the linear gradient (lines 11-14). Change the bottom stop from `#0066ff` to `#ff3311`:

```xml
    <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#00ccff" />
      <stop offset="100%" stop-color="#ff3311" />
    </linearGradient>
```

- [ ] **Step 2: Verify visually**

```bash
npm run dev
```

Open the title screen. The MOONSEC logo should graduate from cyan at the top to red-orange at the bottom.

- [ ] **Step 3: Commit**

```bash
git add public/assets/logo.svg
git commit -m "feat: logo gradient cyan-to-red to match mech4 palette"
```

---

### Task 5: TitleScene — swap selected accent from cyan to red

**Files:**
- Modify: `src/scenes/TitleScene.ts`

- [ ] **Step 1: Swap the accent colour in `updateSelection()`**

In `src/scenes/TitleScene.ts`, `updateSelection()` method (around line 156). Change the selected item colour:

```ts
        t.setStyle({ color: '#ff3311', fontSize: '26px' });
```

(Was `'#00ccff'`.)

- [ ] **Step 2: Verify visually**

```bash
npm run dev
```

On the title screen, the highlighted menu item (with `▶  ◀` arrows) should pulse in red-orange instead of cyan. Unselected items remain dark steel-blue.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/TitleScene.ts
git commit -m "feat: title menu selected accent colour cyan → red-orange"
```

---

### Task 6: TitleScene — procedural mech watermark

**Files:**
- Modify: `src/scenes/TitleScene.ts`

- [ ] **Step 1: Draw the silhouette in `create()`**

In `src/scenes/TitleScene.ts`, in `create()`, after the two `this.add.image(...)` star layer calls (around line 51), add:

```ts
    // Mech4 silhouette watermark — procedural rectangles, depth 1.5
    {
      const cx = W / 2;
      const s  = H * 0.42;      // scale: ~226px tall for 540px height
      const gy = H * 0.75;      // Y position of feet

      const wm = this.add.graphics().setDepth(1.5);
      wm.fillStyle(0xff3311, 0.05);

      // Head
      wm.fillRect(cx - s * 0.11, gy - s * 0.96, s * 0.22, s * 0.16);
      // Body (wide shoulders)
      wm.fillRect(cx - s * 0.22, gy - s * 0.78, s * 0.44, s * 0.32);
      // Left arm
      wm.fillRect(cx - s * 0.38, gy - s * 0.76, s * 0.16, s * 0.24);
      // Right arm
      wm.fillRect(cx + s * 0.22, gy - s * 0.76, s * 0.16, s * 0.24);
      // Left leg
      wm.fillRect(cx - s * 0.19, gy - s * 0.44, s * 0.15, s * 0.44);
      // Right leg
      wm.fillRect(cx + s * 0.04, gy - s * 0.44, s * 0.15, s * 0.44);
    }
```

- [ ] **Step 2: Verify visually**

```bash
npm run dev
```

On the title screen, a large faint red mech silhouette should be barely visible behind the stars and menu. If it's too prominent, lower alpha from `0.05` to `0.04`. If it's invisible, raise to `0.06`.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/TitleScene.ts
git commit -m "feat: faint mech4 silhouette watermark on title screen"
```
