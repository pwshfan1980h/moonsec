import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMBIENCE, LOOP_IDS, MUSIC_TRACKS, SFX_TAKES, STINGS, TITLE_TRACK, allAudioFiles } from '../systems/audioAssets';
import { MUSIC, SFX } from '../../tools/audio/prompts';
import { RADIO_LINES, SPEAKERS, FIELD_CHATTER, STREAK_REACTIONS } from '../data/radioScript';
import { GLYPHS } from '../ui/font/glyphs';

const PUBLIC = path.resolve(__dirname, '../../public');

describe('generated audio', () => {
  it('ships every referenced file in both formats', () => {
    const missing = allAudioFiles().filter((f) => !existsSync(path.join(PUBLIC, f)));
    expect(missing).toEqual([]);
  });

  it('keeps the game and the generator prompts in step', () => {
    for (const [id, takes] of Object.entries(SFX_TAKES)) expect(SFX[id]?.variants ?? 1, id).toBe(takes);
    for (const id of [...LOOP_IDS, ...Object.values(AMBIENCE)]) expect(SFX[id]?.loop, id).toBe(true);
    const sfxIds = new Set([...Object.keys(SFX_TAKES), ...LOOP_IDS, ...Object.values(AMBIENCE)]);
    expect(Object.keys(SFX).filter((id) => !sfxIds.has(id))).toEqual([]);
    const music = new Set([...Object.values(MUSIC_TRACKS).flatMap((t) => Object.values(t)), ...STINGS, TITLE_TRACK]);
    expect(new Set(Object.keys(MUSIC))).toEqual(music);
  });

  it('writes radio captions the pixel font can render', () => {
    const known = new Set(GLYPHS.map((g) => g.ch));
    for (const [id, line] of Object.entries(RADIO_LINES)) {
      const bad = [...line.caption.toUpperCase()].filter((ch) => !known.has(ch));
      expect(bad, id).toEqual([]);
      expect(SPEAKERS[line.speaker], id).toBeDefined();
    }
    for (const id of [...FIELD_CHATTER, ...STREAK_REACTIONS]) expect(RADIO_LINES[id]).toBeDefined();
  });
});
