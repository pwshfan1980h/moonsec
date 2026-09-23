-- Builds a tagged animation file from baked frames.
--   aseprite -b --script-param dir=<bake>/harrow/frames --script-param out=harrow-anims.aseprite \
--     --script tools/assemble-anims.lua
local dir = app.params["dir"]
local out = app.params["out"]
local f = io.open(dir .. "/manifest.json", "r")
local manifest = json.decode(f:read("a"))
f:close()

local spr = Sprite(manifest.w, manifest.h, ColorMode.RGB)
spr.layers[1].name = "rig (baked)"
local layer = spr.layers[1]
local duration = 1 / manifest.fps
local frameNo = 1
local ranges = {}

-- Frames first, tags after: a tag created earlier would stretch as frames are appended.
for _, tag in ipairs(manifest.tags) do
  local from = frameNo
  for i = 0, tag.count - 1 do
    if frameNo > 1 then spr:newEmptyFrame(frameNo) end
    local img = Image{ fromFile = string.format("%s/%s_%03d.png", dir, tag.name, i) }
    spr:newCel(layer, frameNo, img, Point(0, 0))
    spr.frames[frameNo].duration = duration
    frameNo = frameNo + 1
  end
  ranges[#ranges + 1] = { name = tag.name, from = from, to = frameNo - 1 }
end
for _, r in ipairs(ranges) do
  local t = spr:newTag(r.from, r.to)
  t.name = r.name
end

-- Ground line reference layer (hidden) so the feet can be checked against the floor.
local ground = spr:newLayer()
ground.name = "ground ref"
local gimg = Image(manifest.w, manifest.h, ColorMode.RGB)
for x = 0, manifest.w - 1 do gimg:drawPixel(x, manifest.h - 6, app.pixelColor.rgba(109, 227, 255, 160)) end
spr:newCel(ground, 1, gimg, Point(0, 0))
ground.isVisible = false

spr:saveAs(out)
