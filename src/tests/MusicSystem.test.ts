import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMBAT_THRESHOLD, MusicSystem, musicIntensityForWave } from '../systems/MusicSystem';
import { MUSIC_TRACKS } from '../systems/audioAssets';

class FakeAudio {
  static made: FakeAudio[] = [];
  loop = false;
  preload = '';
  volume = 0;
  muted = false;
  paused = true;
  currentTime = 0;
  constructor(public src: string) { FakeAudio.made.push(this); }
  canPlayType(): string { return 'probably'; }
  play(): Promise<void> { this.paused = false; return Promise.resolve(); }
  pause(): void { this.paused = true; }
  load(): void {}
  removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
}

const sound = { mute: false } as never as Phaser.Sound.BaseSoundManager;
const track = (file: string) => FakeAudio.made.find((a) => a.src?.endsWith(`/${file}.ogg`))!;

function setup(): void {
  vi.useFakeTimers();
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('window', Object.assign(globalThis, { addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('music arrangement', () => {
  it('gives every mission a calm, combat and boss track', () => {
    expect(Object.keys(MUSIC_TRACKS)).toHaveLength(5);
    for (const t of Object.values(MUSIC_TRACKS)) {
      expect(new Set([t.explore, t.combat, t.boss]).size).toBe(3);
    }
  });

  it('ramps normal-wave intensity monotonically, every wave reaching the combat layer', () => {
    const intensities = [1, 2, 3, 4, 5].map(wave => musicIntensityForWave(wave, 5));
    expect(intensities).toEqual([0.22, 0.36, 0.5, 0.64, 0.78]);
    expect(intensities.every((i) => i >= COMBAT_THRESHOLD)).toBe(true);
    expect(musicIntensityForWave(-10, 5)).toBe(0.22);
    expect(musicIntensityForWave(99, 5)).toBe(0.78);
  });
});

describe('MusicSystem streaming', () => {
  it('starts calm, crossfades to combat and boss, and ducks under radio', () => {
    setup();
    const music = MusicSystem.forTheme(sound, 'surface');
    music.start(0.5);
    vi.advanceTimersByTime(3000);
    const explore = track('surface-explore'), combat = track('surface-combat'), boss = track('boss');
    expect(explore.loop).toBe(true);
    expect(explore.volume).toBeCloseTo(0.5);
    expect(combat.paused).toBe(true);

    music.setIntensity(0.5);
    vi.advanceTimersByTime(3000);
    expect(music.layer).toBe('combat');
    expect(combat.volume).toBeCloseTo(0.5);
    expect(explore.volume).toBe(0);
    expect(explore.paused).toBe(true); // silent layers stop streaming

    music.setDucked(true);
    vi.advanceTimersByTime(1000);
    expect(combat.volume).toBeLessThan(0.25);
    music.setDucked(false);

    music.setBossMode();
    music.setIntensity(0); // the boss track holds until the mission ends
    vi.advanceTimersByTime(3000);
    expect(music.layer).toBe('boss');
    expect(boss.volume).toBeCloseTo(0.5);
    music.destroy();
  });

  it('follows the global mute and plays a one-shot sting over fading loops', () => {
    setup();
    const muted = { mute: true } as never as Phaser.Sound.BaseSoundManager;
    const music = MusicSystem.forTheme(muted, 'orbital');
    music.start();
    vi.advanceTimersByTime(100);
    expect(track('orbital-explore').muted).toBe(true);
    music.playSting('victory');
    vi.advanceTimersByTime(3000);
    expect(track('victory').loop).toBe(false);
    expect(track('victory').paused).toBe(false);
    expect(track('orbital-explore').volume).toBe(0);
    music.destroy();
  });

  it('releases its streams on destroy, even before start', () => {
    setup();
    MusicSystem.title(sound).destroy();
    const music = MusicSystem.forTheme(sound, 'nexus-core');
    music.start();
    music.destroy();
    vi.advanceTimersByTime(1000);
    expect(FakeAudio.made.filter((a) => a.src !== undefined).every((a) => a.src === '' && a.paused)).toBe(true);
  });
});
