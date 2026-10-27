# Audio

Every sound in Moonsec is a static ElevenLabs render committed under `public/audio/`. The game
never calls ElevenLabs at runtime, and building it never needs an account.

## Layout

| Folder | What | Loaded |
|---|---|---|
| `public/audio/sfx/` | one-shots (multi-take ids end in `-1`, `-2`, ...), effect loops, one ambience bed per mission theme | all at boot (`loadSfx`) |
| `public/audio/vo/` | one file per line in `src/data/radioScript.ts`, radio-band or cockpit processed | training lines at boot, the rest on first use (`ensureVoice`) |
| `public/audio/music/` | title, calm + combat layer per theme, two boss tracks, victory/defeat stings | streamed by `<audio>` elements |

Every file ships as `.ogg` (Vorbis) and `.m4a` (AAC, for Safari). `src/tests/audioAssets.test.ts`
fails if a referenced file is missing, if the generator prompts and the game's id lists drift, or
if a radio caption uses a character the pixel font can't draw.

## Runtime

- **`AudioSystem`** (per Game scene) plays effects through Phaser. Multi-take effects pick a random
  take (never the same twice running) with a little detune, so rapid fire and footfalls don't
  machine-gun one sample. Loops (`jetpack`, `missile`, `uplink`, `radio-static`, ...) fade in/out;
  the mission's ambience bed sits under the music.
- **`MusicSystem`** streams the score. Each theme has a calm (`explore`) and `combat` layer in the
  same key and tempo plus a boss track; switching restarts the incoming track from its top and
  crossfades over 2.5 s. `setIntensity` ≥ `COMBAT_THRESHOLD` selects combat, `setBossMode` holds
  the boss track, `playSting` fades the loops under a one-shot, `setDucked` drops the score under
  radio calls. It follows Phaser's global mute (`M`).
- **`RadioSystem`** queues voiced lines: squelch in, static bed, voice, squelch out, with music and
  ambience ducked. `critical` lines (training, objectives, boss calls) jump the queue; `chatter` is
  dropped if the channel is busy or was used in the last 6 s; a `tag` supersedes stale queued lines
  of the same kind and `interrupt` cuts a stale one on air. The UI panel types the caption out over
  the voice's duration.

### Who says what

| Speaker | Voice | Channel | Used for |
|---|---|---|---|
| LUNAR CONTROL | Sarah | radio | training, objectives, mission briefings |
| PRIORITY | Adam | radio | boss warnings |
| HARROW | River | cockpit | onboard system: boot, armor critical, nanites, uplink, module |
| SURVEY SEVEN / DOCK NINE / HABITAT RING | Chris / Callum / Matilda | radio | field chatter, wave colour, reactions |

Surface Ops is fully talked through: boot → intro → one instruction per training check (re-said
after 25 s idle, at most twice) → completion → contact call per encounter → perimeter clear → relay
online → module installed → Warden call → "core's open" → win. Field chatter fills each leg of
travel once. Campaign nodes 1–4 get a briefing, one line per wave, a boss warning and a win line.

## Regenerating

Requires the `elevenlabs` CLI (`npm i -g @elevenlabs/cli`, `elevenlabs auth login`), `ffmpeg` and
`oggenc` (`brew install ffmpeg vorbis-tools`).

```bash
npm run audio                          # render anything missing (reuses cached downloads)
npm run audio -- --only rapid,tut-intro # re-roll specific ids (spends credits)
npm run audio -- --kind music --reprocess  # re-run ffmpeg on cached downloads only
npm run audio -- --dry-run             # validate every request for free
```

- SFX and music prompts: `tools/audio/prompts.ts`. Voice lines: `src/data/radioScript.ts`
  (`caption` is shown, `say` is spoken, with Eleven v3 audio tags like `[urgent]`).
- Raw downloads are cached in `build/audio_raw/` (ignored). Processing: lead/tail silence trim,
  radio band-pass + crush for transmissions, a short metallic comb for HARROW, peak-normalised
  one-shots, static-gain loops (no step at the seam), music at -16 LUFS with tail→head crossfaded
  loop points.
- Music composes are concurrency-limited per account; the generator runs two at a time.
- The first full render (Oct 2026) used about 34k credits of the Creator plan.
