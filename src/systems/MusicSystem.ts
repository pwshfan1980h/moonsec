/**
 * Procedural music engine using Web Audio API.
 * D-minor pentatonic arpeggio bass + detuned pad + sparse lead.
 * 120 BPM, 8-step loop (~2 s/bar).
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

  // --- Timing constants ---
  private readonly STEP = 0.25;   // 120 BPM, 8th note = 0.25 s
  private readonly LOOK = 0.30;   // look-ahead window
  private readonly TICK = 80;     // scheduler interval (ms)

  // --- D-minor pentatonic frequencies ---
  private readonly D2  = 73.42;
  private readonly F2  = 87.31;
  private readonly A2  = 110.00;
  private readonly C3  = 130.81;
  private readonly D3  = 146.83;
  private readonly F3  = 174.61;
  private readonly A3  = 220.00;
  private readonly C4  = 261.63;
  private readonly D4  = 293.66;
  private readonly A4  = 440.00;

  // Bass arpeggio: D2 . A2 F2 | D2 C3 A2 .
  private readonly BASS = [
    this.D2, 0, this.A2, this.F2,
    this.D2, this.C3, this.A2, 0,
  ];

  // Lead (upper octave, plays on even loops only)
  private readonly LEAD = [
    this.D4, 0, 0, 0,
    this.A4, 0, this.D4, 0,
  ];

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
  }

  start(volume = 0.45): void {
    if (this.running) return;
    this.running = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Fade in over 3 s
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
      if (this.step >= this.BASS.length) {
        this.step = 0;
        this.loopCount++;
      }
      this.nextTime += this.STEP;
    }
    this.timerId = window.setTimeout(() => this.tick(), this.TICK) as unknown as number;
  }

  private scheduleStep(step: number, t: number): void {
    // Sub-kick on downbeats (steps 0 and 4)
    if (step === 0 || step === 4) this.playKick(t);

    // Bass arpeggio
    const bassFreq = this.BASS[step];
    if (bassFreq > 0) {
      this.playNote(bassFreq, 'sawtooth', t, this.STEP * 0.72, 0.28, 700);
    }

    // Lead (every other 4-bar loop for variation)
    if (this.loopCount % 2 === 1) {
      const leadFreq = this.LEAD[step];
      if (leadFreq > 0) {
        this.playNote(leadFreq, 'square', t, this.STEP * 0.35, 0.07, 2800);
      }
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

  // ── Pad (continuous, detuned chord) ──────────────────────────────────────

  private startPad(): void {
    const t = this.ctx.currentTime;

    this.padGain = this.ctx.createGain();
    this.padGain.gain.setValueAtTime(0, t);
    this.padGain.gain.linearRampToValueAtTime(0.09, t + 5); // 5 s attack

    this.padLp = this.ctx.createBiquadFilter();
    this.padLp.type = 'lowpass';
    this.padLp.frequency.setValueAtTime(550, t);
    this.padLp.Q.setValueAtTime(0.9, t);

    // Very slow LFO (0.07 Hz) sweeps filter cutoff ±200 Hz
    this.padLfo = this.ctx.createOscillator();
    this.padLfo.type = 'sine';
    this.padLfo.frequency.setValueAtTime(0.07, t);
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.setValueAtTime(220, t);
    this.padLfo.connect(lfoAmt);
    lfoAmt.connect(this.padLp.frequency);
    this.padLfo.start(t);

    this.padGain.connect(this.padLp);
    this.padLp.connect(this.master);

    // Dm7 chord: D3 F3 A3 C4 — two detuned sawtooth oscillators per note
    const padFreqs = [this.D3, this.F3, this.A3, this.C4];
    for (const freq of padFreqs) {
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
