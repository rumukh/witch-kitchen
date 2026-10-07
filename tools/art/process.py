"""Post-process picked raw candidates into assets/art/** and rebuild assets/art/manifest.json.

Usage: python tools/art/process.py [ID ...]   (no IDs = every picked job)
"""
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from jobs import JOBS, RAW_DIR, ROOT, picks  # noqa: E402

ART = ROOT / "assets" / "art"
MANIFEST = ART / "manifest.json"
DERIVED = Path(__file__).parent / "derived.json"
LICENSE = ("generated with Azure OpenAI Image API (deployment gpt-image-2.5-sunburst) via the azure-image-generation "
           "helper; under the Microsoft Product Terms for Azure OpenAI the customer owns the output and Microsoft claims "
           "no rights in it, so commercial use is permitted (subject to the Azure OpenAI Code of Conduct). No stock or web imagery.")
FOLDER = {"background": "bg", "ending": "endings", "character": "characters", "guest": "guests",
          "feeling-jar": "jars", "dish": "dishes", "ui": "ui", "icon": "ui/icons", "card": "ui/cards", "title": "title"}


def raw_meta(jid, pick):
    d = RAW_DIR / jid
    rev = pick.split("-r")[-1].split("-c")[0].split(".")[0]
    meta = json.loads((d / f"{jid}-r{rev}.json").read_text(encoding="utf-8"))
    sha = next((i["sha256"] for i in meta["images"] if Path(i["path"]).name == pick), meta.get("sha256"))
    return meta, sha, dt.date.fromtimestamp((d / pick).stat().st_mtime).isoformat()


def clean_alpha(im):
    a = np.array(im.convert("RGBA"))
    alpha = a[..., 3]
    alpha[alpha < 6] = 0
    a[alpha == 0, :3] = 0
    return Image.fromarray(a)


def trim(im, margin=0.02):
    bbox = im.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
    im = im.crop(bbox)
    m = int(max(im.size) * margin)
    out = Image.new("RGBA", (im.width + 2 * m, im.height + 2 * m), (0, 0, 0, 0))
    out.paste(im, (m, m))
    return out


def save_png(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)


def process(jid, pk):
    job = JOBS[jid]
    src = RAW_DIR / jid / pk["pick"]
    im = Image.open(src)
    out = job["out"]
    folder = ART / FOLDER[job["kind"]]
    variants = []
    if out["type"] == "bg":
        im = im.convert("RGB")
        w, h = im.size
        tw, th = out.get("w", 1920), out.get("h", 1080)
        s = max(tw / w, th / h)
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
        l, t = (im.width - tw) // 2, (im.height - th) // 2
        im = im.crop((l, t, l + tw, t + th))
        folder.mkdir(parents=True, exist_ok=True)
        f = folder / f"{jid}.webp"
        im.save(f, quality=84, method=6)
        f2 = folder / f"{jid}-720.webp"
        im.resize((tw * 2 // 3, th * 2 // 3), Image.LANCZOS).save(f2, quality=82, method=6)
        variants.append({"file": f2.relative_to(ART).as_posix(), "width": tw * 2 // 3, "height": th * 2 // 3, "label": "720p"})
        transparent = False
    elif out["type"] == "tile":
        n = out["size"]
        a = np.asarray(im.convert("RGB").resize((n, n), Image.LANCZOS)).astype(np.float32)
        rolled = np.roll(a, (n // 2, n // 2), axis=(0, 1))
        r = np.minimum(np.arange(n), np.arange(n)[::-1]) / (n / 2)
        w = np.clip(np.minimum.outer(r, r) * 2.5, 0, 1)[..., None]
        im = Image.fromarray((a * w + rolled * (1 - w)).astype(np.uint8))
        folder.mkdir(parents=True, exist_ok=True)
        f = folder / f"{jid}.webp"
        im.save(f, quality=86, method=6)
        transparent = False
    else:
        im = trim(clean_alpha(im), out.get("margin", 0.02))
        if "h" in out:
            s = out["h"] / im.height
        else:
            s = out["box"] / max(im.size)
        s = min(s, 1.0) if not out.get("upscale") else s
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        im = clean_alpha(im)
        f = folder / f"{jid}.webp"
        save_png(im, f)
        transparent = True
        for vs in out.get("variants", []):
            v = im.resize((round(im.width * vs / max(im.size)), round(im.height * vs / max(im.size))), Image.LANCZOS)
            fv = folder / f"{jid}-{vs}.webp"
            save_png(clean_alpha(v), fv)
            variants.append({"file": fv.relative_to(ART).as_posix(), "width": v.width, "height": v.height, "label": f"{vs}px"})
    meta, sha, created = raw_meta(jid, pk["pick"])
    return {
        "id": jid, "kind": job["kind"], "file": f.relative_to(ART).as_posix(),
        "width": im.width, "height": im.height, "transparent": transparent, "variants": variants,
        "bytes": f.stat().st_size + sum((ART / v["file"]).stat().st_size for v in variants),
        "source": {
            "tool": "azure-image-generation skill (generate-image.ps1)", "provider": "Azure OpenAI",
            "model": "gpt-image-2.5-sunburst (deployment)", "operation": meta.get("operation"),
            "quality": meta.get("quality"), "prompt": meta.get("prompt"),
            "derived_from": meta.get("reference_ids", []), "raw_file": pk["pick"], "raw_sha256": sha,
            "postprocess": {"bg": "cover-crop to 16:9, Lanczos resize, WebP q84/q82",
                            "tile": "Lanczos resize, half-offset cross-fade to make seamlessly tileable, WebP q86"}.get(
                out["type"], "alpha clean + trim + Lanczos resize, WebP with alpha (q90, lossless alpha)"),
        },
        "license": LICENSE, "created": created,
        "review": {"status": pk.get("status", "pending"), "notes": pk.get("notes", "")},
    }


def button_states(base):
    """Derive hover (warmer, brighter) and pressed (darker, nudged down) states from ui-button."""
    from PIL import ImageEnhance
    src = Image.open(ART / base["file"])
    out = {}
    for state, fn in {
        "normal": lambda im: im,
        "hover": lambda im: ImageEnhance.Color(ImageEnhance.Brightness(im).enhance(1.15)).enhance(1.1),
        "pressed": lambda im: ImageEnhance.Brightness(im).enhance(0.82).transform(im.size, Image.AFFINE, (1, 0, 0, 0, 1, -3)),
    }.items():
        rgb = fn(src.convert("RGB"))
        alpha = src.getchannel("A")
        if state == "pressed":
            alpha = alpha.transform(src.size, Image.AFFINE, (1, 0, 0, 0, 1, -3))
        im = rgb.copy(); im.putalpha(alpha)
        f = ART / "ui" / f"ui-button-{state}.webp"
        save_png(clean_alpha(im), f)
        e = json.loads(json.dumps(base))
        e.update(id=f"ui-button-{state}", file=f.relative_to(ART).as_posix(), bytes=f.stat().st_size, variants=[])
        e["source"]["derived_from"] = ["ui-button"]
        e["source"]["postprocess"] = f"deterministic PIL derivation from ui-button ({state} state)"
        out[e["id"]] = e
    return out


def main():
    ids = sys.argv[1:]
    man = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"assets": []}
    entries = {e["id"]: e for e in man["assets"]}
    for jid, pk in picks().items():
        if jid not in JOBS or (ids and jid not in ids):
            continue
        entries[jid] = process(jid, pk)
        print("processed", jid, entries[jid]["width"], entries[jid]["height"], entries[jid]["bytes"])
        if jid == "ui-button":
            entries.update(button_states(entries[jid]))
    if DERIVED.exists():
        for e in json.loads(DERIVED.read_text(encoding="utf-8")):
            e["bytes"] = (ART / e["file"]).stat().st_size + sum((ART / v["file"]).stat().st_size for v in e.get("variants", []))
            e.setdefault("license", LICENSE)
            entries[e["id"]] = e
    order = list(JOBS) + [k for k in entries if k not in JOBS]
    assets = [entries[k] for k in order if k in entries]
    total = sum(e["bytes"] for e in assets)
    MANIFEST.write_text(json.dumps({
        "schema": "witch-kitchen-art-manifest/1", "style_bible": "docs/art/STYLE_BIBLE.md",
        "base_path": "assets/art/", "total_bytes": total, "count": len(assets), "assets": assets,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"manifest: {len(assets)} assets, {total / 1e6:.2f} MB")


if __name__ == "__main__":
    main()

