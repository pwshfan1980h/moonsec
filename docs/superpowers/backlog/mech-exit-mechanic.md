# Backlog: Mech Exit — Pilot On Foot

**Inspiration:** MetalWarriors (SNES) — player could eject from the mech and run around as a tiny pilot with a personal jetpack. Could enter other mechs or reach areas/buttons inaccessible while piloted.

---

## Concept

Press a key (e.g. **E**) to eject the pilot from the mech. The mech stays in place (idle, invulnerable while empty). The pilot — a tiny human sprite — drops out and can:

- Run (slowly) and jump (low)
- Use a personal jetpack (very limited fuel, much weaker than mech)
- Re-enter the mech by walking up to it and pressing E again
- Die in one hit from any drone bullet (fragile — creates tension)
- Pass through narrow gaps the mech cannot (future: button areas, vents)

The mech while empty: stationary, no collision with bullets (or minimal HP buffer), visible as a distinct idle state.

---

## LOE Breakdown

### New assets needed
- Pilot sprite: tiny humanoid (~16×24px), walk/run/jump/jetpack animations (~2 frames each is fine for pixel art)
- OR: procedural — draw the pilot as a simple rectangle + helmet circle in BootScene (no external asset)

### New entities
- `Pilot` class (extends `Phaser.Physics.Arcade.Sprite` or simple `Image`)
  - Walk/run/jump physics (same arcade pattern as Player)
  - Personal jetpack (much weaker: JETPACK_FORCE ~-400, fuel 800ms)
  - `hp = 1` — one-shot death triggers game over (or respawn in mech if mech is alive)
  - Tiny collision body (~10×20px world)

### Changes to existing code
- `Player.ts` — add `eject()` / `reenter()` methods, track `piloting: boolean` state
  - While not piloting: mech freezes in place, disable input, play idle anim
  - On eject: spawn `Pilot` at mech position, transfer control
  - On reenter: destroy `Pilot`, restore mech control
- `GameScene.ts` — hold reference to active `Pilot | null`, add collider for pilot vs ground+platforms, overlap for droneBullets vs pilot
- `DroneSpawner` / `Drone` — drones should target pilot when ejected (nearest of mech/pilot)
- `UIScene` — show pilot HP (1 pip), hide mech weapon cooldowns while ejected, show pilot jetpack bar
- Radar minimap — show pilot as a different dot color when ejected

### Design decisions (resolved)
1. **Empty mech takes no damage** — mech just goes dark/idle while unoccupied, invulnerable
2. **Pilot death = game over** — being a tiny squishy human is intentionally risky; mechanic is for moments of safety
3. **Drones retarget pilot** when ejected — adds urgency, player must judge when it's safe to eject
4. Can the pilot pick up power-ups / press buttons? (future scope — button areas don't exist yet)
5. Should ejection be instant or have an animation (hatch opening)? (TBD in spec)

---

## Rough LOE

| Component | Effort |
|-----------|--------|
| Pilot sprite (procedural, no external asset) | 0.5h |
| `Pilot` entity class (physics, jetpack, death) | 3–4h |
| Player eject/reenter state machine | 2–3h |
| GameScene wiring (colliders, drone targeting) | 2h |
| UIScene HUD updates | 1h |
| Radar minimap pilot blip | 0.5h |
| Drone targeting pilot when ejected | 1–2h |
| **Total estimate** | **~10–13h** |

**Complexity drivers:** The eject/reenter state machine needs to be clean (what if the pilot dies mid-eject? what if the mech is destroyed while pilot is out?). Drone targeting needs to switch focus. These are the hardest parts.

**Phasing suggestion:** Implement in two passes —
1. **Pass 1 (~6h):** Eject/reenter, pilot movement, pilot dies = game over, mech idles
2. **Pass 2 (~5h):** Empty mech takes damage, drone retargeting, button-area hooks

---

## Status

Implemented — see `docs/superpowers/specs/2026-03-22-mech-exit-design.md` and `docs/superpowers/plans/2026-03-22-mech-exit.md`.
