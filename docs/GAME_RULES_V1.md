# Krestets v1 — authoritative rules contract

Status: v1 implementation contract, 2026-10-08. Sources, in precedence order:
`PM_ANSWERS_RU.md` (PM) > `ASSUMPTIONS_V1_RU.md` incl. adopted Q51–Q75 proposals
(A) > `docs/source/GAME_SPEC_ORIGINAL_RU.txt` (S). Gaps closed by the build team
are listed in `docs/DECISIONS_LOG.md` as `DL-xx` and referenced here.

All numbers below live in `content/*.json` (key given in `code`). The code
implements exactly this document; if they disagree, the document wins and the
code is a bug. Ticks are discrete player turns; there is no real time.

## 1. Glossary of model terms

| Term | Meaning | Content key |
|---|---|---|
| tick | one logical turn; `night.tick` counts elapsed ticks of the night | — |
| shift | clock offset from winding, +2 per winding (Q55 variant A) | `actions.windClock.gainTicks` |
| nominal tick | tick an event is authored at; it fires at `nominal + shift` | `nights.*` |
| jar | one feeling on the shelf/tray: `{kind, pure, age, uid}` | `feelings.json` |
| sediment stack | up to 3 sediment in one cell; ages listed per item | `sediment.stackMax` |
| dish | cooked recipe on a burner: `{recipe, readyTick, heatAge, purity, ...}` | `recipes.json` |
| seat | a chair in the hall: empty, guest or dirty | `economy.seats` |
| door | queue of 1 waiting guest | `guests.doorQueue` |
| Mutnoe | campaign-total counter of created sediment, never decreases | `sediment.mutGate` |

## 2. Feelings and states (S7.1, Q30, A Д05)

Base kinds: `joy`, `sadness`, `anger`, `fear`, `nostalgia` (Act I), `loneliness`
(Act II, guests from night 5), `tremor` (Act III, merge only). Derived kinds:
`hope` (aged sadness), `amber` (aged joy), `burning` (joy that stood by the
working stove at dawn; always murky; never becomes amber). `sediment` is waste/fuel.

Each jar is pure or murky. Purity value: pure 100, murky 50.

Order-feeling mapping of a dish (Д05): hope→sadness; amber, burning→joy;
tremor→tremor; sediment and empty gold give no feeling. A dish "has" a feeling
if any ingredient maps to it.

## 3. Campaign structure

12 nights in 3 acts: Act I nights 1–4, Act II 5–9, Act III 10–12.
Modes are chosen per slot at creation (Д18): `standard`, `granny`, `wolf`.

| Mode | Night length (ticks) | Patience mult | Winding | Q66 guarantees |
|---|---|---|---|---|
| standard | 15 | 1.0 | yes | yes |
| granny | 18 | 1.3 | yes | yes |
| wolf | 12 | 0.7 | forbidden | no |

Night 1 is the tutorial in every mode: 10 ticks, no chimes, no ticking, no cuckoo
(grandma guides for free), recipes: smoke tea only.

Start values (Q06, Д19): Heat 1, shelf: 1 pure sadness (age 0), sparks 0, keys 0,
stories 0, threads 3, seats 3, shelf 2×3, 1 burner, water charges 0, empty gold 0.

## 4. Night timeline

### 4.1 Events and their nominal ticks (Q06, Q09, Q12)

| Event | Nominal tick | Notes |
|---|---|---|
| seated guest | 0 | already seated when the night starts |
| wave | 2, 5, 8 | one guest each (limit 4 ordinary guests a night) |
| Wind (`wind`) | 5 | replaces the wave-5 guest by a foreign-world guest (pre-rolled) |
| Midnight (`midnight`) | 8 | Mirror window opens; nameless guest arrives on his nights |
| Predawn (`predawn`) | length − 3 | patience ×2; dish heat-age counts double |
| Dawn (`dawn`) | length | night ends |

Night 1: seated guest at 0, second guest at 3, dawn at 10, no other events.

Winding the clock (`windClock`, 0 ticks, 1 key, max 2/night, not in wolf, not in
night 1): `shift += 2`. All events (waves, chimes, dawn) not yet fired now fire 2
actual ticks later. Fired events never repeat (Q55 A).

### 4.2 Order of resolution on each tick (Q08)

An action with cost `c` advances `c` ticks one at a time. Before the first tick of
a paid action, every guest whose candle is out leaves (unsatisfied) — 0-tick
actions never trigger leaving, so a ready dish can still be served for free (Q56).
For each advanced tick `t` (after `tick := t`):

1. chimes due at `t` (wind, midnight, predawn; dawn last);
2. guest arrival due at `t` (seat, else door, else turned away — §6.3);
3. brew readiness: dishes with `readyTick == t` become ready;
4. heat-age of ready dishes: +1 (+2 from the predawn tick inclusive, Q75);
5. patience: every guest present before `t` loses `4 × mult` quarters (§6.4);
   a guest reaching ≤ 0 has a dead candle and leaves at the start of the next paid action;
6. if `t == dawn`: dawn resolution (§8).

An action may start only if `tick + c ≤ dawn` (Q10). Otherwise it is disabled, spends
nothing, and the UI offers winding if a key is available.

### 4.3 Actions (Q11, S7.6, A)

| Action | id | Ticks | Preconditions | Effect |
|---|---|---|---|---|
| Listen | `listen` | 1 | seated guest, palette ≥ 2 jars, tray empty, chosen kind in palette | remove 1 jar of the chosen kind (topic); warm tone → pure, hasty tone → murky; jar goes to chosen free cell, else first free cell, else tray; reveals next story fragment (max 3) |
| Listen to the bottom | `listenBottom` | 1 | palette = 1 jar (core), confirmed | take the core (murky); guest overdrawn: leaves now, pays empty gold 1 + sediment 1, no story |
| Cook | `cook` | 1 | known recipe, ingredients from shelf cells only, free burner, Heat ≥ recipe heat or a water charge | consume ingredients and heat (or 1 water charge); dish ready at `t0 + brew` |
| Experiment | `experiment` | 2 | 1–3 shelf jars, free burner, Heat ≥ 1 | consume jars and 1 heat; success (exact non-story recipe multiset): dish ready at the end, recipe learned; failure: sediment 1, a permanent hint |
| Serve | `serve` | 0 if dish heat-age ≤ fromOven window, else 1 | ready dish, target present | §6.6 |
| Clean seat | `clean` | 1 | seat dirty | seat empty; door guest sits immediately; forest door bonus +1 heat (≤ 2/night) |
| Visit Kupa | `kupa` | 1 | — | Heat +2 (cap 5) |
| Condense | `condense` | 1 | night ≥ 5, two feeling jars on shelf | both removed, 1 sediment created (Mutnoe +1) |
| Burn jar | `burn` | 0 | jar on shelf/tray or sediment in the Jar of Silence | anger: +1 heat (once/night, later anger gives 0); sediment: +2; other: 0. Heat above 5 is lost (warned) |
| Give dish to the stove | `discardDish` | 0 | dish on burner | dish removed, 1 sediment created (Mutnoe +1) (Q57) |
| Refuse guest | `refuse` | 0 | seated or door guest not served | guest leaves unsatisfied (§6.7) |
| Wait | `wait` | 1 | — | — |
| End night | `endNight` | 0 | no seated/door guest and no wave pending; confirmed | jump to dawn (§8) |
| Wind clock | `windClock` | 0 | key ≥ 1, winds this night < 2, not wolf/night 1, night not over | §4.1; warning if it is the last key on nights 11–12 |
| Cuckoo hint | `cuckoo` | 0 | night ≥ 2, hints used < 3 | §10 |
| Move/swap | `move` | 0 | from occupied | moves or swaps between shelf cells and tray; sediment merges into a stack if the target stack has room; undoable |
| Undo | `undo` | 0 | undo stack not empty | restores the shelf+tray layout before the last move |
| Accept/decline vow | `vow` | 0 | vow offered now | §9 |
| Buy | `buy` | 0 | Межсветье, or the Mirror window (midnight tick) | §7.3 |
| Buy murky | `buyMurky` | 0 | night 8 Mirror window or Межсветье after night 7 | 5 sparks → 1 sediment, Mutnoe not increased (Q73) |
| Serve Kupa | `serve` target `kupa` | as serve | night 9, courage tea ready | §9.3 |
| Final winding | `windFinal` | 0 | night 12, key ≥ 1, pie not served, confirmed | ending `wound` immediately |
| Replay night | `restartNight` | 0 | during the night or in the Межсветье after it | state := night-start checkpoint |
| Restore pre-finale | `restorePreFinale` | 0 | pre-finale checkpoint exists, night 12 or ended | state := pre-finale checkpoint |
| Acknowledge scene | `ackScene` | 0 | a scene is pending | removes it from the queue |

While a scene or vow offer is pending, tick actions are rejected (`scene.pending`).
Reading, scenes and dialogue never spend ticks (Q40).

## 5. Shelf, tray and storage (Q15–Q17, Q58)

- Shelf 2 rows × 3 columns, upgradable to 2 × 4 (a column added on the right).
  Cells are indexed column-major: cell = column × 2 + row. Column 0 is "by the stove".
- Adjacency: shared side only (same column other row; same row neighbouring column).
- Only sediment stacks, up to 3 per cell; a second stack may be started in another cell.
  A stack ages by its oldest item; only the oldest item evaporates.
- Tray: 1 place. While the tray is occupied, listening is not allowed.
- Moves and swaps are free (0 ticks), undoable (bounded stack of 30, saved with the slot).
- New sediment goes to: the Jar of Silence if owned → an existing stack with room →
  a free cell (new stack) → the tray → otherwise it burns in the stove (+2 heat, capped,
  with a message). Nothing disappears silently.
- Recipes and condensing take jars from shelf cells only (tray is a waiting place);
  sediment for recipes may come from shelf stacks or the Jar of Silence.
- Jar of Silence (`silence_jar`): unlimited, eternal sediment storage outside the shelf.

## 6. Guests

### 6.1 Worlds and palettes (S6, Q74, Д15)

| World | Slice palette (nights 1–4) | Full palette (night ≥ 5) | Candle (ticks) | Payment |
|---|---|---|---|---|
| forest | sadness 2, nostalgia 1, anger 1 | + fear 1 | 8 | wood: +1 Heat |
| river | fear 2, sadness 1, nostalgia 1 | + anger 1 | 7 | water: +1 charge (cap 3) |
| city | joy 2, nostalgia 2, anger 1 | same | 6 | sparks 12/10/8/6 for quality 100/75/50/25 |
| memorial (night ≥ 5) | — | loneliness 2, nostalgia 1 | 8 | +1 story (counter) when satisfied; reverse freshness |

Drought (night 7): river guests have one sadness fewer.

Story guests (A Д16, Q65): Dubodyor (forest palette, orders anger in night 7),
Tikhaya (river palette, orders sadness), Commis (night 8, wave-2 slot, city palette,
orders nostalgia, candle 8, pays as city). Vow givers' candles are ×2.

### 6.2 Night schedule generator (Q13, Q65, Q66, Д10, DL-03)

Each night's schedule is pre-rolled at night start from `hash(seed, night, line)` and the
recorded worlds of the two previous nights, so the same guests arrive regardless of
actions (TURN-07). Slots: `s0` (tick 0), `s2`, `s5`, `s8`.

1. Story guests take their slots (`schedule.storyGuests`).
2. Ordinary slots draw a world uniformly from the available worlds (memorial from night 5).
3. Tram line L (if any): at least `min(2, ordinary slots)` ordinary guests are from L
   (checked after the wind replacement).
4. Wind (s5): the slot's guest is replaced by a guest from a world ≠ L (≠ the drawn one if no line).
5. Sliding window: every world appears in the hall at least once in any 3 consecutive
   nights (memorial counted from night 5): if a world is missing from the two previous
   nights and the draft, a free ordinary slot is forced to it.
6. Standard/granny guarantees (Q66): nights 9 and 10: ≥ 1 city guest and ≥ 1 guest with fear;
   nights 10 and 11: ≥ 1 memorial guest; nights 10–12: ≥ 1 ordinary guest with nostalgia;
   night 6: 2 memorial guests (Q65).
7. Each guest gets a pre-rolled `u ∈ [0,1)` for order choice.

### 6.3 Arrival, seats and door (Q12)

Seats: 3 (+1 with the chair). An arriving guest takes a free clean seat; otherwise waits
at the door (queue of 1, patience melts ×0.5); otherwise turns away with Soft Warmth
(sediment 1 + ½ story). A dirty seat counts as occupied. The nameless guest sits by the
clock, takes no seat and needs no cleaning. When a seat is cleaned, the door guest sits at once.

### 6.4 Patience (Q54, Д01)

Stored in quarter ticks. Start = round(candle × mode mult) × 4, ×2 for vow givers.
Per tick loss = 4 × door(0.5) × predawn(2) × nameless present(1.5), multiplied, rounded
down to an integer quarter. A guest arriving at tick `t` starts losing at `t+1`.

### 6.5 Orders (Q19, Q64, Д06)

At seating the guest picks a feeling from its palette with weight = jar count, among
feelings for which the player knows the fresh "order recipe" (sadness → smoke tea,
joy → nimbus ramen, anger → tar gingerbread, fear → fog ukha, nostalgia → postcard
sbiten). If none qualifies, the guest accepts any dish (order `any`). Story guests have
scripted orders. Night 1 guests order sadness.

### 6.6 Serving, quality and payment (Q20, Q21, Q26, Q51–Q53)

- Purity = mean of ingredient purities (pure 100, murky 50; non-jar inputs ignored),
  floored to 25.
- Freshness by heat-age `h` (ticks since ready, doubled from predawn): from oven
  `h ≤ 1 + bonus`, hot `h ≤ 3 + bonus`, cold beyond. Values 100/75/50; memorial
  guests reversed 50/75/100. `bonus` = mittens (+1) + set (+1, TODO stub), max +2.
- Quality = purity × freshness / 100, floored to 25, minimum 25.
- Satisfied: dish has the ordered feeling (or order `any`). Otherwise "sated".
- Payment: city sparks by quality (12/10/8/6), sated: half, floored; city door +25% floored.
  Forest: +1 Heat (whole, even when sated). River: +1 water charge (whole). Satisfied forest
  and river guests tip 5 sparks. Memorial satisfied: +1 story counter (+1 more with the
  cemetery door).
- Story (Q52): satisfied and quality ≥ 75 → full story; satisfied and quality ≤ 50 → ½ story;
  sated → nothing. Served guests leave at once; the seat becomes dirty.

### 6.7 Leaving unhappy (Q29, S7.10)

Refused, dead candle, turned away, or still present at dawn → sediment 1 + ½ story.
Overdrawn → empty gold 1 + sediment 1, no story. The nameless guest → always empty gold 2,
no sediment.

### 6.8 The nameless guest (Д02)

Arrives at Midnight in nights 3, 6, 9, 11, 12. Nights 3–11: accepts only Empty shchi —
then leaves paying 2 empty gold. Otherwise stays until dawn and pays 2 when leaving.
Night 12: accepts the Pie of one's own memory (§11). While present, others' patience melts ×1.5.

## 7. Economy (S7.8, Q26–Q28)

### 7.1 Counters
Sparks; keys (earned only: vows ≤ 10, Mirror trade 1); threads (3); stories (spendable
counter); story halves (2 halves = 1 story, never count for doors); empty gold;
water charges (cap 3, carried between nights); Heat (cap 5, reset to 1 at night start,
2 with Kupa's reward and mittens already owned).

### 7.2 Collections
Each world has 6 stories × (3 fragments + ending). Listening reveals the guest's story
fragments in order; a full story reveals all fragments and the ending and marks the story
complete. A guest carries the first incomplete story of its world (repeats when all done
add only to the counter). Four complete stories of a world open its door permanently (free).

| Door | Bonus (Д11) |
|---|---|
| forest | +1 Heat per seat cleaned, ≤ 2 per night |
| river | +1 water charge at night start (cap 3) |
| city | +25% sparks (floored) |
| memorial | +1 story per satisfied memorial guest |

The tram can only choose a line whose door is open.

### 7.3 Mirror shop (Межсветье; emergency window at the Midnight tick)

| Item | id | Price | Effect |
|---|---|---|---|
| Shelf +2 | `shelf` | 45 | 2×4 shelf; **required for the best ending** (Q15) |
| Chair | `chair` | 60 | 4 seats |
| Kupa's mittens | `mittens` | 50 | from-oven window +1 |
| Double burner | `double_burner` | 90 | 2 burners |
| Jar of Silence | `silence_jar` | 80 sparks or 1 story | §5 |
| Trade | `mirrorTrade` | 3 stories | 1 key, once per campaign, Межсветье only |
| Commis's murk | `buyMurky` | 5 sparks | night 8 only (window) and the following Межсветье |

## 8. Dawn and the Межсветье boundary (Q10, Q22–Q24, Q60)

Dawn (in this order):
1. Unfinished dishes finish (ready, heat-age ≥ 4: cold); burners stay occupied (Q10).
2. Remaining guests (seat, door) leave unhappy (§6.7); the nameless guest pays 2 empty gold.
3. Position checks: young joy in column 0 when any cook/experiment happened this night
   → burning. Loneliness: for each loneliness jar and each adjacent non-loneliness,
   non-sediment jar, the pair counter +1; at 3 the neighbour becomes sediment
   (Mutnoe +1); pairs not adjacent at dawn are reset (Q23).
4. Pryazhenets in a burner and arc open → the Guardian is born, burner freed (Q34).
5. Vow resolution for windows ending tonight (§9). Ending resolution on night 12 (§11).
6. Night report frozen; phase → Межсветье.

Межсветье actions (0 ticks): moves/undo, burn, shop, tram line, tarot (1 card),
tremor pair choice, replay previous night, story/recipe books, next night.

Next night (step order, all on the pre-step state, no chains, Q22):
1. Tremor merges (from the boundary before night 10): chosen pairs of pure young joy
   (age 0–1, not amber/burning) + pure fear in adjacent cells → 1 pure tremor (age 0)
   in the joy's cell; the fear cell empties. Merge beats amber (Q24). Default pairs:
   lowest joy cell first.
2. Aging: every non-merged jar age +1. sadness reaching age 2 → hope (pure kept);
   young joy reaching age 2 → amber. Sediment reaching age 3 evaporates (oldest of stack).
   Jar of Silence sediment never ages.
3. Night start: night += 1, tick 0, shift 0, Heat start value, river door +1 water,
   schedule pre-roll, seated guest at tick 0, night-start checkpoint, scenes and vow offers.

## 9. Vows (PM Appendix A, Q36)

Offered at the start of the first window night (multi-night vows announced one night
earlier). Decline: no key, no thread. Success: +1 key, immediately. Failure: announced
as soon as it is certain; a thread is lost at the dawn of the last window night (max 1
per vow). Tutorial vows 1–3 cost no thread and repeat once next night.

| # | Window | Giver | Success condition | Certain failure |
|---|---|---|---|---|
| 1 | 2 | Dubodyor | 2 dishes with purity 100 served this night | dawn with < 2 |
| 2 | 3 | Prosha | no guest waits at the door > 2 ticks | a door wait reaches 3 |
| 3 | 4 | Tikhaya (guest) | serve Tikhaya a cold dish with sadness | Tikhaya leaves otherwise |
| 4 | 5–7 | Dubodyor (guest n7) | serve Dubodyor thunder perepechi in night 7 | n7 start without hope or a perepechi dish; Dubodyor leaves otherwise |
| 5 | 6 | Prosha | all memorial guests of the night satisfied | a memorial guest leaves unsatisfied |
| 6 | 7–8 | Tikhaya (guest n7, n8) | serve Tikhaya forgotten kisel | Tikhaya leaves in n8 without it, or dawn n8 |
| 7 | 8 | Prosha (Commis guest) | serve Commis a dish with nostalgia, quality ≥ 75 | Commis leaves otherwise |
| 8 | 9 | Dubodyor | no feeling jar burnt and no dish given to the stove this night | such an action |
| 9 | 10–11 | Tikhaya (guest n10, n11) | serve Tikhaya tram boltushka | Tikhaya leaves in n11 without it, or dawn n11 |
| 10 | 11 | Prosha | no cuckoo hint this night and ≥ 2 satisfied guests | a hint used, or dawn with < 2 |

Repeats: 1 → night 3, 2 → night 4, 3 → night 5 (Tikhaya returns as a guest).

### 9.3 Kupa's quest (Д07)
Night 9: Kupa can be served courage tea (0 ticks from oven, else 1). Reward: free mittens;
if already owned, +1 start Heat every night. Optional, costs no thread.

## 10. Hints

Cuckoo (Д08): 3 per night from night 2, 0 ticks, closes undo. Priority: (1) a ready dish
matching a seated order → serve; (2) a seated order cookable now from shelf jars and heat
→ that recipe; (3) a guest with ≤ 1 tick of candle → risk; (4) a guest whose palette has a
jar needed for a seated order → listen; (5) a dish brewing → wait; (6) none.
Tutorial whispers and onboarding cards never use hints.

Tarot (Д09): once per Межсветье, one of: `guest` (worlds and likely orders of s0 and s2),
`wind` (the world the Wind will bring), `whisper` (one ingredient of an unknown non-story
recipe; kept in the recipe book). Opening a card locks the tram line for that Межсветье.

## 11. Arcs and endings (Q31–Q35, Q37, Д21)

- Guardian arc opens at any time from night 10 when Mutnoe ≥ 5; it unlocks Pryazhenets.
  In night 10 grandma states how much Mutnoe is missing.
- Pryazhenets left in a burner at a dawn of night ≥ 10 with the arc open → Guardian born.
- Pie of one's own memory (known from night 11): nostalgia 2 + 1 thread + 1 story (counter);
  thread and story are paid at cooking. Serving it to the nameless guest in night 12 sets
  `pieServed`.
- Wound: `windFinal` in night 12 (1 key) ends the campaign at once.
- At the dawn of night 12: pieServed ∧ guardian → **new_spring**; pieServed → **remember**;
  else **letter**. Priority New Spring → Remember → Wound → Letter.

## 12. Recipes (S7.5, Q14, Д04)

| id | Ingredients | Brew | Heat | Known from |
|---|---|---|---|---|
| smoke_tea | sadness 1 | 1 | 0 | 1 |
| nimbus_ramen | sadness 2, joy 1 | 2 | 1 | 2 |
| tar_gingerbread | anger 1 | 1 | 1 | 2 |
| postcard_sbiten | nostalgia 1 | 1 | 1 | 2 |
| fog_ukha | fear 2 | 2 | 1 | 3 |
| empty_shchi | empty gold 2 | 1 | 0 | 3 |
| thunder_perepechi | anger 1, hope 1 | 2 | 2 | 4 |
| amber_ryapushka | nostalgia 1, amber 1 | 2 | 1 | 4 |
| forgotten_kisel | nostalgia 2, hope 1 | 2 | 1 | 6 |
| courage_tea | fear 2, hope 1 | 3 | 1 | 9 |
| tram_boltushka | tremor 1, nostalgia 1 | 1 | 0 | 9 |
| pryazhenets | hope, amber, anger, fear, nostalgia, loneliness, tremor 1 each + sediment 3 | 3 | 2 | arc |
| memory_pie | nostalgia 2 + thread 1 + story 1 | 2 | 1 | 11 |

Ingredient `joy` accepts joy or burning joy. Experiments may discover any non-story jar
recipe earlier (not empty shchi, pryazhenets, memory pie).

## 13. Saves, checkpoints, undo, replay (Q45, Q46, Q68)

- 3 slots; strict autosave after every committed action (incl. 0-tick); write failure
  blocks play with a retry dialog.
- The night-start state is stored in the slot (`nightStart`); `restartNight` restores it with
  the same pre-rolled guests. The pre-finale state (end of the Межсветье before night 12) is
  stored as `preFinale`.
- Undo: shelf/tray moves only, stack saved with the slot; any other action clears it.
- Global profile (separate record): settings, achievements, endings seen, onboarding seen.
  Awards are idempotent set-unions; slot import never grants awards.
- Export/import one slot as a bounded validated file with an explicit target slot.
- Night report (DIAG-01): revisions, seed, mode, night, night-start state (IDs/numbers only),
  action list with ticks, outcome hash; replayable headlessly.

## 14. Onboarding triggers (Доп-1, UI-08)

Cards (`onboarding.json`) fire on first committed encounter: first night, first guest,
first listen choice, core warning, tray full, first cook, first ready dish, dirty seat,
door queue, heat low, first chime (night 2), cuckoo, nameless guest, first sediment,
first hope/amber (Q61), condense (night 5), loneliness, tremor forecast, Mirror window,
Межсветье screens (tram, shop, tarot, doors, vows, forecast). Seen flags are per slot;
a global setting disables cards; Help reopens them. Cards never spend ticks or hints.

## 15. Streamer mode (Q42, Д17)

Hides: the name «Крестец» as the spirit's name (replaced by «хозяин перекрёстка»), Kupa's
confession scene text (night 9), vow 8 texts, ending names and conditions, spoiler
achievements. Prices and warnings stay with neutral text.

## 16. UI glossary (RU)

Склянка — jar; Полка — shelf; Поднос — tray; Печь, конфорка — stove, burner; Жар — Heat;
Осадок — sediment; Мутное — Mutnoe; Банка Тишины — Jar of Silence; Ходики — clock;
Тик — tick; Кукушка — cuckoo hint; Межсветье — between nights; Искорки — sparks;
Ключи-заводные — keys; Нити памяти — threads; Пустое золото — empty gold; Заряд воды — water
charge; История, половинка истории — story, half story; Дверь мира — world door; Завет — vow;
Свеча — patience candle; Слушать, Слушать до дна, Варить, Опыт, Подать, Убрать место,
К Купе, Сгустить, Сжечь, Отдать печи, Отказать, Подождать, Завершить ночь, Перевести
ходики. Forbidden in the UI: «ресурс», «юнит», «инвентарь».
