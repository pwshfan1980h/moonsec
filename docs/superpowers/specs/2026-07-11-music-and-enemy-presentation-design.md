# Music + Enemy Presentation — Design Spec

**Goal:** Replace the short, busy procedural loop and inconsistent enemy effects with a restrained score and a shared visual language that makes threats easier to read.

## Music direction

The current score repeats an eight-step bass pattern, keeps a sustained saw pad running continuously, and changes boss music mainly by adding hats. The result is harmonically static and tiring over a full wave.

The replacement uses a 32-step phrase made from four eight-step bars:

- **Bar A — establish:** bass and atmosphere, minimal percussion.
- **Bar B — answer:** add a small motif.
- **Bar C — pressure:** fuller pulse/percussion when combat intensity permits.
- **Bar D — release:** remove notes and leave space before the loop returns.

Each mission still has its own tempo, root language, and timbre, but all themes share one scheduler and arrangement model. Wave progress controls an intensity value from 0–1. Boss mode raises intensity and changes the phrase; it does not merely play every drum more often.

### Mission identities

- **Surface Ops:** patient industrial march; low D minor; dry kick and radio-like motif.
- **Trade Lanes:** syncopated G minor pulse that suggests forward motion without constant hi-hats.
- **Deep Facility:** sparse B-flat pedal, filtered machinery ticks, long silences.
- **Orbital Station:** suspended E minor fifths, wide stereo signals, almost no conventional drum kit.
- **Nexus Core:** distorted return of the Surface motif with an uneven bass accent and controlled density.

Music stays behind weapon and warning audio. Normal master target is 0.32–0.36, pads are quieter than bass, and high-frequency percussion is deliberately sparse.

## Enemy presentation direction

Enemy presentation follows four readable moments:

1. **Arrival:** a short ground/air projection and fade-in communicates where a unit entered. No camera flash.
2. **Idle identity:** silhouette, tint, and one restrained accent communicate family and role.
3. **Attack intent:** existing gameplay telegraphs use a consistent warm warning color; effects appear near the weapon or target, not over the whole screen.
4. **Damage/death:** a brief white-to-family-color hit flash and a family-colored debris burst. Large enemies retain their staged deaths.

Shared helpers own arrival and hit presentation so individual classes stop implementing slightly different tint timers. The helper must never alter collision bodies, gameplay scale, AI state, or damage timing.

### Family palette

| Role | Accent | Visual cue |
|---|---|---|
| Standard aerial | red | compact arrival ring |
| Sniper/control | cyan | narrow crosshair brackets |
| Bomber | orange | wide downward projection |
| Carrier/swarm | amber | segmented ring |
| Heavy/PPC | violet | slow double ring |
| Shielded ground | blue | shield arc plus low arrival line |
| Mine | red only when armed | no bright idle warning |
| Boss | variant color | staged entrance, no generic spawn flash |

## Acceptance criteria

- Music phrases do not audibly reset every eight steps.
- Every level has a distinct arrangement at equal volume.
- Wave intensity changes are gradual and boss mode changes notes/rhythm, not only density.
- Enemy arrival effects do not change physics scale or hitboxes.
- Common enemies use one shared hit-flash implementation.
- Telegraph red/orange is reserved for imminent damage; idle enemies do not constantly pulse warning colors.
- Presentation effects clean themselves up on scene restart.
