import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { RadioSystem } from '../systems/RadioSystem';

/** Scene double: voices are always cached, timers run when `advance` is called. */
function fixture() {
  const timers: { at: number; fn: () => void; removed?: boolean }[] = [];
  const voices: (EventEmitter & { key: string; duration: number; play: () => void; destroy: () => void; destroyed?: boolean })[] = [];
  const time = {
    now: 0,
    delayedCall(ms: number, fn: () => void) { const t = { at: time.now + ms, fn, remove() { t.removed = true; } } as any; timers.push(t); return t; },
  };
  const advance = async (ms: number) => {
    await Promise.resolve();
    const end = time.now + ms;
    for (;;) {
      const due = timers.filter((t) => !t.removed && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.removed = true;
      time.now = due.at;
      due.fn();
      await Promise.resolve();
    }
    time.now = end;
  };
  const events = new EventEmitter();
  const scene: any = {
    time, events,
    cache: { audio: { exists: () => true } },
    sound: {
      add(key: string) {
        const v = Object.assign(new EventEmitter(), { key, duration: 2, play: vi.fn(), destroy() { v.destroyed = true; } }) as any;
        voices.push(v);
        return v;
      },
    },
  };
  const audio: any = { play: vi.fn(), startLoop: vi.fn(), stopLoop: vi.fn() };
  const duck = vi.fn();
  const radio = new RadioSystem(scene, audio, duck);
  const shown: string[] = [];
  events.on('radioTransmission', (speaker: string, caption: string) => shown.push(`${speaker}: ${caption}`));
  /** Finish the line currently on air. */
  const complete = async () => { voices[voices.length - 1].emit('complete'); await advance(800); };
  return { radio, audio, duck, voices, shown, advance, complete };
}

describe('RadioSystem', () => {
  it('plays lines in order with squelch, static and ducking around radio calls', async () => {
    const f = fixture();
    f.radio.say('tut-intro');
    f.radio.say('tut-jump');
    await f.advance(200);
    expect(f.audio.play).toHaveBeenCalledWith('radio-on');
    expect(f.audio.startLoop).toHaveBeenCalledWith('radio-static');
    expect(f.duck).toHaveBeenLastCalledWith(true);
    expect(f.voices.map((v) => v.key)).toEqual(['vo:tut-intro']);
    expect(f.shown[0]).toMatch(/^LUNAR CONTROL: /);
    await f.complete();
    expect(f.audio.play).toHaveBeenCalledWith('radio-off');
    expect(f.voices.map((v) => v.key)).toEqual(['vo:tut-intro', 'vo:tut-jump']);
    await f.complete();
    expect(f.duck).toHaveBeenLastCalledWith(false);
  });

  it('keeps HARROW onboard lines off the radio band', async () => {
    const f = fixture();
    f.radio.say('sys-online');
    await f.advance(10);
    expect(f.audio.play).not.toHaveBeenCalledWith('radio-on');
    expect(f.shown[0]).toMatch(/^HARROW: /);
  });

  it('supersedes queued lines with the same tag and cuts a stale instruction on air', async () => {
    const f = fixture();
    f.radio.say('tut-jump', { tag: 'tut' });
    f.radio.say('tut-dash', { tag: 'tut' });
    await f.advance(200);
    expect(f.voices.map((v) => v.key)).toEqual(['vo:tut-jump']); // tut-dash replaced nothing yet: jump already on air
    f.radio.say('tut-target', { tag: 'tut', interrupt: true });
    await f.advance(400);
    expect(f.voices[0].destroyed).toBe(true);
    expect(f.voices.map((v) => v.key)).toEqual(['vo:tut-jump', 'vo:tut-target']);
  });

  it('puts critical lines ahead of normal traffic and drops chatter on a busy channel', async () => {
    const f = fixture();
    f.radio.say('chat-control-1');
    f.radio.say('lanes-w1');
    f.radio.say('lanes-boss', { priority: 'critical' });
    expect(f.radio.say('chat-dock-1', { priority: 'chatter' })).toBe(false);
    await f.advance(200);
    await f.complete();
    expect(f.voices.map((v) => v.key)).toEqual(['vo:chat-control-1', 'vo:lanes-boss']);
    await f.complete();
    await f.complete();
    expect(f.radio.isQuiet()).toBe(false); // just ended: still within the quiet window
    await f.advance(7000);
    expect(f.radio.isQuiet()).toBe(true);
    expect(f.radio.say('chat-dock-1', { priority: 'chatter' })).toBe(true);
  });

  it('says a line once per mission, and releases the channel if a voice never completes', async () => {
    const f = fixture();
    expect(f.radio.once('surf-core')).toBe(true);
    expect(f.radio.once('surf-core')).toBe(false);
    await f.advance(200 + 2000 + 1500 + 500);
    expect(f.audio.stopLoop).toHaveBeenCalledWith('radio-static');
    f.radio.destroy();
    expect(f.duck).toHaveBeenLastCalledWith(false);
  });
});
