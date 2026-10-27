// Static audio rendered by tools/audio/generate.ts. Every file ships as .ogg (Vorbis) and .m4a
// (AAC, for Safari); Phaser's loader picks whichever the browser can decode.

import type Phaser from 'phaser';
import type { MusicTheme } from '../data/levelConfigs';
import { RADIO_LINES, type RadioLineId } from '../data/radioScript';

/** One-shot effects and how many takes each was rendered with (played at random). */
export const SFX_TAKES = {
  rapid: 3, turret: 2, 'missile-launch': 1, 'missile-impact': 1, 'missile-ready': 1, 'dry-fire': 1,
  hit: 3, eject: 2, explosion: 3, hurt: 2, emp: 1, death: 1,
  footstep: 4, servo: 3, jump: 1, surge: 1, 'landing-soft': 1, 'landing-heavy': 1, 'landing-slam': 1,
  'mech-boot': 1, 'nanite-heal': 1, 'nanite-tick': 1,
  'drone-shoot': 2, 'enemy-charge': 1, 'warden-charge': 1, 'warden-shield': 1, pickup: 1, 'relay-online': 1,
  'ui-nav': 1, 'ui-confirm': 1, 'wave-alert': 1, 'boss-alarm': 1, streak: 1, 'radio-on': 1, 'radio-off': 1,
} as const;
export type SfxId = keyof typeof SFX_TAKES;

export const LOOP_IDS = ['jetpack', 'missile', 'missile-reload', 'uplink', 'radio-static'] as const;
export type LoopId = typeof LOOP_IDS[number];

export const AMBIENCE: Record<MusicTheme, string> = {
  surface: 'amb-surface', 'trade-lanes': 'amb-trade-lanes', 'deep-facility': 'amb-deep-facility',
  orbital: 'amb-orbital', 'nexus-core': 'amb-nexus-core',
};

/** Each mission theme has a calm and a combat layer in the same key and tempo, plus a boss track. */
export const MUSIC_TRACKS: Record<MusicTheme, { explore: string; combat: string; boss: string }> = {
  surface: { explore: 'surface-explore', combat: 'surface-combat', boss: 'boss' },
  'trade-lanes': { explore: 'trade-lanes-explore', combat: 'trade-lanes-combat', boss: 'boss' },
  'deep-facility': { explore: 'deep-facility-explore', combat: 'deep-facility-combat', boss: 'boss' },
  orbital: { explore: 'orbital-explore', combat: 'orbital-combat', boss: 'boss' },
  'nexus-core': { explore: 'nexus-core-explore', combat: 'nexus-core-combat', boss: 'boss-final' },
};
export const STINGS = ['victory', 'defeat'] as const;
export const TITLE_TRACK = 'title';

export const sfxKey = (id: string, take?: number) => `sfx:${id}${take ? `-${take}` : ''}`;
export const voKey = (id: RadioLineId) => `vo:${id}`;
export const audioUrls = (dir: 'sfx' | 'vo' | 'music', file: string) => [`audio/${dir}/${file}.ogg`, `audio/${dir}/${file}.m4a`];

/** Every file the game references, as paths under public/ (one entry per format). */
export function allAudioFiles(): string[] {
  const files: string[] = [];
  const add = (dir: 'sfx' | 'vo' | 'music', file: string) => files.push(...audioUrls(dir, file));
  for (const [id, takes] of Object.entries(SFX_TAKES)) {
    if (takes === 1) add('sfx', id); else for (let n = 1; n <= takes; n++) add('sfx', `${id}-${n}`);
  }
  for (const id of [...LOOP_IDS, ...Object.values(AMBIENCE)]) add('sfx', id);
  for (const id of Object.keys(RADIO_LINES)) add('vo', id);
  for (const t of Object.values(MUSIC_TRACKS)) for (const f of Object.values(t)) add('music', f);
  for (const f of [...STINGS, TITLE_TRACK]) add('music', f);
  return [...new Set(files)];
}

/** Queue every effect, loop and ambience bed on a loader (BootScene). */
export function loadSfx(load: Phaser.Loader.LoaderPlugin): void {
  for (const [id, takes] of Object.entries(SFX_TAKES)) {
    if (takes === 1) load.audio(sfxKey(id), audioUrls('sfx', id));
    else for (let n = 1; n <= takes; n++) load.audio(sfxKey(id, n), audioUrls('sfx', `${id}-${n}`));
  }
  for (const id of [...LOOP_IDS, ...Object.values(AMBIENCE)]) load.audio(sfxKey(id), audioUrls('sfx', id));
}

/** Load a voice line on demand; resolves once it can play (immediately when cached). */
export function ensureVoice(scene: Phaser.Scene, id: RadioLineId): Promise<boolean> {
  const key = voKey(id);
  if (scene.cache.audio.exists(key)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (fileKey: string, ok: boolean) => { if (fileKey !== key) return; off(); resolve(ok); };
    const onOk = (k: string) => done(k, true);
    const onErr = (file: Phaser.Loader.File) => done(file.key, false);
    const off = () => { scene.load.off(`filecomplete-audio-${key}`, onOk); scene.load.off('loaderror', onErr); };
    scene.load.once(`filecomplete-audio-${key}`, onOk);
    scene.load.on('loaderror', onErr);
    scene.load.audio(key, audioUrls('vo', id));
    if (!scene.load.isLoading()) scene.load.start();
  });
}
