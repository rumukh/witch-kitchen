"""Cut seamless loops / ending cues from ACE-Step renders.

python tools/audio/make_music.py <build_dir>/music <music_jobs.json>

music_jobs.json maps cue id -> {"src": flac, "bpm": nominal, "loop": bool, "bars": [min,max],
"tool": ..., "settings": {...}}. For loops the script estimates the real tempo,
searches a bar-aligned loop window whose start and end are most similar
(spectral + waveform), then bakes a short equal-power crossfade so the last sample
flows into sample 0. Non-looping cues get a trimmed head and a natural tail fade.
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000


def mono(x):
    return x.mean(axis=1) if x.ndim == 2 else x


def onset_env(m, hop=512):
    f, t, Z = signal.stft(m, SR, nperseg=2048, noverlap=2048 - hop)
    S = np.log1p(np.abs(Z) * 100)
    flux = np.maximum(np.diff(S, axis=1), 0).sum(axis=0)
    return flux - signal.medfilt(flux, 31), SR / hop


def estimate_bpm(m, nominal):
    env, fps = onset_env(m)
    env = env - env.mean()
    ac = np.correlate(env, env, "full")[len(env) - 1:]
    best, bv = nominal, -np.inf
    for bpm in np.arange(nominal * 0.94, nominal * 1.06, 0.05):
        lag = 60 / bpm * fps
        v = sum(np.interp(lag * k, np.arange(len(ac)), ac) for k in (1, 2, 4, 8))
        if v > bv:
            best, bv = bpm, v
    return float(best)


def features(m, hop=1024):
    f, t, Z = signal.stft(m, SR, nperseg=4096, noverlap=4096 - hop)
    S = np.abs(Z)
    edges = np.geomspace(60, 12000, 41)
    bands = np.stack([S[(f >= lo) & (f < hi)].sum(axis=0) for lo, hi in zip(edges[:-1], edges[1:])])
    F = np.log1p(bands * 50)
    F /= np.linalg.norm(F, axis=0, keepdims=True) + 1e-9
    return F, hop


def find_loop(x, bpm, bars, head_skip=3.0, tail_keep=4.0, xfade=0.35):
    m = mono(x)
    F, hop = features(m)
    bar = 4 * 60 / bpm * SR
    win = int(3.0 * SR / hop)
    best = None
    max_start = len(m) - tail_keep * SR
    for nb in range(bars[0], bars[1] + 1):
        L = int(round(nb * bar))
        for s in range(int(head_skip * SR), int(max_start - L - xfade * SR), hop):
            a, b = s // hop, (s + L) // hop
            if b + win >= F.shape[1]:
                break
            sim = float((F[:, a:a + win] * F[:, b:b + win]).sum(axis=0).mean())
            if best is None or sim > best[0]:
                best = (sim, s, L, nb)
    sim, s, L, nb = best
    # refine L by +-15 ms waveform cross-correlation around the seam
    w = int(0.25 * SR)
    ref = m[s:s + w]
    lags = range(-int(0.015 * SR), int(0.015 * SR) + 1)
    corr = [np.dot(ref, m[s + L + d:s + L + d + w]) for d in lags]
    L += list(lags)[int(np.argmax(corr))]
    return s, L, nb, sim


def bake(x, s, L, xfade):
    xf = int(xfade * SR)
    body = x[s:s + L].copy()
    tail = x[s + L:s + L + xf]
    k = np.linspace(0, 1, xf)
    fi, fo = np.sin(k * np.pi / 2)[:, None], np.cos(k * np.pi / 2)[:, None]
    body[:xf] = body[:xf] * fi + tail * fo
    return body


def ending(x, fade_s=2.5):
    m = mono(x)
    fr = int(0.05 * SR)
    n = len(m) // fr
    e = 20 * np.log10(np.sqrt((m[: n * fr].reshape(n, fr) ** 2).mean(1)) + 1e-9)
    act = np.where(e > e.max() - 50)[0]
    s, t = act[0] * fr, min(len(x), (act[-1] + 1) * fr)
    y = x[s:t].copy()
    k = int(0.01 * SR)
    y[:k] *= np.linspace(0, 1, k)[:, None]
    f = int(fade_s * SR)
    y[-f:] *= (np.linspace(1, 0, f) ** 2)[:, None]
    return y


def main(out_dir, jobs_path):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    jobs = json.loads(Path(jobs_path).read_text(encoding="utf-8-sig"))
    meta_path = out / "music_meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    for cid, j in jobs.items():
        x, sr = sf.read(j["src"], always_2d=True)
        if sr != SR:
            x = signal.resample_poly(x, SR, sr, axis=0)
        settings = dict(j["settings"])
        bpm_nominal = j.get("bpm", 0)
        if j.get("tuneCents"):
            # pitch-align by resampling (also scales tempo by the same tiny ratio)
            from fractions import Fraction
            ratio = Fraction(2 ** (-j["tuneCents"] / 1200)).limit_denominator(2000)
            x = signal.resample_poly(x, ratio.numerator, ratio.denominator, axis=0)
            bpm_nominal = bpm_nominal * 2 ** (j["tuneCents"] / 1200)
            settings["tuningCorrectionCents"] = j["tuneCents"]
        if j["loop"]:
            bpm = estimate_bpm(mono(x), bpm_nominal)
            xfade = j.get("xfade", 0.35)
            s, L, nb, sim = find_loop(x, bpm, j["bars"], head_skip=j.get("headSkip", 3.0),
                                      tail_keep=j.get("tailKeep", 4.0), xfade=xfade)
            y = bake(x, s, L, xfade)
            settings.update({"estimatedBpm": round(bpm, 2), "loopSourceStartSample": int(s), "loopBars": nb,
                             "loopSourceLengthSamples": int(L), "seamCrossfadeSeconds": xfade,
                             "seamSpectralSimilarity": round(sim, 4)})
            print(cid, "bpm", round(bpm, 2), "start", round(s / SR, 2), "len", round(L / SR, 2), "bars", nb, "sim", round(sim, 3))
        else:
            y = ending(x)
            print(cid, "ending", round(len(y) / SR, 2))
        sf.write(out / f"{cid}.wav", y.astype(np.float32), SR, subtype="FLOAT")
        meta[cid] = {"loop": j["loop"], "tool": j["tool"], "settings": settings, "notes": j.get("notes", "")}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
