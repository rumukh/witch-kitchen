# v1 acceptance evidence

Date: 2026-10-08. Branch `rumukh-krestets-v1-game-build`. Engine AEGIS `0abd61b5`.
All commands below were run on this branch; outputs are in this folder and `docs/screens/`.

## Balance and reachability (headless, `npx tsx sim/run.ts`, 15 workers)

Full table: `simulation-report.md` / `.json`.

| Check | Threshold | Result |
|---|---|---|
| Q14 average player, Act I standard nights (30,000 nights) | ≥ 3 of 4 satisfied by tick 13 in ≥ 80% | **89.9%** (mean 3.47 satisfied; last serve p50/p90/max 10/12/14) |
| Q14 good plan (best of 40 on the same stream, 6,000 nights) | all 4 in ≥ 30% | **58.9%** (≥3 by tick 13: 92.0%) |
| Q26 shelf by night 6 | deadline | 100% on every tram route |
| Q26 mittens or chair by night 8 | deadline | 88.7–93.0% |
| Q26 Jar of Silence by night 10 | deadline | 99.8–100% (stories or sparks) |
| Q26 income per night (nights 2–11) | 15–25 | 19.8–22.4 mean |
| Q37 endings, Standard and Granny, 10,000 seeds each | all four reachable | **100%** for wound, remember, new_spring, letter |
| Wolf Hour (reported only, Q66) | — | wound/remember/letter 100%, new_spring 71.2% |
| Criterion 6: best ending without the double burner | — | 100% (2,000 seeds; bot never buys it) |
| Criterion 1: 0 sparks and 0 keys every night | campaign finishes | letter 100%, remember 100% |
| K28 determinism | identical aggregates across parallelism | identical digests (15 workers × 97-seed chunks vs 1 worker) |
| Throughput | ≥ 10,000 seeds per policy per run | ≈ 1,600 campaigns/s wall (15 workers) |

Load log nights 2–11 (Q50) is in `simulation-report.md`.

## Rules and engine integration (`npm test`, 22 tests)

- Pure model vs AEGIS host parity on 3 bot-played nights: identical states; 3.6 ms per commit,
  ~5 KB state (engine issue #17 measured; runtime jobs/claims unused, so #8 does not apply).
- Winding (Q55 A), quarter-tick patience (nameless ×1.5, predawn ×2), Q10 past-dawn rejection,
  from-oven 0-tick serving, Q20 purity floors, experiments (learn / sediment + hint), Q15
  shelf necessity for Pryazhenets, hope/amber/burning transitions, tremor merge before night 10
  beating amber, sediment evaporation, half stories never open doors, vow key and thread loss,
  ending priority and immediate Wound.
- K18: three moves, undo two → exact layout; a cuckoo hint clears undo.
- K19/K27: replaying a night restores identical guests; the night log replays to the same hash.

## Browser (Playwright on `dist/web`, `npm run e2e`, 5 tests)

- New game → nights 1 and 2 finished through the UI only; mid-night reload resumes at the same
  tick with background and portraits restored.
- Import of an exported slot file into an explicit target slot (title screen file picker).
- Night-12 fixture → **New Spring** reached through the UI (pie cooked, served to the nameless
  guest after midnight, Guardian already born) → «Попробовать другую концовку» restores the
  pre-finale checkpoint → **Wound** by winding the clock.
- UI-09/K21/K22: at 100/125/150% text and 1280×720 every action-bar button, «К Купе»,
  cuckoo, pause and winding are fully inside the viewport and their panels; keyboard-only
  Tab + Enter cleans a seat and `W` waits; no horizontal clipping.
- DIAG-01: the browser-exported report `sample-night-report.json` replays headlessly with
  `npx tsx scripts/replay-report.ts` → `match: true`.
- Audio: delivered SFX/ambience/murmur/whisper cues load with no console errors.

## Desktop (`node scripts/smoke-electron.mjs` on `dist/win/Krestets-win32-x64`)

Launch → new game → actions → quit → relaunch → continue: same tick and Heat; save files
`slot-1.json` + `.prev`, `profile.json` + `.prev` in an isolated `%APPDATA%`-style folder;
0 requests outside the packaged origin (every other request is blocked by the app).
Window minimum 1280×720, F11 fullscreen, single-instance lock.

## Known gaps and TODO stubs

- Music cues (night calm/middle/predawn, Межсветье, title, endings) are still rendering in the
  audio session; every missing cue is silent and the game is fully playable. Whispers are
  synthetic TTS pending PM approval (Q40).
- Sets (сервизы) are a `TODO` stub per Д20.
- Not exercised here: clean Windows 10 22H2/11 VMs with networking disabled at the OS level,
  process kill during file writes and injected sharing violations (K24/K25). The design uses
  temp + fsync + rename, a `.prev` copy, CAS and bounded EPERM/EBUSY retries.
- Screen readers, touch and mobile are not promised (Q02, Q43). Playtest timing (Q48) and
  editorial review of texts remain for the slice playtest.
- Engine note sent to the coordinator: AEGIS audio requires HTTP(S) asset origins; the
  desktop build serves an intercepted `https://krestets.local/` origin.
