# Level Redesign — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign both levels for visual quality and gameplay feel: larger help text, proper lunar-surface parallax, Moon Base props (domes/towers/arrays) in L1, rebuild L2 as a surface level with a cold "dark side" palette.

**Architecture:** All changes are isolated to `GameScene.ts` and `UIScene.ts`. L2 is rebuilt using the same infrastructure as L1 (same world dimensions, same prop/platform drawing helpers) with different data and palette. No new scenes or asset files required — everything is procedural via Phaser Graphics.

**Tech Stack:** Phaser 3.80, TypeScript, Vite, procedural Phaser Graphics (no new image assets)

---

## Change 1: Help Text Size + L2 Level Name

**File:** `src/scenes/UIScene.ts`

- `fontSize`: `'9px'` → `'15px'`
- `color`: `'#334455'` → `'#556677'`

No position changes needed — the text is bottom-left anchored with `setOrigin(0, 1)`.

Also update the L2 level name string to match the rebuilt surface layout:
- `'SUBSURFACE'` → `'DARK SIDE'`

---

## Change 2: L1 Parallax — Lunar Surface

**File:** `src/scenes/GameScene.ts` — replace `makeBackground()`

Remove the current two-layer dot-scatter parallax. Replace with three procedural tileSprite layers:

### Layer 1 — Starfield (scroll 0.05×)
- Generate a `GAME_W × GROUND_Y` texture with 400+ white dots at random positions
- Dot size: 1px only (no 2px blobs)
- Alpha: random 0.25–0.55 per dot
- Stored as `bgStars` tileSprite, depth 1

### Layer 2 — Crater terrain silhouette (scroll 0.20×)
- Generate a `GAME_W × 200` texture representing the mid-distance lunar surface
- Draw a filled baseline rect `#0d0d1e` (full width, 200px tall)
- Overlay a terrain silhouette: flat baseline with 6–8 shallow crater arcs cut in using `arc()` in erase/darker color `#070710`
- Craters: radius 30–80px, deterministic positions from hash, along the bottom 80px of the texture
- Stored as `bgTerrain` tileSprite at Y = `GROUND_Y - 160`, depth 2

### Layer 3 — Dust haze (scroll 0.35×)
- Generate a `GAME_W × 120` texture
- Fill with a vertical gradient: `#1a1a2e` at bottom fading to transparent at top (simulate with 8 horizontal rect strips decreasing alpha)
- Stored as `bgHaze` tileSprite at Y = `GROUND_Y - 80`, depth 3

### updateParallax() — update to 3 layers
```ts
private updateParallax(): void {
  const sx = this.cameras.main.scrollX;
  this.bgStars.setTilePosition(sx * 0.05, 0);
  this.bgTerrain.setTilePosition(sx * 0.20, 0);
  this.bgHaze.setTilePosition(sx * 0.35, 0);
}
```

**Field changes:** Replace `bgFar`/`bgNear` fields with:
- `private bgStars!: Phaser.GameObjects.TileSprite`
- `private bgTerrain!: Phaser.GameObjects.TileSprite`
- `private bgHaze?: Phaser.GameObjects.TileSprite` — optional; only assigned in `makeBackground()` (L1), left `undefined` for L2

---

## Change 3: L1 Moon Base Props

**File:** `src/scenes/GameScene.ts` — new `makeBaseProps()` method called from `create()` after `makePlatforms()`

Places purely visual background structures (no physics) across the world. All at **depth 2.5** — above `bgTerrain` (depth 2) and `bgHaze` (depth 3), below platforms (depth 4+) and players (depth 10+). These are world objects (not fixed); they scroll with the camera naturally.

### Prop Type 1: Habitat Domes
**Count:** 8 across the world (X: 300 to 6100, spaced ~700px with hash variation ±200px)

Each dome is drawn with a single Graphics object:
- **Base plate:** filled rect, width = radius×2 + 20, height 12px, color `#1a1a3a`, at ground level (Y = GROUND_Y)
- **Dome shell:** filled semicircle (arc 180°→0°), radius 50–100px (hash), color `#12122e`
- **Panel lines:** 4–6 radial lines from center to rim, `#2a2a50`, lineWidth 1
- **Airlock nub:** small rect 14×18px centered at dome base, `#1e1e44`
- **Inner glow:** smaller filled semicircle at 60% radius, `#0d0d25`, no stroke
- **Window dot:** 4px filled circle at upper-center of dome, `#4488ff` alpha 0.6

**Damaged variant** (1 in 3 domes — determined by hash):
- Skip 1–2 panel line segments (leave gap)
- Add crack: jagged polyline from rim toward center, color `#ff4400`, lineWidth 1, alpha 0.7
- Window dot color: `#ff2200` (damaged, red warning)

### Prop Type 2: Communication Towers
**Count:** 6 across the world (X: 500 to 5800, spaced ~900px with hash variation)

Each tower:
- **Mast:** thin rect 6px wide, height 80–140px (hash), color `#1e2040`, from GROUND_Y upward
- **Dish:** at top — ellipse 28×14px, color `#252545`, plus horizontal line through center `#3a3a60`
- **Support struts:** two lines from 60% up the mast, angled 35° outward to ground, `#1a1a38`, lineWidth 1
- **Base block:** rect 20×10px at ground, `#1e2040`

**Damaged variant** (1 in 2 towers — hash):
- Mast tilted: position the tower Graphics at `(x, GROUND_Y)` and draw the mast upward using `fillRect(-3, -mastHeight, 6, mastHeight)` so that `setAngle(hash * 12 - 6)` (−6° to +6° lean) rotates around the mast base. All other tower elements (dish, struts, base block) are drawn relative to the same Graphics origin.
- Dish replaced with broken stub (shorter ellipse, jagged line)

### Prop Type 3: Solar Array Clusters
**Count:** 5 across the world (X: 400 to 5900, spaced ~1100px with hash variation)

Each cluster: 3–5 panels (count from hash)
- **Panel pole:** rect 4×40px, color `#1a1a38`, from GROUND_Y upward
- **Panel:** rect 32×10px, rotated 30° around the pole top, color `#1a2840`
- **Panel highlight:** 1px line along top edge of panel, `#334466`
- Panels spaced 44px apart horizontally

---

## Change 4: L2 Rebuild as Surface Level

**File:** `src/scenes/GameScene.ts`

### World dimensions
L2 uses identical dimensions to L1:
- World width: `WORLD_WIDTH = 6400`
- World height: `WORLD_HEIGHT = 1080`
- Ground Y: `GROUND_Y = 960`
- Camera bounds: `(0, 0, WORLD_WIDTH, WORLD_HEIGHT)` — fixed, not expandable

### Camera setup
Replace the current L2 camera block:
```ts
// Before (vertical expanding bounds):
this.cameras.main.setBounds(0, 0, GAME_W, this.cameraBoundMaxY);
this.cameras.main.startFollow(this.player, false, 0.10, 0.10);

// After (surface level, same as L1):
this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
this.cameras.main.startFollow(this.player, false, 0.12, 0.08);
```

In the `waveCleared` handler, remove only the L2 camera-expansion lines (keep the upgrade card launch and other wave-complete logic intact):
```ts
// Remove these lines (L2 camera expansion — no longer needed):
if (this.currentLevel === 2) {
  this.cameraBoundMaxY += 480;
  this.cameras.main.setBounds(0, 0, GAME_W, this.cameraBoundMaxY);
}
```
Also remove the `cameraBoundMaxY` field declaration from GameScene.

### Physics world bounds
```ts
// Before:
this.physics.world.setBounds(0, 0, GAME_W, 4800);
// After:
this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
```

### Player spawn Y
Update the L2 branch of the spawn position logic:
```ts
// Before:
const spawnY = this.currentLevel === 2 ? 200 : GROUND_Y - 5;
// After:
const spawnY = GROUND_Y - 5; // same for both levels — L2 is now a surface level
```

### L2 Background — `makeBackgroundL2()`
Replace current green-tinted shaft background with cold dark-side surface:

**Sky:** Rectangle `#010112` (near-black cold blue), full screen, depth 0, scrollFactor 0

**Starfield layer (`bgStars`):** Same generation as L1 but 500+ dots (denser), each dot tinted `#aabbff` (slight cold blue), alpha 0.2–0.45. Scroll 0.05×.

**Terrain silhouette (`bgTerrain`):** More jagged than L1 — craters 40–100px radius, more angular peaks between craters (small triangle protrusions 10–20px tall), baseline color `#080815`. Scroll 0.20×.

**No dust haze layer** — the dark side is harsh, no atmospheric scattering.

### L2 Ground — `makeGroundL2()`
Replace shaft/wall geometry:
- Ground rect: `(WORLD_WIDTH/2, GROUND_Y + GROUND_HEIGHT/2)`, size `(WORLD_WIDTH, GROUND_HEIGHT)`, color `#0d0a20` (deep violet-navy)
- Glow line: Y = `GROUND_Y + 1`, color `#6633cc` (purple), height 2px
- Remove left/right shaft walls entirely

### L2 Platforms
Reuse `makePlatforms()` with new `palette` and `counts` parameters. Update the signature:

```ts
private makePlatforms(
  palette: 'blue' | 'purple' = 'blue',
  counts: { low: number; mid: number; high: number } = { low: 15, mid: 12, high: 8 }
): void
```

L1 call: `makePlatforms()` (defaults). L2 call: `makePlatforms('purple', { low: 18, mid: 15, high: 10 })`.

```ts
// Palette definitions (inside makePlatforms):
const palettes = {
  blue:   { body: '#1c2040', slab: '#12122e', posts: '#2a3a5a', glow: '#7799ff', accent: '#334466', lights: '#ff8800' },
  purple: { body: '#1a0d2e', slab: '#100820', posts: '#2a1a44', glow: '#aa66ff', accent: '#3a2255', lights: '#ff3355' },
};
```

### L2 Props — `makeBaseProps()` with damage level
Reuse `makeBaseProps()` with a `damageLevel: 'low' | 'high'` parameter:
- L1: `damageLevel = 'low'` (1 in 3 domes damaged, 1 in 2 towers damaged)
- L2: `damageLevel = 'high'` (2 in 3 domes damaged, all towers tilted, solar panels 50% missing)

### L2 updateParallax()
L2 uses `bgStars` and `bgTerrain` only (no haze). Add a level check in `updateParallax()`:
```ts
private updateParallax(): void {
  const sx = this.cameras.main.scrollX;
  this.bgStars.setTilePosition(sx * 0.05, 0);
  this.bgTerrain.setTilePosition(sx * 0.20, 0);
  if (this.bgHaze) this.bgHaze.setTilePosition(sx * 0.35, 0);
}
```

---

## Out of Scope

- Animated props (fire/smoke particles on damaged structures)
- Blinking warning lights
- Foreground parallax layer (objects in front of player)
- L2 unique enemy types or boss variants
- Music or ambient audio
- Exit portals or objective markers
