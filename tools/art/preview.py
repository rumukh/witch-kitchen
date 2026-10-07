"""Tile images on a checkerboard for quick review: python tools/art/preview.py OUT.png IMG [IMG...] [--h 600]"""
import sys
from PIL import Image, ImageDraw

args = sys.argv[1:]
h = 600
if "--h" in args:
    i = args.index("--h"); h = int(args[i + 1]); del args[i:i + 2]
out, paths = args[0], args[1:]
ims = []
for p in paths:
    im = Image.open(p).convert("RGBA")
    im = im.resize((max(1, im.width * h // im.height), h), Image.LANCZOS)
    ims.append(im)
W = sum(i.width for i in ims) + 10 * (len(ims) + 1)
sheet = Image.new("RGBA", (W, h + 20), (255, 255, 255, 255))
d = ImageDraw.Draw(sheet)
for y in range(0, h + 20, 16):
    for x in range(0, W, 16):
        if (x // 16 + y // 16) % 2:
            d.rectangle([x, y, x + 15, y + 15], fill=(200, 60, 200, 255))
x = 10
for im in ims:
    sheet.alpha_composite(im, (x, 10)); x += im.width + 10
sheet.convert("RGB").save(out)
