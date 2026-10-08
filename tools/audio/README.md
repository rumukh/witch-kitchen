# Krestets audio tools

Reproducible generators for `assets/audio/**` and `assets/audio/manifest.json`.

| Script | Output |
|---|---|
| `make_sfx.py <build>/sfx` | 39 procedural SFX (seeded numpy/scipy synthesis) |
| `make_ambience.py <build>/amb` | 7 seamless ambience loops, incl. the sample-accurate clock |
| `make_murmur.py <build>/murmur` | 11 murmur sets x 12 formant-synth syllables |
| `make_voice.py <speech_dir> <whispers.json> <build>` | grandmother whispers from a speech-production run (Azure TTS), pause-capped and re-verified |
| `make_music.py <build>/music <jobs>` | loops/endings cut from ACE-Step 1.5 renders, crossfade-baked loop seams |
| `ace_local.py <jobs.json>` | in-process ACE-Step runner with the ace-step-music skill settings (XL-SFT, INT8, CPU+DiT offload, 50 ODE steps); text2music with the 1.7B planner (PyTorch backend) and "cover" re-renders |
| `music_jobs.py <spec> <jobs>` | builds make_music job entries with full render provenance |
| `score_tonal.py <ref> <cands...>` | tuning offset, transposition and key-profile check used to keep the three night tiers crossfade-compatible |

Night tiers: the calm text2music render was cut to a seamless 16-bar loop, laid out as a 36-bar guide (2 + 16 + 16 + 2 bars), time-stretched to 76/96/116 BPM and re-rendered with `cover` (strength 0.7). Each tier is tuning-aligned to within 2 cents by resampling and cut to a 32-bar loop.
| `build_assets.py <build> <repo>` | loudness normalisation, OGG Vorbis + AAC m4a encoding, decoded verification, manifest |

`build_assets.py` measures every shipped OGG with ffmpeg `ebur128` (integrated LUFS, true and sample peak), checks decoded sample counts for both codecs and runs the loop-seam test on every looping cue.

Requirements: Python 3.10 with numpy, scipy, soundfile; ffmpeg with libvorbis and aac on PATH.
