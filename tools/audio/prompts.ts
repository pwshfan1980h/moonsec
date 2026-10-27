// ElevenLabs prompts for every non-voice sound in the game. tools/audio/generate.ts renders each
// entry to public/audio/<dir>/<id>[-n].ogg + .m4a; voice lines come from src/data/radioScript.ts.
// Prompts never name artists, films or songs, and music is instrumental.

export interface SfxPrompt {
  text: string;
  seconds: number;
  /** Render this many takes (<id>-1, <id>-2, ...); the game picks one at random per play. */
  variants?: number;
  loop?: boolean;
  influence?: number;
}

export interface MusicPrompt {
  prompt: string;
  seconds: number;
  /** Blend the last seconds into the start so the track loops without a seam. */
  crossfade?: number;
}

const MECH = 'giant armored lunar combat mech';

export const SFX: Record<string, SfxPrompt> = {
  // ── Player weapons ──
  rapid: { text: `Single shot from a ${MECH}'s arm-mounted rapid-fire autocannon, short sharp mechanical bang with a metallic snap and brass casing clink, tight, dry`, seconds: 0.5, variants: 3 },
  turret: { text: `Heavy precision cannon on a ${MECH} firing one round, deep punchy boom, hydraulic recoil clunk, short rising capacitor whine`, seconds: 1.2, variants: 2 },
  'missile-launch': { text: 'Shoulder pod micro-missile launching, sharp ignition pop, rocket hiss whooshing away', seconds: 0.9 },
  'missile-impact': { text: 'Missile hitting a robot, heavy crunchy explosion with deep sub boom and metal shrapnel rain', seconds: 1.8 },
  'missile-ready': { text: 'Military mech weapon system ready indicator, crisp two-tone electronic chirp', seconds: 0.5 },
  'dry-fire': { text: 'Empty mech autocannon dry fire, heavy mechanical clack with a servo whir, no shot', seconds: 0.5 },

  // ── Impacts ──
  hit: { text: 'Bullet striking armored robot plating, sharp metallic ping and crunch with a small spark crackle', seconds: 0.5, variants: 3 },
  eject: { text: 'Bullet ricochet off grey lunar rock, quick zing with a dusty crack', seconds: 0.6, variants: 2 },
  explosion: { text: 'Hostile robot drone exploding, punchy metallic explosion, debris rattling down, short low boom tail', seconds: 1.8, variants: 3 },
  hurt: { text: `Inside the cockpit of a ${MECH} taking a heavy hit, deep metal crunch, electrical sparks, short warning buzz`, seconds: 0.9, variants: 2 },
  emp: { text: 'Electromagnetic pulse hitting a robot, crackling electric zap, systems shorting out with a descending power-down whine', seconds: 1.5 },
  death: { text: `${MECH} critical failure: alarm blip, sparks, heavy internal explosion, servos powering down with a long descending whine and a final metal groan`, seconds: 3.5 },

  // ── Mech body ──
  footstep: { text: `Single heavy footstep of a ${MECH} on dusty ground over metal, deep thud, hydraulic hiss and a metal clank, close`, seconds: 0.6, variants: 4 },
  servo: { text: 'Robot mech joint servo motor, short whirring movement with a hydraulic hiss at the end', seconds: 0.6, variants: 3 },
  jump: { text: `${MECH} jump jets igniting in a short powerful burst, deep thruster whoosh and hydraulic leg push`, seconds: 0.8 },
  surge: { text: 'Mech dash booster burst, fast violent thruster whoosh with electric crackle, passing by', seconds: 0.8 },
  'landing-soft': { text: `${MECH} landing lightly after a short hop, dusty thud and hydraulic suspension compressing`, seconds: 0.7 },
  'landing-heavy': { text: `${MECH} landing hard, deep metal crunch, hydraulic suspension slam, dust`, seconds: 1.0 },
  'landing-slam': { text: 'Massive war robot slamming down from great height, ground-shaking metal impact, debris rattle, long low rumble', seconds: 2.0 },
  'mech-boot': { text: `${MECH} powering up: electrical hum rising, servos cycling one by one, hydraulic hiss, heavy clunk of systems locking in, soft cockpit beeps`, seconds: 3.5 },
  'nanite-heal': { text: 'Swarm of repair nanobots spreading over metal armor, rising glittering electronic shimmer with soft welding crackle', seconds: 2.0 },
  'nanite-tick': { text: 'Tiny electronic repair tick, soft high click with a faint spark', seconds: 0.5 },

  // ── World and enemies ──
  'drone-shoot': { text: 'Hostile robot energy blaster firing a single pulse, buzzy sci-fi zap with a metallic edge', seconds: 0.5, variants: 2 },
  'enemy-charge': { text: 'Robot war machine revving to charge, aggressive motor rev and metal screech', seconds: 1.0 },
  'warden-charge': { text: 'Ominous energy weapon charging up, deep rising hum and growing electric whine', seconds: 1.7 },
  'warden-shield': { text: 'Energy shield powering on with a deep electric thrum and a glassy shimmer', seconds: 1.2 },
  pickup: { text: 'Salvage pickup collected, bright clean sci-fi blip with a soft metallic chime', seconds: 0.6 },
  'relay-online': { text: 'Sci-fi relay station coming online, rising electrical hum resolving into a confident confirmation chime', seconds: 2.5 },

  // ── Interface ──
  'ui-nav': { text: 'Retro sci-fi computer interface tick, short soft click beep', seconds: 0.5 },
  'ui-confirm': { text: 'Sci-fi computer interface confirm, two-tone affirmative beep with a soft mechanical latch', seconds: 0.7 },
  'wave-alert': { text: 'Military sci-fi combat alert, one short ominous klaxon blast with radio static', seconds: 1.5 },
  'boss-alarm': { text: 'Deep sci-fi base alarm siren, two slow ominous wails', seconds: 3.0 },
  streak: { text: 'Short heroic sci-fi accent, bright punchy synth stab with a metallic shimmer', seconds: 0.8 },
  'radio-on': { text: 'Military radio transmission squelch, click and a short burst of static opening the channel', seconds: 0.5 },
  'radio-off': { text: 'Military radio squelch tail, short static burst ending with a click', seconds: 0.5 },

  // ── Loops ──
  jetpack: { text: 'Mech jetpack thrusters sustained burn, steady roaring rocket thrust with low rumble, constant level', seconds: 3, loop: true },
  missile: { text: 'Small missile rocket motor in flight, steady hissing roar, constant level', seconds: 2, loop: true },
  'missile-reload': { text: 'Mech missile pod reloading, steady mechanical ratcheting with servo whir, constant', seconds: 2, loop: true },
  uplink: { text: 'Data uplink transmission, digital chirps and warbling modem tones, steady', seconds: 3, loop: true },
  'radio-static': { text: 'Radio static bed, soft crackly hiss with faint interference warble, constant level', seconds: 4, loop: true },

  // ── Ambience (one bed per mission theme) ──
  'amb-surface': { text: `Inside a ${MECH} cockpit on the Moon: low air recycler hum, faint electronics ticking, very distant deep rumbles, quiet and lonely, constant`, seconds: 12, loop: true, influence: 0.5 },
  'amb-trade-lanes': { text: 'Space freight rail yard heard through a hull: distant heavy machinery, cargo clanks, low engine drones, constant', seconds: 12, loop: true, influence: 0.5 },
  'amb-deep-facility': { text: 'Deep underground mining facility: dripping water, distant drills, low ventilation drone, eerie metal creaks, constant', seconds: 12, loop: true, influence: 0.5 },
  'amb-orbital': { text: 'Orbital space station interior: soft life-support hum, gentle hull creaks, distant thruster puffs, constant', seconds: 12, loop: true, influence: 0.5 },
  'amb-nexus-core': { text: 'Inside a hostile machine core: pulsing electrical hum, ominous low drone, faint digital chatter, constant', seconds: 12, loop: true, influence: 0.5 },
};

const NO_VOX = 'instrumental only, no vocals, no choir singing words';

export const MUSIC: Record<string, MusicPrompt> = {
  title: { prompt: `Dark cinematic sci-fi title theme for a lonely lunar mech game. Slow cold analog synth pads over a deep pulsing bass, distant metallic percussion, a simple haunting synth melody, sense of isolation and resolve, D minor, 84 BPM, ${NO_VOX}`, seconds: 90, crossfade: 4 },

  'surface-explore': { prompt: `Sparse ambient lunar exploration music. Cold analog synth drones, soft pulsing bass, faint ticking percussion, lonely and quietly tense, D minor, 100 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },
  'surface-combat': { prompt: `Driving industrial sci-fi combat music for a mech battle on the Moon. Heavy punchy drums, distorted analog bass, urgent arpeggiated synths, gritty, D minor, 100 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },

  'trade-lanes-explore': { prompt: `Industrial space freight yard ambience music. Clanking metallic percussion in a mechanical rhythm, low synth drone, muted bass pulse, G minor, 112 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },
  'trade-lanes-combat': { prompt: `Fast industrial sci-fi action music. Pounding metal percussion, aggressive sequenced bass, sharp synth stabs, relentless machine rhythm, G minor, 112 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },

  'deep-facility-explore': { prompt: `Claustrophobic underground sci-fi horror ambience music. Low drones, distant metal scrapes, slow heartbeat bass, unsettling sparse synth notes, B flat minor, 84 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },
  'deep-facility-combat': { prompt: `Tense dark sci-fi horror combat music. Heavy tribal industrial drums, grinding distorted bass, dissonant synth swells, B flat minor, 84 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },

  'orbital-explore': { prompt: `Weightless orbital space station music. Wide shimmering synth pads, slow bell-like synth arpeggio, soft sub bass, vast and melancholic, E minor, 90 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },
  'orbital-combat': { prompt: `Soaring urgent space battle music. Wide synth pads, driving electronic drums, pulsing bass, heroic synth lead, E minor, 90 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },

  'nexus-core-explore': { prompt: `Ominous machine intelligence ambience music. Glitchy digital textures, deep throbbing bass, cold detuned synth pads, menacing and alien, D phrygian, 124 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },
  'nexus-core-combat': { prompt: `Aggressive glitch industrial combat music against a rogue AI. Distorted breakbeat drums, screaming detuned synth bass, frantic arpeggios, D phrygian, 124 BPM, seamless loop, ${NO_VOX}`, seconds: 70, crossfade: 3 },

  boss: { prompt: `Intense sci-fi boss battle music against a giant war machine. Pounding industrial war drums, huge distorted bass synth, ominous brass-like synth stabs, rising tension, D minor, 132 BPM, seamless loop, ${NO_VOX}`, seconds: 90, crossfade: 3 },
  'boss-final': { prompt: `Epic final boss music against a rogue machine god. Massive industrial drums, wordless synthetic choir pads, distorted bass, desperate heroic synth melody, D phrygian, 136 BPM, seamless loop, ${NO_VOX}`, seconds: 90, crossfade: 3 },

  victory: { prompt: `Short triumphant sci-fi victory fanfare. Warm synth brass, uplifting chord resolution, ends cleanly, D major, ${NO_VOX}`, seconds: 10 },
  defeat: { prompt: `Short somber sci-fi game over sting. Slow fading cold synth pad, minor chord, lonely distant pulse, ends in silence, D minor, ${NO_VOX}`, seconds: 12 },
};
