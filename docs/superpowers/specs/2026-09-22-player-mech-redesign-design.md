# Player Mech Redesign — Design Spec

**Goal:** Replace the player mech with a rigged, part-based mech that moves more, tracks the mouse, has real jump jets, and matches the slate-and-cyan look of the tiles, enemies and HUD. Every current action gets a readable animation, including repair, which has none today.

**Mockups:** `art/mech-redesign/mockup.html` (interactive rig, both concepts, every action, demo reel). Aseprite files and GIF previews are in `art/mech-redesign/`.

## Why the current mech doesn't work

- **Rigid.** `mech4-sheet` has 47 frames of 70×70, but most tags are near-identical frames of the same static pose. The walk is 7 frames in which the feet slide against the ground.
- **No aim.** Turret, rapid and missile fire all leave fixed offsets (`player.y - 100`, `y - 78` with `±45`, `y - 90` with `±35`). The sprite only flips with movement, so shots appear from points that aren't a barrel.
- **Wrong palette.** Saturated red and white on a 1.6× non-integer scale. Tiles, drones and tanks use a dark slate ramp with top-lit bevels and small glowing accents; red is the hostile colour (drone eyes, bullets, warnings).
- **Unused and missing states.** `dash`, `jump_land`, `shoot`, `power_up`, `melee` and `crouch` exist in the sheet but are never played. EMP reuses `death`. Repair, relay uplink, fuel-out and damage states have nothing.

## Direction

### Chassis — pick one

| | **A. HARROW** (recommended) | **B. BASTION** |
|---|---|---|
| Form | BattleTech-style reverse-joint biped | Four-legged walker tank |
| Guns | Near arm heavy cannon (LMB), far arm gatling (RMB), shoulder missile box (E) | Turret cannon (LMB), chin gatling (RMB), rear launcher (E) |
| Jump jets | Back nozzle + both calves | Belly vents + rear dash nozzle |
| Size (native) | ~52 px tall | ~34 px tall × 46 px wide |
| Read | Instantly "mech"; two guns tracking independently | Clearest aim read; tank fantasy |
| Cost | Medium (biped balance needs tuning) | Lower (trot keeps two feet down) |

Both use the same rig code. Only the part art, sockets and gait constants differ.

### Style rules

- Author at native resolution and display at **integer 2×**. No 1.6× scaling.
- Hull ramp: `#0e1019` outline → `#1b1e2c` → `#282c3f` → `#3b4159` → `#57607d` → `#8690b0` → `#c3cbe2`. Light comes from the top, matching the tileset bevels.
- The 1 px outline is one step darker than the shadow, never pure black.
- **Cyan `#6de3ff` = player** (visor, sensor lights, jets' outer glow, surge ghosts). **Amber `#ffb347`** only on hazard trim and ordnance. **Green `#66ff99`** only for nanite repair. No red on the player except damage feedback.
- Far-side limbs use the ramp shifted one step darker, which gives depth without extra art.

## Rig architecture

```
Aseprite (parts file) ──CLI export──▶ atlas.png + atlas.json (slices = pivots/sockets)
                                          │
Player (Arcade body, input, stats) ──▶ MechRig (view)
                                          ├─ Gait        feet placement from distance travelled
                                          ├─ IK2         two-bone knee solve per leg
                                          ├─ AimTracker  critically-damped gun rotation per arm
                                          ├─ Springs     hip drop, lean, recoil, kick, knockback
                                          ├─ ActionLayer repair / relay / emp / death / dash / spawn blends
                                          └─ RigRenderer parts → native DynamicTexture → drawn at 2×
```

- **Parts file.** One layer per part, one slice per part, with the slice pivot set to the joint. The runtime reads pivots and sockets from the exported slice data, so repainting a part needs no code change. `art/mech-redesign/*-parts.aseprite` are working drafts in this format.
- **Pixel grid.** The rig draws into a native-resolution `DynamicTexture` and is then displayed at 2×. Rotated parts snap to the same pixel grid as every other sprite (no mixels). If rotation shimmer on the long barrels bothers us, pre-bake barrels at 32 angles with Aseprite's RotSprite and pick the nearest angle.
- **Gait.** A distance-driven phase with stance for half the cycle, so feet never slide: foot offset moves by exactly the body's displacement. Biped: stride 18 px, cycle 36 px. Quad: trot, cycle 28 px. Hip drop peaks on footfall. Footfalls emit dust, a 0.5 px shake and the existing `footstep` SFX.
- **Aim.** Each gun has its own tracker (ω = 16, max 9 rad/s) and its own firing arc (Harrow cannon −77°…+60°). The torso pitches 18% of the aim angle. The mockup's "Aim feel" dropdown compares weighted, snappy and instant tracking.
- **Facing follows the cursor**, not movement. Walking away from the cursor plays the gait in reverse with a backward lean (backpedal).
- **Sockets drive gameplay.** `muzzleMain`, `muzzleRapid`, `podTube` and jet nozzles replace every hard-coded spawn offset.

## Animation catalog

| Action | Proposed |
|---|---|
| Idle | ±1 px hip breathing, vent steam every 3–4 s, guns keep tracking |
| Walk / backpedal | IK gait with no foot sliding; hip bob on footfall; lean into travel |
| Surge dash | 40 ms crouch, hard lean, feet skate apart with sparks, back jet horizontal, whole-rig afterimages |
| Jump | Crouch squash on launch, legs extend then tuck, ignition burst from all nozzles |
| Jump jets | Legs tuck rising and reach falling; flame cores (white → amber → cyan) with the existing particle style |
| Fuel out | Sputter puffs and smoke; legs flail slightly |
| Landing | Hip spring compresses in proportion to fall speed; heavy landing drops to a kneel with a dust ring |
| Cannon | Barrel slides back 4 px, arm kicks up, torso rocks, shell casing ejects and bounces |
| Gatling | Barrels spin (2-frame swap), muzzle flicker, heat glow builds over sustained fire, spin-down |
| Missile | Pod hatch flips open, missile pops up then homes, hatch closes; three pod LEDs show reload |
| **Nanite repair** | Kneel, armour plate opens over glowing internals, nanite swarm orbits the hull (in front of and behind it), weld sparks, green scanline clipped to the silhouette, sealing pulse |
| **Relay uplink** | Plant feet, antenna mast rises from the pod, animated data beam into the relay, confirm burst |
| Hurt | 1-frame white flash, 150 ms red, torso snaps away from the hit, sparks and armour chips, knockback |
| Damage states | 2 HP: back smoke. 1 HP: sparks and visor flicker |
| EMP | Lights go dark (palette swap), guns droop, hips sag, arcs crawl over the parts, reboot flicker, guns snap up |
| Death | Legs buckle, torso slumps, four cook-off explosions, darkened smoking wreck stays |
| **Drop-in** | Mission start and respawn: descends on jets, landing slam, cyan systems-online pulse |
| Upgrade | Outline pulse on pickup or field upgrade |

## Gameplay-neutral by default

The redesign is presentation-only unless we choose otherwise. Where the mockup took liberties, the shipping version keeps current behaviour:

- **Jump anticipation:** the mockup delays takeoff by 80 ms. In game, the jump stays instant and the crouch plays as a squash on the launch frame.
- **Gatling spin-up:** the mockup waits ~200 ms before firing. In game, keep instant fire with spin as a visual only, unless we decide spin-up is a feature.
- **Repair movement:** unchanged. The kneel pose only plays while standing still; walking keeps the panel open with a lighter crouch.

**Facing follows the cursor** is the one deliberate behaviour change. It affects which way the missile launches and which side the surge dash defaults to. Decision needed (see below).

## Open questions

1. Chassis: HARROW or BASTION? Keep the other as the second selectable chassis (replacing `mech` STRIDER)?
2. Facing: follow the cursor (recommended), or keep facing movement direction with guns tracking inside a mirrored arc?
3. Gatling spin-up: visual only, or a small gameplay delay?
4. Barrel rotation: accept runtime nearest-neighbour rotation (as in the mockup), or pre-bake RotSprite angles?

## Out of scope

Weapon balance, stats in `MECH_STATS`, enemy AI, and hitbox size changes beyond fitting the new silhouette.
