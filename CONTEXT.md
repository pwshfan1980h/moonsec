# Context

Domain vocabulary for Moonsec. One concept per heading, alphabetical. This file is
the source of truth for what these words mean; when a term sharpens, edit it in place.

## Damage profile

The small bundle of per-enemy combat data a [Hostile](#hostile) exposes so that hit
resolution can be uniform. The `DamageProfile` interface carries: damage taken from a
rapid bullet, a turret bullet, and a missile (`fromRapid` / `fromTurret` / `fromMissile`);
the tint, per-hit probability, and count of the debris chunks it sheds (`chunkTint` /
`chunkChance` / `chunkCount`, where `chunkChance: 0` means it sheds none); and two feedback
switches — `showDamageText` (a floating damage number, still gated on whole-number damage)
and `impactAudio` (off for hostiles that voice their own impact, e.g. the Mine). Lives on
the entity (each [Hostile](#hostile) owns its own), so a [Drone](#hostile)'s variant-specific
chunk colour and a Carrier's rapid-fire resistance travel with the instance. Read by
[HostileCombat](#hostilecombat); never by the spawner.

## Hostile

Any enemy the player can shoot: drones, bombers, mines, carriers and their swarmlings,
PPC platforms, stun darts, shielded tanks, and the Nexus boss. As an interface a Hostile
is the pair `{ damageProfile, takeDamage(amount) }` — the minimum [HostileCombat](#hostilecombat)
needs to resolve a hit. All Hostiles live in the `drones` or `tanks` physics group.
Death and the `droneKilled` event stay in each entity's own `die()` path, not in the
interface.

## HostileCombat

The module that owns hit resolution between player weapons and [Hostiles](#hostile):
disabling the spent projectile, reading the [damage profile](#damage-profile), applying
`takeDamage`, and triggering impact feedback (spark, debris, audio, damage number). It
concentrates the recipe that was previously copy-pasted across nine spawn sites. A single
instance lives on the scene (`scene.hostileCombat`); callers wire a Hostile's weapon
overlaps with `register(hostile)`, which returns the colliders so recyclers (boss escorts)
can tear them down. Every spawn path routes through it — the DroneSpawner waves, the
NexusBoss escorts, and the Carrier's swarmlings. Counterpart to CollisionRegistry, which
owns player-facing collisions; HostileCombat owns enemy-facing ones.
