import type { MusicTheme } from '../data/levelConfigs';

export type MusicThemeParams = {
  step: number;
  bass: number[];
  motif: number[];
  bossAccent: number[];
  chords: number[][];
  kickSteps: number[];
  snareSteps: number[];
  hatSteps: number[];
  padFilter: number;
  bassWave: OscillatorType;
  motifWave: OscillatorType;
  space: number;
};

const note = (hz: number, semitones: number) => hz * Math.pow(2, semitones / 12);
const phrase = (...bars: number[][]): number[] => bars.flat();
const bar = (...notes: number[]): number[] => [...notes, ...Array(Math.max(0, 8 - notes.length)).fill(0)].slice(0, 8);

const D2 = 73.42;
const G2 = 98;
const Bb1 = 58.27;
const E2 = 82.41;

export const MUSIC_THEMES: Record<MusicTheme, MusicThemeParams> = {
  surface: {
    step: 0.25,
    bass: phrase(
      bar(D2, 0, D2, 0, note(D2, 7), 0, 0, 0),
      bar(D2, 0, note(D2, 3), 0, note(D2, 7), 0, note(D2, 10), 0),
      bar(D2, D2, 0, note(D2, 7), D2, 0, note(D2, 3), 0),
      bar(D2, 0, 0, 0, note(D2, 10), 0, note(D2, 7), 0),
    ),
    motif: phrase(
      bar(0, 0, 0, 0, 0, 0, 0, 0),
      bar(note(D2, 24), 0, 0, note(D2, 27), 0, note(D2, 31), 0, 0),
      bar(0, 0, note(D2, 24), 0, 0, 0, note(D2, 22), 0),
      bar(note(D2, 19), 0, 0, 0, 0, 0, 0, 0),
    ),
    bossAccent: phrase(
      bar(note(D2, 12), 0, 0, 0, 0, note(D2, 13), 0, 0),
      bar(0, 0, note(D2, 15), 0, 0, 0, 0, 0),
      bar(note(D2, 12), 0, 0, note(D2, 18), 0, 0, 0, 0),
      bar(0, note(D2, 13), 0, 0, 0, 0, 0, 0),
    ),
    chords: [[D2, note(D2, 3), note(D2, 7), note(D2, 10)], [D2, note(D2, 5), note(D2, 8), note(D2, 12)], [D2, note(D2, 3), note(D2, 7), note(D2, 12)], [note(D2, -2), note(D2, 3), note(D2, 7), note(D2, 10)]],
    kickSteps: [0, 8, 16, 20, 24], snareSteps: [12, 20], hatSteps: [10, 14, 18, 22],
    padFilter: 460, bassWave: 'triangle', motifWave: 'square', space: 0.10,
  },
  'trade-lanes': {
    step: 0.205,
    bass: phrase(
      bar(G2, 0, note(G2, 7), G2, 0, note(G2, 3), 0, 0),
      bar(G2, 0, 0, note(G2, 10), note(G2, 7), 0, G2, 0),
      bar(G2, 0, note(G2, 7), 0, G2, note(G2, 3), 0, note(G2, 10)),
      bar(G2, 0, 0, 0, note(G2, 7), 0, note(G2, 3), 0),
    ),
    motif: phrase(
      bar(0, 0, 0, 0, 0, 0, 0, 0),
      bar(note(G2, 19), 0, note(G2, 22), 0, 0, note(G2, 15), 0, 0),
      bar(0, note(G2, 19), 0, 0, note(G2, 22), 0, note(G2, 24), 0),
      bar(note(G2, 15), 0, 0, 0, 0, 0, 0, 0),
    ),
    bossAccent: phrase(
      bar(note(G2, 12), 0, note(G2, 13), 0, 0, 0, 0, 0),
      bar(0, note(G2, 15), 0, 0, 0, note(G2, 10), 0, 0),
      bar(note(G2, 12), 0, 0, 0, note(G2, 18), 0, 0, 0),
      bar(0, 0, note(G2, 13), 0, 0, 0, 0, 0),
    ),
    chords: [[G2, note(G2, 3), note(G2, 7), note(G2, 10)], [note(G2, 3), note(G2, 7), note(G2, 10), note(G2, 15)], [G2, note(G2, 5), note(G2, 10), note(G2, 14)], [G2, note(G2, 3), note(G2, 7), note(G2, 12)]],
    kickSteps: [0, 6, 8, 14, 16, 22, 24, 30], snareSteps: [4, 12, 20, 28], hatSteps: [9, 11, 13, 15, 17, 19, 21, 23],
    padFilter: 720, bassWave: 'sawtooth', motifWave: 'square', space: 0.08,
  },
  'deep-facility': {
    step: 0.34,
    bass: phrase(
      bar(Bb1, 0, 0, 0, note(Bb1, 5), 0, 0, 0),
      bar(Bb1, 0, 0, note(Bb1, 7), 0, 0, 0, 0),
      bar(Bb1, 0, note(Bb1, 5), 0, 0, 0, note(Bb1, 2), 0),
      bar(Bb1, 0, 0, 0, 0, 0, 0, 0),
    ),
    motif: phrase(
      bar(0, 0, 0, 0, 0, 0, 0, 0),
      bar(0, 0, note(Bb1, 24), 0, 0, 0, 0, 0),
      bar(0, 0, 0, 0, 0, note(Bb1, 19), 0, 0),
      bar(note(Bb1, 17), 0, 0, 0, 0, 0, 0, 0),
    ),
    bossAccent: phrase(
      bar(note(Bb1, 12), 0, 0, 0, 0, 0, 0, 0),
      bar(0, 0, 0, note(Bb1, 13), 0, 0, 0, 0),
      bar(note(Bb1, 12), 0, 0, 0, 0, note(Bb1, 18), 0, 0),
      bar(0, 0, note(Bb1, 13), 0, 0, 0, 0, 0),
    ),
    chords: [[Bb1, note(Bb1, 5), note(Bb1, 7), note(Bb1, 12)], [Bb1, note(Bb1, 3), note(Bb1, 7), note(Bb1, 10)], [note(Bb1, -2), note(Bb1, 3), note(Bb1, 7), note(Bb1, 12)], [Bb1, note(Bb1, 5), note(Bb1, 10), note(Bb1, 14)]],
    kickSteps: [0, 16, 24], snareSteps: [], hatSteps: [18, 22],
    padFilter: 230, bassWave: 'sine', motifWave: 'triangle', space: 0.18,
  },
  orbital: {
    step: 0.29,
    bass: phrase(
      bar(E2, 0, 0, note(E2, 7), 0, 0, 0, 0),
      bar(E2, 0, note(E2, 3), 0, 0, note(E2, 7), 0, 0),
      bar(E2, 0, 0, 0, note(E2, 10), 0, note(E2, 7), 0),
      bar(E2, 0, 0, 0, 0, 0, 0, 0),
    ),
    motif: phrase(
      bar(0, 0, 0, 0, 0, 0, 0, 0),
      bar(note(E2, 24), 0, 0, 0, note(E2, 31), 0, 0, 0),
      bar(0, note(E2, 27), 0, 0, 0, 0, note(E2, 22), 0),
      bar(note(E2, 19), 0, 0, 0, 0, 0, 0, 0),
    ),
    bossAccent: phrase(
      bar(note(E2, 12), 0, 0, 0, note(E2, 13), 0, 0, 0),
      bar(0, 0, note(E2, 19), 0, 0, 0, 0, 0),
      bar(note(E2, 12), 0, 0, 0, 0, 0, note(E2, 18), 0),
      bar(0, note(E2, 13), 0, 0, 0, 0, 0, 0),
    ),
    chords: [[E2, note(E2, 7), note(E2, 12), note(E2, 15)], [note(E2, 3), note(E2, 7), note(E2, 12), note(E2, 15)], [E2, note(E2, 5), note(E2, 10), note(E2, 14)], [E2, note(E2, 7), note(E2, 14), note(E2, 19)]],
    kickSteps: [0, 16], snareSteps: [], hatSteps: [11, 19, 27],
    padFilter: 980, bassWave: 'triangle', motifWave: 'sine', space: 0.24,
  },
  'nexus-core': {
    step: 0.215,
    bass: phrase(
      bar(D2, 0, note(D2, 7), D2, 0, note(D2, 3), note(D2, 10), 0),
      bar(D2, note(D2, 7), 0, note(D2, 3), D2, 0, note(D2, 10), 0),
      bar(D2, 0, D2, note(D2, 7), 0, note(D2, 3), 0, note(D2, 10)),
      bar(D2, 0, note(D2, 10), 0, note(D2, 7), 0, note(D2, 3), 0),
    ),
    motif: phrase(
      bar(note(D2, 24), 0, 0, note(D2, 27), 0, note(D2, 31), 0, 0),
      bar(0, note(D2, 24), 0, note(D2, 22), 0, 0, note(D2, 19), 0),
      bar(note(D2, 27), 0, note(D2, 24), 0, note(D2, 31), 0, 0, 0),
      bar(note(D2, 19), 0, 0, 0, note(D2, 22), 0, 0, 0),
    ),
    bossAccent: phrase(
      bar(note(D2, 13), 0, note(D2, 12), 0, 0, note(D2, 18), 0, 0),
      bar(0, note(D2, 15), 0, 0, note(D2, 13), 0, 0, 0),
      bar(note(D2, 12), 0, 0, note(D2, 19), 0, 0, note(D2, 18), 0),
      bar(0, note(D2, 13), 0, 0, 0, note(D2, 15), 0, 0),
    ),
    chords: [[D2, note(D2, 3), note(D2, 7), note(D2, 10)], [note(D2, -2), note(D2, 3), note(D2, 7), note(D2, 10)], [D2, note(D2, 5), note(D2, 8), note(D2, 12)], [D2, note(D2, 3), note(D2, 7), note(D2, 13)]],
    kickSteps: [0, 3, 8, 11, 16, 19, 24, 27], snareSteps: [4, 12, 20, 28], hatSteps: [2, 6, 10, 14, 18, 22, 26, 30],
    padFilter: 620, bassWave: 'sawtooth', motifWave: 'square', space: 0.12,
  },
};

export function musicIntensityForWave(wave: number, waveCount: number): number {
  if (waveCount <= 1) return 0.78;
  const progress = Math.max(0, Math.min(1, (wave - 1) / (waveCount - 1)));
  return 0.22 + progress * 0.56;
}

/** Procedural four-bar score with level themes and wave-driven arrangement intensity. */
export class MusicSystem {
  private readonly ctx = new AudioContext();
  private readonly master = this.ctx.createGain();
  private readonly compressor = this.ctx.createDynamicsCompressor();
  private readonly reverb = this.ctx.createConvolver();
  private readonly reverbGain = this.ctx.createGain();
  private readonly theme: MusicThemeParams;
  private readonly noiseBuffer: AudioBuffer;
  private running = false;
  private closing = false;
  private phraseStep = 0;
  private nextTime = 0;
  private timerId = 0;
  private bossMode = false;
  private intensity = 0.2;
  private targetIntensity = 0.2;
  private padOscs: OscillatorNode[] = [];
  private padGain?: GainNode;
  private readonly LOOK_AHEAD = 0.3;
  private readonly TICK_MS = 80;

  constructor(theme: MusicTheme = 'surface') {
    this.theme = MUSIC_THEMES[theme];
    this.master.gain.value = 0;
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.012;
    this.compressor.release.value = 0.28;
    this.reverb.buffer = this.makeImpulseResponse(1.4, 2.8);
    this.reverbGain.gain.value = this.theme.space;
    this.master.connect(this.compressor);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoiseBuffer();
  }

  setIntensity(value: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, value));
  }

  setBossMode(): void {
    this.bossMode = true;
    this.setIntensity(1);
  }

  start(volume = 0.34): void {
    if (this.running) return;
    this.running = true;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(volume, now + 2.5);
    this.startPad(now);
    this.phraseStep = 0;
    this.nextTime = now + 0.12;
    this.tick();
  }

  stop(): void {
    if (this.closing) return;
    this.closing = true;
    const wasRunning = this.running;
    this.running = false;
    clearTimeout(this.timerId);
    const now = this.ctx.currentTime;
    if (wasRunning) {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.8);
      for (const osc of this.padOscs) {
        try { osc.stop(now + 0.9); } catch { /* already stopped */ }
      }
    }
    window.setTimeout(() => { void this.ctx.close().catch(() => undefined); }, wasRunning ? 1000 : 0);
  }

  destroy(): void { this.stop(); }

  private tick(): void {
    if (!this.running) return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.12;
    const now = this.ctx.currentTime;
    while (this.nextTime < now + this.LOOK_AHEAD) {
      this.scheduleStep(this.phraseStep, this.nextTime);
      this.phraseStep = (this.phraseStep + 1) % 32;
      this.nextTime += this.theme.step;
    }
    this.timerId = window.setTimeout(() => this.tick(), this.TICK_MS);
  }

  private scheduleStep(step: number, time: number): void {
    if (step % 8 === 0) this.movePad(Math.floor(step / 8), time);

    const bass = this.theme.bass[step];
    if (bass > 0) {
      const accent = this.bossMode && step % 8 === 0 ? 1.25 : 1;
      this.playTone(bass, this.theme.bassWave, time, this.theme.step * 0.72, (0.09 + this.intensity * 0.08) * accent, 620);
    }

    const motif = this.theme.motif[step];
    if (motif > 0 && (this.intensity >= 0.42 || this.bossMode)) {
      this.playTone(motif, this.theme.motifWave, time, this.theme.step * 0.55, 0.025 + this.intensity * 0.025, 2600, step % 2 === 0 ? -0.28 : 0.28);
    }

    const bossAccent = this.theme.bossAccent[step];
    if (this.bossMode && bossAccent > 0) {
      this.playTone(bossAccent, 'sawtooth', time, this.theme.step * 0.42, 0.035, 1800, step % 2 === 0 ? 0.2 : -0.2);
    }

    if (this.intensity >= 0.28 && this.theme.kickSteps.includes(step)) this.playKick(time, this.bossMode ? 0.26 : 0.20);
    if (this.intensity >= 0.55 && this.theme.snareSteps.includes(step)) this.playSnare(time);
    if (this.intensity >= 0.75 && this.theme.hatSteps.includes(step)) this.playHat(time);
    if (this.bossMode && step % 8 === 6) this.playMetalTick(time);
  }

  private startPad(time: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.theme.padFilter;
    this.padGain = this.ctx.createGain();
    this.padGain.gain.setValueAtTime(0, time);
    this.padGain.gain.linearRampToValueAtTime(0.035, time + 4);
    this.padGain.connect(filter);
    filter.connect(this.master);
    filter.connect(this.reverb);
    for (const frequency of this.theme.chords[0]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      osc.detune.value = this.padOscs.length % 2 === 0 ? -4 : 4;
      osc.connect(this.padGain);
      osc.start(time);
      this.padOscs.push(osc);
    }
  }

  private movePad(barIndex: number, time: number): void {
    const chord = this.theme.chords[barIndex % this.theme.chords.length];
    for (let i = 0; i < this.padOscs.length; i++) {
      this.padOscs[i].frequency.setTargetAtTime(chord[i % chord.length], time, 0.08);
    }
    this.padGain?.gain.setTargetAtTime(0.025 + this.intensity * 0.018, time, 0.25);
  }

  private playTone(frequency: number, wave: OscillatorType, time: number, duration: number, volume: number, filterHz: number, pan = 0): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const panner = this.ctx.createStereoPanner();
    osc.type = wave;
    osc.frequency.value = frequency;
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    panner.pan.value = pan;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(this.master);
    gain.connect(this.reverb);
    osc.start(time);
    osc.stop(time + duration + 0.02);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); panner.disconnect(); gain.disconnect(); };
  }

  private playKick(time: number, volume: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(82, time);
    osc.frequency.exponentialRampToValueAtTime(34, time + 0.22);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    osc.connect(gain); gain.connect(this.master);
    osc.start(time); osc.stop(time + 0.25);
  }

  private playSnare(time: number): void { this.playNoise(time, 0.11, 1800, 'bandpass', 0.10); }
  private playHat(time: number): void { this.playNoise(time, 0.035, 6500, 'highpass', 0.045); }
  private playMetalTick(time: number): void { this.playTone(1240, 'square', time, 0.045, 0.025, 3200, 0.18); }

  private playNoise(time: number, duration: number, frequency: number, type: BiquadFilterType, volume: number): void {
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = type;
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    source.start(time); source.stop(time + duration);
  }

  private makeNoiseBuffer(): AudioBuffer {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private makeImpulseResponse(seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return impulse;
  }
}
