// Every game sound is a static ElevenLabs render (tools/audio/generate.ts, loaded in BootScene).
// Effects with several takes pick one at random and get a little pitch jitter, so rapid fire and
// footfalls never sound like the same sample twice in a row.

import type Phaser from 'phaser';
import { AMBIENCE, SFX_TAKES, sfxKey, type LoopId, type SfxId } from './audioAssets';
import type { MusicTheme } from '../data/levelConfigs';

export type SoundId = SfxId;
export type { LoopId };

// Volume per sound (Phaser normalises 0–1; files are peak-normalised to -1 dBFS)
const VOLUMES: Record<SoundId, number> = {
  rapid:            0.30,
  turret:           0.60,
  'missile-launch': 0.50,
  'missile-impact': 0.75,
  'missile-ready':  0.35,
  'dry-fire':       0.40,
  hit:              0.35,
  eject:            0.20,
  explosion:        0.60,
  hurt:             0.65,
  emp:              0.75,
  death:            0.85,
  footstep:         0.45,
  servo:            0.22,
  jump:             0.50,
  surge:            0.55,
  'landing-soft':   0.40,
  'landing-heavy':  0.60,
  'landing-slam':   0.85,
  'mech-boot':      0.55,
  'nanite-heal':    0.50,
  'nanite-tick':    0.25,
  'drone-shoot':    0.30,
  'enemy-charge':   0.55,
  'warden-charge':  0.60,
  'warden-shield':  0.50,
  pickup:           0.45,
  'relay-online':   0.60,
  'ui-nav':         0.30,
  'ui-confirm':     0.45,
  'wave-alert':     0.45,
  'boss-alarm':     0.55,
  streak:           0.40,
  'radio-on':       0.35,
  'radio-off':      0.30,
};

const LOOP_VOLUMES: Record<LoopId, number> = {
  jetpack: 0.40, missile: 0.25, 'missile-reload': 0.22, uplink: 0.30, 'radio-static': 0.06,
};

/** Cents of random detune per play; sounds heard many times in a row vary the most. */
const JITTER: Partial<Record<SoundId, number>> = {
  rapid: 60, hit: 120, eject: 150, explosion: 90, footstep: 70, servo: 120, 'drone-shoot': 80, 'nanite-tick': 100, pickup: 40,
};

const AMBIENCE_VOLUME = 0.32;

export class AudioSystem {
  private readonly sound: Phaser.Sound.BaseSoundManager;
  private lastPlay: Partial<Record<SoundId, number>> = {};
  private readonly minInterval: Partial<Record<SoundId, number>> = {
    rapid: 55, // ms — prevents audio spam on rapid fire
    'nanite-tick': 550,
    eject: 80,  // geometry-impact throttle — prevents stacking during sustained fire
    hit:   70,  // enemy-impact throttle
    servo: 180,
  };
  private lastTake: Partial<Record<SoundId, number>> = {};
  private loops = new Map<LoopId, Phaser.Sound.BaseSound>();
  private ambience?: Phaser.Sound.BaseSound;
  private stepSide = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.sound = scene.sound;
  }

  /** Stop every loop this instance owns (scene shutdown / restart). One-shots finish on their own. */
  destroy(): void {
    for (const s of this.loops.values()) { this.scene.tweens?.killTweensOf(s); s.destroy(); }
    this.loops.clear();
    if (this.ambience) { this.scene.tweens?.killTweensOf(this.ambience); this.ambience.destroy(); this.ambience = undefined; }
  }

  play(id: SoundId): void {
    const now = performance.now();
    const min = this.minInterval[id] ?? 0;
    if (min > 0 && this.lastPlay[id] !== undefined && now - this.lastPlay[id]! < min) return;
    this.lastPlay[id] = now;
    this.playAt(id, {});
  }

  playAt(id: SoundId, opts: { rate?: number; detune?: number; volume?: number }): void {
    const jitter = JITTER[id] ?? 0;
    try {
      this.sound.play(this.pickTake(id), {
        volume: opts.volume ?? VOLUMES[id],
        rate:   opts.rate ?? 1,
        detune: (opts.detune ?? 0) + (Math.random() * 2 - 1) * jitter,
      });
    } catch { /* ignore — sound not yet loaded or context suspended */ }
  }

  /** A random take, never the same one twice in a row. */
  private pickTake(id: SoundId): string {
    const takes = SFX_TAKES[id];
    if (takes === 1) return sfxKey(id);
    let n = 1 + Math.floor(Math.random() * takes);
    if (n === this.lastTake[id]) n = (n % takes) + 1;
    this.lastTake[id] = n;
    return sfxKey(id, n);
  }

  startLoop(id: LoopId): void {
    if (this.loops.has(id)) return;
    try {
      const s = this.sound.add(sfxKey(id), { loop: true, volume: 0 });
      s.play();
      this.loops.set(id, s);
      this.scene.tweens.add({ targets: s, volume: LOOP_VOLUMES[id], duration: 60 });
    } catch { /* ignore */ }
  }

  stopLoop(id: LoopId): void {
    const s = this.loops.get(id);
    if (!s) return;
    this.loops.delete(id);
    this.scene.tweens.killTweensOf(s);
    this.scene.tweens.add({ targets: s, volume: 0, duration: 90, onComplete: () => s.destroy() });
  }

  /** The mission's environmental bed, faded in under the music. */
  startAmbience(theme: MusicTheme): void {
    if (this.ambience) return;
    try {
      const s = this.sound.add(sfxKey(AMBIENCE[theme]), { loop: true, volume: 0 });
      s.play();
      this.ambience = s;
      this.scene.tweens.add({ targets: s, volume: AMBIENCE_VOLUME, duration: 3000 });
    } catch { /* ignore */ }
  }

  /** Lowers the bed (e.g. while a radio call plays or on the result screen). */
  setAmbienceLevel(level: number, ms = 400): void {
    if (!this.ambience) return;
    this.scene.tweens.killTweensOf(this.ambience);
    this.scene.tweens.add({ targets: this.ambience, volume: AMBIENCE_VOLUME * level, duration: ms });
  }

  /** Game over: the cockpit bed sinks away. */
  startDeathAmbient(): void { this.setAmbienceLevel(0.25, 2500); }
  stopDeathAmbient(): void { this.setAmbienceLevel(1, 500); }

  playMissileReady(): void { this.play('missile-ready'); }

  playWaveStinger(): void { this.play('wave-alert'); }

  /** Kill-streak accent; bigger streaks ring higher. */
  playStreakChime(milestone: number): void {
    const detune: Record<number, number> = { 3: 0, 5: 300, 10: 700, 20: 1200 };
    this.playAt('streak', { detune: detune[milestone] ?? 0 });
  }

  /** Rig footfall at `weight` (0..1): left and right feet differ a little, heavier steps land louder. */
  footstep(weight: number): void {
    this.stepSide ^= 1;
    const w = Math.max(0.2, Math.min(1, weight));
    this.playAt('footstep', { volume: VOLUMES.footstep * (0.55 + 0.45 * w), detune: this.stepSide ? 0 : -60 });
    if (w > 0.6 && Math.random() < 0.35) this.play('servo');
  }
}
