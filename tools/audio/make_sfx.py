"""Procedural SFX for Krestets. Run: python tools/audio/make_sfx.py <out_dir>

Writes 48 kHz float WAV masters plus sfx_meta.json describing each cue's
design so the manifest can record the exact settings.
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from synth import (SR, bell, bp, chime_tone, env_ad, fade, glass, hp, lp, mix,
                   noise_burst, norm_peak, pink, pluck, reverb, sine_sweep,
                   sparkle, stereo, t_axis, wood_knock, brown)

# G major pentatonic, the key shared with the night theme
G3, A3, B3, D4, E4, G4, A4, B4, D5, E5, G5, A5, B5, D6 = (
    196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25,
    783.99, 880.0, 987.77, 1174.66)

SFX = {}


def cue(name, peak_db=-4.0, note=""):
    def deco(fn):
        SFX[name] = (fn, peak_db, note or (fn.__doc__ or "").strip())
        return fn
    return deco


def seq(notes, gap, maker, length=None):
    return mix(*[(i * gap, maker(f)) for i, f in enumerate(notes)], length=length)


# ------------------------------------------------------------------ chimes
@cue("chime-wind", -3.5)
def chime_wind(r):
    """Wind-change chime: three rising soft bells G4-B4-D5 over a breath of air."""
    bells = seq([G4, B4, D5], 0.28, lambda f: bell(f, 3.0, 0.7, 1.6))
    air = pink(len(bells), r)
    air = bp(air, 400, 3000) * np.sin(np.linspace(0, np.pi, len(bells))) ** 2 * 0.25
    return stereo(reverb(bells + air, 0.6, 0.3), 0.35)


@cue("chime-midnight", -3.5)
def chime_midnight(r):
    """Midnight chime: deep wall-clock bell motif D4-G4-B4-A4 then a low G3 strike."""
    parts = [(i * 0.42, bell(f, 3.5, 0.6, 2.0)) for i, f in enumerate([D4, G4, B4, A4])]
    parts.append((1.9, bell(G3, 4.0, 0.5, 2.6) * 1.2))
    return stereo(reverb(mix(*parts), 0.8, 0.3), 0.35)


@cue("chime-predawn", -3.5)
def chime_predawn(r):
    """Predawn chime: brisker bright motif E5-D5-B4-D5 with a doubled final strike."""
    parts = [(i * 0.22, bell(f, 2.5, 0.9, 1.3)) for i, f in enumerate([E5, D5, B4, D5])]
    parts += [(1.0, bell(G4, 3.0, 0.8, 1.8)), (1.25, bell(G4, 3.0, 0.8, 1.8) * 0.6)]
    return stereo(reverb(mix(*parts), 0.6, 0.28), 0.35)


@cue("chime-dawn", -3.5)
def chime_dawn(r):
    """Dawn chime: warm rising arpeggio G4-B4-D5-G5 resolving with a sparkle."""
    parts = [(i * 0.2, bell(f, 3.5, 0.8, 1.8)) for i, f in enumerate([G4, B4, D5, G5])]
    parts.append((0.85, sparkle(2.0, 14, 3000, 8000, r) * 0.25))
    parts.append((0.8, bell(G3, 4.0, 0.5, 2.5) * 0.8))
    return stereo(reverb(mix(*parts), 0.7, 0.3), 0.4)


def cuckoo_call(f_hi, f_lo, r):
    def pipe(f, d):
        t = t_axis(d)
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
        ph = 2 * np.pi * np.cumsum(f * vib) / SR
        tone = np.sin(ph) + 0.12 * np.sin(2 * ph) + 0.04 * np.sin(3 * ph)
        breath = bp(r.standard_normal(len(t)), f * 0.8, f * 2.5) * 0.06
        e = np.minimum(1, t / 0.025) * np.minimum(1, (d - t) / 0.06)
        return (tone + breath) * e
    return mix((0, pipe(f_hi, 0.22)), (0.27, pipe(f_lo, 0.34)))


@cue("cuckoo", -7)
def cuckoo(r):
    """Wooden cuckoo pipe: two falling-third calls D5-B4, with the little door click."""
    call = cuckoo_call(D5, B4, r)
    click = wood_knock(900, 0.1, r, 0.012) * 0.4
    x = mix((0, click), (0.08, call), (0.85, call * 0.9), (1.6, click * 0.7))
    return stereo(reverb(x, 0.4, 0.2), 0.25)


# ------------------------------------------------------------------ jars & cooking
@cue("jar-pick", -5)
def jar_pick(r):
    """Lift a small glass jar: soft glass tick and a tiny upward air lift."""
    x = mix((0, glass(1850, 0.4, 0.12) * 0.6), (0.01, noise_burst(0.15, 800, 4000, 0.03, 0.04, r) * 0.25))
    return stereo(reverb(x, 0.25, 0.15), 0.2)


@cue("jar-place", -5)
def jar_place(r):
    """Set a jar down on a wooden shelf: muted wooden tap plus glass ring."""
    x = mix((0, wood_knock(300, 0.25, r, 0.025)), (0.002, glass(1600, 0.4, 0.1) * 0.35))
    return stereo(reverb(x, 0.25, 0.15), 0.2)


@cue("jar-swap", -5)
def jar_swap(r):
    """Two jars trade places: two light glass clinks a fifth apart."""
    x = mix((0, glass(1750, 0.4, 0.1) * 0.6), (0.11, glass(2330, 0.45, 0.12) * 0.5),
            (0.0, noise_burst(0.2, 600, 3000, 0.04, 0.05, r) * 0.15))
    return stereo(reverb(x, 0.25, 0.15), 0.25)


@cue("listen-extract", -5)
def listen_extract(r):
    """A feeling is drawn out of a guest: soft rising sparkle."""
    sp = mix(*[(i * 0.06, chime_tone(f, 0.8, 0.25) * (0.5 + 0.06 * i))
               for i, f in enumerate([G5, A5, B5, D6, 1318.5, 1568.0])])
    air = noise_burst(0.8, 2000, 8000, 0.25, 0.25, r) * 0.08
    return stereo(reverb(mix(sp, air), 0.5, 0.35), 0.45)


def bubbles(dur, n, r, lo=300, hi=1200):
    parts = []
    for _ in range(n):
        f0 = r.uniform(lo, hi)
        d = r.uniform(0.02, 0.06)
        t = t_axis(d)
        f = f0 * (1 + 2.5 * t / d)
        b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (d / 3))
        parts.append((r.uniform(0, dur - d), b * r.uniform(0.3, 1)))
    return mix(*parts, length=int(dur * SR))


@cue("pour", -5)
def pour(r):
    """Liquid poured into a pot: bubble stream over a soft trickle."""
    d = 1.1
    tr = bp(r.standard_normal(int(d * SR)), 500, 3500) * 0.12
    e = np.minimum(1, t_axis(d) / 0.08) * np.minimum(1, (d - t_axis(d)) / 0.25)
    x = (bubbles(d, 45, r) * 0.5 + tr) * e
    return stereo(reverb(x, 0.3, 0.2), 0.3)


def fire_whoosh(dur, r, lo=80, hi=900, rise=0.15):
    n = int(dur * SR)
    t = t_axis(dur)
    x = lp(brown(n, r) * 0.6 + pink(n, r) * 0.4, hi) 
    x = hp(x, lo)
    e = np.minimum(1, t / rise) * np.exp(-np.maximum(t - rise, 0) / (dur * 0.35))
    return x * e


def crackles(dur, rate, r, lo=1500, hi=7000):
    n = int(dur * SR)
    out = np.zeros(n)
    k = int(rate * dur)
    for _ in range(k):
        p = r.integers(0, max(1, n - 800))
        L = r.integers(80, 600)
        out[p:p + L] += r.standard_normal(L) * np.exp(-np.arange(L) / (L / 4)) * r.uniform(0.2, 1)
    return bp(out, lo, hi)


@cue("stove-ignite", -4)
def stove_ignite(r):
    """Stove catches: match-like strike, then a warm rising flame."""
    strike = noise_burst(0.12, 1500, 7000, 0.002, 0.03, r) * 0.6
    flame = fire_whoosh(1.4, r, 60, 1200, 0.35)
    cr = crackles(1.4, 18, r) * 0.25
    return stereo(reverb(mix(strike, (0.05, flame + cr)), 0.4, 0.2), 0.4)


@cue("stove-whoosh", -4)
def stove_whoosh(r):
    """Fire breathes up in the stove: low warm whoosh."""
    return stereo(reverb(fire_whoosh(1.0, r, 50, 700, 0.3), 0.4, 0.2), 0.4)


@cue("burn", -4)
def burn(r):
    """Something is fed to the fire: soft flare with crackles, not harsh."""
    x = fire_whoosh(1.3, r, 60, 900, 0.08) + crackles(1.3, 30, r) * 0.35
    return stereo(reverb(x, 0.4, 0.2), 0.4)


@cue("dish-discard", -4)
def dish_discard(r):
    """A dish is given to the stove: plate slide on wood, then a gentle flare."""
    slide = bp(r.standard_normal(int(0.35 * SR)), 900, 4000) * env_ad(int(0.35 * SR), 0.1, 0.12) * 0.25
    flare = fire_whoosh(1.1, r, 60, 800, 0.12) + crackles(1.1, 20, r) * 0.3
    return stereo(reverb(mix(slide, (0.3, flare)), 0.4, 0.2), 0.4)


@cue("brew-ready-bell", -4)
def brew_ready_bell(r):
    """Dish ready: small kitchen bell, two bright dings D6 then B5."""
    x = mix((0, bell(D6, 1.6, 1.0, 0.9)), (0.18, bell(B5, 1.8, 1.0, 1.0) * 0.8))
    return stereo(reverb(x, 0.4, 0.25), 0.3)


@cue("serve-plate", -4)
def serve_plate(r):
    """Clay plate set on the counter: wooden thunk plus ceramic ring."""
    t = t_axis(0.6)
    cer = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d)
              for f, a, d in [(1210, 1, 0.09), (2730, 0.5, 0.05), (4100, 0.2, 0.03)])
    x = mix(wood_knock(180, 0.4, r, 0.05), (0.003, cer * 0.35))
    return stereo(reverb(x, 0.3, 0.18), 0.25)


@cue("heat-gain", -5)
def heat_gain(r):
    """Heat added: warm upward breath and a few cosy crackles."""
    n = int(0.9 * SR)
    t = t_axis(0.9)
    sw = sine_sweep(180, 360, 0.9) * np.sin(np.pi * t / 0.9) ** 2 * 0.25
    x = fire_whoosh(0.9, r, 80, 1500, 0.4) * 0.8 + crackles(0.9, 15, r) * 0.25 + sw
    return stereo(reverb(x, 0.4, 0.2), 0.35)


@cue("water-charge", -5)
def water_charge(r):
    """Water charged with a feeling: bubbling rise ending in a glassy sparkle."""
    b = bubbles(0.9, 35, r, 400, 1600) * 0.5
    sp = sparkle(1.0, 8, 2500, 6000, r) * 0.3
    return stereo(reverb(mix(b, (0.45, sp)), 0.4, 0.3), 0.4)


# ------------------------------------------------------------------ progress
def coin(f, r):
    t = t_axis(0.5)
    return sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / d)
               for k, a, d in [(1, 1, 0.12), (2.71, 0.6, 0.08), (5.2, 0.3, 0.05)])


@cue("coins-sparks", -4)
def coins_sparks(r):
    """Sparks (iskorki) earned: little coin tinkles plus warm sparkle."""
    parts = [(i * 0.05 + r.uniform(0, 0.02), coin(r.uniform(2200, 3400), r) * r.uniform(0.4, 0.9))
             for i in range(6)]
    parts.append((0.05, sparkle(0.9, 10, 3000, 7500, r) * 0.25))
    return stereo(reverb(mix(*parts), 0.4, 0.25), 0.5)


@cue("key-gain", -4)
def key_gain(r):
    """Key received: a soft key jingle and a warm two-note chime G5-D6."""
    jingle = mix(*[(r.uniform(0, 0.15), coin(r.uniform(3000, 4500), r) * 0.35) for _ in range(5)])
    ch = mix((0.12, chime_tone(G5, 1.5, 0.8)), (0.3, chime_tone(D6, 1.8, 0.9) * 0.8))
    return stereo(reverb(mix(jingle, ch), 0.5, 0.3), 0.4)


@cue("thread-snap", -6)
def thread_snap(r):
    """A thread is lost: soft muffled string pluck that sags downward, gentle not punishing."""
    s = pluck(B3, 1.4, 0.994, 0.25, 11)
    t = t_axis(1.4)
    s = lp(s, 1800) * np.exp(-t / 0.5)
    sag = sine_sweep(D4, B3 * 0.94, 0.9) * env_ad(int(0.9 * SR), 0.01, 0.3) * 0.15
    return stereo(reverb(mix(s * 0.8, sag), 0.5, 0.25), 0.3)


@cue("achievement", -3.5)
def achievement(r):
    """Achievement: music-box arpeggio G5-B5-D6-G6 with glittering tail."""
    arp = mix(*[(i * 0.1, chime_tone(f, 1.8, 0.8)) for i, f in enumerate([G5, B5, D6, 1567.98])])
    sp = sparkle(1.6, 16, 3000, 9000, r) * 0.25
    pad = mix((0, bell(G4, 2.5, 0.6, 1.6) * 0.5))
    return stereo(reverb(mix(arp, (0.3, sp), pad), 0.6, 0.3), 0.45)


@cue("experiment-success", -4)
def experiment_success(r):
    """Kitchen experiment worked: happy bubble pop then rising chimes D5-G5-B5."""
    b = bubbles(0.5, 18, r, 500, 1500) * 0.5
    ch = mix(*[(0.35 + i * 0.09, chime_tone(f, 1.4, 0.6)) for i, f in enumerate([D5, G5, B5])])
    return stereo(reverb(mix(b, ch), 0.5, 0.28), 0.4)


@cue("experiment-fail", -6)
def experiment_fail(r):
    """Experiment fizzles: soft hiss that settles down, with a mild two-note drop."""
    n = int(1.2 * SR)
    t = t_axis(1.2)
    hiss = r.standard_normal(n)
    # sweep a lowpass downward by blending band-limited copies
    hiss = lp(hiss, 3000) * np.exp(-t / 0.35) * 0.25 + lp(hiss, 900) * np.exp(-t / 0.6) * 0.2
    pops = bubbles(0.6, 8, r, 200, 600) * 0.3
    tones = mix((0.15, chime_tone(B4, 0.8, 0.3) * 0.25), (0.35, chime_tone(G4, 1.0, 0.35) * 0.25))
    return stereo(reverb(mix(hiss, pops, tones), 0.4, 0.2), 0.35)


# ------------------------------------------------------------------ guests & world
def creak(dur, f0, f1, r):
    t = t_axis(dur)
    f = f0 + (f1 - f0) * (t / dur) + 6 * np.sin(2 * np.pi * 7 * t)
    pulses = np.zeros(len(t))
    ph = np.cumsum(f) / SR
    idx = np.where(np.diff(np.floor(ph)) > 0)[0]
    pulses[idx] = 1
    res = bp(pulses, 500, 2200) + 0.5 * bp(pulses, 180, 400)
    return res * np.sin(np.pi * t / dur) ** 1.5


@cue("guest-arrive-door", -4)
def guest_arrive_door(r):
    """Guest arrives: short friendly door creak and a little door bell."""
    cr = creak(0.6, 30, 55, r) * 0.6
    bells = mix(*[(0.3 + i * 0.07, bell(f, 1.2, 1.0, 0.6) * 0.35) for i, f in enumerate([B5, G5, D6, B5])])
    return stereo(reverb(mix(cr, bells), 0.5, 0.25), 0.35)


@cue("guest-leave", -5)
def guest_leave(r):
    """Guest leaves: soft door close and a lower, slower little bell."""
    thud = wood_knock(140, 0.4, r, 0.06) * 0.7
    bells = mix(*[(0.1 + i * 0.12, bell(f, 1.3, 0.9, 0.7) * 0.3) for i, f in enumerate([D5, B4])])
    return stereo(reverb(mix(creak(0.35, 45, 30, r) * 0.35, (0.3, thud), bells), 0.5, 0.25), 0.35)


@cue("broom-clean", -6)
def broom_clean(r):
    """Broom sweeps the table area: three soft bristle swishes."""
    def swish(d):
        n = int(d * SR)
        t = t_axis(d)
        x = bp(r.standard_normal(n), 1200, 7000) * np.sin(np.pi * t / d) ** 2
        return x * (1 + 0.5 * np.sin(2 * np.pi * 40 * t))
    x = mix((0, swish(0.28)), (0.33, swish(0.25) * 0.9), (0.62, swish(0.3) * 0.8))
    return stereo(reverb(x * 0.6, 0.3, 0.15), 0.4)


@cue("page-turn", -6)
def page_turn(r):
    """Book page turns: paper flutter and a soft settle."""
    d = 0.45
    n = int(d * SR)
    t = t_axis(d)
    fl = bp(r.standard_normal(n), 1500, 7000) * (np.sin(np.pi * t / d) ** 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t))
    settle = noise_burst(0.1, 300, 2000, 0.003, 0.02, r) * 0.5
    return stereo(reverb(mix(fl * 0.6, (0.38, settle)), 0.3, 0.12), 0.35)


@cue("card-flip", -6)
def card_flip(r):
    """Card flips over: quick air swish and a crisp soft snap."""
    sw = noise_burst(0.18, 1000, 6000, 0.08, 0.04, r) * 0.5
    snap = noise_burst(0.06, 2000, 8000, 0.0005, 0.006, r)
    return stereo(reverb(mix(sw, (0.1, snap * 0.8)), 0.3, 0.12), 0.35)


@cue("tarot-reveal", -4)
def tarot_reveal(r):
    """Grandmother's card reveal: card flip then a low bell and gentle shimmer."""
    flip = card_flip(r)[:, 0]
    sh = sparkle(1.8, 18, 2500, 8000, r) * 0.25
    low = bell(D4, 3.0, 0.5, 2.0) * 0.6
    return stereo(reverb(mix(flip * 0.6, (0.12, low), (0.15, sh)), 0.7, 0.35), 0.45)


@cue("tram-bell", -4)
def tram_bell(r):
    """Tram 33 bell: two classic ding-ding strikes on a bright gong bell."""
    def ding():
        t = t_axis(1.4)
        return sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d)
                   for f, a, d in [(1180, 1, 0.5), (2950, 0.5, 0.25), (4720, 0.25, 0.12), (590, 0.2, 0.6)])
    x = mix((0, ding()), (0.22, ding() * 0.85))
    return stereo(reverb(x, 0.5, 0.25), 0.3)


@cue("mirror-shimmer", -5)
def mirror_shimmer(r):
    """Mirror memorial world shimmer: slow glassy sweep of soft tones."""
    tones = mix(*[(i * 0.07, glass(f, 1.2, 0.5) * 0.4) for i, f in enumerate(np.geomspace(1400, 4200, 12))])
    air = noise_burst(1.6, 3000, 9000, 0.4, 0.5, r) * 0.08
    return stereo(reverb(mix(tones, air), 0.8, 0.4), 0.6)


@cue("nameless-arrive", -8)
def nameless_arrive(r):
    """Nameless Guest: a swell of air that hollows into near-silence; no tone, no threat."""
    d = 3.5
    n = int(d * SR)
    t = t_axis(d)
    air = lp(pink(n, r), 1400) * 0.6 + lp(brown(n, r), 300) * 0.4
    e = np.sin(np.pi * np.clip(t / 1.4, 0, 1) / 2) ** 2 * np.exp(-np.maximum(t - 1.4, 0) / 0.6)
    hush = np.sin(2 * np.pi * 1760 * t) * 0.01 * e
    return stereo(reverb((air + hush) * e, 1.0, 0.4), 0.7)


# ------------------------------------------------------------------ interface
@cue("ui-click", -9)
def ui_click(r):
    """Interface click: tiny wooden tap."""
    return stereo(wood_knock(1100, 0.08, r, 0.008), 0.0)


@cue("ui-hover", -15)
def ui_hover(r):
    """Interface hover: barely-there soft glass pip."""
    return stereo(glass(2600, 0.12, 0.03) * 0.6 + noise_burst(0.12, 3000, 8000, 0.01, 0.01, r) * 0.1, 0.0)


@cue("ui-confirm", -8)
def ui_confirm(r):
    """Interface confirm: two soft gusli plucks rising G5 to D6."""
    x = mix((0, pluck(G5, 0.5, 0.99, 0.25, 1) * 0.6), (0.07, pluck(D6, 0.6, 0.99, 0.25, 2) * 0.6))
    x = lp(x, 6000)
    return stereo(reverb(x, 0.25, 0.15), 0.2)


@cue("ui-error", -9)
def ui_error(r):
    """Interface not-allowed: gentle muted wooden double tap with a falling third."""
    x = mix((0, wood_knock(520, 0.15, r, 0.02)), (0.1, wood_knock(415, 0.18, r, 0.025)))
    return stereo(lp(x, 2500), 0.0)


@cue("undo", -8)
def undo(r):
    """Undo: short reverse-style air swoop down ending in a soft tap."""
    d = 0.3
    n = int(d * SR)
    t = t_axis(d)
    sw = sine_sweep(1400, 700, d) * (t / d) ** 2 * 0.3
    air = bp(r.standard_normal(n), 1500, 6000) * (t / d) ** 2 * 0.2
    return stereo(reverb(mix(sw + air, (d - 0.01, wood_knock(800, 0.1, r, 0.01) * 0.6)), 0.25, 0.12), 0.2)


@cue("clock-wind", -4)
def clock_wind(r):
    """Clock winding: ratchet clicks pulling the weight chain, then a settling spring."""
    parts = []
    tpos = 0.0
    for i in range(14):
        gap = 0.085 - 0.002 * i
        parts.append((tpos, wood_knock(1500 + r.uniform(-80, 80), 0.06, r, 0.006) * 0.6
                      + noise_burst(0.06, 3000, 9000, 0.0005, 0.003, r) * 0.4))
        tpos += gap
    spring = pluck(G3 * 2, 1.0, 0.993, 0.7, 5) * 0.25
    parts.append((tpos + 0.05, spring))
    parts.append((tpos + 0.05, bell(G4, 1.5, 0.6, 0.6) * 0.2))
    return stereo(reverb(mix(*parts), 0.35, 0.15), 0.25)


def render_all(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    meta = {}
    for name, (fn, peak_db, note) in SFX.items():
        r = np.random.default_rng(sum(map(ord, name)) * 7919)
        x = fn(r)
        x = x if x.ndim == 2 else stereo(x)
        x = np.stack([lp(x[:, 0], 10000, 1), lp(x[:, 1], 10000, 1)], axis=1)  # gentle warmth
        # trim trailing near-silence, keep 20 ms of room, fade the edges
        thr = 10 ** (-70 / 20) * np.max(np.abs(x))
        last = np.max(np.where(np.max(np.abs(x), axis=1) > thr)[0])
        x = x[: min(len(x), last + int(0.02 * SR))]
        x = fade(x, 0.001, 0.02)
        x = norm_peak(x, peak_db - 0.6)  # headroom for lossy-codec overshoot
        sf.write(out / f"{name}.wav", x.astype(np.float32), SR, subtype="FLOAT")
        meta[name] = {"design": note, "target_peak_dbfs": peak_db,
                      "seed": int(sum(map(ord, name)) * 7919)}
    (out / "sfx_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return meta


if __name__ == "__main__":
    m = render_all(sys.argv[1])
    print(len(m), "sfx rendered")
