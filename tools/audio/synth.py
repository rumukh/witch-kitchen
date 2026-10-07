"""Small procedural synthesis toolkit used to build Krestets SFX, ambience and murmur.

Everything here is generated from math and seeded random numbers, so all output is
original and free of third-party rights.
"""
import numpy as np
from scipy import signal

SR = 48000


def t_axis(dur):
    return np.arange(int(round(dur * SR))) / SR


def silence(dur):
    return np.zeros(int(round(dur * SR)))


def env_ad(n, attack, decay_tau, sr=SR):
    t = np.arange(n) / sr
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay_tau)


def fade(x, fin=0.003, fout=0.01):
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a:
        x[:a] *= (np.linspace(0, 1, a) ** 2)[:, None] if x.ndim == 2 else np.linspace(0, 1, a) ** 2
    if b:
        x[-b:] *= (np.linspace(1, 0, b) ** 2)[:, None] if x.ndim == 2 else np.linspace(1, 0, b) ** 2
    return x


def mix(*parts, length=None):
    """parts: (offset_seconds, array) tuples or plain arrays (mono)."""
    items = [(0.0, p) if isinstance(p, np.ndarray) else p for p in parts]
    n = length or max(int(o * SR) + len(a) for o, a in items)
    out = np.zeros(n)
    for o, a in items:
        s = int(o * SR)
        e = min(n, s + len(a))
        if e > s:
            out[s:e] += a[: e - s]
    return out


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, fc, order=2):
    sos = signal.butter(order, fc, btype="low", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, btype="high", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def pink(n, rng):
    w = rng.standard_normal(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    p = signal.lfilter(b, a, w)
    return p / (np.max(np.abs(p)) + 1e-9)


def brown(n, rng):
    b = np.cumsum(rng.standard_normal(n))
    b = hp(b, 25)
    return b / (np.max(np.abs(b)) + 1e-9)


# ---------------------------------------------------------------- tonal sources

BELL_RATIOS = [0.5, 1.0, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011, 4.166]
BELL_AMPS = [0.35, 1.0, 0.45, 0.32, 0.5, 0.18, 0.14, 0.12, 0.06]


def bell(freq, dur=2.5, bright=1.0, decay=1.4):
    t = t_axis(dur)
    out = np.zeros_like(t)
    for i, (r, a) in enumerate(zip(BELL_RATIOS, BELL_AMPS)):
        f = freq * r
        if f > SR / 2.2:
            continue
        tau = decay / (1 + 0.6 * i) * (1.6 if r == 0.5 else 1.0)
        amp = a * (bright ** (i / 4))
        ph = 2 * np.pi * f * t + 0.8 * np.sin(2 * np.pi * (0.7 + 0.3 * i) * t) * (i > 0)
        out += amp * np.sin(ph) * np.exp(-t / tau)
    return out * np.clip(t / 0.002, 0, 1)


def chime_tone(freq, dur=1.5, decay=0.9):
    """Small, sweet music-box/tubular style tone (near-harmonic)."""
    t = t_axis(dur)
    parts = [(1, 1.0, 1.0), (2.0, 0.12, 0.6), (2.76, 0.22, 0.45), (5.4, 0.06, 0.25)]
    out = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / (decay * d))
              for r, a, d in parts if freq * r < SR / 2.2)
    return out * np.clip(t / 0.0015, 0, 1)


def glass(freq, dur=0.6, decay=0.18):
    t = t_axis(dur)
    ratios = [1, 2.32, 4.25, 6.63]
    amps = [1, 0.45, 0.2, 0.08]
    out = sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / (decay / (1 + i)))
              for i, (r, a) in enumerate(zip(ratios, amps)) if freq * r < SR / 2.2)
    return out * np.clip(t / 0.0008, 0, 1)


def pluck(freq, dur=1.2, damp=0.996, bright=0.5, seed=0):
    """Karplus-Strong string (gusli/domra-like), vectorised per period."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    p = max(2, int(round(SR / freq)))
    buf = rng.uniform(-1, 1, p)
    buf = lp(buf, 800 + 9000 * bright, 1)
    out = np.empty(((n // p) + 2) * p)
    cur = buf
    for k in range((n // p) + 2):
        out[k * p:(k + 1) * p] = cur
        nxt = damp * 0.5 * (cur + np.roll(cur, 1))
        cur = nxt
    return out[:n]


def sine_sweep(f0, f1, dur, shape="exp"):
    t = t_axis(dur)
    f = f0 * (f1 / f0) ** (t / dur) if shape == "exp" else f0 + (f1 - f0) * t / dur
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def noise_burst(dur, lo, hi, attack=0.001, decay=0.03, rng=None, order=2):
    rng = rng if rng is not None else np.random.default_rng(0)
    n = int(dur * SR)
    return bp(rng.standard_normal(n), lo, hi, order) * env_ad(n, attack, decay)


def wood_knock(freq=420, dur=0.25, rng=None, tau=0.035):
    rng = rng if rng is not None else np.random.default_rng(1)
    t = t_axis(dur)
    body = (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2.31 * t)
            + 0.25 * np.sin(2 * np.pi * freq * 3.9 * t)) * np.exp(-t / tau)
    click = noise_burst(dur, 1500, 6000, 0.0005, 0.004, rng)
    return body * 0.8 + click * 0.5


def sparkle(dur=0.8, n=10, lo=2500, hi=7000, rng=None, spread=None):
    rng = rng if rng is not None else np.random.default_rng(2)
    spread = spread or dur * 0.6
    parts = []
    for _ in range(n):
        f = rng.uniform(lo, hi)
        o = rng.uniform(0, spread)
        parts.append((o, chime_tone(f, 0.5, 0.12) * rng.uniform(0.3, 1.0)))
    return mix(*parts, length=int(dur * SR))


def reverb(x, size=0.35, mixw=0.25, seed=7, tail=1.2):
    """Cheap convolution reverb with an exponentially decaying noise IR (mono)."""
    rng = np.random.default_rng(seed)
    n = int(tail * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t / (size * 0.5))
    ir = lp(ir, 6000)
    k = int(0.008 * SR)
    ir[:k] *= np.linspace(0, 1, k)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    wet = signal.fftconvolve(np.pad(x, (0, n)), ir)[: len(x) + n]
    dry = np.pad(x, (0, n))
    return (1 - mixw) * dry + mixw * wet * 0.6


def stereo(x, width=0.0, pan=0.0, seed=3):
    """Mono -> stereo with decorrelated reverb-ish width and constant-power pan."""
    l, r = x.copy(), x.copy()
    if width > 0:
        rng = np.random.default_rng(seed)
        n = int(0.03 * SR)
        irl = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.006 * SR))
        irr = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.006 * SR))
        irl /= np.sqrt(np.sum(irl ** 2))
        irr /= np.sqrt(np.sum(irr ** 2))
        l = (1 - width) * x + width * signal.fftconvolve(x, irl)[: len(x)]
        r = (1 - width) * x + width * signal.fftconvolve(x, irr)[: len(x)]
    gl = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    gr = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    return np.stack([l * gl, r * gr], axis=1)


def norm_peak(x, db=-6.0):
    pk = np.max(np.abs(x)) + 1e-12
    return x * (10 ** (db / 20) / pk)


def loop_crossfade(x, loop_len, xfade):
    """Make a seamless loop of loop_len samples from x (len >= loop_len + xfade).

    The material after loop_len is equal-power crossfaded into the head, so the
    last sample flows directly into sample 0 when looped.
    """
    body = np.array(x[:loop_len], dtype=float)
    tail = np.asarray(x[loop_len:loop_len + xfade], dtype=float)
    k = np.linspace(0, 1, xfade)
    fi, fo = np.sin(k * np.pi / 2), np.cos(k * np.pi / 2)
    if body.ndim == 2:
        fi, fo = fi[:, None], fo[:, None]
    body[:xfade] = body[:xfade] * fi + tail * fo
    return body
