"""Finalize grandmother whispers produced by the speech-production skill.

Run with the speech runtime python (needs speech_production + scipy on path):
  python tools/audio/make_voice.py <speech_output_dir> <whispers.json> <build_dir>

Caps internal pauses at MAX_GAP seconds (the whispering style inserts multi-second
gaps at ellipses and sentence ends), trims edges, writes 48 kHz mono WAVs and
re-checks every finished file with Azure recognition for the manifest.
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path.home() / ".copilot/skills/speech-production/scripts"))
import speech_production as sp  # noqa: E402

FRAME = 0.01
MAX_GAP = 0.45
XF = 0.03
LEAD, TAIL = 0.06, 0.3


def cap_pauses(x, sr):
    fr = int(FRAME * sr)
    n = len(x) // fr
    e = 20 * np.log10(np.sqrt((x[: n * fr].reshape(n, fr) ** 2).mean(1)) + 1e-9)
    act = e > e.max() - 42
    idx = np.where(act)[0]
    start, end = max(0, idx[0] * fr - int(LEAD * sr)), min(len(x), (idx[-1] + 1) * fr + int(TAIL * sr))
    keep, i = [], idx[0]
    seg_start = start
    out = []
    while i <= idx[-1]:
        if not act[i]:
            j = i
            while j <= idx[-1] and not act[j]:
                j += 1
            gap = (j - i) * FRAME
            if gap > MAX_GAP:
                cut_a = i * fr + int(MAX_GAP / 2 * sr)
                cut_b = j * fr - int(MAX_GAP / 2 * sr)
                out.append(x[seg_start:cut_a])
                seg_start = cut_b
            i = j
        else:
            i += 1
    out.append(x[seg_start:end])
    xf = int(XF * sr)
    y = out[0]
    for part in out[1:]:
        k = np.linspace(0, 1, xf)
        y = np.concatenate([y[:-xf], y[-xf:] * (1 - k) + part[:xf] * k, part[xf:]])
    f = int(0.005 * sr)
    y[:f] *= np.linspace(0, 1, f)
    y[-int(0.05 * sr):] *= np.linspace(1, 0, int(0.05 * sr))
    return y


def main(speech_dir, whispers_path, build_dir):
    speech_dir, build = Path(speech_dir), Path(build_dir) / "voice"
    build.mkdir(parents=True, exist_ok=True)
    report = json.loads((speech_dir / "production-report.json").read_text(encoding="utf-8"))
    display = json.loads(Path(whispers_path).read_text(encoding="utf-8-sig"))
    region, key, _ = sp.get_speech_resource({"preferred_region": "swedencentral"})
    meta = {}
    for seg in report["segments"]:
        x, sr = sf.read(seg["final_path"])
        if x.ndim == 2:
            x = x.mean(1)
        assert sr == 48000
        y = cap_pauses(x, sr)
        dst = build / f"{seg['id']}.wav"
        sf.write(dst, y.astype(np.float32), sr, subtype="FLOAT")
        a = sp.assess(region, key, "ru-RU", dst, seg["text"])
        tr = sp.transcribe(region, key, "ru-RU", dst)
        ssml = Path(seg["ssml_path"]).read_text(encoding="utf-8")
        meta[seg["id"]] = {
            "text": display[seg["id"]],
            "tool": "Azure AI Speech neural TTS via speech-production skill (REST), finalized by tools/audio/make_voice.py",
            "settings": {
                "voice": seg["voice"], "style": "whispering", "language": "ru-RU (via <lang>)",
                "ssml": ssml, "spokenText": seg["text"],
                "post": f"internal pauses capped at {MAX_GAP}s, lead {LEAD}s, tail {TAIL}s; loudness -20 LUFS",
                "rawDurationSeconds": round(len(x) / sr, 2),
                "skillDecision": seg["decision"],
                "skillScores": {"accuracy": seg["accuracy_score"], "fluency": seg["fluency_score"],
                                "completeness": seg["completeness_score"]},
                "finalCheck": {"transcript": tr, "accuracy": a["accuracy_score"], "fluency": a["fluency_score"],
                               "completeness": a["completeness_score"]},
            },
            "notes": ("Slice-only synthetic voice (Q40): release needs PM approval. "
                      + ("SSML respells 'Купе' as 'Ку́пи' ([ˈkupʲɪ]) because the voice ignores IPA phoneme tags "
                         "(capability probe sentinel failed); audible result is the dative of Kupa, not 'купе́'. "
                         if "Купе" in display[seg["id"]] else "")).strip(),
        }
        print(seg["id"], round(len(x) / sr, 2), "->", round(len(y) / sr, 2), a["accuracy_score"], a["completeness_score"], tr)
    (build / "voice_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(*sys.argv[1:4])
