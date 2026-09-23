-- Builds the rig parts file: one layer per part, one slice per part whose pivot is the
-- joint the rig rotates around. This is the file an artist repaints; the runtime reads
-- slice bounds + pivots from the exported JSON (--data with slices), so no code changes.
--   aseprite -b --script-param dir=<bake>/harrow/parts --script-param out=harrow-parts.aseprite \
--     --script tools/assemble-parts.lua
local dir = app.params["dir"]
local out = app.params["out"]
local f = io.open(dir .. "/parts.json", "r")
local parts = json.decode(f:read("a"))
f:close()

local GAP, COLS = 4, 4
local colW, rowH = {}, {}
for i, p in ipairs(parts) do
  local c, r = (i - 1) % COLS, (i - 1) // COLS
  colW[c] = math.max(colW[c] or 0, p.w)
  rowH[r] = math.max(rowH[r] or 0, p.h)
end
local W, H = GAP, GAP
for c = 0, COLS - 1 do W = W + (colW[c] or 0) + GAP end
for r = 0, #rowH do H = H + (rowH[r] or 0) + GAP end

local spr = Sprite(W, H, ColorMode.RGB)
local base = spr.layers[1]
local y, x = GAP, GAP
local xs, ys = {}, {}
local acc = GAP
for c = 0, COLS - 1 do xs[c] = acc; acc = acc + (colW[c] or 0) + GAP end
acc = GAP
for r = 0, #rowH do ys[r] = acc; acc = acc + (rowH[r] or 0) + GAP end

for i, p in ipairs(parts) do
  local c, r = (i - 1) % COLS, (i - 1) // COLS
  local layer = (i == 1) and base or spr:newLayer()
  layer.name = p.name
  local img = Image{ fromFile = dir .. "/" .. p.name .. ".png" }
  spr:newCel(layer, 1, img, Point(xs[c], ys[r]))
  local s = spr:newSlice(Rectangle(xs[c], ys[r], p.w, p.h))
  s.name = p.name
  s.pivot = Point(p.px, p.py)
  s.color = Color{ r = 109, g = 227, b = 255 }
end

spr:saveAs(out)
