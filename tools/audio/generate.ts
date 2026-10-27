// Renders the game's audio with ElevenLabs and commits the results as static files.
//
//   npm run audio                         # everything missing (reuses cached downloads)
//   npm run audio -- --kind vo            # one family: sfx | vo | music
//   npm run audio -- --only rapid,title   # regenerate just these ids (calls ElevenLabs again)
//   npm run audio -- --dry-run            # validate every request without spending credits
//   npm run audio -- --reprocess          # re-run ffmpeg on cached downloads (filter tweaks)
//
// Requests go through the `elevenlabs` CLI (npm i -g @elevenlabs/cli; `elevenlabs auth login`).
// Raw downloads are cached in build/audio_raw/ (ignored); processed audio is written to
// public/audio/{sfx,vo,music}/<id>.ogg + .m4a (Vorbis for most browsers, AAC for Safari).
// Building or running the game never needs an ElevenLabs account.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { MUSIC, SFX } from './prompts.ts';
import { RADIO_LINES, SPEAKERS } from '../../src/data/radioScript.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const RAW = path.join(ROOT, 'build/audio_raw');
const OUT = path.join(ROOT, 'public/audio');

type Kind = 'sfx' | 'vo' | 'music';
interface Job {
  kind: Kind;
  id: string;
  command: string[];
  body: Record<string, unknown>;
  format: string;
  /** ffmpeg filter chain applied to the download before encoding. */
  filter: string;
  channels: 1 | 2;
  loop?: boolean;
  crossfade?: number;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const only = option('only')?.split(',');
const kindFilter = option('kind') as Kind | undefined;

// Trim the model's lead-in silence so one-shots fire on the frame they are triggered.
const TRIM_HEAD = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01';
const TRIM_TAIL = 'areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse';
const PEAK = 'alimiter=limit=0.89:level=false';
// Transmissions: phone-band voice, squeezed and slightly crushed, like a suit radio.
const RADIO = 'highpass=f=320,lowpass=f=3300,acompressor=threshold=0.08:ratio=6:attack=3:release=80:makeup=3,acrusher=bits=11:mix=0.18:mode=log,highpass=f=280';
// HARROW's own voice: full band with a short metallic comb so it reads as the machine.
const COCKPIT = 'highpass=f=140,aecho=0.8:0.7:7|13:0.35|0.25,acompressor=threshold=0.1:ratio=4:attack=5:release=120:makeup=2';

function jobs(): Job[] {
  const list: Job[] = [];
  for (const [id, p] of Object.entries(SFX)) {
    const takes = p.variants ?? 1;
    for (let n = 1; n <= takes; n++) {
      list.push({
        kind: 'sfx', id: takes > 1 ? `${id}-${n}` : id,
        command: ['text-to-sound-effects', 'convert'],
        body: { text: p.text, duration_seconds: p.seconds, prompt_influence: p.influence ?? 0.6, model_id: 'eleven_text_to_sound_v2', ...(p.loop ? { loop: true } : {}) },
        format: 'mp3_44100_128',
        filter: p.loop ? '' : `${TRIM_HEAD},${TRIM_TAIL},afade=t=out:st=${Math.max(0, p.seconds - 0.08)}:d=0.08`,
        channels: 1, loop: p.loop,
      });
    }
  }
  for (const [id, line] of Object.entries(RADIO_LINES)) {
    const speaker = SPEAKERS[line.speaker];
    list.push({
      kind: 'vo', id,
      command: ['text-to-speech', 'convert', '--voice-id', speaker.voiceId],
      body: { text: (line.say ?? line.caption).replace(/HARROW/g, 'Harrow'), model_id: 'eleven_v3', voice_settings: { stability: speaker.stability } },
      format: 'mp3_44100_128',
      filter: `${TRIM_HEAD},${TRIM_TAIL},${speaker.channel === 'radio' ? RADIO : COCKPIT},loudnorm=I=-16:TP=-1.5:LRA=9`,
      channels: 1,
    });
  }
  for (const [id, m] of Object.entries(MUSIC)) {
    list.push({
      kind: 'music', id,
      command: ['music', 'compose'],
      body: { prompt: m.prompt, music_length_ms: m.seconds * 1000, force_instrumental: true, model_id: 'music_v2_5' },
      format: 'mp3_44100_192',
      filter: '', channels: 2, loop: !!m.crossfade, crossfade: m.crossfade,
    });
  }
  return list.filter((j) => (!kindFilter || j.kind === kindFilter) && (!only || only.includes(j.id) || only.includes(j.id.replace(/-\d+$/, ''))));
}

function run(cmd: string, argv: string[]): string {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.slice(0, 4).join(' ')} failed:\n${r.stderr || r.stdout}`);
  return `${r.stdout}${r.stderr}`;
}

function runAsync(cmd: string, argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stdout.on('data', (d) => { err += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv.slice(0, 3).join(' ')}: ${err.trim()}`))));
  });
}

const duration = (file: string) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
const peakDb = (file: string) => Number(/max_volume: (-?[\d.]+) dB/.exec(run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']))![1]);
const loudness = (file: string) => Number(/Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS/.exec(run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-']))![1]);

/** Download → filter / loop blend → level → Vorbis + AAC. */
function process_(job: Job, raw: string): void {
  const dir = path.join(OUT, job.kind);
  mkdirSync(dir, { recursive: true });
  const wav = path.join(RAW, job.kind, `${job.id}.processed.wav`);
  const wet = path.join(RAW, job.kind, `${job.id}.filtered.wav`);
  const base = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (job.crossfade) {
    // Blend the tail into the head: the loop point then joins continuous audio.
    const len = duration(raw), cf = job.crossfade;
    const graph = `[0:a]atrim=${len - cf}:${len},asetpts=PTS-STARTPTS,afade=t=out:d=${cf}[tail];`
      + `[0:a]atrim=0:${cf},asetpts=PTS-STARTPTS,afade=t=in:d=${cf}[head];`
      + `[tail][head]amix=inputs=2:normalize=0[blend];`
      + `[0:a]atrim=${cf}:${len - cf},asetpts=PTS-STARTPTS[body];[blend][body]concat=n=2:v=0:a=1[out]`;
    run('ffmpeg', [...base, '-i', raw, '-filter_complex', graph, '-map', '[out]', '-ac', '2', '-ar', '44100', wet]);
  } else {
    run('ffmpeg', [...base, '-i', raw, ...(job.filter ? ['-af', job.filter] : []), '-ac', String(job.channels), '-ar', '44100', wet]);
  }
  // Loops and music get one static gain (time-varying gain would step at the seam): music to
  // -16 LUFS under a limiter, effect loops to a -3 dB peak. Everything else is peak-limited.
  const level = job.kind === 'music' ? `volume=${(-16 - loudness(wet)).toFixed(2)}dB,${PEAK}`
    : job.loop ? `volume=${(-3 - peakDb(wet)).toFixed(2)}dB`
    : job.kind === 'sfx' ? `volume=${(-1 - peakDb(wet)).toFixed(2)}dB` : 'anull';
  run('ffmpeg', [...base, '-i', wet, '-af', level, wav]);
  const out = path.join(dir, job.id);
  run('oggenc', ['--quiet', '-q', job.kind === 'music' ? '1' : '2', '-o', `${out}.ogg`, wav]);
  run('ffmpeg', [...base, '-i', wav, '-c:a', 'aac', '-b:a', job.channels === 2 ? '96k' : '64k', '-movflags', '+faststart', `${out}.m4a`]);
  console.log(`  ${job.kind}/${job.id}  ${duration(`${out}.ogg`).toFixed(2)}s  ${(statSync(`${out}.ogg`).size / 1024).toFixed(0)} KB`);
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => { for (let item; (item = queue.shift()) !== undefined;) await work(item); }));
}

async function main(): Promise<void> {
  const list = jobs();
  const failures: string[] = [];
  const work = async (job: Job) => {
    const raw = path.join(RAW, job.kind, `${job.id}.mp3`);
    mkdirSync(path.dirname(raw), { recursive: true });
    const outOgg = path.join(OUT, job.kind, `${job.id}.ogg`);
    const fetch = flag('dry-run') || !!only || !existsSync(raw);
    if (!fetch && existsSync(outOgg) && !flag('reprocess')) return;
    try {
      if (fetch) {
        const argv = [...job.command, '-o', raw, '--output-format', job.format, '--json', JSON.stringify(job.body)];
        if (flag('dry-run')) { await runAsync('elevenlabs', [...argv, '--dry-run']); console.log(`  ok ${job.kind}/${job.id}`); return; }
        console.log(`  generating ${job.kind}/${job.id}`);
        await runAsync('elevenlabs', argv);
      }
      process_(job, raw);
    } catch (e) {
      failures.push(job.id);
      console.error(`  FAILED ${job.kind}/${job.id}: ${(e as Error).message.slice(0, 400)}`);
    }
  };
  // Music generation is concurrency-limited per account; four parallel composes get rejected.
  await Promise.all([
    pool(list.filter((j) => j.kind !== 'music'), flag('dry-run') ? 8 : 4, work),
    pool(list.filter((j) => j.kind === 'music'), flag('dry-run') ? 8 : 2, work),
  ]);
  console.log(`${list.length - failures.length}/${list.length} done${failures.length ? `; failed: ${failures.join(', ')}` : ''}`);
  if (failures.length) process.exitCode = 1;
}

void main();
