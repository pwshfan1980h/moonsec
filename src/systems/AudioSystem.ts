// One-shot sounds use Phaser's built-in audio manager (loaded in BootScene).
// Jetpack and missile-flight loops stay procedural (Web Audio API) — no loopable file equivalents.

import type Phaser from 'phaser';

type SoundId =
  | 'rapid' | 'turret' | 'hit' | 'hurt' | 'jump' | 'death'
  | 'drone-shoot' | 'explosion' | 'footstep' | 'missile-impact';

type LoopId = 'jetpack' | 'missile-flight';

interface AudioUpdateState {
  onGround: boolean;
  moving: boolean;   // Math.abs(velocityX) > 10
  delta: number;     // ms
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
};

export class AudioSystem {
  private soundManager: Phaser.Sound.BaseSoundManager;
  private ctx: AudioContext;                              // used only for loops
  private noiseBuffer!: AudioBuffer;
  private lastPlay: Partial<Record<SoundId, number>> = {};
  private readonly minInterval: Partial<Record<SoundId, number>> = {
    rapid: 55, // ms — prevents audio spam on rapid fire
  };
  private loops = new Map<LoopId, LoopEntry>();
  private footstepTimer = 0;
  private wasOnGround = false;

  constructor(soundManager: Phaser.Sound.BaseSoundManager) {
    this.soundManager = soundManager;
    this.ctx = new AudioContext();
    this.initNoiseBuffer();
  }

  play(id: SoundId): void {
    const now = performance.now();
    const min = this.minInterval[id] ?? 0;
    if (min > 0 && this.lastPlay[id] !== undefined && now - this.lastPlay[id]! < min) return;
    this.lastPlay[id] = now;

    try {
      this.soundManager.play(id, { volume: VOLUMES[id] });
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

      } else if (id === 'missile-flight') {
        // Sine sweep 180 → 500 Hz over 1.5s
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.linearRampToValueAtTime(500, t + 1.5);
        osc.connect(gainNode);
        osc.start(t);
        sources.push(osc);

        gainNode.gain.linearRampToValueAtTime(0.10, t + FADE_IN);
      }

      this.loops.set(id, { sources, gainNode });
    } catch { /* ignore */ }
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

  update(state: AudioUpdateState): void {
    const { onGround, moving, delta } = state;

    // Reset timer on landing to prevent an immediate step sound
    if (!this.wasOnGround && onGround) {
      this.footstepTimer = 280;
    }
    this.wasOnGround = onGround;

    if (onGround && moving) {
      this.footstepTimer -= delta;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 280;
        this.play('footstep');
      }
    } else {
      this.footstepTimer = Math.min(this.footstepTimer, 280);
    }
  }

  private initNoiseBuffer(): void {
    const sr = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, sr, sr);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;
  }
}
