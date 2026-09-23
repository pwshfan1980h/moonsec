#!/bin/sh
# Exports a 4x GIF per animation tag plus a 4x parts sheet for each concept.
#   ASEPRITE=/path/to/aseprite sh art/mech-redesign/tools/previews.sh
set -e
ASEPRITE="${ASEPRITE:-aseprite}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$DIR/previews"
for c in harrow bastion; do
  for tag in idle walk backpedal dash jump cannon gatling missile hurt repair relay emp death dropin; do
    "$ASEPRITE" -b "$DIR/$c-anims.aseprite" --layer "rig (baked)" --tag "$tag" --scale 4 --save-as "$DIR/previews/$c-$tag.gif"
  done
  "$ASEPRITE" -b "$DIR/$c-parts.aseprite" --scale 4 --save-as "$DIR/previews/$c-parts.png"
done
