# Player Mech Redesign — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-22-player-mech-redesign-design.md`
**Mockup:** `art/mech-redesign/mockup.html`, the reference implementation of the rig maths, pose solving and every action. Port its logic, not its canvas code.

## Task 0: Lock the design

- [ ] Choose a chassis and answer the spec's open questions (facing rule, gatling spin-up, barrel rotation).
- [ ] Art pass in `art/mech-redesign/<chassis>-parts.aseprite`: repaint parts by hand over the generated drafts, keeping slice names and pivots.
- [ ] Add the missing sockets as slices: `muzzleMain`, `muzzleRapid`, `podTube`, `jetBack`, `jetCalf`, `eject`, `vent`, `plate`, `antenna`.

## Task 1: Asset pipeline

- [ ] Add `npm run art:mech`, which calls the Aseprite CLI: `--split-layers --sheet public/assets/<chassis>-rig.png --data public/assets/<chassis>-rig.json --format json-hash --list-slices`.
- [ ] Load the atlas in `BootScene` and build a `RigDefinition` from the slices: part name → frame, pivot, sockets.
- [ ] Unit-test slice parsing against a checked-in JSON fixture.

## Task 2: Pure rig maths (`src/entities/mech/`)

- [ ] `ik.ts`: two-bone solve with a bend sign; clamps unreachable targets.
- [ ] `gait.ts`: distance-driven phase; stance/swing foot offsets; footfall detection; blend to rest and to the airborne pose.
- [ ] `aimTracker.ts`: clamped arc, critically-damped spring, max rate.
- [ ] `spring.ts`: step, impulse, clamp.
- [ ] Vitest coverage: planted feet don't slide (foot world x constant through stance); IK reaches reachable targets; the aim clamp holds; springs settle.

## Task 3: `MechRig` view

- [ ] A `MechRig` class that owns a native-resolution `DynamicTexture` and draws the parts each frame from the solved pose; displayed as an Image at 2×, origin at the feet.
- [ ] Palette variants (near, far, lights-off) are generated at load by remapping the ramp, not authored separately.
- [ ] Silhouette effects (hit flash, red tint, EMP tint, repair scanline, death darkening) are drawn clipped to the rig's own texture.
- [ ] `snapshot()` returns a texture of the current pose for surge ghosts and the pilot guide.

## Task 4: Player integration

- [ ] `Player` keeps its Arcade body, input and stats; the sprite itself goes invisible and `MechRig` follows `x/y`.
- [ ] Replace `updateAnim`/`playAnim` with rig state updates.
- [ ] Apply the chosen facing rule; update `HomingMissile` and surge default direction to use `player.facing`.
- [ ] `RapidGun`, `Turret` and `HomingMissile` spawn from rig sockets (`player.rig.socket('muzzleMain')`) instead of fixed offsets.
- [ ] `PlayerHud` uses a rig height instead of `displayHeight`.
- [ ] `GameScene.spawnSurgeGhost` uses `rig.snapshot()`; `UIScene`'s pilot-guide illustration renders from a snapshot as well.
- [ ] Refit the physics body to the new silhouette (keep roughly the same collision area so level tuning holds).

## Task 5: Locomotion

- [ ] Gait while grounded, idle breathing, vent steam.
- [ ] Jump: instant physics; crouch squash on the launch frame; air pose that tucks while rising and reaches while falling.
- [ ] Landing: hip spring impulse from `prevVelocityY`; heavy-landing kneel; tie into the existing `landing-*` audio branches.
- [ ] Surge dash: lean, skate pose, horizontal back jet, sparks, skid stop.

## Task 6: Weapons

- [ ] Cannon: barrel recoil spring, arm kick, torso rock, shell-eject particle.
- [ ] Gatling: spin value, 2-frame barrel swap, heat glow, spin-down.
- [ ] Missile: hatch lid rotation, pop-up launch from `podTube`, pod LEDs showing reload.

## Task 7: Abilities and states

- [ ] Nanite repair: kneel blend, plate open over internals, orbiting swarm (depth-sorted around the rig), weld sparks, scanline, sealing pulse; cancel on hurt as today.
- [ ] Relay uplink: `SurfaceMission` emits relay progress; the rig raises the antenna, draws the data beam, confirm burst.
- [ ] Hurt, damage states (smoke at 2 HP, sparks and visor flicker at 1 HP), EMP shutdown and reboot, death cook-off and wreck.
- [ ] Drop-in on mission start and restart; upgrade pulse on pickups and field upgrades.

## Task 8: Jump jets

- [ ] Nozzle sockets drive the existing emitter trio (orange core, cyan outer, smoke) plus a per-frame pixel flame core.
- [ ] Fuel-out sputter when `jetpackFuel` hits 0 mid-thrust.

## Task 9: Clean up and verify

- [ ] Remove `mech`/`mech4` sheets, `MECH_CONFIG`, and `buildAsepriteAnims` usage for the player.
- [ ] `npm test` and `npm run build`.
- [ ] Play all five missions: check aim at extreme angles, stairs and platform edges (feet on ledges), elevators, EMP, death, restart.
- [ ] Check performance: one DynamicTexture redraw per frame; no per-frame allocations in gait or IK.
