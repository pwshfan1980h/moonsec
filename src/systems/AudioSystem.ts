// One-shot sounds use Phaser's built-in audio manager (loaded in BootScene).
// Jetpack and missile-flight loops stay procedural (Web Audio API) — no loopable file equivalents.

import type Phaser from 'phaser';

type SoundId =
  | 'rapid' | 'turret' | 'hit' | 'hurt' | 'jump' | 'death'
  | 'drone-shoot' | 'explosion' | 'footstep' | 'missile-impact'
  | 'nanite-heal' | 'nanite-tick' | 'pickup' | 'eject'
  | 'ui-nav' | 'ui-confirm' | 'level-complete'
  | 'missile-launch' | 'landing-soft' | 'landing-heavy' | 'landing-slam';

type LoopId = 'jetpack' | 'missile' | 'missile-reload';

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
  eject:            0.20,
  'ui-nav':         0.25,
  'ui-confirm':     0.40,
  'level-complete': 0.70,
  'missile-launch': 0.45,
  'landing-soft':   0.30,
  'landing-heavy':  0.50,
  'landing-slam':   0.85,
};

export class AudioSystem {
  private soundManager: Phaser.Sound.BaseSoundManager;
  private ctx: AudioContext;                              // used only for loops
  private noiseBuffer!: AudioBuffer;
  private lastPlay: Partial<Record<SoundId, number>> = {};
  private readonly minInterval: Partial<Record<SoundId, number>> = {
    rapid: 55, // ms — prevents audio spam on rapid fire
    'nanite-tick': 550,
    eject: 80,  // geometry-impact throttle — prevents stacking during sustained fire
    hit:   70,  // enemy-impact throttle
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
    if (id === 'footstep')      { this.playMechFootstep(); return; }
    if (id === 'landing-soft')  { this.playProceduralOneShot(70, 0.08, 0.30); return; }
    if (id === 'landing-heavy') { this.playProceduralOneShot(55, 0.12, 0.50, { filterHz: 200 }); return; }
    if (id === 'landing-slam')  { this.playLandingSlam(); return; }

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
        // Rocket roar: lowpassed noise (exhaust) + sub rumble + slow cutoff LFO for "breath"
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        noiseSrc.loop = true;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1400, t);
        lp.Q.setValueAtTime(0.9, t);

        // LFO sweeps the cutoff ±250 Hz for a crackling-exhaust feel
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(6.5, t);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(250, t);
        lfo.connect(lfoGain);
        lfoGain.connect(lp.frequency);

        noiseSrc.connect(lp);
        lp.connect(gainNode);
        noiseSrc.start(t);
        lfo.start(t);
        sources.push(noiseSrc, lfo);

        // Sub-sine 48 Hz — thrust body
        const subOsc = this.ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(48, t);
        const subGain = this.ctx.createGain();
        subGain.gain.setValueAtTime(0.6, t); // attenuate vs. noise
        subOsc.connect(subGain);
        subGain.connect(gainNode);
        subOsc.start(t);
        sources.push(subOsc);

        gainNode.gain.linearRampToValueAtTime(0.28, t + FADE_IN);
      }

      if (id === 'missile-reload') {
        // Mechanical reload: ticking sub-osc + soft noise whir, pitch rises subtly over time
        const tick = this.ctx.createOscillator();
        tick.type = 'square';
        tick.frequency.setValueAtTime(110, t);
        const tickGain = this.ctx.createGain();
        tickGain.gain.setValueAtTime(0.05, t);
        tick.connect(tickGain);
        tickGain.connect(gainNode);
        tick.start(t);
        sources.push(tick);

        // LFO gates the tick gain for a "clank-clank-clank" loading feel
        const lfo = this.ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.setValueAtTime(4.5, t);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(0.06, t);
        lfo.connect(lfoGain);
        lfoGain.connect(tickGain.gain);
        lfo.start(t);
        sources.push(lfo);

        // Soft hiss from bandpassed noise — chassis servo
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        noiseSrc.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1200, t);
        bp.Q.setValueAtTime(2.2, t);
        const hissGain = this.ctx.createGain();
        hissGain.gain.setValueAtTime(0.18, t);
        noiseSrc.connect(bp);
        bp.connect(hissGain);
        hissGain.connect(gainNode);
        noiseSrc.start(t);
        sources.push(noiseSrc);

        gainNode.gain.linearRampToValueAtTime(0.22, t + FADE_IN);
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
        // Heavy mech cadence — lumbering, with a slightly tighter beat at full pace
        this.footstepTimer = Math.abs(velocityX) > 250 ? 320 : 440;
        this.play('footstep');
      }
    } else {
      this.footstepTimer = Math.min(this.footstepTimer, 200);
    }
  }

  /** Short, crisp two-tone beep — missile cooldown reached zero. */
  playMissileReady(): void {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;

      const beep = (at: number, freq: number, dur: number, gain: number): void => {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(gain, at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        g.connect(this.ctx.destination);

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, at);
        osc.connect(g);
        osc.start(at);
        osc.stop(at + dur);
        osc.onended = () => { try { g.disconnect(); } catch { /* ok */ } };
      };

      beep(t,        880,  0.08, 0.18);
      beep(t + 0.09, 1320, 0.12, 0.22);
    } catch { /* ignore */ }
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

  /** ED-209-style heavy mech footstep — hydraulic thud + metallic clank + servo whine. */
  private playMechFootstep(): void {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;

      // 1. Sub-bass hydraulic thud — sine sweep 90→38 Hz
      const thumpDur = 0.18;
      const thumpG = this.ctx.createGain();
      thumpG.gain.setValueAtTime(0.55, t);
      thumpG.gain.exponentialRampToValueAtTime(0.0001, t + thumpDur);
      thumpG.connect(this.ctx.destination);
      const thump = this.ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(90, t);
      thump.frequency.exponentialRampToValueAtTime(38, t + thumpDur);
      thump.connect(thumpG);
      thump.start(t);
      thump.stop(t + thumpDur);
      thump.onended = () => { try { thumpG.disconnect(); } catch { /* ok */ } };

      // 2. Metallic clank — bandpassed noise burst around 2.4 kHz
      const clankDur = 0.06;
      const clankG = this.ctx.createGain();
      clankG.gain.setValueAtTime(0.22, t);
      clankG.gain.exponentialRampToValueAtTime(0.0001, t + clankDur);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, t);
      bp.Q.setValueAtTime(4.5, t);
      const clankNs = this.ctx.createBufferSource();
      clankNs.buffer = this.noiseBuffer;
      clankNs.connect(bp); bp.connect(clankG); clankG.connect(this.ctx.destination);
      clankNs.start(t);
      clankNs.stop(t + clankDur);
      clankNs.onended = () => { try { clankG.disconnect(); bp.disconnect(); } catch { /* ok */ } };

      // 3. Servo whine — short downsweep triangle 620→180 Hz, lags slightly behind the thump
      const servoStart = t + 0.012;
      const servoDur = 0.09;
      const servoG = this.ctx.createGain();
      servoG.gain.setValueAtTime(0, servoStart);
      servoG.gain.linearRampToValueAtTime(0.10, servoStart + 0.008);
      servoG.gain.exponentialRampToValueAtTime(0.0001, servoStart + servoDur);
      servoG.connect(this.ctx.destination);
      const servo = this.ctx.createOscillator();
      servo.type = 'triangle';
      servo.frequency.setValueAtTime(620, servoStart);
      servo.frequency.exponentialRampToValueAtTime(180, servoStart + servoDur);
      servo.connect(servoG);
      servo.start(servoStart);
      servo.stop(servoStart + servoDur);
      servo.onended = () => { try { servoG.disconnect(); } catch { /* ok */ } };

      // 4. Floor rumble tail — lowpassed noise after the impact
      const rumbleStart = t + 0.01;
      const rumbleDur = 0.14;
      const rumbleG = this.ctx.createGain();
      rumbleG.gain.setValueAtTime(0.16, rumbleStart);
      rumbleG.gain.exponentialRampToValueAtTime(0.0001, rumbleStart + rumbleDur);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(160, rumbleStart);
      const rumbleNs = this.ctx.createBufferSource();
      rumbleNs.buffer = this.noiseBuffer;
      rumbleNs.connect(lp); lp.connect(rumbleG); rumbleG.connect(this.ctx.destination);
      rumbleNs.start(rumbleStart);
      rumbleNs.stop(rumbleStart + rumbleDur);
      rumbleNs.onended = () => { try { rumbleG.disconnect(); lp.disconnect(); } catch { /* ok */ } };
    } catch { /* ignore */ }
  }

  /** Heavy slam from height — sub-bass crash + metal debris rattle + long rumble tail. */
  private playLandingSlam(): void {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;

      // Sub-bass impact — sine sweep 110→22 Hz
      const subDur = 0.42;
      const subG = this.ctx.createGain();
      subG.gain.setValueAtTime(0.95, t);
      subG.gain.exponentialRampToValueAtTime(0.0001, t + subDur);
      subG.connect(this.ctx.destination);
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(110, t);
      sub.frequency.exponentialRampToValueAtTime(22, t + subDur);
      sub.connect(subG);
      sub.start(t);
      sub.stop(t + subDur);
      sub.onended = () => { try { subG.disconnect(); } catch { /* ok */ } };

      // Metal crash — broad bandpass noise burst, ~1.5 kHz
      const crashDur = 0.18;
      const crashG = this.ctx.createGain();
      crashG.gain.setValueAtTime(0.45, t);
      crashG.gain.exponentialRampToValueAtTime(0.0001, t + crashDur);
      const crashBp = this.ctx.createBiquadFilter();
      crashBp.type = 'bandpass';
      crashBp.frequency.setValueAtTime(1500, t);
      crashBp.Q.setValueAtTime(1.4, t);
      const crashNs = this.ctx.createBufferSource();
      crashNs.buffer = this.noiseBuffer;
      crashNs.connect(crashBp); crashBp.connect(crashG); crashG.connect(this.ctx.destination);
      crashNs.start(t);
      crashNs.stop(t + crashDur);
      crashNs.onended = () => { try { crashG.disconnect(); crashBp.disconnect(); } catch { /* ok */ } };

      // Debris rattle — high-shelf noise gated by an LFO for 0.3s
      const ratStart = t + 0.05;
      const ratDur = 0.30;
      const ratG = this.ctx.createGain();
      ratG.gain.setValueAtTime(0.12, ratStart);
      ratG.gain.exponentialRampToValueAtTime(0.0001, ratStart + ratDur);
      const ratHp = this.ctx.createBiquadFilter();
      ratHp.type = 'highpass';
      ratHp.frequency.setValueAtTime(3500, ratStart);
      const ratNs = this.ctx.createBufferSource();
      ratNs.buffer = this.noiseBuffer;
      ratNs.connect(ratHp); ratHp.connect(ratG); ratG.connect(this.ctx.destination);
      ratNs.start(ratStart);
      ratNs.stop(ratStart + ratDur);
      ratNs.onended = () => { try { ratG.disconnect(); ratHp.disconnect(); } catch { /* ok */ } };

      // Rumble tail — lowpassed noise, 0.5s
      const rumbleDur = 0.50;
      const rumbleG = this.ctx.createGain();
      rumbleG.gain.setValueAtTime(0.28, t);
      rumbleG.gain.exponentialRampToValueAtTime(0.0001, t + rumbleDur);
      const rumbleLp = this.ctx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.setValueAtTime(180, t);
      const rumbleNs = this.ctx.createBufferSource();
      rumbleNs.buffer = this.noiseBuffer;
      rumbleNs.connect(rumbleLp); rumbleLp.connect(rumbleG); rumbleG.connect(this.ctx.destination);
      rumbleNs.start(t);
      rumbleNs.stop(t + rumbleDur);
      rumbleNs.onended = () => { try { rumbleG.disconnect(); rumbleLp.disconnect(); } catch { /* ok */ } };
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
