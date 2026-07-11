# Music + Enemy Presentation — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-11-music-and-enemy-presentation-design.md`

## Task 1: Replace the music data model

- [ ] Replace eight-step `bass`/`lead` theme data with four-bar bass, motif, chord, and percussion patterns.
- [ ] Keep one look-ahead scheduler and schedule a 32-step phrase without allocating persistent nodes per note.
- [ ] Reduce continuous pad gain and normal master volume.
- [ ] Add `setIntensity(0..1)` with a short ramp; use intensity to reveal arrangement layers.
- [ ] Make boss mode select boss accents/patterns rather than blindly adding hi-hats.
- [ ] Preserve `start()`, `stop()`, `destroy()`, and suspended-context behavior.

## Task 2: Drive music from wave state

- [ ] Set low intensity on mission start.
- [ ] Increase intensity across normal waves.
- [ ] Switch to boss mode on the boss wave.
- [ ] Avoid restarting the AudioContext or phrase between waves.
- [ ] Verify scene restart closes the old context and creates one score instance.

## Task 3: Add shared enemy presentation helpers

- [ ] Create `src/entities/effects/enemyPresentation.ts`.
- [ ] Implement arrival projection variants using Graphics/tweens only.
- [ ] Implement a standard hit flash that restores the family's base tint safely.
- [ ] Implement a small family-colored debris accent for normal deaths.
- [ ] Ensure every temporary object is destroyed by its completion callback.

## Task 4: Adopt helpers by enemy family

- [ ] Standard drones and sniper/control variants.
- [ ] Bomber.
- [ ] Carrier and swarmlings.
- [ ] PPC platform.
- [ ] Shielded tank without replacing its shield-break effect.
- [ ] Mine arrival only; retain its armed-state warning.
- [ ] Leave Nexus boss staged presentation separate.
- [ ] Remove replaced tint timers and duplicated arrival snippets.

## Task 5: Verify

- [ ] Run `npm test` and `npm run build`.
- [ ] Play one normal and one boss wave in at least two missions.
- [ ] Listen for obvious eight-step repetition, clipping, excessive hats, and masked warning SFX.
- [ ] Confirm arrivals and hits remain readable against every mission palette.
- [ ] Restart during active effects and confirm no orphaned Graphics, tweens, timers, or audio contexts remain.
