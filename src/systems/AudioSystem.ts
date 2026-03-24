// Procedural audio via Web Audio API — no external files needed

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

interface ToneConfig {
  freq: number | [number, number];
  duration: number;
  type: OscillatorType;
  gain: number;
  filterFreq?: number;
}

const TONES: Record<SoundId, ToneConfig> = {
  rapid:           { freq: 1400,       duration: 0.04, type: 'sawtooth', gain: 0.10, filterFreq: 3000 },
  turret:          { freq: [180, 60],  duration: 0.18, type: 'square',   gain: 0.25, filterFreq: 600  },
  hit:             { freq: 440,        duration: 0.06, type: 'square',   gain: 0.12, filterFreq: 2000 },
  hurt:            { freq: [880, 220], duration: 0.20, type: 'square',   gain: 0.20, filterFreq: 1500 },
  jump:            { freq: [300, 600], duration: 0.12, type: 'sine',     gain: 0.15 },
  death:           { freq: [440, 55],  duration: 0.60, type: 'sawtooth', gain: 0.35, filterFreq: 800  },
  'drone-shoot':   { freq: 600,        duration: 0.06, type: 'square',   gain: 0.08, filterFreq: 2500 },
  // explosion and missile-impact are handled by layered private methods — play() routes them
  explosion:       { freq: [80, 15],   duration: 0.8,  type: 'sine',     gain: 0.50 },
  footstep:        { freq: 0,          duration: 0.012, type: 'sine',    gain: 0.07 },
  'missile-impact':{ freq: [60, 12],   duration: 0.9,  type: 'sine',     gain: 0.50 },
};

export class AudioSystem {
  private ctx: AudioContext;
  private lastPlay: Partial<Record<SoundId, number>> = {};
  private minInterval: Partial<Record<SoundId, number>> = {
    rapid: 55,
  };
  private loops = new Map<LoopId, LoopEntry>();
  private noiseBuffer!: AudioBuffer;
  private footstepTimer = 0;
  private wasOnGround = false;

  constructor() {
    this.ctx = new AudioContext();
    this.initNoiseBuffer();
  }

  private initNoiseBuffer(): void {
    const sr = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, sr, sr);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;
  }

  play(id: SoundId): void {
    if (id === 'explosion')       { this.playExplosion();     return; }
    if (id === 'missile-impact')  { this.playMissileImpact(); return; }
    if (id === 'footstep')        { this.playFootstep();      return; }

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

  startLoop(_id: LoopId): void { /* Task 3 */ }
  stopLoop(_id: LoopId): void  { /* Task 3 */ }

  update(_state: AudioUpdateState): void { /* Task 4 */ }

  private playNoiseLayer(filterType: BiquadFilterType, filterFreq: number, duration: number, gain: number): void {
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, t);

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(gain, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

      src.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      src.start(t);
      src.stop(t + duration + 0.01);
    } catch { /* ignore */ }
  }

  private playOscLayer(type: OscillatorType, freqStart: number, freqEnd: number, duration: number, gain: number): void {
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, t);
      osc.frequency.linearRampToValueAtTime(freqEnd, t + duration);

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(gain, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.01);
    } catch { /* ignore */ }
  }

  private playExplosion(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playOscLayer('sine',     80,  15, 0.8, 0.50); // sub-bass
    this.playNoiseLayer('lowpass', 300,     0.6, 0.40); // noise rumble
    this.playOscLayer('sawtooth', 120, 40, 0.5, 0.30); // mid crunch
  }

  private playMissileImpact(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playOscLayer('sine',     60,  12, 0.9, 0.50); // deep sub-bass
    this.playNoiseLayer('lowpass', 200,     0.7, 0.45); // noise through lowpass
    this.playOscLayer('sawtooth', 300, 80, 0.3, 0.20); // high crack
  }

  private playFootstep(): void { /* Task 4 */ }
}
