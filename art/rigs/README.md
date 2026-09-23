# Rig parts

Every rigged body (HARROW, enemies, bosses) is built from rigid parts defined in
`src/rig/parts/<rig>.ts` with a tiny pixel-drawing API (rectangles, polygons, discs,
pixels — palette names only). `npm run art:rig` rasterises them into one atlas:

- `public/assets/rig.png` / `rig.json` — every part in four palette variants:
  `@n` near, `@f` far-side (one ramp step darker), `@e` EMP lights-out, `@fe` both.
- `art/rigs/<rig>/<part>.png` — the near variant of each part, for reference.

A part is drawn facing +x. Its pivot (`px`, `py`) is the joint it rotates around; long
parts (limbs, guns) run along +x from the pivot. `sockets` name attachment points
(child joints, muzzles, nozzles, FX anchors) in the same part-local pixels.

The rig code in `src/rig/bodies/<rig>.ts` places parts every frame (IK legs, aim,
springs) and exposes sockets to gameplay, so bullets leave the barrel you see.

`src/tests/rigAtlas.test.ts` fails if the committed atlas is stale or a part leaves the
palette. Preview any rig state with `?rigtest=all` (add `=bones` to draw the IK chains).
