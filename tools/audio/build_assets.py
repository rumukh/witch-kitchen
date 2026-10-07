"""Normalize, encode, verify and catalogue Krestets audio.

python tools/audio/build_assets.py <build_dir> <repo_root>

Reads float WAV masters from <build_dir>/{sfx,amb,music,voice,murmur} and the
metadata JSON files written by the generators, then writes
assets/audio/<kind>/<id>.ogg + .m4a and assets/audio/manifest.json.
Measurements in the manifest are taken from the decoded OGG files.
"""
import datetime as dt
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000
TODAY = dt.date.today().isoformat()

TARGETS = {  # integrated LUFS targets; None = peak-normalised
    "music": -18.0, "ambience": -24.0, "voice": -20.0, "sfx": None, "murmur": None,
}
ENC = {  # (vorbis quality, aac bitrate, channels)
    "music": (4, "128k", 2), "ambience": (3, "96k", 2), "sfx": (4, "128k", 2),
    "voice": (4, "64k", 1), "murmur": (3, "64k", 1),
}
FOLDER = {"music": "music", "ambience": "ambience", "sfx": "sfx", "voice": "voice", "murmur": "murmur"}

LICENSE_PROCEDURAL = ("Original procedural synthesis written for this project (tools/audio); no samples or "
                      "third-party recordings. Owned by the project; commercial use permitted (Q05).")
LICENSE_ACE = ("Generated locally with ACE-Step 1.5 (Apache-2.0 code/weights; generated output is not "
               "claimed by the model authors) from original prompts written for this project; no reference "
               "audio. Commercial use permitted (Q05). Final release audio subject to PM approval.")
LICENSE_TTS = ("Synthesized with Azure AI Speech neural TTS under the project's Azure subscription; Microsoft "
               "terms permit commercial use of synthesized output. Slice-only per Q40: release voices need PM "
               "approval (live voice or PM-approved synthesis).")


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise RuntimeError(" ".join(cmd) + "\n" + p.stderr[-2000:])
    return p.stdout + p.stderr


def ebur128(path):
    out = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af",
               "ebur128=peak=true+sample:framelog=quiet", "-f", "null", "-"])
    summ = out[out.rfind("Summary:"):]
    i = float(re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summ).group(1))
    tp = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", summ)
    sp = re.search(r"Sample peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", summ)
    return i, float(tp.group(1)) if tp else None, float(sp.group(1)) if sp else None


def decode(path, channels):
    with tempfile.TemporaryDirectory() as td:
        w = Path(td) / "d.wav"
        run(["ffmpeg", "-hide_banner", "-y", "-i", str(path), "-ac", str(channels), "-ar", str(SR),
             "-c:a", "pcm_f32le", str(w)])
        x, _ = sf.read(w, always_2d=True)
    return x


def seam_check(x):
    """Compare the loop boundary against the file's own internal continuity."""
    m = x.mean(axis=1)
    d = np.abs(np.diff(m))
    jump = abs(m[0] - m[-1])
    p999 = float(np.quantile(d, 0.999))
    # short-term RMS continuity across the seam vs. everywhere else (5 ms frames)
    f = int(0.005 * SR)
    circ = np.concatenate([m, m[: f * 4]])
    fr = circ[: (len(circ) // f) * f].reshape(-1, f)
    rms = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    steps = np.abs(np.diff(rms))
    seam_idx = len(m) // f - 1
    seam_step = float(steps[max(0, seam_idx - 1): seam_idx + 2].max())
    p99 = float(np.quantile(steps, 0.99))
    ok = jump <= max(2 * p999, 1e-3) and seam_step <= max(p99, 3.0)
    return {"sample_jump": round(float(jump), 6), "diff_p99_9": round(p999, 6),
            "rms_step_db_at_seam": round(seam_step, 2), "rms_step_db_p99": round(p99, 2), "pass": bool(ok)}


def encode(master, dest_base, kind, channels):
    q, abr, _ = ENC[kind]
    ogg = dest_base.with_suffix(".ogg")
    m4a = dest_base.with_suffix(".m4a")
    run(["ffmpeg", "-hide_banner", "-y", "-i", str(master), "-ac", str(channels), "-ar", str(SR),
         "-c:a", "libvorbis", "-q:a", str(q), "-map_metadata", "-1", str(ogg)])
    run(["ffmpeg", "-hide_banner", "-y", "-i", str(master), "-ac", str(channels), "-ar", str(SR),
         "-c:a", "aac", "-b:a", abr, "-movflags", "+faststart", "-map_metadata", "-1", str(m4a)])
    return ogg, m4a


def prepare(src, kind, channels, tmpdir, peak_limit=None):
    """Return a normalised float WAV master path for encoding."""
    x, sr = sf.read(src, always_2d=True)
    assert sr == SR, (src, sr)
    if channels == 1 and x.shape[1] > 1:
        x = x.mean(axis=1, keepdims=True)
    target = TARGETS[kind]
    if target is not None:
        tmp = Path(tmpdir) / ("m_" + Path(src).name)
        sf.write(tmp, x.astype(np.float32), SR, subtype="FLOAT")
        i, tp, _ = ebur128(tmp)
        gain = target - i
        x = x * 10 ** (gain / 20)
        lim = peak_limit if peak_limit is not None else -1.5
        tp_after = (tp + gain) if tp is not None else None
        if tp_after is not None and tp_after > lim:
            x = x * 10 ** ((lim - tp_after) / 20)
    out = Path(tmpdir) / Path(src).name
    sf.write(out, x.astype(np.float32), SR, subtype="FLOAT")
    return out


def build_entry(id_, kind, bus, src, repo, tmpdir, loop, extra):
    channels = ENC[kind][2]
    master = prepare(src, kind, channels, tmpdir)
    dest_dir = repo / "assets" / "audio" / FOLDER[kind]
    dest_dir.mkdir(parents=True, exist_ok=True)
    ogg, m4a = encode(master, dest_dir / id_, kind, channels)
    dec = decode(ogg, channels)
    dec_m4a = decode(m4a, channels)
    n_master = sf.info(master).frames
    i, tp, sp = ebur128(ogg)
    entry = {
        "id": id_, "kind": kind, "bus": bus,
        "files": {"ogg": str(ogg.relative_to(repo)).replace("\\", "/"),
                  "m4a": str(m4a.relative_to(repo)).replace("\\", "/")},
        "sampleRate": SR, "channels": channels,
        "duration": round(n_master / SR, 4),
        "samples": int(n_master),
        "loop": bool(loop),
        "lufs": None if i is None else round(i, 1),
        "truePeakDbtp": tp, "samplePeakDbfs": sp,
        "decodedSamples": {"ogg": int(len(dec)), "m4a": int(len(dec_m4a))},
        "bytes": {"ogg": ogg.stat().st_size, "m4a": m4a.stat().st_size},
        "date": TODAY,
    }
    if loop:
        entry["loopStart"] = 0
        entry["loopEnd"] = int(n_master)
        entry["seam"] = seam_check(dec[: n_master])
        entry["seamMaster"] = seam_check(sf.read(master, always_2d=True)[0])
    entry.update(extra)
    return entry


def main(build, repo):
    build, repo = Path(build), Path(repo)
    entries = []
    with tempfile.TemporaryDirectory() as td:
        # SFX
        sm = json.loads((build / "sfx" / "sfx_meta.json").read_text(encoding="utf-8"))
        for id_, m in sm.items():
            bus = "ui" if id_.startswith("ui-") or id_ == "undo" else "effects"
            entries.append(build_entry(id_, "sfx", bus, build / "sfx" / f"{id_}.wav", repo, td, False, {
                "tool": "tools/audio/make_sfx.py (numpy/scipy procedural synthesis)",
                "settings": {"design": m["design"], "seed": m["seed"], "targetPeakDbfs": m["target_peak_dbfs"]},
                "license": LICENSE_PROCEDURAL, "notes": ""}))
        # Ambience
        am = json.loads((build / "amb" / "amb_meta.json").read_text(encoding="utf-8"))
        for id_, m in am.items():
            entries.append(build_entry(id_, "ambience", "ambience", build / "amb" / f"{id_}.wav", repo, td, True, {
                "tool": "tools/audio/make_ambience.py (numpy/scipy procedural synthesis)",
                "settings": {"design": m["design"], "seed": m["seed"]},
                "license": LICENSE_PROCEDURAL, "notes": ""}))
        # Music
        mm_path = build / "music" / "music_meta.json"
        if mm_path.exists():
            for id_, m in json.loads(mm_path.read_text(encoding="utf-8")).items():
                entries.append(build_entry(id_, "music", "music", build / "music" / f"{id_}.wav", repo, td,
                                           m["loop"], {"tool": m["tool"], "settings": m["settings"],
                                                       "license": LICENSE_ACE, "notes": m.get("notes", "")}))
        # Voice
        vm_path = build / "voice" / "voice_meta.json"
        if vm_path.exists():
            for id_, m in json.loads(vm_path.read_text(encoding="utf-8")).items():
                entries.append(build_entry(id_, "voice", "voice", build / "voice" / f"{id_}.wav", repo, td,
                                           False, {"tool": m["tool"], "text": m["text"], "settings": m["settings"],
                                                   "license": LICENSE_TTS, "notes": m.get("notes", "")}))
        # Murmur sets
        mu_path = build / "murmur" / "murmur_meta.json"
        if mu_path.exists():
            for set_id, m in json.loads(mu_path.read_text(encoding="utf-8")).items():
                clips = [build_entry(c, "murmur", "voice", build / "murmur" / f"{c}.wav", repo, td, False, {})
                         for c in m["clips"]]
                entries.append({
                    "id": set_id, "kind": "murmur", "bus": "voice",
                    "files": [{"id": c["id"], **c["files"], "duration": c["duration"],
                               "samplePeakDbfs": c["samplePeakDbfs"]} for c in clips],
                    "clipCount": len(clips),
                    "duration": round(sum(c["duration"] for c in clips), 3),
                    "durationRange": [min(c["duration"] for c in clips), max(c["duration"] for c in clips)],
                    "loop": False, "lufs": None,
                    "samplePeakDbfs": max(c["samplePeakDbfs"] for c in clips),
                    "bytes": {"ogg": sum(c["bytes"]["ogg"] for c in clips), "m4a": sum(c["bytes"]["m4a"] for c in clips)},
                    "tool": "tools/audio/make_murmur.py (source-filter formant synthesis)",
                    "settings": m["settings"], "license": LICENSE_PROCEDURAL, "date": TODAY,
                    "notes": "Single nonsense syllables from random vowel formants; no lexical content. Pick a random clip per revealed text chunk.",
                })
    total = {"ogg": sum(e["bytes"]["ogg"] for e in entries), "m4a": sum(e["bytes"]["m4a"] for e in entries)}
    manifest = {
        "schema": "krestets-audio-manifest/1",
        "generated": TODAY,
        "sampleRate": SR,
        "formats": {"primary": "ogg (Vorbis)", "fallback": "m4a (AAC-LC)"},
        "loudnessTargets": {"music": "-18 LUFS integrated", "ambience": "-24 LUFS integrated",
                            "voice": "-20 LUFS integrated", "sfx": "sample peak <= -3 dBFS"},
        "loopPointsUnit": "samples at 48000 Hz; loopStart/loopEnd refer to the decoded stream; every looping file is exactly one loop (loopStart 0, loopEnd = samples)",
        "busMap": {"music": "music", "ambience": "ambience", "effects": "sfx except ui-*/undo", "ui": "ui-*, undo", "voice": "whisper.*, murmur-*"},
        "notes": [
            "All measurements (LUFS, peaks, decoded sample counts, seam checks) are taken from the encoded OGG files with ffmpeg ebur128.",
            "AAC (m4a) decodes start-aligned (priming removed via the MP4 edit list) but can carry up to 1024 trailing padding samples (see decodedSamples). Always loop with loopEnd from this manifest; prefer OGG for loops.",
            "Seam check (seam = decoded OGG, seamMaster = pre-codec master): the sample jump N-1 -> 0 must be <= 2x the file's own 99.9th-percentile sample step, and the 5 ms RMS step across the seam <= max(file p99, 3 dB).",
            "Grandmother whispers are synthetic TTS for the vertical slice; release voices require PM approval (Q40).",
        ],
        "totals": {"bytes": total, "megabytes": round((total["ogg"] + total["m4a"]) / 1e6, 2), "cues": len(entries)},
        "cues": entries,
    }
    out = repo / "assets" / "audio" / "manifest.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [e["id"] for e in entries if e.get("loop") and not e["seam"]["pass"]]
    loud = [e["id"] for e in entries if e["kind"] in ("sfx",) and e["samplePeakDbfs"] > -3.0]
    print(f"{len(entries)} cues, {manifest['totals']['megabytes']} MB; seam failures: {bad}; sfx peak failures: {loud}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
