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
2. **Terrain steps** ✅ — one-tile (32-unit) terraces with automatic step-up
   (`src/level/stepUp.ts`): HARROW eases up onto the ledge (visual lag + knee dip); ground
   walkers walk into one-tile rises instead of jumping. Whole-tile steps keep collision, AI nav
   and radar on the one grid; half-tile cells would need a second collision system. Surface Ops
   has four terraced mounds/ridges; relay columns and the Warden arena stay flat. Later:
   per-column heightfield for true slopes.
3. **Environment part kit** ✅ — `src/world/`: rasterised at boot with the rig's primitives
   (`buildWorldTextures`). `shade.ts` does per-pixel light (lambert, chrome environment
   reflection) onto palette ramps through a 4×4 ordered dither. Terrain (`terrainTiles.ts`,
   `autotile.ts`): regolith picked by 4-edge mask × 8 variants, deep strata three cells down,
   truss decks with end caps; Surface Ops now renders with it. Props (`props.ts`, near + far
   variants, `placeProp`): geodesic chrome storage dome with cargo bulkhead, silo on legs,
   containers (amber/cold/hull), gantry column + beam, bulkhead, pipe + support, lamp, antenna
   dish, solar array, boulders S/M/L, crate. Review sheet: `?rigtest=world`.
4. **Surface Ops redesign** ✅ — new `surface-ops.txt` (zones listed in its header): landing
   pad, stepped crater, survey plateau, container yard (`C` stacks = solid cover, drawn as
   containers), habitat dome under an upper gantry route (`=` decks on auto-placed lattice
   supports), pipe-lined service trench, antenna ridge, and the Warden arena on a plated (`%`)
   floor inside a giant storage-dome interior. Dressing list: `surface-ops.dressing.ts`
   (`dressLevel`). Relays are a kit prop and follow the terrain; ground units spawn on the
   ground, snipers take the decks. Legacy props, background domes and ambient life are skipped
   for text-map levels.
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
