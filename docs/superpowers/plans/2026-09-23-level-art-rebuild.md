# Level art rebuild — Surface Ops first

**Goal:** replace every piece of world art with art built the way HARROW is built — physical
assemblies drawn in code from palette ramps (`R`/`P`/`D` primitives, 1 px `hull0` outline, one
light direction, real panel seams, bolts, hinges, cable runs) — and rebuild the maps around
better, far less flat designs.

**Setting:** the Moon. The mech moves between **domed chrome/metal storage areas**: pressurised
geodesic and ribbed-shell domes, cargo silos, stacked containers, gantries and conveyor spurs,
with a deep background of more domes, masts, landing pads and ridgelines so the world reads as
a working colony, not a corridor.

**Scope now:** Surface Ops (node 0) only. The other four missions stay on the legacy template
builder and old art until this map is finished and signed off.

**Keep:** HARROW, the rigged enemy roster, the icon UI kit and fonts, the 24-colour palette and
retro filter.

**Replace (everything else in the world):** industrial tilesets, background crater strip and
dome circles, in-mission Earth, base props, environmental life, collectables/pickups, the
Trade Lanes freight art (later, with its level).

## Steps

1. **Grid format + parser** ✅ — text maps (`src/data/maps/*.txt`, legend in
   `src/level/levelMap.ts`): `.` empty, `#` solid mass, `=` deck, `S` spawn. Surface Ops loads
   from `surface-ops.txt`; legacy templates still work through `buildMap`.
2. **Terrain steps** — half-tile step cells and automatic step-up for HARROW and walkers
   (the IK legs already plant on uneven ground). Later: per-column heightfield for true slopes.
3. **Environment part kit** — a `PartSpec`-style kit for world pieces, rasterised into an atlas
   like the rig: regolith edge/fill pieces chosen by neighbour mask (autotile), deck plates with
   trusses, dome shells (chrome ramps: `hull3`→`hull6` with `cyan` reflections), bulkhead doors,
   silos, containers, gantry legs, pipes, lamps.
4. **Surface Ops redesign** — new `surface-ops.txt`: crater bowls, ridge climbs, a dome
   interior/exterior transition, container stacks as cover, an upper gantry route and a lower
   service trench, the Warden arena in the largest storage dome.
5. **Parallax backdrop** — 3–4 layers built from the same kit: far ridgeline + Earth, distant
   dome clusters and masts, mid-ground silos and gantries, near rocks/foreground occluders.
6. **Set pieces + props** — hand-placed decorative assemblies (wrecked lander, antenna farm,
   cargo crawler), pickups redrawn in the kit.
7. Roll the kit out to the other missions, one per pass.

## Other ideas (parked)

- Explosions that crater regolith cells (not structure).
- Dev hot-reload of map files.
- Palette light pools (amber/hostile) painted into tiles instead of shaders.
- Ballistic low-g dust debris to replace the old atmosphere dust.
- Lander drop-in intro per mission.
