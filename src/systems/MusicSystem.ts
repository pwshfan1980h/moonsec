// Static ElevenLabs score, streamed through <audio> elements so a level's 70–90 s tracks are never
// decoded whole into memory. Each mission theme has a calm layer, a combat layer and a boss track;
// the system crossfades between them (restarting the incoming track from its top so it enters on a
// downbeat), ducks under radio calls, and follows Phaser's global mute.

import type Phaser from 'phaser';
import type { MusicTheme } from '../data/levelConfigs';
import { MUSIC_TRACKS, TITLE_TRACK } from './audioAssets';

export type MusicLayer = 'explore' | 'combat' | 'boss';
export type MusicSting = 'victory' | 'defeat';

/** Wave progress → arrangement intensity; anything at or above COMBAT_THRESHOLD plays the combat layer. */
export function musicIntensityForWave(wave: number, waveCount: number): number {
  if (waveCount <= 1) return 0.78;
  const progress = Math.max(0, Math.min(1, (wave - 1) / (waveCount - 1)));
  return 0.22 + progress * 0.56;
}
export const COMBAT_THRESHOLD = 0.2;

const TICK_MS = 50;
const CROSSFADE_S = 2.5;
const DUCK_LEVEL = 0.38;

let ext: 'ogg' | 'm4a' | undefined;
function trackUrl(file: string): string {
  ext ??= typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
  return `audio/music/${file}.${ext}`;
}

/** One looping (or one-shot) stream with its own fade target. */
class Stream {
  readonly el: HTMLAudioElement;
  level = 0;
  target = 0;
  constructor(file: string, loop: boolean) {
    this.el = new Audio(trackUrl(file));
    this.el.loop = loop;
    this.el.preload = 'auto';
    this.el.volume = 0;
  }
  restart(): void {
    try { this.el.currentTime = 0; } catch { /* not seekable yet */ }
    void this.el.play()?.catch(() => undefined);
  }
  release(): void {
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }
}

export class MusicSystem {
  private readonly layers = new Map<MusicLayer, Stream>();
  private sting?: Stream;
  private active: MusicLayer = 'explore';
  private volume = 0.5;
  private duck = 1;
  private duckTarget = 1;
  private running = false;
  private closed = false;
  private timerId = 0;
  private intensity = 0;
  private readonly retry = () => { if (!this.running) return; for (const s of this.layers.values()) if (s.target > 0 && s.el.paused) void s.el.play()?.catch(() => undefined); };

  constructor(private readonly sound: Phaser.Sound.BaseSoundManager, tracks: Partial<Record<MusicLayer, string>>) {
    for (const [layer, file] of Object.entries(tracks) as [MusicLayer, string][]) this.layers.set(layer, new Stream(file, true));
  }

  static forTheme(sound: Phaser.Sound.BaseSoundManager, theme: MusicTheme): MusicSystem {
    return new MusicSystem(sound, MUSIC_TRACKS[theme]);
  }

  static title(sound: Phaser.Sound.BaseSoundManager): MusicSystem {
    return new MusicSystem(sound, { explore: TITLE_TRACK });
  }

  get layer(): MusicLayer { return this.active; }

  /** Fade the calm layer in. Browsers that block autoplay start it on the first click or key. */
  start(volume = 0.5): void {
    if (this.running || this.closed) return;
    this.running = true;
    this.volume = volume;
    this.switchTo(this.active, true);
    window.addEventListener('pointerdown', this.retry);
    window.addEventListener('keydown', this.retry);
    this.timerId = window.setInterval(() => this.tick(), TICK_MS);
  }

  /** 0..1; at or above COMBAT_THRESHOLD the combat layer plays (unless the boss track has taken over). */
  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
    if (this.active === 'boss') return;
    this.switchTo(this.intensity >= COMBAT_THRESHOLD && this.layers.has('combat') ? 'combat' : 'explore');
  }

  setBossMode(): void {
    if (this.layers.has('boss')) this.switchTo('boss');
  }

  /** Radio calls pull the score down so speech stays intelligible. */
  setDucked(ducked: boolean): void { this.duckTarget = ducked ? DUCK_LEVEL : 1; }

  /** End-of-mission cue: loops fade out under a one-shot sting. */
  playSting(sting: MusicSting): void {
    if (this.closed) return;
    for (const s of this.layers.values()) s.target = 0;
    this.sting?.release();
    this.sting = new Stream(sting, false);
    this.sting.level = this.sting.target = 1;
    this.sting.restart();
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('pointerdown', this.retry);
    window.removeEventListener('keydown', this.retry);
    for (const s of this.layers.values()) s.target = 0;
    if (this.sting) this.sting.target = 0;
    if (!this.running) { this.release(); return; }
    // let the tick loop fade everything out, then free the streams
    window.setTimeout(() => this.release(), 900);
  }

  destroy(): void { this.stop(); }

  private release(): void {
    this.running = false;
    window.clearInterval(this.timerId);
    for (const s of this.layers.values()) s.release();
    this.sting?.release();
  }

  private switchTo(layer: MusicLayer, force = false): void {
    if (!force && layer === this.active) return;
    this.active = layer;
    if (!this.running || this.closed) return;
    for (const [id, s] of this.layers) {
      s.target = id === layer ? 1 : 0;
      if (id === layer && (s.el.paused || s.level <= 0.01)) s.restart();
    }
  }

  private tick(): void {
    const dt = TICK_MS / 1000;
    const step = (from: number, to: number, perSecond: number) => (from < to ? Math.min(to, from + perSecond * dt) : Math.max(to, from - perSecond * dt));
    const fade = this.closed ? 1 / 0.8 : 1 / CROSSFADE_S;
    this.duck = step(this.duck, this.duckTarget, 2.5);
    const muted = this.sound.mute;
    for (const s of [...this.layers.values(), ...(this.sting ? [this.sting] : [])]) {
      s.level = step(s.level, s.target, s === this.sting ? 1 / 0.8 : fade);
      s.el.muted = muted;
      s.el.volume = Math.max(0, Math.min(1, s.level * this.volume * this.duck));
      if (s.level === 0 && s.target === 0 && !s.el.paused) s.el.pause();
    }
  }
}
