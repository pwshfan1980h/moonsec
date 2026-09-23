# Mech redesign mockups

Spec: `docs/superpowers/specs/2026-09-22-player-mech-redesign-design.md`

| File | What it is |
|---|---|
| `mockup.html` | Interactive rig mockup. Open it in a browser: pilot with A/D, Space, Shift, LMB/RMB, E, Q, hold F, or press **Play demo reel**. Switch between HARROW and BASTION; toggle bones, slow-mo and aim feel. |
| `mockup.src.html` | The same page with the ground and drone art as placeholders (`__GROUND__`, `__VIPER__`). Edit this file, then rebuild `mockup.html` by substituting base64 of the first 128×24 of `industrial-tileset.png` and the first 136×24 of `Viper-sheet.png`. |
| `harrow-parts.aseprite`, `bastion-parts.aseprite` | Rig parts: one layer per part, one slice per part, with the slice pivot at the joint. The art pass starts here. |
| `harrow-anims.aseprite`, `bastion-anims.aseprite` | Every action baked from the rig at 15 fps, one tag per action (idle, walk, backpedal, dash, jump, cannon, gatling, missile, hurt, repair, relay, emp, death, dropin). Reference for timing, not shipping art. |
| `previews/` | 4× GIF per tag and a 4× parts sheet per concept. |
| `tools/bake.cjs` | Re-bakes parts and frames from `mockup.html` with Playwright. |
| `tools/assemble-parts.lua`, `tools/assemble-anims.lua` | Aseprite scripts that build the `.aseprite` files from a bake. |
| `tools/previews.sh` | Exports `previews/` from the `.aseprite` files. |

Regenerate everything:

```sh
PLAYWRIGHT_CORE=<path to playwright-core> CHROME=<chromium or headless shell> \
  node art/mech-redesign/tools/bake.cjs /tmp/mech-bake
aseprite -b --script-param dir=/tmp/mech-bake/harrow/parts  --script-param out=$PWD/art/mech-redesign/harrow-parts.aseprite --script art/mech-redesign/tools/assemble-parts.lua
aseprite -b --script-param dir=/tmp/mech-bake/harrow/frames --script-param out=$PWD/art/mech-redesign/harrow-anims.aseprite --script art/mech-redesign/tools/assemble-anims.lua
# …same for bastion…
ASEPRITE=aseprite sh art/mech-redesign/tools/previews.sh
```
