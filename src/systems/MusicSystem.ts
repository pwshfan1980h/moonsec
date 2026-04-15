import type { MusicTheme } from '../data/levelConfigs';

type ThemeParams = {
  step:       number;    // seconds per 8th note (controls BPM)
  bass:       number[];  // 8-step bass note frequencies (0 = rest)
  lead:       number[];  // 8-step lead frequencies (0 = rest)
  padFreqs:   number[];  // sustained pad chord frequencies
  padFilter:  number;    // pad lowpass center Hz
  hiHatEvery: number;    // 0 = no hi-hat; 1 = every step; 2 = every other step
  snareStep:  number;    // step index for snare (-1 = no snare)
  kickSteps:  number[];  // steps with a kick drum
};

// Frequency helpers
const note = (hz: number, semis: number) => hz * Math.pow(2, semis / 12);

// Pre-computed notes
const D2 = 73.42, F2 = 87.31, A2 = 110.00, C3 = 130.81;
const D3 = 146.83, F3 = 174.61, A3 = 220.00, C4 = 261.63;
const D4 = 293.66, A4 = 440.00;
// G-minor rooted notes for Trade Lanes
const G2 = 98.00, Bb2 = note(G2, 3), G3 = 196.00, D5 = note(D4, 12);
// Bb-minor for Deep Facility
const Bb1 = 58.27, Eb2 = note(Bb1, 5), F_2 = 87.31, Bb3 = note(Bb2, 12);
// E-minor for Orbital
const E2 = 82.41, B2 = note(E2, 7), E3 = note(E2, 12), G3e = note(E2, 15);

const THEMES: Record<MusicTheme, ThemeParams> = {
  'surface': {
    step:      0.25,  // 120 BPM
    bass:      [D2, 0, A2, F2, D2, C3, A2, 0],
    lead:      [D4, 0, 0, 0, A4, 0, D4, 0],
    padFreqs:  [D3, F3, A3, C4],
    padFilter: 550,
    hiHatEvery: 2, snareStep: 4, kickSteps: [0, 4],
  },
  'trade-lanes': {
    step:      0.18,  // ~139 BPM — fast and punchy
    bass:      [G2, 0, D2, Bb2, G2, 0, D2, Bb2],
    lead:      [G3, 0, D5, 0, G3, 0, Bb2, 0],
    padFreqs:  [G3, Bb2, D3, F3],
    padFilter: 900,
    hiHatEvery: 1, snareStep: 4, kickSteps: [0, 2, 4, 6],
  },
  'deep-facility': {
    step:      0.33,  // ~91 BPM — slow and ominous
    bass:      [Bb1, 0, 0, Eb2, Bb1, 0, F_2, 0],
    lead:      [Bb3, 0, 0, 0, 0, 0, Bb3, 0],
    padFreqs:  [Bb1, Eb2, F_2, Bb3],
    padFilter: 200,
    hiHatEvery: 0, snareStep: -1, kickSteps: [0, 4],
  },
  'orbital': {
    step:      0.27,  // ~111 BPM — floating, minimal
    bass:      [E2, 0, B2, 0, E2, 0, G3e, 0],
    lead:      [E3, 0, 0, 0, B2, 0, 0, 0],
    padFreqs:  [E2, B2, E3, G3e],
    padFilter: 1200,
    hiHatEvery: 0, snareStep: -1, kickSteps: [0, 4],
  },
  'nexus-core': {
    step:      0.19,  // ~158 BPM — relentless
    bass:      [D2, 0, A2, F2, D2, C3, A2, F2],
    lead:      [D4, A4, 0, D4, A4, 0, D4, 0],
    padFreqs:  [D3, F3, A3, C4],
    padFilter: 700,
    hiHatEvery: 1, snareStep: 4, kickSteps: [0, 2, 4, 6],
  },
};

/**
 * Procedural music engine using Web Audio API.
 * Theme-aware: key, BPM, pad voicing, and percussion pattern vary per level.
 */
export class MusicSystem {
  private ctx: AudioContext;
  private master: GainNode;
  private running = false;

  // Scheduler state
  private step = 0;
  private loopCount = 0;
  private nextTime = 0;
  private timerId = 0;

  // Pad nodes (sustained, stopped on destroy)
  private padOscs: OscillatorNode[] = [];
  private padGain!: GainNode;
  private padLfo!: OscillatorNode;
  private padLp!: BiquadFilterNode;

  private bossMode = false;
  private noiseBuffer!: AudioBuffer;

  private readonly LOOK = 0.30;
  private readonly TICK = 80;

  private readonly theme: ThemeParams;

  constructor(theme: MusicTheme = 'surface') {
    this.theme  = THEMES[theme];
    this.ctx    = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.initNoiseBuffer();
  }

  /** Escalate to boss-fight percussion layer. Call once when boss wave begins. */
  setBossMode(): void {
    this.bossMode = true;
  }

  start(volume = 0.45): void {
    if (this.running) return;
    this.running = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const t = this.ctx.currentTime;
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(volume, t + 3);

    this.startPad();
    this.step      = 0;
    this.loopCount = 0;
    this.nextTime  = t + 0.15;
    this.tick();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.timerId);

    const t = this.ctx.currentTime;
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 1.5);

    for (const osc of this.padOscs) {
      try { osc.stop(t + 1.6); } catch { /* already stopped */ }
    }
    try { this.padLfo.stop(t + 1.6); } catch { /* ok */ }

    setTimeout(() => { try { this.ctx.close(); } catch { /* ok */ } }, 2000);
  }

  destroy(): void { this.stop(); }

  // ── Scheduler loop ────────────────────────────────────────────────────────

  private tick(): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    while (this.nextTime < now + this.LOOK) {
      this.scheduleStep(this.step, this.nextTime);
      this.step++;
      if (this.step >= this.theme.bass.length) {
        this.step = 0;
        this.loopCount++;
      }
      this.nextTime += this.theme.step;
    }
    this.timerId = window.setTimeout(() => this.tick(), this.TICK) as unknown as number;
  }

  private scheduleStep(step: number, t: number): void {
    const { bass, lead, hiHatEvery, snareStep, kickSteps } = this.theme;

    if (kickSteps.includes(step)) this.playKick(t);

    const bassFreq = bass[step];
    if (bassFreq > 0) {
      this.playNote(bassFreq, 'sawtooth', t, this.theme.step * 0.72, 0.28, 700);
    }

    if (this.loopCount % 2 === 1) {
      const leadFreq = lead[step];
      if (leadFreq > 0) {
        this.playNote(leadFreq, 'square', t, this.theme.step * 0.35, 0.07, 2800);
      }
    }

    // Boss percussion layer (overlaid on top of theme percussion)
    if (this.bossMode) {
      if (hiHatEvery === 0 || step % 2 === 1) this.playHiHat(t); // always add hi-hats in boss mode
      if (snareStep >= 0 && step === snareStep) this.playSnare(t);
    } else {
      // Normal play — theme-defined percussion
      if (hiHatEvery > 0 && step % hiHatEvery === 1) this.playHiHat(t);
      if (snareStep >= 0 && step === snareStep)        this.playSnare(t);
    }
  }

  // ── Note / kick players ───────────────────────────────────────────────────

  private playNote(
    freq: number, type: OscillatorType, t: number,
    dur: number, gain: number, lpHz: number,
  ): void {
    try {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.012);
      g.gain.setValueAtTime(gain, t + dur - 0.03);
      g.gain.linearRampToValueAtTime(0, t + dur);

      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(lpHz, t);

      osc.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.01);
      osc.onended = () => { try { g.disconnect(); lp.disconnect(); } catch { /* ok */ } };
    } catch { /* ignore scheduling errors */ }
  }

  private playKick(t: number): void {
    try {
      const dur = 0.28;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.38, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      g.connect(this.master);

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + dur);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur);
      osc.onended = () => { try { g.disconnect(); } catch { /* ok */ } };
    } catch { /* ok */ }
  }

  // ── Boss percussion ───────────────────────────────────────────────────────

  private playHiHat(t: number): void {
    try {
      const dur = 0.04;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.master);

      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(7000, t);
      ns.connect(hp); hp.connect(g);
      ns.start(t); ns.stop(t + dur);
      ns.onended = () => { try { g.disconnect(); hp.disconnect(); } catch { /* ok */ } };
    } catch { /* ok */ }
  }

  private playSnare(t: number): void {
    try {
      const dur = 0.16;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.master);

      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, t);
      bp.Q.setValueAtTime(0.8, t);
      ns.connect(bp); bp.connect(g);
      ns.start(t); ns.stop(t + dur);
      ns.onended = () => { try { g.disconnect(); bp.disconnect(); } catch { /* ok */ } };
    } catch { /* ok */ }
  }

  private initNoiseBuffer(): void {
    const sr = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, sr, sr);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;
  }

  // ── Pad (continuous, detuned chord) ──────────────────────────────────────

  private startPad(): void {
    const t = this.ctx.currentTime;

    this.padGain = this.ctx.createGain();
    this.padGain.gain.setValueAtTime(0, t);
    this.padGain.gain.linearRampToValueAtTime(0.09, t + 5);

    this.padLp = this.ctx.createBiquadFilter();
    this.padLp.type = 'lowpass';
    this.padLp.frequency.setValueAtTime(this.theme.padFilter, t);
    this.padLp.Q.setValueAtTime(0.9, t);

    this.padLfo = this.ctx.createOscillator();
    this.padLfo.type = 'sine';
    this.padLfo.frequency.setValueAtTime(0.07, t);
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.setValueAtTime(Math.min(220, this.theme.padFilter * 0.4), t);
    this.padLfo.connect(lfoAmt);
    lfoAmt.connect(this.padLp.frequency);
    this.padLfo.start(t);

    this.padGain.connect(this.padLp);
    this.padLp.connect(this.master);

    for (const freq of this.theme.padFreqs) {
      for (const detune of [-7, 7]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        osc.detune.setValueAtTime(detune, t);
        osc.connect(this.padGain);
        osc.start(t);
        this.padOscs.push(osc);
      }
    }
  }
}
