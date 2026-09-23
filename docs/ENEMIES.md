# Enemy roster

Every enemy is a `RiggedHostile` (`src/entities/RiggedHostile.ts`): a hidden Arcade sprite for physics and combat, a procedural rig drawn by `RigView`, and a brain built from the AI toolkit in `src/ai/`. Parts come from the rig atlas (`src/rig/parts/foes*.ts`, rebuilt with `npm run art:rig`); bodies are specs in `src/rig/bodies/foeSpecs.ts`. Browse them all with `?rigtest=foes`.

Rules every enemy follows:
- No idle patrols, straight flyovers or plain homing. Each unit reacts to where HARROW is, where it is aiming, and what the terrain allows.
- Every attack has a readable telegraph: a laser sight, wing fold, head scrape, dust mound, charge beam or arm beep.
- Attack tokens (`src/ai/AttackTokens.ts`) cap how many enemies fire at once per kind (`ranged`, `melee`, `artillery`, `bomb`). Each slot also has a recovery time after its holder attacks, which spaces volleys out.
- Hostile red is reserved for eyes, enemy fire and telegraphs.

| Unit | Role | Behaviour | Counter |
|---|---|---|---|
| **WASP** | squad flyer | In squads of 2–4, one suppresses from a firing spot while the others flank toward the side HARROW isn't aiming at, using terrain for cover. They roll away from hard hits and search the last known position when they lose sight. | Turn to face the flankers and break line of sight. |
| **HORNET** | strafer | Makes curved strafing runs that start on HARROW's blind side, then loops out and lines up again. | Surge sideways out of the pass. |
| **HERON** | hover sniper | Perches and holds a lagging laser sight on HARROW for 0.8 s before firing, then relocates. | Break line of sight to reset its aim. |
| **JACKAL** | pack striker | Packs of 3 circle, two members feint a charge, and the real EMP strike comes from the opposite side. The pack scatters and regroups afterwards. | Watch the side the feints aren't coming from. |
| **BROODMOTHER** | carrier | Holds a standoff distance, opens its hangar door (a destructible part) to launch MITEs, and recalls them to repair itself. | Shoot the hangar door. |
| **MITE** | swarm | Screeners wall off the mother. Biters latch onto HARROW and chew its armor. | Surge or jet burst throws off latched biters. |
| **MANTA** | dive bomber | Flies a racetrack at altitude, folds its wings and paints a reticle at HARROW's predicted position, then drops a stick of 3 bombs. Only spawns where there is ground. | Change direction after the reticle appears. |
| **TICK** | crawler mine | Waits burrowed, with only a sensor nub showing. When it senses HARROW it hops to where HARROW will land, beeps, and explodes. | Shoot it mid-hop. |
| **LONGLEG** | artillery hexapod | Walks to a perch, braces, charges its coil with a visible beam and heat haze, fires a PPC round, then relocates. | Punish it while it walks between perches. |
| **BULWARK** | shield walker | Advances from cover to cover, braces its frontal shield slab, and lobs telegraphed mortar shells. | Flank it with a surge, or shoot the shield off. |
| **PROWLER** | skirmisher | Moves between cover points and peeks out to fire bursts. Nearby explosions flush it out. | Use a missile to flush it. |
| **SPOTTER** | tripod sniper | Deploys its legs (vulnerable, +50% damage taken), fires after holding a steady laser sight, then packs up and moves. | Hit it while it deploys. |
| **RAM** | charger | Scrapes the ground with its head lowered as a warning, then charges in a straight line it cannot steer. Hitting a wall stuns it with its back exposed. | Jump it, then shoot its back. |
| **STILT** | stilt-walker | Strides until its gondola is over HARROW, then fires downward. Its knees are weak points. | Break a knee to topple it. |
| **SCUTTLER** | segmented crawler | Walks floors and ceilings and drops onto HARROW's path. Each hit sheds a segment. | Keep moving under ceilings. |
| **BURROWER** | tunneler | Travels under the regolith as a moving dust mound, erupts under HARROW's path, fires a ring of shots, and stays up for a moment before diving again. | Shoot it while it is surfaced. |
| **WARDEN** | Surface Ops boss | A four-legged fortress with the attack rhythm shield → telegraph → strike → core exposed. Each of its two arms covers half of the ground sweep; its uplink dish calls orbital columns. | Break an arm to make that half of the sweep safe. Break the dish to end the columns. Shoot the core while it is exposed. |
| **NEXUS** | flying boss | Has four thruster pods (destructible parts). Losing pods makes it list and unlocks a desperation pattern. Fires a triple shot and a telegraphed half-screen blast, and brings WASP escorts. | Strip the pods. Evade toward the arrow when the blast is telegraphed. |

## Waves

`src/systems/waveMix.ts` composes each wave from the mission's `enemyMix` (`balanced`, `aerial`, `ground-heavy`, `elite`, `boss-rush`). Unit types are filtered by what the level allows:
- Bombers need ground.
- TICK, STILT and BURROWER need walkable spans.
- SCUTTLER needs spans (and uses the ceiling where there is one).

Squads and packs spawn together. Scaling brackets (`WAVE_BRACKETS`) raise hit points and fire rates as the waves go on.
