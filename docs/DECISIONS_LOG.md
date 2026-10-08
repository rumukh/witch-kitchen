# Decisions log (build team, v1)

Gaps not closed by `PM_ANSWERS_RU.md` or `ASSUMPTIONS_V1_RU.md` (incl. adopted Q51–Q75
proposals). Each entry: the simplest rule consistent with the design spirit. The rules
contract `docs/GAME_RULES_V1.md` already reflects every entry.

| ID | Topic | Decision | Why |
|---|---|---|---|
| DL-01 | Engine pin | AEGIS `main` cc9593b3 (re-pinned 2026-10-08 after PRs #18/#19; first pin 0abd61b5), SDK packed and vendored in `vendor/aegis-sdk/`. Save format, content and state schema unchanged; saves from the first pin restore unchanged (`scripts/check-old-saves.ts`). | newest green commit |
| DL-02 | Model architecture | Rules are a pure deterministic TypeScript model (`src/model`). The AEGIS runtime hosts it: `resolve` → legality/cost, command `start` → action effects, `turn` → one tick, `finish` → completion and dawn. Runtime jobs, phases and claims are not used (engine issue #8: consumed jobs/claims grow without bound). Bots run the same model functions directly for throughput; a parity test proves identical states. | keeps saves compact, makes 10k-seed sweeps feasible |
| DL-03 | Randomness | No in-night randomness. Each night's guests are pre-rolled from `hash(seed, night, line)` (counter-based sfc32), so replays are identical (TURN-07). Order draws are pre-rolled per guest. | replayable nights, no stream state |
| DL-04 | Mode in campaign | Mode and seed are fixed per slot; the runtime adapter is created per campaign with them. | initialize has no seed input |
| DL-05 | Empty gold | A counter, not a shelf jar. | it is a payment, never stored with feelings |
| DL-06 | Where a listened jar goes | To the chosen free cell, else the first free cell scanning from the right-most column (away from the stove), else the tray. Listening is impossible while the tray is occupied (Q17). | protects young Joy by default |
| DL-07 | Recipes take jars only from the shelf | Tray jars cannot be cooked or condensed. With a 2×3 shelf, Pryazhenets (7 feelings + sediment) is then impossible even with the Jar of Silence and the tray, which makes the shelf upgrade mandatory exactly as Q15 states. | enforces Q15 honestly |
| DL-08 | Sediment preference | New sediment goes to the Jar of Silence first (if owned), then stacks, free cell, tray, burn. Burning from the Jar and using it for recipes is allowed. | the Jar is the "eternal store"; nothing lost silently |
| DL-09 | Patience on the arrival tick | A guest arriving at tick t starts losing patience at t+1. | otherwise an arrival loses a tick it never had |
| DL-10 | Dawn and dishes | At dawn every dish on a burner becomes cold (heat-age set beyond the hot window incl. bonuses). | Q10 "стоит остывшим" |
| DL-11 | Seats at dawn | Seats are cleaned in the Межсветье (Q56); the door queue empties at dawn. | — |
| DL-12 | Dubodyor's order | In night 7 (vow 4) he orders anger, so Thunder Perepechi satisfies him. | vow consistency |
| DL-13 | Story guests and stories | Vow givers, Commis and tutorial guests carry no world story; listening to them gives jars only. | their stories are the vow lines |
| DL-14 | Story assignment | A guest carries the first incomplete story of its world not carried by another present guest; when all are complete, a repeat picked by its pre-rolled draw. | "в заданном порядке" |
| DL-15 | Fragments | Each warm or hasty listen reveals the next fragment (max 3). A full story reveals all fragments and the ending. Fragments heard stay in the book even on a half story. | collection is eternal (Q28) |
| DL-16 | Experiments | Exact multiset match with any non-story recipe whose ingredients are only jars (Joy also accepts burning Joy). Sediment cannot be used in experiments. A failure gives the closest unknown recipe's next ingredient as a permanent hint. | Q25/Q63 |
| DL-17 | Experiment heat | 1 Heat at the start; the burner is occupied during its 2 ticks. | Q25 |
| DL-18 | Mirror window | Opens on the Midnight tick and stays open until the next tick-spending action. Commis's murk is sold in that window of night 8 and in the Межсветье after night 8. | "аварийное окошко на тике 8" |
| DL-19 | Tarot vs tram | Opening a tarot card locks the tram line for that Межсветье (the reveal is computed for the chosen line). | reveals stay truthful |
| DL-20 | Guardian check | At any dawn from night 10, a Pryazhenets on a burner with the arc open births the Guardian and frees the burner. | Q34, Q35 |
| DL-21 | Ending at dawn 12 | pieServed ∧ guardian → New Spring; pieServed → Remember; else Letter. Wound only via `windFinal`. | Q31, Q67 |
| DL-22 | End night | Allowed when no guest is seated or waiting and no wave remains; the nameless guest may still be present (he leaves at dawn and pays). | Q11 |
| DL-23 | Burning in the Межсветье | Allowed (0 ticks) but gives no Heat; Heat is reset at night start anyway. | nothing hidden |
| DL-24 | Scene gating | While a scene is pending only `ackScene`, replay and pre-finale restore are accepted; while a vow offer is pending, tick-spending actions are rejected. | dialogue never costs ticks |
| DL-25 | Undo scope | Shelf/tray moves and swaps only; any other action except scene acknowledgement clears the stack; depth 30; saved with the slot. | Q46, Q68, TURN-06 |
| DL-26 | Checkpoints in state | The night-start and pre-finale states are stored inside the slot state (stripped of nested copies). Replay and restore are committed actions, so runtime revisions stay monotonic and export includes both checkpoints. Measured cost: ~3.6 ms per commit with a ~5 KB state (engine issue #17). | SAVE-06, TURN-07 |
| DL-27 | Night report | The night log stores `[tick, action JSON]` for the current night; the report adds the night-start state (IDs and numbers only, no texts) and an outcome hash. | DIAG-01 |
| DL-28 | Ramen scene | Acknowledging the night-1 ramen scene seats grandma's dish: the tick-0 guest leaves satisfied (no pay, story or sediment), leaving a dirty seat. | Q38, Q62 |
| DL-29 | Kupa's quest scope | Kupa can be served courage tea only in night 9; tea is learned on night 9 (Д04). | Д07 |
| DL-30 | Vow 4 certain failure | At the start of night 7 without a Hope jar and without a Perepechi dish the vow is failed immediately. | "невыполнимость сообщается сразу" |
| DL-31 | Vow 9 window | Serving Tikhaya the Boltushka in night 10 or 11 succeeds. | window 10→11 |
| DL-32 | Ordinary-guest guarantees | Q66 guarantees count only ordinary (non-story) guests; generated by rejection sampling over 400 deterministic attempts. Verified on 10,000 seeds per route. | conservative |
| DL-33 | Sweep evidence | `sim/run.ts`: Standard and Granny all four endings 100% of 10,000 seeds; Wolf Hour New Spring 71% (reported only). | Q37, Q66 |
| DL-34 | Input during saves | The UI waits for the strict checkpoint barrier (`busy`/`checkpoint-pending`) and re-dispatches the same input, instead of dropping it. Gameplay never advances past an unacknowledged save; a failed save blocks play with a retry dialog. | SAVE-05, Q45 |
| DL-35 | Onboarding scope | Seen cards are stored per slot in the global profile; a global setting disables all cards; Help reopens any card. Cards never spend ticks or hints. | Q68, UI-08 |
| DL-36 | Streamer filter | In streamer mode «Крестец» as the spirit's name is replaced by «хозяин перекрёстка» in dialogue and story texts; spoiler scenes use authored safe alternatives through AEGIS `projectPresentation`; ending names and spoiler achievements are hidden. The game title keeps the tavern name. | Q42, Д17 |
| DL-37 | Desktop wrapper | Electron 44 portable x64 (Q69). The packaged files are served from a privileged, secure, standard `app://krestets/` origin (no `file://`); AEGIS audio accepts it through `createNarration({ schemes: ['app:'] })` (engine PR #19). Every other request is blocked, so the build is offline by construction. Saves are files and independent of the origin: a save written by the earlier `https://krestets.local` build resumes in the `app://` build. Saves: `%APPDATA%\Krestets\saves`, temp file + fsync + rename, `.prev` copy, compare-and-swap, bounded retry on EPERM/EBUSY. A second instance is refused by a single-instance lock (no concurrent writer). Minimum window 1280×720, F11 fullscreen. | DESKTOP-02, SAVE-07 |
| DL-38 | Web build | Static folder with relative paths, no service worker, no remote requests; a one-time notice explains browser-storage eviction and recommends export or the Windows build. | WEBHOST-01, Q70 |
| DL-39 | Audio buses | Five buses mapped onto three AEGIS audio controllers: main (voice whispers, music, voice murmur), room (ambience/ticking loop, effects), UI. The nameless-guest state mutes music and ticking and ducks effects to 35%; voice and UI keep. Missing cues are silent; captions always shown for whispers and (setting) for signals. | AUDIO-06 |
| DL-40 | Campaign seeds | A new slot gets a random seed; `?seed=<id>` fixes it for tests. Seeds are stored in the slot. | determinism |
| DL-41 | Mutnoe display | Shown as «??» in Act I, as a number from Act II. | S13 phase 1 |
| DL-42 | Listening dialogue | Each listen offers one warm and one hasty reply (catalog `listen.json`); warm → pure, hasty → murky; order alternates per guest. | Q18 |
| DL-43 | Sets (сервизы) | TODO stub (Д20): the +1 from-oven bonus slot exists in the freshness formula, items are never granted. | Д20, S0.4 |
| DL-44 | CI and hosting | GitHub Actions: `ci.yml` (typecheck, lint, tests, quick sweeps, web build, Playwright chromium; Windows build artifact on master) and `pages.yml` (web build deployed to GitHub Pages at `/witch-kitchen/`). Relative paths, no service worker, storage namespace `io.github.rumukh.krestets.saves` on the shared `rumukh.github.io` origin. | WEBHOST-01 |
| DL-45 | Profile registry | The engine's new `createProfileRegistry` is not adopted in v1: the existing slot/profile records already meet SAVE-06 and adopting it would change the stored layout without a player-visible gain. `rebindSave` (#15) is equivalent to the current explicit target-slot import. | keep saves unchanged |
