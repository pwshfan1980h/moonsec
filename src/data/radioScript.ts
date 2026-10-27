// Every voiced radio line in the game. `caption` is what the radio panel shows; `say` is what the
// voice actor reads (Eleven v3 audio tags in brackets), defaulting to the caption. The audio
// generator (tools/audio/generate.ts) renders each line to public/audio/vo/<id>.

export type Speaker = 'control' | 'command' | 'harrow' | 'survey' | 'dock' | 'habitat';

export interface SpeakerSpec {
  /** Tag shown on the radio panel. */
  name: string;
  voiceId: string;
  /** `radio`: band-limited transmission with squelch. `cockpit`: HARROW's own onboard voice. */
  channel: 'radio' | 'cockpit';
  /** Eleven voice settings: lower stability = more expressive delivery. */
  stability: number;
}

export const SPEAKERS: Record<Speaker, SpeakerSpec> = {
  control: { name: 'LUNAR CONTROL', voiceId: 'EXAVITQu4vr4xnSDxMaL', channel: 'radio', stability: 0.5 },
  command: { name: 'PRIORITY', voiceId: 'pNInz6obpgDQGcFmaJgB', channel: 'radio', stability: 0.5 },
  harrow: { name: 'HARROW', voiceId: 'SAz9YHcvj6GT2YYXdXww', channel: 'cockpit', stability: 1 },
  survey: { name: 'SURVEY SEVEN', voiceId: 'iP95p4xoKVk53GoZ742B', channel: 'radio', stability: 0.5 },
  dock: { name: 'DOCK NINE', voiceId: 'N2lVS1w4EtoT3dr4eOWO', channel: 'radio', stability: 0.5 },
  habitat: { name: 'HABITAT RING', voiceId: 'XrExE9yKIg1WjnnlVkGX', channel: 'radio', stability: 0.5 },
};

export interface RadioLine {
  speaker: Speaker;
  caption: string;
  say?: string;
  /** Warning styling on the panel (boss calls, critical alerts). */
  warning?: boolean;
}

const line = (speaker: Speaker, caption: string, say?: string, warning = false): RadioLine => ({ speaker, caption, say, warning });

export const RADIO_LINES = {
  // ── Surface Ops training ─────────────────────────────────────────────────
  'tut-intro': line('control', 'Lunar Control to HARROW. Good copy. Before we send you out, let us warm up your systems.',
    '[calm] Lunar Control to HARROW, radio check... good copy. Before we send you out, let\'s warm up your systems.'),
  'tut-jump': line('control', 'Walk it forward with A and D. SPACE to jump; hold it in the air and the thrusters carry you.',
    'Walk it forward with A and D. Hit space to jump... and hold it in the air, the thrusters will carry you.'),
  'tut-dash': line('control', 'Thrusters look clean. Now the surge drive: SHIFT dashes you the way you are moving.',
    '[pleased] Thrusters look clean. Now the surge drive. Shift dashes you in whatever direction you\'re moving.'),
  'tut-target': line('control', 'Nice burst. Practice target downrange. Aim with the mouse: left click turret, right click rapid fire.',
    '[impressed] Nice burst. Last check. There\'s a practice target downrange. Aim with the mouse... left click for the turret, right click for rapid fire.'),
  'tut-complete': line('control', 'Target down. Survey relay is dark just ahead; go wake it up. Q runs repair nanites. Do not heal under fire.',
    '[warmly] Target down. Systems checked, HARROW. The survey relay is dark just ahead... go wake it up. And if your armor gets chewed up, Q runs the repair nanites. Just don\'t heal under fire.'),
  'tut-gate-1': line('control', 'Hold up, HARROW. Finish your checks before you leave the range.',
    '[firmly] Hold up, HARROW. Finish your checks before you leave the range.'),
  'tut-gate-2': line('control', 'Negative, HARROW. Range is locked until training is complete.',
    '[slightly amused] Negative, HARROW. Range stays locked until you finish training.'),

  // ── Surface Ops mission ──────────────────────────────────────────────────
  'surf-contact-1': line('control', 'Contacts at the survey relay. Small patrol. Clear them out.',
    '[alert] Contacts at the survey relay. Small patrol... clear them out.'),
  'surf-contact-2': line('control', 'Habitat relay is crawling. Use the low roofs for an angle. If a Ram charges, surge clear.',
    '[urgent] Habitat relay is crawling with them. Use those low roofs for an angle... and if a Ram charges, surge out of the way.'),
  'surf-contact-3': line('control', 'Uplink relay. This is their main line. Watch the warning lines and keep moving.',
    '[tense] Uplink relay. This is their main line, HARROW. Watch the warning lines and keep moving.'),
  'surf-clear': line('control', 'Perimeter clear. Step into the relay ring and hold F to bring it online.',
    '[relieved] Perimeter clear. Step into the relay ring and hold F to bring it online.'),
  'surf-relay-1': line('control', 'Survey relay online. Telemetry is back. Engineering is pushing you a field module; pick one.',
    '[happy] Survey relay online! We\'re getting telemetry again. Engineering\'s pushing you a field module... pick one.'),
  'surf-relay-2': line('habitat', 'Habitat relay is up. Lights are back on in here. Thank you, HARROW.',
    '[emotional] Habitat relay is up... the lights are back on in here. Thank you, HARROW.'),
  'surf-relay-3': line('control', 'Uplink online. That is the whole surface network. Wait, something big on seismic, east of you.',
    '[excited] Uplink online, that\'s the whole surface network! [pause] [concerned] Wait... something big on seismic. East of you.'),
  'surf-boss': line('command', 'Warden-class contact. Jump the ground sweep, dash out of marked columns, hit the core when it opens.',
    '[commanding] All stations, Warden-class contact. HARROW: jump the ground sweep, dash out of the marked columns, and hit the core when it opens.', true),
  'surf-core': line('control', 'Core is open. Hit it now!', '[shouting] Core\'s open! Hit it now!'),
  'surf-win': line('control', 'Warden is down! Uplink secured. Lunar Control to all stations: the surface is ours again.',
    '[cheering] Warden is down! Uplink secured! [calmer] Lunar Control to all stations... the surface is ours again.'),

  // ── Field chatter (between fights) ───────────────────────────────────────
  'chat-survey-1': line('survey', 'Survey Seven to Control. Eyes on the mech. Godspeed, big guy.',
    '[casual] Survey Seven to Control, we\'ve got eyes on the mech. [chuckles] Godspeed, big guy.'),
  'chat-survey-2': line('survey', 'Survey Seven, still here, still breathing. Keep going, HARROW.',
    '[tired] Survey Seven... still here. Still breathing. Keep going, HARROW.'),
  'chat-dock-1': line('dock', 'Dock Nine. We are reading movement under the regolith. A lot of it.',
    '[nervous] Control, Dock Nine... we\'re reading movement under the regolith. A lot of it.'),
  'chat-habitat-1': line('habitat', 'Habitat Ring. If anyone out there is listening: we are holding.',
    '[quietly] This is Habitat Ring. If anyone out there is listening... we\'re holding.'),
  'chat-control-1': line('control', 'Your telemetry looks good, HARROW. Keep that pace.', '[calm] Your telemetry looks good, HARROW. Keep that pace.'),
  'chat-dock-2': line('dock', 'Dock Nine here. Saw that last fight on the long scope. Remind me never to annoy you.',
    '[laughs] Dock Nine here. Saw that last fight on the long scope. Remind me never to get on your bad side.'),

  // ── Combat reactions ─────────────────────────────────────────────────────
  'react-streak-1': line('control', 'Good kills, HARROW.', '[approving] Good kills, HARROW.'),
  'react-streak-2': line('control', 'They are scattering. Keep the pressure on!', '[excited] They\'re scattering! Keep the pressure on!'),
  'react-streak-3': line('dock', 'Did you see that? That is how it is done!', '[cheering] Did you see that?! That\'s how it\'s done!'),
  'react-death': line('control', 'HARROW? HARROW, respond... we have lost your signal.', '[worried] HARROW? [pause] HARROW, respond... [quietly] we\'ve lost your signal.', true),

  // ── HARROW onboard voice ─────────────────────────────────────────────────
  'sys-online': line('harrow', 'All systems nominal. Pilot link established.', '[flat] All systems nominal. Pilot link established.'),
  'sys-armor-low': line('harrow', 'Warning. Armor integrity critical.', '[flat] Warning. Armor integrity critical.', true),
  'sys-nanites': line('harrow', 'Repair nanites deployed.', '[flat] Repair nanites deployed.'),
  'sys-uplink': line('harrow', 'Uplink established.', '[flat] Uplink established.'),
  'sys-module': line('harrow', 'Field module installed.', '[flat] Field module installed.'),

  // ── Campaign nodes 1–4: arrival, waves, boss, victory ───────────────────
  'lanes-intro': line('control', 'Trade Lanes. Convoys are pinned along the rail. Clear the traffic lanes, HARROW.',
    '[focused] Trade Lanes, HARROW. Convoys are pinned along the rail. Clear the traffic lanes.'),
  'lanes-w1': line('dock', 'Cargo traffic is diverting around your firing lane.', 'Cargo traffic is diverting around your firing lane.'),
  'lanes-w2': line('control', 'Convoy Seven is trapped ahead. Break the blockade.', '[urgent] Convoy Seven is trapped ahead. Break the blockade.'),
  'lanes-w3': line('dock', 'Dock crews have killed the lights. Watch for engine flare.', '[hushed] Dock crews have killed the lights. Watch for engine flare.'),
  'lanes-w4': line('control', 'Rail control reports unauthorized launches on every vector.', '[tense] Rail control reports unauthorized launches on every vector.'),
  'lanes-w5': line('dock', 'The carrier signal just swallowed the whole band.', '[alarmed] The carrier signal just swallowed the whole band.'),
  'lanes-boss': line('command', 'Heavy carrier emerging from the traffic shadow.', '[commanding] Heavy carrier emerging from the traffic shadow. Engage.', true),
  'lanes-win': line('dock', 'Carrier down. Lanes are open. Every crew on this rail owes you a drink.',
    '[cheering] Carrier down! Lanes are open! Every crew on this rail owes you a drink.'),

  'deep-intro': line('control', 'Deep Facility. Signal is weak down here. Stay close to the comm repeaters.',
    '[quietly] Deep Facility. Signal\'s weak down here, HARROW... stay close.'),
  'deep-w1': line('control', 'Life-support telemetry is faint, but it is not zero.', '[hopeful] Life-support telemetry is faint... but it\'s not zero.'),
  'deep-w2': line('survey', 'Excavation lifts are cycling without operators.', '[uneasy] Excavation lifts are cycling... without operators.'),
  'deep-w3': line('control', 'The lower galleries were sealed for a reason.', '[grim] The lower galleries were sealed for a reason.'),
  'deep-w4': line('survey', 'Heat blooms ahead. Something is feeding on the grid.', '[nervous] Heat blooms ahead. Something is feeding on the grid.'),
  'deep-w5': line('control', 'All surviving crews are behind pressure doors. Push on.', '[determined] All surviving crews are behind pressure doors. Push on.'),
  'deep-boss': line('command', 'Massive contact in the bore chamber. No valid transponder.', '[commanding] Massive contact in the bore chamber. No valid transponder.', true),
  'deep-win': line('survey', 'Pressure doors are opening. People are walking out. You did it.',
    '[emotional] Pressure doors are opening... people are walking out. You did it.'),

  'orbit-intro': line('control', 'Orbital Station. Mag boots are off out there; trust your thrusters.',
    '[focused] Orbital Station, HARROW. No ground to stand on up there... trust your thrusters.'),
  'orbit-w1': line('control', 'Station-keeping thrusters are firing in the wrong sequence.', '[concerned] Station-keeping thrusters are firing in the wrong sequence.'),
  'orbit-w2': line('dock', 'Rescue pods are crossing below. Check your fire.', '[urgent] Rescue pods are crossing below. Check your fire!'),
  'orbit-w3': line('control', 'Telemetry ghosts are multiplying across the hull.', '[uneasy] Telemetry ghosts are multiplying across the hull.'),
  'orbit-w4': line('habitat', 'The ring habitat has twenty minutes of reserve atmosphere.', '[strained] The ring habitat has twenty minutes of reserve atmosphere.'),
  'orbit-w5': line('control', 'Orbital control is gone. You are the control tower now.', '[resolute] Orbital control is gone. You\'re the control tower now.'),
  'orbit-boss': line('command', 'Docking spine is opening. That is not a ship.', '[commanding] Docking spine is opening... [grim] that is not a ship.', true),
  'orbit-win': line('habitat', 'Atmosphere is holding. The ring is safe. We saw everything, HARROW.',
    '[relieved] Atmosphere is holding. The ring is safe. We saw everything, HARROW.'),

  'nexus-intro': line('control', 'Nexus Core. This is where the signal comes from. End it.',
    '[serious] Nexus Core. This is where the signal comes from, HARROW. End it.'),
  'nexus-w1': line('control', 'The colony network is speaking with one voice now.', '[unsettled] The colony network is speaking with one voice now.'),
  'nexus-w2': line('control', 'Every service drone on the Moon just turned toward you.', '[alarmed] Every service drone on the Moon just turned toward you.'),
  'nexus-w3': line('survey', 'Core temperature is rising. This may be deliberate.', '[tense] Core temperature is rising. This may be deliberate.'),
  'nexus-w4': line('control', 'We can hear old crew messages inside the carrier wave.', '[whispers] We can hear old crew messages inside the carrier wave.'),
  'nexus-w5': line('command', 'No extraction route remains. Finish it.', '[commanding] No extraction route remains. Finish it.'),
  'nexus-boss': line('command', 'NEXUS CORE UNBOUND. ALL CHANNELS ARE YOURS.', '[shouting] Nexus core unbound! All channels are yours, HARROW!', true),
  'nexus-win': line('control', 'Signal is gone. Just static now. Beautiful, quiet static. Come home, HARROW.',
    '[emotional] The signal\'s gone. Just static now... beautiful, quiet static. [softly] Come home, HARROW.'),
} satisfies Record<string, RadioLine>;

export type RadioLineId = keyof typeof RADIO_LINES;

/** Lines heard between fights, cycled without repeats. */
export const FIELD_CHATTER: RadioLineId[] = ['chat-survey-1', 'chat-dock-1', 'chat-control-1', 'chat-habitat-1', 'chat-dock-2', 'chat-survey-2'];
export const STREAK_REACTIONS: RadioLineId[] = ['react-streak-1', 'react-streak-2', 'react-streak-3'];
