"""Murmur (unintelligible babble) sets via source-filter formant synthesis.

python tools/audio/make_murmur.py <out_dir>

Each clip is one nonsense syllable (optional consonant onset + vowel/diphthong)
built from a glottal pulse train and formant resonators. There is no recorded or
TTS speech, so no real words can occur.
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

from synth import SR, bp, lp, hp, reverb

VOWELS = {  # F1, F2, F3 (adult male reference), bandwidths fixed below
    "a": (750, 1200, 2500), "o": (500, 850, 2450), "u": (330, 760, 2350),
    "e": (480, 1750, 2500), "i": (290, 2200, 2950), "y": (340, 1450, 2400),
}
BW = (90, 110, 160)

SETS = {
    #            f0,  tract, breath, dur range ms, gravel, verb, nasal, contour
    "kupa":      dict(f0=125, tract=0.95, breath=0.18, dur=(70, 210), gravel=0.35, verb=0.10, nasal=0.0, contour="down",
                      note="Kupa, the stove spirit: low, grumbly, a little gravelly"),
    "commis":    dict(f0=170, tract=1.00, breath=0.12, dur=(60, 160), gravel=0.0, verb=0.08, nasal=0.0, contour="up",
                      note="Commis: quick, eager, mid-pitched chatter"),
    "dubodyor":  dict(f0=82, tract=0.82, breath=0.15, dur=(120, 250), gravel=0.45, verb=0.15, nasal=0.0, contour="down",
                      note="Dubodyor: big, deep, slow woodland rumble"),
    "tikhaya":   dict(f0=235, tract=1.16, breath=0.55, dur=(90, 230), gravel=0.0, verb=0.25, nasal=0.0, contour="arch",
                      note="Tikhaya: quiet, breathy, soft and high"),
    "prosha":    dict(f0=150, tract=1.05, breath=0.2, dur=(60, 180), gravel=0.15, verb=0.08, nasal=0.0, contour="chatter",
                      note="Prosha (domovoi): small old fellow, quick fussy chatter"),
    "tram33":    dict(f0=135, tract=1.00, breath=0.12, dur=(70, 200), gravel=0.05, verb=0.12, nasal=0.6, contour="flat",
                      note="Tram 33: nasal, slightly announcer-like monotone"),
    "guardian":  dict(f0=96, tract=0.88, breath=0.25, dur=(130, 250), gravel=0.1, verb=0.45, nasal=0.0, contour="down",
                      note="Guardian: slow, low, distant and resonant"),
    "guest-forest":   dict(f0=175, tract=1.05, breath=0.3, dur=(70, 220), gravel=0.05, verb=0.15, nasal=0.0, contour="arch",
                           note="Generic forest guest: soft and woody"),
    "guest-river":    dict(f0=210, tract=1.10, breath=0.4, dur=(80, 230), gravel=0.0, verb=0.22, nasal=0.0, contour="arch",
                           note="Generic river guest: airy, flowing"),
    "guest-city":     dict(f0=155, tract=1.00, breath=0.1, dur=(60, 180), gravel=0.0, verb=0.06, nasal=0.2, contour="chatter",
                           note="Generic city guest: crisp and quick"),
    "guest-memorial": dict(f0=140, tract=1.00, breath=0.45, dur=(100, 250), gravel=0.0, verb=0.4, nasal=0.0, contour="down",
                           note="Generic memorial guest: hushed, gentle, a little distant"),
}
CLIPS_PER_SET = 12


def glottal(f0_curve, rng, gravel):
    """Band-limited glottal source with -12 dB/oct tilt, jitter and optional subharmonic gravel."""
    jit = 1 + 0.01 * signal.lfilter([1], [1, -0.995], rng.standard_normal(len(f0_curve))) * 0.05
    f = f0_curve * jit
    ph = 2 * np.pi * np.cumsum(f) / SR
    src = np.zeros(len(f))
    for k in range(1, 40):
        mask = (k * f) < 5000
        if not mask.any():
            break
        src += mask * np.sin(k * ph) / k ** 1.6
    if gravel:
        src *= 1 + gravel * np.sin(ph / 2) ** 8 * 0.8
    return src


def resonator(x, f, bw):
    r = np.exp(-np.pi * bw / SR)
    a = [1, -2 * r * np.cos(2 * np.pi * f / SR), r * r]
    b = [1 - r]
    return signal.lfilter(b, a, x)


def formant_filter(x, vowel, tract, nasal):
    f = [v / tract for v in VOWELS[vowel]]
    y = sum(resonator(x, fi, bw) * g for fi, bw, g in zip(f, BW, (1.0, 0.7, 0.35)))
    if nasal:
        y = (1 - nasal) * y + nasal * (resonator(x, 260 / tract, 60) * 0.8 + y * 0.4)
    return y


def contour(n, kind, rng):
    t = np.linspace(0, 1, n)
    if kind == "down":
        c = 1.08 - 0.18 * t
    elif kind == "up":
        c = 0.95 + 0.15 * t
    elif kind == "arch":
        c = 0.95 + 0.15 * np.sin(np.pi * t)
    elif kind == "chatter":
        c = 1 + 0.08 * np.sin(2 * np.pi * rng.uniform(1.5, 3) * t + rng.uniform(0, 6))
    else:
        c = np.ones(n)
    return c


def onset(kind, rng, tract):
    if kind == "plosive":
        return bp(rng.standard_normal(int(0.018 * SR)), 1200 / tract, 4500, 2) * np.exp(-np.arange(int(0.018 * SR)) / 200) * 0.6
    if kind == "fric":
        lo = rng.choice([1800, 3000, 4200])
        n = int(rng.uniform(0.03, 0.06) * SR)
        e = np.sin(np.linspace(0, np.pi, n)) ** 1.5
        return bp(rng.standard_normal(n), lo, min(lo * 2.2, 9000), 2) * e * 0.25
    return np.zeros(0)


def syllable(cfg, rng, f0_scale):
    dur = rng.uniform(*cfg["dur"]) / 1000
    on_kind = rng.choice(["none", "plosive", "fric", "nasal"], p=[0.3, 0.3, 0.2, 0.2])
    on = onset(on_kind, rng, cfg["tract"])
    n = max(int(dur * SR) - len(on), int(0.04 * SR))
    f0 = cfg["f0"] * f0_scale * contour(n, cfg["contour"], rng)
    src = glottal(f0, rng, cfg["gravel"])
    breath = hp(rng.standard_normal(n), 400) * cfg["breath"] * 0.25
    v1, v2 = rng.choice(list(VOWELS), 2)
    a = formant_filter(src + breath, v1, cfg["tract"], cfg["nasal"])
    b = formant_filter(src + breath, v2, cfg["tract"], cfg["nasal"])
    w = np.clip(np.linspace(-0.6, 1.6, n), 0, 1) if rng.random() < 0.4 else np.zeros(n)
    voiced = a * (1 - w) + b * w
    if on_kind == "nasal":
        voiced[: int(0.03 * SR)] = lp(voiced[: int(0.03 * SR)], 400)
    na, nr = int(0.012 * SR), int(0.035 * SR)
    env = np.ones(n)
    env[:na] = np.linspace(0, 1, na) ** 1.5
    env[-nr:] = np.linspace(1, 0, nr) ** 2
    voiced = voiced / (np.max(np.abs(voiced)) + 1e-9) * env
    x = np.concatenate([on, voiced])
    if cfg["verb"]:
        x = reverb(x, 0.3 + cfg["verb"], cfg["verb"], seed=int(rng.integers(1 << 20)), tail=0.12)
    x = hp(x, 70)[: max(int(dur * SR), len(on) + int(0.04 * SR))]
    k = int(0.002 * SR)
    x[:k] *= np.linspace(0, 1, k)
    x[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    return x


def render_all(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    meta = {}
    for set_id, cfg in SETS.items():
        seed = sum(map(ord, set_id)) * 15485863
        rng = np.random.default_rng(seed)
        clips = []
        scales = np.linspace(0.82, 1.22, CLIPS_PER_SET)
        rng.shuffle(scales)
        for i in range(CLIPS_PER_SET):
            x = syllable(cfg, rng, scales[i])
            # equalise loudness across a set (RMS), keep peaks <= -6 dBFS
            rms = np.sqrt(np.mean(x ** 2)) + 1e-9
            x = x * (10 ** (-22 / 20) / rms)
            pk = np.max(np.abs(x))
            if pk > 10 ** (-6 / 20):
                x *= 10 ** (-6 / 20) / pk
            cid = f"murmur-{set_id}-{i + 1:02d}"
            sf.write(out / f"{cid}.wav", x.astype(np.float32), SR, subtype="FLOAT")
            clips.append(cid)
        meta[f"murmur-{set_id}"] = {"clips": clips, "settings": {
            "character": cfg["note"], "seed": int(seed), "f0Hz": cfg["f0"], "pitchScales": [round(float(s), 3) for s in scales],
            "vocalTractScale": cfg["tract"], "breathiness": cfg["breath"], "durationMs": list(cfg["dur"]),
            "gravel": cfg["gravel"], "reverb": cfg["verb"], "nasal": cfg["nasal"], "contour": cfg["contour"]}}
    (out / "murmur_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return meta


if __name__ == "__main__":
    m = render_all(sys.argv[1])
    print(len(m), "murmur sets,", sum(len(v["clips"]) for v in m.values()), "clips")
