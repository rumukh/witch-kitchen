"""Assemble make_music.py job entries with full provenance from ACE render metadata.

python tools/audio/music_jobs.py <spec.json> <out_jobs.json>

spec: {cue_id: {"src": flac, "loop": bool, "bars": [a,b], "tuneCents": c, "headSkip": s,
                 "tailKeep": s, "notes": str, "guide": optional description}}
"""
import json
import sys
from pathlib import Path

TOOL = ("ACE-Step 1.5 XL-SFT (acestep-v15-xl-sft, INT8 weight-only, CPU+DiT offload, flash attention, "
        "50 ODE steps, guidance 7.0, shift 3.0, batch 1) via tools/audio/ace_local.py; "
        "planner acestep-5Hz-lm-1.7B (PyTorch backend) for text2music; no LM for cover. "
        "Loop/trim by tools/audio/make_music.py")


def main(spec_path, out_path):
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8-sig"))
    jobs = {}
    for cid, s in spec.items():
        meta = json.loads(Path(s["src"]).with_suffix(".json").read_text(encoding="utf-8-sig"))
        if "job" in meta:  # ace_local.py
            j = meta["job"]
            settings = {"task": j["task"], "prompt": j["caption"], "bpm": j["bpm"], "key": j["key"],
                        "timeSignature": "4/4", "renderSeconds": j["duration"], "seed": meta.get("seed")}
            if j["task"] == "cover":
                settings.update({"coverStrength": j.get("strength"), "coverSource": s.get("guide", Path(j["src"]).name)})
            bpm = j["bpm"]
        else:  # skill helper (generate-music.ps1)
            r = meta["request"]
            settings = {"task": "text2music", "prompt": r["prompt"], "bpm": r.get("bpm"), "key": r.get("key_scale"),
                        "timeSignature": r.get("time_signature"), "renderSeconds": r.get("audio_duration"),
                        "seed": meta["result"].get("seed"), "aceTaskId": meta.get("task_id")}
            bpm = r.get("bpm")
        jobs[cid] = {k: v for k, v in s.items() if k in ("src", "loop", "bars", "tuneCents", "headSkip", "tailKeep", "xfade", "notes")}
        jobs[cid].update({"bpm": bpm, "tool": TOOL, "settings": settings})
    Path(out_path).write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
