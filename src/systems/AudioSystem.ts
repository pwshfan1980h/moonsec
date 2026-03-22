// Procedural audio via Web Audio API — no external files needed for POC

type SoundId = 'rapid' | 'turret' | 'missile' | 'explosion' | 'hit' | 'hurt' | 'jump' | 'death' | 'drone-shoot';

interface ToneConfig {
  freq: number | [number, number]; // [start, end] = sweep
  duration: number;
  type: OscillatorType;
  gain: number;
  filterFreq?: number;
}

const TONES: Record<SoundId, ToneConfig> = {
  rapid:       { freq: 1400, duration: 0.04, type: 'sawtooth',  gain: 0.10, filterFreq: 3000 },
  turret:      { freq: [180, 60],  duration: 0.18, type: 'square',   gain: 0.25, filterFreq: 600  },
  missile:     { freq: [220, 880], duration: 0.30, type: 'sawtooth', gain: 0.18, filterFreq: 2000 },
  explosion:   { freq: [100, 30],  duration: 0.45, type: 'sawtooth', gain: 0.40, filterFreq: 400  },
  hit:         { freq: 440,  duration: 0.06, type: 'square',   gain: 0.12, filterFreq: 2000 },
  hurt:        { freq: [880, 220], duration: 0.20, type: 'square',   gain: 0.20, filterFreq: 1500 },
  jump:        { freq: [300, 600], duration: 0.12, type: 'sine',     gain: 0.15 },
  death:       { freq: [440, 55],  duration: 0.60, type: 'sawtooth', gain: 0.35, filterFreq: 800  },
  'drone-shoot': { freq: 600, duration: 0.06, type: 'square',  gain: 0.08, filterFreq: 2500 },
};

export class AudioSystem {
  private ctx: AudioContext;
  private lastPlay: Partial<Record<SoundId, number>> = {};
  private minInterval: Partial<Record<SoundId, number>> = {
    rapid: 55, // throttle rapid gun clicks
  };

  constructor() {
    this.ctx = new AudioContext();
  }

  play(id: SoundId): void {
    const now = performance.now();
    const min = this.minInterval[id] ?? 0;
    if (min > 0 && this.lastPlay[id] !== undefined && now - this.lastPlay[id]! < min) return;
    this.lastPlay[id] = now;

    const cfg = TONES[id];
    if (!cfg) return;

    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      const t = this.ctx.currentTime;

      osc.type = cfg.type;

      if (Array.isArray(cfg.freq)) {
        osc.frequency.setValueAtTime(cfg.freq[0], t);
        osc.frequency.linearRampToValueAtTime(cfg.freq[1], t + cfg.duration);
      } else {
        osc.frequency.setValueAtTime(cfg.freq, t);
      }

      gainNode.gain.setValueAtTime(cfg.gain, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + cfg.duration);

      if (cfg.filterFreq) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cfg.filterFreq, t);
        osc.connect(filter);
        filter.connect(gainNode);
      } else {
        osc.connect(gainNode);
      }

      gainNode.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + cfg.duration + 0.01);
    } catch {
      // Silently ignore audio errors
    }
  }
}
