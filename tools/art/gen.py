"""Generate raw candidates for art jobs via the azure-image-generation helper.

Usage: python tools/art/gen.py ID [ID ...] [--count N] [--quality Q] [--parallel N] [--extra "text"]
Raw outputs go to $ART_RAW_DIR/<id>/<id>-rN(-cK).png with prompt and provenance JSON beside them.
"""
import argparse
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from jobs import JOBS, RAW_DIR, picked_raw  # noqa: E402

HELPER = Path.home() / ".copilot/skills/azure-image-generation/scripts/generate-image.ps1"


def next_rev(d: Path, jid: str) -> int:
    n = 1
    while (d / f"{jid}-r{n}.json").exists() or (d / f"{jid}-r{n}.prompt.txt").exists():
        n += 1
    return n


CUTOUT_EDIT = ("Image 1 is the approved artwork and the absolute authority. Reproduce it exactly: the same subject, pose, face, "
               "expression, clothing, colours, line work, gouache texture, proportions and framing. Keep every part of the subject. "
               "Output it as a clean cutout: everything that is not the subject (including any painted checkerboard or plain backdrop) "
               "becomes fully transparent background.")


def run(jid, count, quality, extra, cutout=False):
    job = dict(JOBS[jid])
    if cutout:
        job.update(prompt=CUTOUT_EDIT, refs=[str(picked_raw(jid))], transparent=True)
    d = RAW_DIR / jid
    d.mkdir(parents=True, exist_ok=True)
    rev = next_rev(d, jid)
    prompt = job["prompt"] + ((" " + extra) if extra else "")
    pf = d / f"{jid}-r{rev}.prompt.txt"
    pf.write_text(prompt, encoding="utf-8")
    out = d / f"{jid}-r{rev}.png"
    cmd = ["pwsh", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(HELPER),
           "-PromptFile", str(pf), "-Size", job["size"], "-Quality", quality or job["quality"],
           "-OutputPath", str(out), "-Count", str(count or job.get("count", 1))]
    if job.get("transparent"):
        cmd += ["-Background", "transparent"]
    refs = [str(picked_raw(r)) if not os.path.isabs(r) else r for r in job.get("refs", [])]
    if refs:
        cmd += ["-ReferenceImage"] + refs
    for attempt in range(8):
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if p.returncode == 0 or "rate limit" not in (p.stdout + p.stderr):
            break
        time.sleep(65 + 10 * attempt)
    if p.returncode != 0:
        return f"FAIL {jid} r{rev}: {p.stdout[-800:]} {p.stderr[-800:]}"
    try:
        meta = json.loads(p.stdout[p.stdout.index("{"):])
    except Exception:
        return f"FAIL {jid} r{rev}: unparsable {p.stdout[-400:]}"
    meta["job_id"] = jid
    meta["prompt"] = prompt
    meta["reference_ids"] = [jid + " (approved non-transparent pick, re-rendered as cutout)"] if cutout else job.get("refs", [])
    (d / f"{jid}-r{rev}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return f"OK {jid} r{rev}: " + ", ".join(Path(x).name for x in meta["paths"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--count", type=int)
    ap.add_argument("--quality")
    ap.add_argument("--parallel", type=int, default=4)
    ap.add_argument("--extra", default="")
    ap.add_argument("--cutout", action="store_true")
    a = ap.parse_args()
    ids = []
    for i in a.ids:
        if i.endswith("*"):
            ids += [k for k in JOBS if k.startswith(i[:-1])]
        else:
            if i not in JOBS:
                sys.exit(f"unknown job {i}")
            ids.append(i)
    with cf.ThreadPoolExecutor(a.parallel) as ex:
        for r in ex.map(lambda j: run(j, a.count, a.quality, a.extra, a.cutout), ids):
            print(r, flush=True)


if __name__ == "__main__":
    main()

