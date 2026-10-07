"""Procedural ambience loops for Krestets. Run: python tools/audio/make_ambience.py <out_dir>

Every bed is built as a circular (wrap-around) signal: event layers are rendered
past the loop end and folded back onto the start, and stationary noise layers are
equal-power crossfaded, so sample N-1 flows into sample 0 without a seam.
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from synth import (SR, bell, bp, brown, chime_tone, glass, hp, loop_crossfade, lp,
                   noise_burst, pink, reverb, stereo, t_axis, wood_knock)

AMB = {}


def amb(name, seconds, note):
    def deco(fn):
        AMB[name] = (fn, seconds, note)
        return fn
    return deco


def bed(n, r, maker, xfade_s=2.0):
    """Stationary stereo bed of exactly n samples that loops via crossfade."""
    xf = int(xfade_s * SR)
    raw = maker(n + xf, r)
    if raw.ndim == 1:
        raw = stereo(raw, 0.6, seed=int(r.integers(1 << 30)))
    return loop_crossfade(raw, n, xf)


def events(n, r, count, maker, pan_spread=0.7, tail_s=4.0):
    """Sparse events placed on a circle: tails past n wrap to the start."""
    out = np.zeros((n + int(tail_s * SR), 2))
    for _ in range(count):
        pos = int(r.integers(0, n))
        ev = maker(r)
        st = stereo(ev, 0.0, pan=float(r.uniform(-pan_spread, pan_spread)))
        e = min(len(out), pos + len(st))
        out[pos:e] += st[: e - pos]
    looped = out[:n].copy()
    over = out[n:]
    looped[: len(over)] += over
    return looped


def slow_lfo(n, r, rate=0.05, depth=0.3, period=None):
    """Periodic LFO that completes an integer number of cycles over n samples."""
    cycles = max(1, round(rate * n / SR))
    t = np.arange(n) / n
    ph = r.uniform(0, 2 * np.pi)
    return 1 - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * cycles * t + ph))


# ------------------------------------------------------------------ clock
@amb("amb-clock-ticking", 32.0, "Wall-clock (khodiki) pendulum: alternating tick/tock exactly every 1.000 s (48000 samples); 32 beats per loop, tails wrapped circularly so the loop is sample-accurate.")
def clock(n, r):
    period = SR  # one beat per second
    out = np.zeros(n + SR)
    for k in range(n // period):
        tick = k % 2 == 0
        f = 1650 if tick else 1450
        x = wood_knock(f, 0.25, r, 0.010) * 0.8 + wood_knock(f * 0.31, 0.25, r, 0.03) * 0.5
        x[:2400] += noise_burst(0.05, 2500, 8000, 0.0003, 0.002, r) * 0.35
        x *= 1.0 if tick else 0.85
        p = k * period + period // 2  # seam falls in the quiet half-beat between tocks
        out[p:p + len(x)] += x
    room = reverb(out, 0.25, 0.22, seed=3, tail=0.8)
    looped = room[:n].copy()
    looped[: len(room) - n] += room[n:]
    st = stereo(looped, 0.25, seed=5)
    # a very low, steady mechanism hum keeps it from feeling sterile
    hum = lp(brown(n + SR, r), 120)[: n + SR]
    hum = loop_crossfade(stereo(hum, 0.5), n, SR) * 0.015
    return st + hum


# ------------------------------------------------------------------ tavern
@amb("amb-tavern-room", 48.0, "Quiet wooden tavern room tone: low warm air, distant settling creaks, rare soft cup clinks.")
def tavern(n, r):
    tone = bed(n, r, lambda m, rr: lp(brown(m, rr), 350) * 0.6 + lp(pink(m, rr), 1500) * 0.08)

    def creak(rr):
        d = rr.uniform(0.3, 0.7)
        t = t_axis(d)
        f = rr.uniform(25, 45) + 10 * t / d
        ph = np.cumsum(f) / SR
        pul = np.zeros(len(t))
        pul[np.where(np.diff(np.floor(ph)) > 0)[0]] = 1
        return (bp(pul, 300, 1400) * np.sin(np.pi * t / d) ** 2) * 0.25

    def clink(rr):
        return glass(rr.uniform(1500, 2400), 0.5, 0.08) * 0.05

    return tone + events(n, r, 7, creak) + events(n, r, 3, clink)


@amb("amb-stove-fire", 40.0, "Russian stove fire: low breathing roar, steady soft crackle, occasional pops; nothing sharp.")
def stove(n, r):
    def roar(m, rr):
        x = lp(brown(m, rr), 220) * 0.8 + bp(pink(m, rr), 200, 1200) * 0.15
        return x * slow_lfo(m, rr, 0.2, 0.35)

    base = bed(n, r, roar)

    def crack(rr):
        L = int(rr.integers(60, 500))
        x = rr.standard_normal(L) * np.exp(-np.arange(L) / (L / 5))
        return bp(np.pad(x, (0, 400)), 1200, 6500) * rr.uniform(0.05, 0.25)

    def pop(rr):
        return noise_burst(0.08, 600, 3500, 0.0005, 0.01, rr) * rr.uniform(0.2, 0.35)

    cr = events(n, r, int(n / SR * 9), crack, 0.4, 0.1)
    pp = events(n, r, int(n / SR * 0.3), pop, 0.4, 0.2)
    return base + cr + pp


# ------------------------------------------------------------------ worlds
@amb("amb-world-forest", 45.0, "Forest door bed: breathing wind in leaves, a few soft distant bird calls.")
def forest(n, r):
    def wind(m, rr):
        return bp(pink(m, rr), 250, 2500) * slow_lfo(m, rr, 0.08, 0.6) * 0.5

    base = bed(n, r, wind, 3.0)

    def bird(rr):
        f0 = rr.uniform(2600, 3800)
        calls = []
        for i in range(int(rr.integers(2, 5))):
            d = rr.uniform(0.06, 0.14)
            t = t_axis(d)
            f = f0 * (1 + rr.uniform(-0.25, 0.25) * t / d) * (1 + 0.03 * np.sin(2 * np.pi * 40 * t))
            calls.append(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2)
            calls.append(np.zeros(int(rr.uniform(0.04, 0.12) * SR)))
        return reverb(np.concatenate(calls), 0.5, 0.4, tail=0.8) * 0.06

    return base + events(n, r, 9, bird, 0.9, 2.0)


@amb("amb-world-river", 45.0, "River door bed: gentle flowing water, glassy bubbles, soft lapping.")
def river(n, r):
    def flow(m, rr):
        x = bp(pink(m, rr), 300, 2500) * 0.4 + lp(brown(m, rr), 300) * 0.4
        return x * slow_lfo(m, rr, 0.15, 0.3)

    base = bed(n, r, flow, 3.0)

    def bub(rr):
        d = rr.uniform(0.02, 0.07)
        t = t_axis(d)
        f = rr.uniform(500, 1500) * (1 + 2 * t / d)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (d / 3)) * rr.uniform(0.03, 0.09)

    def lap(rr):
        return lp(noise_burst(0.6, 150, 900, 0.15, 0.2, rr), 900) * 0.25

    return base + events(n, r, int(n / SR * 6), bub, 0.8, 0.2) + events(n, r, 10, lap, 0.6, 0.8)


@amb("amb-world-city", 45.0, "City door bed: soft distant traffic hush, faint warm lamp hum, far-off tram bell rarely.")
def city(n, r):
    def hush(m, rr):
        return lp(brown(m, rr), 260) * 0.6 + bp(pink(m, rr), 300, 1800) * 0.12 * slow_lfo(m, rr, 0.05, 0.5)

    base = bed(n, r, hush, 3.0)
    t = np.arange(n) / SR
    hum = sum(a * np.sin(2 * np.pi * f * t) for f, a in [(100, 1), (200, 0.4), (300, 0.15)])
    hum = stereo(hum * 0.006, 0.0)  # 100 Hz harmonics complete whole cycles over the loop

    def far_tram(rr):
        tt = t_axis(1.6)
        d = sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt / dd)
                for f, a, dd in [(1180, 1, 0.5), (2950, 0.4, 0.25)])
        x = d + np.pad(d, (int(0.22 * SR), 0))[: len(d)] * 0.8
        return lp(reverb(x, 1.0, 0.7, tail=2.0), 2500) * 0.035

    def steps(rr):
        out = []
        for _ in range(int(rr.integers(4, 8))):
            out.append(lp(noise_burst(0.06, 200, 2000, 0.002, 0.015, rr), 1500) * 0.05)
            out.append(np.zeros(int(0.48 * SR)))
        return np.concatenate(out)

    return base + hum + events(n, r, 2, far_tram, 0.5, 3.0) + events(n, r, 3, steps, 0.8, 4.0)


@amb("amb-world-memorial", 45.0, "Memorial (pogost) door bed: hushed wind, candle flutter, a very distant soft bell; calm, not eerie.")
def memorial(n, r):
    def wind(m, rr):
        return lp(pink(m, rr), 700) * slow_lfo(m, rr, 0.04, 0.5) * 0.5

    base = bed(n, r, wind, 3.0)
    t = np.arange(n) / SR
    # soft warm pad G3+D4 with whole-cycle frequencies (exact cycles over loop)
    cyc = lambda f: round(f * n / SR) * SR / n
    pad = sum(a * np.sin(2 * np.pi * cyc(f) * t) for f, a in [(196.0, 1), (293.66, 0.6), (392.0, 0.3)])
    pad = stereo(pad * 0.012 * slow_lfo(n, r, 0.05, 0.5), 0.0)

    def flutter(rr):
        return bp(noise_burst(0.5, 200, 1200, 0.05, 0.15, rr), 200, 1200) * 0.08

    def far_bell(rr):
        return lp(reverb(bell(392.0, 5.0, 0.4, 2.5), 1.2, 0.6, tail=2.5), 2000) * 0.04

    return base + pad + events(n, r, 8, flutter, 0.5, 0.6) + events(n, r, 3, far_bell, 0.4, 7.0)


def render_all(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    meta = {}
    for name, (fn, seconds, note) in AMB.items():
        seed = sum(map(ord, name)) * 104729
        r = np.random.default_rng(seed)
        n = int(seconds * SR)
        x = fn(n, r)
        assert len(x) == n, (name, len(x), n)
        x = x / (np.max(np.abs(x)) + 1e-9) * 0.5
        sf.write(out / f"{name}.wav", x.astype(np.float32), SR, subtype="FLOAT")
        meta[name] = {"design": note, "seed": int(seed), "loop_samples": n}
    (out / "amb_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return meta


if __name__ == "__main__":
    print(len(render_all(sys.argv[1])), "ambience loops rendered")
