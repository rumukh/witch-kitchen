"""Turn a soft TTS read into a gentle elderly whisper.

LPC analysis per 25 ms frame; the vocal-tract envelope is re-excited with white
noise (true whisper excitation) and blended with a little of the voiced original
so the line keeps warmth and stays intelligible. Output 48 kHz mono float.
"""
import numpy as np
from scipy import signal
from scipy.linalg import solve_toeplitz

SR_OUT = 48000


def lpc(frame, order):
    r = np.correlate(frame, frame, "full")[len(frame) - 1:len(frame) + order]
    if r[0] <= 1e-9:
        return np.zeros(order), 0.0
    r[0] *= 1.0001
    a = solve_toeplitz(r[:order], -r[1:order + 1])
    err = r[0] + np.dot(a, r[1:order + 1])
    return a, max(err, 1e-12)


def whisperize(x, sr, voiced_mix=0.22, order=None, seed=0, breath_tilt=True):
    rng = np.random.default_rng(seed)
    x = x.astype(float)
    order = order or int(sr / 1000) + 4
    win = int(0.025 * sr)
    hop = win // 4
    w = np.hanning(win)
    pre = signal.lfilter([1, -0.9], [1], x)
    out = np.zeros(len(x) + win)
    norm = np.zeros(len(x) + win)
    for s in range(0, len(x) - win, hop):
        fr = pre[s:s + win] * w
        a, err = lpc(fr, order)
        if err <= 1e-10:
            continue
        exc = rng.standard_normal(win) * np.sqrt(err / win)
        y = signal.lfilter([1], np.concatenate([[1], a]), exc)
        out[s:s + win] += y * w
        norm[s:s + win] += w ** 2
    out = out[: len(x)] / np.maximum(norm[: len(x)], 1e-3)
    out = signal.lfilter([1], [1, -0.9], out)  # de-emphasis
    out = signal.sosfilt(signal.butter(2, 180, "high", fs=sr, output="sos"), out)
    # match short-term energy contour of the original
    def env(v):
        return np.sqrt(signal.sosfiltfilt(signal.butter(2, 30, fs=sr, output="sos"), v ** 2).clip(1e-12))
    out *= env(x) / env(out)
    voiced = signal.sosfilt(signal.butter(2, 3500, fs=sr, output="sos"), x)
    y = (1 - voiced_mix) * out + voiced_mix * voiced
    if sr != SR_OUT:
        y = signal.resample_poly(y, SR_OUT, sr)
    return y


def room(y, seed=4):
    rng = np.random.default_rng(seed)
    n = int(0.35 * SR_OUT)
    t = np.arange(n) / SR_OUT
    ir = rng.standard_normal(n) * np.exp(-t / 0.07)
    ir = signal.sosfilt(signal.butter(2, 5000, fs=SR_OUT, output="sos"), ir)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = signal.fftconvolve(y, ir)
    dry = np.pad(y, (0, len(wet) - len(y)))
    return 0.86 * dry + 0.14 * wet
