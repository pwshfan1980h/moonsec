import { afterEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_THEMES, MusicSystem, musicIntensityForWave } from '../systems/MusicSystem';

class FakeAudioParam {
  value = 0;
  setValueAtTime(value: number): void { this.value = value; }
  linearRampToValueAtTime(value: number): void { this.value = value; }
  exponentialRampToValueAtTime(value: number): void { this.value = value; }
  setTargetAtTime(value: number): void { this.value = value; }
  cancelScheduledValues(): void {}
}

class FakeAudioNode {
  connect(): this { return this; }
  disconnect(): void {}
}

class FakeGain extends FakeAudioNode { gain = new FakeAudioParam(); }
class FakeFilter extends FakeAudioNode { type = ''; frequency = new FakeAudioParam(); }
class FakePanner extends FakeAudioNode { pan = new FakeAudioParam(); }
class FakeOscillator extends FakeAudioNode {
  type = '';
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  start(): void {}
  stop(): void {}
}
class FakeBufferSource extends FakeAudioNode {
  buffer: unknown;
  start(): void {}
  stop(): void {}
}

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'suspended';
  sampleRate = 100;
  destination = new FakeAudioNode();
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createGain(): GainNode { return new FakeGain() as never; }
  createDynamicsCompressor(): DynamicsCompressorNode {
    return Object.assign(new FakeAudioNode(), {
      threshold: new FakeAudioParam(), knee: new FakeAudioParam(), ratio: new FakeAudioParam(),
      attack: new FakeAudioParam(), release: new FakeAudioParam(),
    }) as never;
  }
  createConvolver(): ConvolverNode { return Object.assign(new FakeAudioNode(), { buffer: null }) as never; }
  createBuffer(_channels: number, length: number): AudioBuffer {
    const channels = [new Float32Array(length), new Float32Array(length)];
    return { numberOfChannels: 2, getChannelData: (index: number) => channels[index] } as never;
  }
  createBiquadFilter(): BiquadFilterNode { return new FakeFilter() as never; }
  createOscillator(): OscillatorNode { return new FakeOscillator() as never; }
  createStereoPanner(): StereoPannerNode { return new FakePanner() as never; }
  createBufferSource(): AudioBufferSourceNode { return new FakeBufferSource() as never; }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MusicSystem arrangement data', () => {
  it('defines a complete four-bar phrase for every mission', () => {
    expect(Object.keys(MUSIC_THEMES)).toHaveLength(5);
    for (const theme of Object.values(MUSIC_THEMES)) {
      expect(theme.bass).toHaveLength(32);
      expect(theme.motif).toHaveLength(32);
      expect(theme.bossAccent).toHaveLength(32);
      expect(theme.bossAccent.some(frequency => frequency > 0)).toBe(true);
      expect(theme.bossAccent).not.toEqual(theme.motif);
      expect(theme.chords).toHaveLength(4);
      expect(theme.chords.every(chord => chord.length === 4)).toBe(true);
    }
  });

  it('keeps scheduled pattern steps inside the phrase', () => {
    for (const theme of Object.values(MUSIC_THEMES)) {
      const scheduled = [...theme.kickSteps, ...theme.snareSteps, ...theme.hatSteps];
      expect(scheduled.every(step => Number.isInteger(step) && step >= 0 && step < 32)).toBe(true);
      expect(new Set(theme.kickSteps).size).toBe(theme.kickSteps.length);
      expect(new Set(theme.snareSteps).size).toBe(theme.snareSteps.length);
      expect(new Set(theme.hatSteps).size).toBe(theme.hatSteps.length);
    }
  });

  it('gives every theme musical space and a safe scheduler tempo', () => {
    for (const theme of Object.values(MUSIC_THEMES)) {
      expect(theme.step).toBeGreaterThanOrEqual(0.18);
      expect(theme.step).toBeLessThanOrEqual(0.35);
      expect(theme.space).toBeGreaterThanOrEqual(0.08);
      expect(theme.space).toBeLessThanOrEqual(0.25);
      expect(theme.padFilter).toBeGreaterThan(150);
      expect(theme.padFilter).toBeLessThan(1200);
    }
  });

  it('ramps normal-wave intensity monotonically without exceeding the mix ceiling', () => {
    const intensities = [1, 2, 3, 4, 5].map(wave => musicIntensityForWave(wave, 5));
    expect(intensities).toEqual([0.22, 0.36, 0.5, 0.64, 0.78]);
    expect(musicIntensityForWave(-10, 5)).toBe(0.22);
    expect(musicIntensityForWave(99, 5)).toBe(0.78);
  });

  it('starts, schedules, enters boss mode, and closes its audio context', async () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext();
    function MockAudioContext(): FakeAudioContext { return context; }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('window', globalThis);

    const music = new MusicSystem('surface');
    music.setIntensity(0.5);
    music.start();
    expect(context.resume).toHaveBeenCalledTimes(1);

    music.setBossMode();
    vi.advanceTimersByTime(100);
    music.destroy();
    vi.advanceTimersByTime(1100);
    await Promise.resolve();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('closes its audio context even when destroyed before start', async () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext();
    function MockAudioContext(): FakeAudioContext { return context; }
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('window', globalThis);

    new MusicSystem('orbital').destroy();
    vi.runAllTimers();
    await Promise.resolve();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
