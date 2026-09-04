# Surface Ops vertical slice

The first mission now teaches the core controls in play, gives each fight a destination, and ends with a boss whose warnings explain the required response. The other four campaign nodes retain their existing wave directors.

## Mission sequence

1. **Systems check:** jump, surge with Shift, and destroy a stationary training target. No hostile attacks during this introduction.
2. **Survey relay:** two skirmishers and one sniper. Clear the patrol, then stand in the relay ring and hold F for 1.8 seconds.
3. **Specialization:** choose one of three modules. The game pauses while choosing.
4. **Habitat relay:** four enemies introduce a charger and low roofs for cover or elevated firing positions.
5. **Uplink relay:** five enemies combine the three roles. Each restored relay supplies one armor, 50 rapid ammo, and a full fuel refill.
6. **Warden:** enter the eastern arena. Jump its ground sweep, move or dash clear of a marked orbital column, and attack while its shield vents.

Leaving a relay ring or releasing F resets its connection progress. Combat must finish before a relay can be restored. Persistent objectives, beacons, remaining-hostile counts, and relay status show what to do next.

## Encounter rules

At most four Surface enemies can be alive and two can hold attack slots simultaneously. Incoming enemies arrive at intervals instead of all at once. Skirmishers and snipers lock their aim during a visible warning; moving after that warning starts evades the original line of fire. Chargers warn before committing to a lunge. Warning text supplements the colored lines.

The Warden alternates ground sweeps and locked orbital columns, each with a 1.7-second warning. Its shield blocks damage. The core opens for 4.2 seconds after each attack, shortening to 3.2 seconds below half health. Shield state, instructions, and boss health appear in the HUD.

## Specializations

| Module | Benefit | Tradeoff |
| --- | --- | --- |
| Capacitor | Turret shots deal 2 damage instead of 1 | Turret interval grows from 420 to 650 ms |
| Missile rack | Missile cooldown falls from 5 to 3 seconds | Rapid ammo capacity falls by 50 |
| Repair core | Repairs 2 armor per use and immediately restores 1 armor | Repair cooldown becomes 28 seconds |

These modules apply to the current mission. Later campaign nodes continue to offer their existing upgrades.

## Movement

Shift provides a dedicated surge input; double-tapping A/D remains available. Jump input is buffered for 120 ms and can still activate within 100 ms of leaving a ledge. Jetpack thrust resets acceleration each frame, limits upward velocity, and recharges on the ground. Dash velocity is no longer clipped by the ordinary horizontal physics cap.

## Local verification

Run Node 24 and `npm ci`, then `npm test` and `npm run build`. Tests exercise jump timing, encounter spawn/attack limits, full mission progression, relay interruption, upgrade choice, boss vulnerability/attack avoidance, and charger behavior after player death.

Development-only routes:

- `?encounter=1`, `?encounter=2`, or `?encounter=3`: start near that encounter.
- `?boss=1`: start at the Warden.
- Add `&playtest=1` to show local input controls and a diagnostic snapshot. Aim/fire runs for eight seconds and then requests pause if the player survives. Use Pause to resume.

The playtest toolbar and mission shortcuts are excluded or disabled in production. The toolbar drives the real input and projectile systems; it does not grant health or complete objectives.

For manual acceptance, start without shortcuts: complete the introduction, use Q after taking damage, restore all three relays, choose a module, defeat the Warden, and continue to the overworld. Also restart after death and check that objective, score, upgrade, and hostile counts reset. Balance still benefits from observation with new players, especially the third encounter and the Warden exposure window.
