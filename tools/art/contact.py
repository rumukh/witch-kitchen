"""Build docs/art/contact-sheet-<group>.png overviews from assets/art/manifest.json."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "assets" / "art"
DOCS = ROOT / "docs" / "art"
GROUPS = {
    "backgrounds": (["background", "ending"], 384, 4),
    "characters": (["character"], 300, 7),
    "guests": (["guest"], 240, 6),
    "jars-dishes": (["feeling-jar", "dish"], 180, 9),
    "ui": (["ui", "icon", "card", "title"], 150, 10),
}
try:
    FONT = ImageFont.truetype("arial.ttf", 14)
except OSError:
    FONT = ImageFont.load_default()


def checker(w, h):
    bg = Image.new("RGB", (w, h), (236, 228, 212))
    d = ImageDraw.Draw(bg)
    for y in range(0, h, 12):
        for x in range(0, w, 12):
            if (x // 12 + y // 12) % 2:
                d.rectangle([x, y, x + 11, y + 11], fill=(214, 204, 186))
    return bg


def main():
    man = json.loads((ART / "manifest.json").read_text(encoding="utf-8"))
    for name, (kinds, cell, cols) in GROUPS.items():
        items = [a for a in man["assets"] if a["kind"] in kinds]
        if not items:
            continue
        cw, ch = (cell, cell * 9 // 16) if name == "backgrounds" else (cell, cell)
        rows = (len(items) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * (cw + 10) + 10, rows * (ch + 30) + 10), (40, 34, 52))
        d = ImageDraw.Draw(sheet)
        for i, a in enumerate(items):
            x, y = 10 + (i % cols) * (cw + 10), 10 + (i // cols) * (ch + 30)
            im = Image.open(ART / a["file"]).convert("RGBA")
            im.thumbnail((cw, ch), Image.LANCZOS)
            tile = checker(cw, ch).convert("RGBA")
            tile.alpha_composite(im, ((cw - im.width) // 2, (ch - im.height) // 2))
            sheet.paste(tile.convert("RGB"), (x, y))
            d.text((x, y + ch + 4), a["id"], fill=(240, 220, 180), font=FONT)
        out = DOCS / f"contact-sheet-{name}.png"
        sheet.save(out, optimize=True)
        print(out, sheet.size)


if __name__ == "__main__":
    main()
