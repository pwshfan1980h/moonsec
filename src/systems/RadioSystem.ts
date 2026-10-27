// Voiced radio traffic: a queue of RADIO_LINES played one at a time with squelch, a static bed and
// the music ducked underneath, while the UI shows the caption for exactly as long as the voice runs.
// Critical lines (training steps, objectives, boss calls) always play; chatter is dropped whenever
// the channel is busy, so ambient talk never delays something the player needs to hear.

import type Phaser from 'phaser';
import { RADIO_LINES, SPEAKERS, type RadioLineId } from '../data/radioScript';
import { ensureVoice, voKey } from './audioAssets';
import type { AudioSystem } from './AudioSystem';

export type RadioPriority = 'critical' | 'normal' | 'chatter';

export interface RadioRequest {
  priority?: RadioPriority;
  /** Queued lines with the same tag are superseded (e.g. an older training instruction). */
  tag?: string;
  /** Cut the line on air if it shares this tag. */
  interrupt?: boolean;
}

interface Queued extends Required<Pick<RadioRequest, 'priority'>> { id: RadioLineId; tag?: string; }

const VOICE_VOLUME = 0.9;
const SQUELCH_LEAD_MS = 140;
const GAP_MS = 450;
/** Silence after any transmission before chatter may start. */
const CHATTER_QUIET_MS = 6000;

export class RadioSystem {
  private queue: Queued[] = [];
  private current?: { line: Queued; sound?: Phaser.Sound.BaseSound };
  private busy = false;
  private destroyed = false;
  private lastEnded = -Infinity;
  private readonly said = new Set<RadioLineId>();
  private readonly timers: Phaser.Time.TimerEvent[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly audio: AudioSystem,
    private readonly duck: (on: boolean) => void,
  ) {}

  /** Queue a line. Returns false when chatter was dropped because the channel is busy. */
  say(id: RadioLineId, req: RadioRequest = {}): boolean {
    if (this.destroyed) return false;
    const priority = req.priority ?? 'normal';
    if (priority === 'chatter' && !this.isQuiet()) return false;
    if (req.tag) {
      this.queue = this.queue.filter((q) => q.tag !== req.tag);
      if (req.interrupt && this.current?.line.tag === req.tag) this.cut();
    }
    const line: Queued = { id, priority, tag: req.tag };
    // critical lines jump ahead of normal ones (but never cut the line on air)
    if (priority === 'critical') {
      const at = this.queue.findIndex((q) => q.priority !== 'critical');
      this.queue.splice(at < 0 ? this.queue.length : at, 0, line);
    } else this.queue.push(line);
    this.said.add(id);
    if (!this.busy) this.next();
    return true;
  }

  /** Say a line at most once per mission. */
  once(id: RadioLineId, req?: RadioRequest): boolean {
    return this.said.has(id) ? false : this.say(id, req);
  }

  /** Nothing on air, nothing queued, and the channel has been silent for a moment. */
  isQuiet(): boolean {
    return !this.busy && this.queue.length === 0 && this.scene.time.now - this.lastEnded > CHATTER_QUIET_MS;
  }

  get onAir(): RadioLineId | undefined { return this.current?.line.id; }

  destroy(): void {
    this.destroyed = true;
    this.queue = [];
    for (const t of this.timers) t.remove(false);
    this.current?.sound?.destroy();
    this.current = undefined;
    this.audio.stopLoop('radio-static');
    this.duck(false);
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line || this.destroyed) { this.busy = false; return; }
    this.busy = true;
    this.current = { line };
    void ensureVoice(this.scene, line.id).then((ok) => {
      if (this.destroyed || this.current?.line !== line) return;
      if (!ok) { this.finish(line, 0); return; }
      this.transmit(line);
    });
  }

  private transmit(line: Queued): void {
    const spec = RADIO_LINES[line.id];
    const speaker = SPEAKERS[spec.speaker];
    const radio = speaker.channel === 'radio';
    this.duck(true);
    if (radio) { this.audio.play('radio-on'); this.audio.startLoop('radio-static'); }
    this.delay(radio ? SQUELCH_LEAD_MS : 0, () => {
      if (this.current?.line !== line) return;
      const sound = this.scene.sound.add(voKey(line.id), { volume: VOICE_VOLUME });
      this.current.sound = sound;
      sound.once('complete', () => this.finish(line, GAP_MS));
      sound.play();
      const ms = Math.round((sound.duration || 3) * 1000);
      // a locked or failed voice never completes; don't let it hold the channel
      this.delay(ms + 1500, () => this.finish(line, GAP_MS));
      this.scene.events.emit('radioTransmission', speaker.name, spec.caption, spec.warning ?? false, ms);
    });
  }

  private finish(line: Queued, gap: number): void {
    if (this.current?.line !== line) return;
    const radio = SPEAKERS[RADIO_LINES[line.id].speaker].channel === 'radio';
    this.current.sound?.destroy();
    this.current = undefined;
    this.lastEnded = this.scene.time.now;
    if (radio) { this.audio.stopLoop('radio-static'); this.audio.play('radio-off'); }
    if (this.queue.length === 0) this.duck(false);
    this.delay(gap, () => this.next());
  }

  /** Drop the line on air (superseded instruction); the queue carries on. */
  private cut(): void {
    const line = this.current?.line;
    if (!line) return;
    this.finish(line, 120);
  }

  private delay(ms: number, fn: () => void): void {
    if (ms <= 0) { fn(); return; }
    this.timers.push(this.scene.time.delayedCall(ms, fn));
  }
}
