// One-shot sounds use Phaser's built-in audio manager (loaded in BootScene).
// Jetpack and missile-flight loops stay procedural (Web Audio API) — no loopable file equivalents.

import type Phaser from 'phaser';

type SoundId =
  | 'rapid' | 'turret' | 'hit' | 'hurt' | 'jump' | 'death'
  | 'drone-shoot' | 'explosion' | 'footstep' | 'missile-impact'
  | 'nanite-heal' | 'nanite-tick' | 'pickup'
  | 'ui-nav' | 'ui-confirm' | 'level-complete'
  | 'missile-launch' | 'landing-soft' | 'landing-heavy';

type LoopId = 'jetpack' | 'missile';

interface AudioUpdateState {
  onGround:  boolean;
  moving:    boolean;    // Math.abs(velocityX) > 10
  velocityX: number;     // raw px/s — used for footstep interval scaling
  delta:     number;     // ms
}

interface LoopEntry {
  sources: (AudioBufferSourceNode | OscillatorNode)[];
  gainNode: GainNode;
}

// Volume per sound (Phaser normalises 0–1)
const VOLUMES: Record<SoundId, number> = {
  rapid:            0.25,
  turret:           0.55,
  hit:              0.40,
  hurt:             0.70,
  jump:             0.50,
  death:            0.80,
  'drone-shoot':    0.25,
  explosion:        0.70,
  footstep:         0.25,
  'missile-impact': 0.80,
  'nanite-heal':    0.55,
  'nanite-tick':    0.30,
  'pickup':         0.50,
  'ui-nav':         0.25,
  'ui-confirm':     0.40,
  'level-complete': 0.70,
  'missile-launch': 0.45,
  'landing-soft':   0.30,
  'landing-heavy':  0.50,
};

export class AudioSystem {
  private soundManager: Phaser.Sound.BaseSoundManager;
  private ctx: AudioContext;                              // used only for loops
  private noiseBuffer!: AudioBuffer;
  private lastPlay: Partial<Record<SoundId, number>> = {};
  private readonly minInterval: Partial<Record<SoundId, number>> = {
    rapid: 55, // ms — prevents audio spam on rapid fire
    'nanite-tick': 550,
  };
  private loops = new Map<LoopId, LoopEntry>();
  private deathAmbientNodes: (OscillatorNode | GainNode)[] = [];
  private footstepTimer = 0;
  private readonly onBeforeUnload = () => { try { this.ctx.close(); } catch { /* ignore */ } };

  constructor(soundManager: Phaser.Sound.BaseSoundManager) {
    this.soundManager = soundManager;
    this.ctx = new AudioContext();
    this.initNoiseBuffer();
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  /** Call before discarding this instance (e.g. scene restart) to stop all nodes and close the AudioContext. */
  destroy(): void {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.deathAmbientNodes = []; // context closing kills nodes immediately
    // Stop all active loops immediately (no fade — context is going away)
    for (const id of [...this.loops.keys()]) {
      const entry = this.loops.get(id)!;
      this.loops.delete(id);
      try {
        for (const src of entry.sources) {
          try { src.stop(); } catch { /* already stopped */ }
          src.disconnect();
        }
        entry.gainNode.disconnect();
      } catch { /* ignore */ }
    }
    try { this.ctx.close(); } catch { /* ignore */ }
  }

  play(id: SoundId): void {
    const now = performance.now();
    const min = this.minInterval[id] ?? 0;
    if (min > 0 && this.lastPlay[id] !== undefined && now - this.lastPlay[id]! < min) return;
    this.lastPlay[id] = now;

    // Procedural sounds — bypass Phaser sound manager
    if (id === 'missile-launch') { this.playMissileLaunch(); return; }
    if (id === 'landing-soft')  { this.playProceduralOneShot(70, 0.08, 0.30); return; }
    if (id === 'landing-heavy') { this.playProceduralOneShot(55, 0.12, 0.50, { filterHz: 200 }); return; }

    // Layered procedural additions
    if (id === 'explosion') this.playExplosionThump();

    try {
      this.soundManager.play(id, { volume: VOLUMES[id] });
    } catch { /* ignore — sound not yet loaded or context suspended */ }
  }

  playAt(id: SoundId, opts: { rate?: number; detune?: number; volume?: number }): void {
    try {
      this.soundManager.play(id, {
        volume:  opts.volume  ?? VOLUMES[id],
        rate:    opts.rate    ?? 1,
        detune:  opts.detune  ?? 0,
      });
    } catch { /* ignore — sound not yet loaded or context suspended */ }
  }

  startLoop(id: LoopId): void {
    if (this.loops.has(id)) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;
      const FADE_IN = 0.05;

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0, t);
      gainNode.connect(this.ctx.destination);

      const sources: (AudioBufferSourceNode | OscillatorNode)[] = [];

      if (id === 'jetpack') {
        // White noise → bandpass 900 Hz (Q=1.5) — thrust hiss
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        noiseSrc.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(900, t);
        bp.Q.setValueAtTime(1.5, t);
        noiseSrc.connect(bp);
        bp.connect(gainNode);
        noiseSrc.start(t);
        sources.push(noiseSrc);

        // Sub-sine 55 Hz — body rumble
        const subOsc = this.ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(55, t);
        subOsc.connect(gainNode);
        subOsc.start(t);
        sources.push(subOsc);

        gainNode.gain.linearRampToValueAtTime(0.35, t + FADE_IN);
      }

      if (id === 'missile') {
        // Sine whine ~1380 Hz with slow LFO pitch wobble — tracking scream
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(5.5, t);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(28, t); // ±28 Hz wobble
        lfo.connect(lfoGain);

        const whine = this.ctx.createOscillator();
        whine.type = 'sawtooth';
        whine.frequency.setValueAtTime(1380, t);
        lfoGain.connect(whine.frequency);

        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(900, t);

        whine.connect(hp);
        hp.connect(gainNode);
        whine.start(t);
        lfo.start(t);
        sources.push(whine, lfo);

        gainNode.gain.linearRampToValueAtTime(0.18, t + FADE_IN);
      }

      this.loops.set(id, { sources, gainNode });
    } catch { /* ignore */ }
  }

  /** A minor chord drone — plays on game over. Fades in over 2s. */
  startDeathAmbient(): void {
    this.stopDeathAmbient();
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;
      const masterGain = this.ctx.createGain();
      masterGain.gain.setValueAtTime(0, t);
      masterGain.gain.linearRampToValueAtTime(0.18, t + 2.5);
      masterGain.connect(this.ctx.destination);
      this.deathAmbientNodes.push(masterGain);
      // A1 minor chord: A=55Hz, C=65.41Hz, E=82.41Hz
      for (const freq of [55, 65.41, 82.41]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.connect(masterGain);
        osc.start(t);
        this.deathAmbientNodes.push(osc);
      }
    } catch { /* ignore */ }
  }

  stopDeathAmbient(): void {
    if (this.deathAmbientNodes.length === 0) return;
    try {
      const t = this.ctx.currentTime;
      for (const node of this.deathAmbientNodes) {
        if (node instanceof GainNode) {
          node.gain.cancelScheduledValues(t);
          node.gain.setValueAtTime(node.gain.value, t);
          node.gain.linearRampToValueAtTime(0, t + 0.5);
          setTimeout(() => { try { node.disconnect(); } catch { /* ignore */ } }, 600);
        } else if (node instanceof OscillatorNode) {
          try { node.stop(t + 0.5); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    this.deathAmbientNodes = [];
  }

  stopLoop(id: LoopId): void {
    const entry = this.loops.get(id);
    if (!entry) return;
    this.loops.delete(id);

    try {
      const t = this.ctx.currentTime;
      const FADE_OUT = 0.08;

      entry.gainNode.gain.cancelScheduledValues(t);
      entry.gainNode.gain.setValueAtTime(entry.gainNode.gain.value, t);
      entry.gainNode.gain.linearRampToValueAtTime(0, t + FADE_OUT);

      setTimeout(() => {
        try {
          entry.gainNode.disconnect();
          for (const src of entry.sources) {
            try { src.stop(); } catch { /* already stopped */ }
            src.disconnect();
          }
        } catch { /* ignore */ }
      }, FADE_OUT * 1000 + 20);
    } catch { /* ignore */ }
  }

  private playProceduralOneShot(
    freq: number,
    duration: number,
    peakGain: number,
    noiseLayer?: { filterHz: number },
  ): void {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;

      const masterGain = this.ctx.createGain();
      masterGain.gain.setValueAtTime(peakGain, t);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      masterGain.connect(this.ctx.destination);

      // Sine oscillator
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(masterGain);
      osc.start(t);
      osc.stop(t + duration);
      osc.onended = () => { try { masterGain.disconnect(); } catch { /* ignore */ } };

      if (noiseLayer) {
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(noiseLayer.filterHz, t);
        noiseSrc.connect(lp);
        lp.connect(masterGain);
        noiseSrc.start(t);
        noiseSrc.stop(t + duration);
      }
    } catch { /* ignore */ }
  }

  private playMissileLaunch(): void {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;
      const DURATION = 0.35;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.linearRampToValueAtTime(0, t + DURATION);
      gain.connect(this.ctx.destination);

      // White noise through bandpass, sweep 2000→600 Hz
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2000, t);
      bp.frequency.linearRampToValueAtTime(600, t + DURATION);
      noiseSrc.connect(bp);
      bp.connect(gain);
      noiseSrc.start(t);
      noiseSrc.stop(t + DURATION);
      noiseSrc.onended = () => { try { gain.disconnect(); } catch { /* ignore */ } };
    } catch { /* ignore */ }
  }

  update(state: AudioUpdateState): void {
    const { onGround, moving, velocityX, delta } = state;

    if (onGround && moving) {
      this.footstepTimer -= delta;
      if (this.footstepTimer <= 0) {
        // Shorter interval when running (|vx| > ~250 px/s)
        this.footstepTimer = Math.abs(velocityX) > 250 ? 140 : 280;
        this.play('footstep');
      }
    } else {
      this.footstepTimer = Math.min(this.footstepTimer, 140);
    }
  }

  /** Short percussive chord stab on wave start. */
  playWaveStinger(): void {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t   = this.ctx.currentTime;
      const dur = 0.22;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, t);
      lp.frequency.linearRampToValueAtTime(400, t + dur);
      g.connect(lp);
      lp.connect(this.ctx.destination);

      // Dm power chord: D3 + A3 + D4
      for (const freq of [146.83, 220.00, 293.66]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        osc.connect(g);
        osc.start(t);
        osc.stop(t + dur);
        osc.onended = () => { try { g.disconnect(); lp.disconnect(); } catch { /* ok */ } };
      }
    } catch { /* ignore */ }
  }

  /** Rising pitched chime on kill-streak milestone. Higher pitch = bigger streak. */
  playStreakChime(milestone: number): void {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;

      // C5 / E5 / G5 / C6 per milestone tier
      const freqMap: Record<number, number> = { 3: 523.25, 5: 659.25, 10: 783.99, 20: 1046.50 };
      const freq = freqMap[milestone] ?? 523.25;
      const dur  = milestone >= 10 ? 0.9 : 0.6;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.ctx.destination);

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      // Slight pitch slide up for sparkle
      osc.frequency.linearRampToValueAtTime(freq * 1.04, t + dur);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur);

      // Octave echo at half gain, 80ms delay — adds shimmer on big streaks
      if (milestone >= 5) {
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.10, t + 0.08);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
        g2.connect(this.ctx.destination);
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, t + 0.08);
        osc2.connect(g2);
        osc2.start(t + 0.08);
        osc2.stop(t + dur + 0.08);
        osc2.onended = () => { try { g2.disconnect(); } catch { /* ok */ } };
      }

      osc.onended = () => { try { g.disconnect(); } catch { /* ok */ } };
    } catch { /* ignore */ }
  }

  private playExplosionThump(): void {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t   = this.ctx.currentTime;
      const dur = 0.38;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(this.ctx.destination);

      // Sub-sine sweep 90→18 Hz — body thump
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(18, t + dur);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur);
      osc.onended = () => { try { g.disconnect(); } catch { /* ok */ } };

      // Short noise burst for crack texture
      const ns = this.ctx.createBufferSource();
      ns.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(280, t);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.30, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      ns.connect(lp); lp.connect(ng); ng.connect(this.ctx.destination);
      ns.start(t);
      ns.stop(t + 0.12);
      ns.onended = () => { try { ng.disconnect(); lp.disconnect(); } catch { /* ok */ } };
    } catch { /* ignore */ }
  }

  private initNoiseBuffer(): void {
    const sr = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, sr, sr);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;
  }
}
