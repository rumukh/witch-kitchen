"""Score ACE renders for tier compatibility: tuning offset (cents from A440),
tuning concentration, transposition and key-profile correlation vs a reference.

python tools/audio/score_tonal.py <reference> <candidate> [<candidate> ...]
"""
import sys

import numpy as np
import soundfile as sf
from scipy import signal


def load(p, seconds=80):
    x, sr = sf.read(p)
    m = x.mean(1) if x.ndim == 2 else x
    return m[: sr * seconds], sr


def tuning(m, sr):
    fr, t, Z = signal.stft(m, sr, nperseg=16384, noverlap=8192)
    S = np.abs(Z)
    cents, w = [], []
    for j in range(S.shape[1]):
        col = S[:, j]
        for k in signal.find_peaks(col, height=col.max() * 0.1)[0]:
            if 150 < fr[k] < 2000 and 0 < k < len(col) - 1:
                a, b, c = np.log(col[k - 1:k + 2] + 1e-12)
                d = 0.5 * (a - c) / (a - 2 * b + c)
                cents.append((1200 * np.log2((k + d) * sr / 16384 / 440)) % 100)
                w.append(col[k])
    ang = np.array(cents) / 100 * 2 * np.pi
    w = np.array(w)
    z = np.sum(w * np.exp(1j * ang))
    return (np.angle(z) / (2 * np.pi) * 100 + 50) % 100 - 50, abs(z) / w.sum()


def profile(m, sr):
    fr, t, Z = signal.stft(m, sr, nperseg=8192, noverlap=4096)
    S = np.abs(Z)
    P = np.zeros(12)
    for i, fq in enumerate(fr):
        if 100 < fq < 3000:
            P[int(round(12 * np.log2(fq / 440))) % 12] += S[i].sum()
    return P / P.sum()


def main(ref, cands):
    rm, sr = load(ref)
    rp = profile(rm, sr)
    for c in cands:
        m, sr = load(c)
        cents, conc = tuning(m, sr)
        p = profile(m, sr)
        tr = max(range(12), key=lambda k: np.dot(rp, np.roll(p, k)))
        print(f"{c.split(chr(92))[-1]:45s} tune {cents:+6.1f}c conc {conc:.2f} transpose {tr:2d} keycorr {np.corrcoef(rp, p)[0, 1]:.2f}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
