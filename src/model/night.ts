import type { Content, Kind, Mode, World } from './content.js';
import type { DawnReport, GameState, Jar, Loc, NightState, NightStats } from './types.js';
import { addSediment, isStoveCell, neighbors } from './shelf.js';
import { generateSchedule, worldsOf } from './schedule.js';
import { arrive, unhappyOutcome } from './guests.js';
import { vowsAtDawn, vowsAtNightStart } from './vows.js';

export function emptyStats(): NightStats {
  return {
    arrived: 0,
    served: 0,
    satisfied: 0,
    sated: 0,
    unhappy: 0,
    overdrawn: 0,
    turnedAway: 0,
    sparks: 0,
    stories: 0,
    halves: 0,
    sediment: 0,
    heatLost: 0,
    lastServeTick: 0,
    pureDishes: 0,
    overflowBurned: 0,
  };
}

export function nightLength(s: GameState, C: Content, n = s.night): number {
  return n === C.nights.tutorial.night ? C.nights.tutorial.ticks : C.nights.modes[s.mode].ticks;
}

export function dawnTick(s: GameState): number {
  return s.nt.len + s.nt.shift;
}

export function isTutorial(s: GameState, C: Content): boolean {
  return s.night === C.nights.tutorial.night;
}

/** Chimes of the current night with their nominal ticks. */
export function chimes(s: GameState, C: Content): { id: string; t: number }[] {
  if (isTutorial(s, C)) return [];
  return [
    { id: 'wind', t: C.nights.events.wind },
    { id: 'midnight', t: C.nights.events.midnight },
    { id: 'predawn', t: s.nt.len - C.nights.events.predawnBeforeDawn },
  ];
}

function blankNight(n: number, len: number, heat: number): NightState {
  return {
    n,
    tick: 0,
    shift: 0,
    len,
    fired: [],
    sched: [],
    heat,
    angerBurned: false,
    hints: 0,
    winds: 0,
    forestBonus: 0,
    cooked: false,
    mirrorTick: -1,
    nameless: 0,
    namelessArr: -1,
    stats: emptyStats(),
    log: [],
    lastHint: null,
    pureServed: 0,
    doorFail: false,
    living: false,
    cuckooUsed: false,
    memorialFail: false,
  };
}

export function createCampaign(C: Content, seed: string, mode: Mode, checkpoints = true): GameState {
  const st = C.nights.start;
  const s: GameState = {
    v: 1,
    seed,
    mode,
    night: 1,
    phase: 'night',
    ending: null,
    sparks: 0,
    keys: 0,
    threads: st.threads,
    stories: 0,
    halves: 0,
    gold: 0,
    water: 0,
    mut: 0,
    cols: st.shelfCols,
    seatsN: st.seats,
    burnersN: st.burners,
    up: [],
    silence: -1,
    shelf: Array.from({ length: st.shelfCols * 2 }, () => null),
    tray: null,
    seats: Array.from({ length: st.seats }, () => null),
    door: null,
    burners: Array.from({ length: st.burners }, () => null),
    known: [],
    book: [],
    tried: [],
    col: {},
    doors: [],
    line: null,
    tarot: null,
    hist: [],
    vows: {},
    offers: [],
    scenes: [],
    flags: {
      arc: false,
      guardian: false,
      pieServed: false,
      kupaReward: false,
      kupaHeat: 0,
      mirrorTraded: false,
      namelessSeen: false,
    },
    pairs: {},
    uid: 0,
    gid: 0,
    undo: [],
    tremorPairs: null,
    nt: blankNight(1, C.nights.tutorial.ticks, st.heat),
    report: null,
    nightStart: null,
    preFinale: null,
  };
  for (const j of st.shelf) s.shelf[j.cell] = { k: j.kind, p: j.pure, a: 0, u: ++s.uid };
  startNight(s, C, checkpoints);
  return s;
}

export function stripCheckpoints(s: GameState): GameState {
  const copy = structuredClone({ ...s, nightStart: null, preFinale: null });
  return copy;
}

export function checkArc(s: GameState, C: Content): void {
  if (!s.flags.arc && s.night >= C.sediment.mutGateFromNight && s.mut >= C.sediment.mutGate) {
    s.flags.arc = true;
    for (const [id, r] of Object.entries(C.recipes.recipes))
      if (r.unlock === 'guardianArc' && !s.known.includes(id)) s.known.push(id);
    s.scenes.push('arc.open');
  }
}

export function startNight(s: GameState, C: Content, checkpoints: boolean): void {
  const n = s.night;
  s.phase = 'night';
  const heat = C.nights.start.heat + s.flags.kupaHeat;
  s.nt = blankNight(n, nightLength(s, C, n), Math.min(C.nights.start.heatMax, heat));
  s.seats = Array.from({ length: s.seatsN }, () => null);
  s.door = null;
  s.tarot = null;
  s.tremorPairs = null;
  s.undo = [];
  if (s.doors.includes('river'))
    s.water = Math.min(C.nights.start.waterMax, s.water + C.economy.doors.river.waterAtNightStart);
  const tut = isTutorial(s, C);
  for (const [id, r] of Object.entries(C.recipes.recipes)) {
    const ok = tut ? C.nights.tutorial.recipes.includes(id) : r.knownFrom <= n && r.unlock === undefined;
    if (ok && !s.known.includes(id)) s.known.push(id);
  }
  s.scenes.push(`night.start.${n}`);
  if (tut) s.scenes.push('n1.ramen');
  if (n === 9) s.scenes.push('kupa.confession');
  if (n === 11) s.scenes.push('krestets.name');
  if (n === C.nights.droughtNight) s.scenes.push('drought');
  if (n === C.economy.murky.night) s.scenes.push('commis.arrives');
  checkArc(s, C);
  if (n === C.sediment.mutGateFromNight && !s.flags.arc)
    s.scenes.push(`arc.missing:${C.sediment.mutGate - s.mut}`);
  vowsAtNightStart(s, C);
  s.nt.sched = generateSchedule(
    C,
    s.seed,
    n,
    s.line,
    s.hist,
    s.vows,
    C.nights.modes[s.mode].guarantees,
  );
  for (const e of s.nt.sched) if (e.t === 0) arrive(s, C, e);
  s.nightStart = checkpoints ? stripCheckpoints(s) : null;
}

/** Advance exactly one tick (§4.2). Dawn resolution is run by the caller after the action finishes. */
export function advanceTick(s: GameState, C: Content): void {
  const nt = s.nt;
  nt.tick++;
  const t = nt.tick;
  for (const ch of chimes(s, C)) {
    if (nt.fired.includes(ch.id) || ch.t + nt.shift > t) continue;
    nt.fired.push(ch.id);
    if (ch.id === 'midnight') {
      nt.mirrorTick = t;
      if (C.guests.nameless.nights.includes(s.night) && nt.nameless === 0) {
        nt.nameless = 1;
        nt.namelessArr = t;
        s.scenes.push(s.flags.namelessSeen ? 'nameless.arrive' : 'nameless.first');
        s.flags.namelessSeen = true;
      }
    }
  }
  for (const e of nt.sched) if (!e.done && e.t + (isTutorial(s, C) ? 0 : nt.shift) <= t) arrive(s, C, e);
  const predawn = nt.fired.includes('predawn');
  for (const d of s.burners) {
    if (!d) continue;
    if (!d.ok && d.rt <= t) {
      d.ok = true;
      d.h = 0;
    } else if (d.ok) d.h += predawn ? 2 : 1;
  }
  const P = C.nights.patience;
  const mult = (predawn ? P.predawnMult : 1) * (nt.nameless === 1 ? P.namelessMult : 1);
  for (const x of s.seats) {
    if (!x || x === 'dirty' || x.out || x.arr >= t) continue;
    x.pat -= Math.floor(P.quarters * mult);
    if (x.pat <= 0) x.out = true;
  }
  if (s.door && s.door.arr < t) {
    const g = s.door;
    g.dw++;
    if (!g.out) {
      g.pat -= Math.floor(P.quarters * mult * P.doorMult);
      if (g.pat <= 0) g.out = true;
    }
  }
}

/** Dead-candle guests leave at the start of a paid action (Q08/Q56). */
export function departOutGuests(s: GameState, C: Content): void {
  s.seats.forEach((x, i) => {
    if (x && x !== 'dirty' && x.out) {
      s.seats[i] = 'dirty';
      unhappyOutcome(s, C, x);
    }
  });
  if (s.door?.out) {
    const g = s.door;
    s.door = null;
    unhappyOutcome(s, C, g);
  }
}

function forEachJar(s: GameState, fn: (j: Jar, loc: Loc) => void): void {
  s.shelf.forEach((j, i) => j && fn(j, i));
  if (s.tray) fn(s.tray, 'tray');
}

export function dawn(s: GameState, C: Content): void {
  const nt = s.nt;
  const report: DawnReport = { night: s.night, stats: nt.stats, thread: false, guardian: false, transforms: [] };
  for (const d of s.burners) {
    if (!d) continue;
    if (d.exp && d.fail) continue;
    d.ok = true;
    d.h = Math.max(d.h, C.recipes.freshness.coldAtDawnAge + C.recipes.freshness.maxBonus);
  }
  for (const x of s.seats) if (x && x !== 'dirty') unhappyOutcome(s, C, x);
  if (s.door) unhappyOutcome(s, C, s.door);
  s.seats = s.seats.map(() => null);
  s.door = null;
  if (nt.nameless === 1) {
    nt.nameless = 2;
    s.gold += C.guests.nameless.payEmptyGold;
  }
  // Position checks (Q23).
  if (nt.cooked)
    s.shelf.forEach((j, i) => {
      if (j && j.k === 'joy' && isStoveCell(i)) {
        j.k = 'burning';
        j.p = false;
        report.transforms.push({ cell: i, from: 'joy', to: 'burning' });
      }
    });
  const after = C.feelings.kinds.loneliness.drainsNeighborsAfterDawns ?? 3;
  const pairs: Record<string, number> = {};
  const drained = new Set<number>();
  s.shelf.forEach((j, i) => {
    if (!j || j.k !== 'loneliness') return;
    for (const nb of neighbors(i, s.cols)) {
      const o = s.shelf[nb];
      if (!o || o.k === 'loneliness' || o.k === 'sediment') continue;
      const key = `${j.u}-${o.u}`;
      pairs[key] = (s.pairs[key] ?? 0) + 1;
      if (pairs[key]! >= after) drained.add(nb);
    }
  });
  s.pairs = pairs;
  for (const i of drained) {
    const o = s.shelf[i]!;
    report.transforms.push({ cell: i, from: o.k, to: 'sediment' });
    s.shelf[i] = null;
    addSediment(s, C, 1, true);
  }
  // Pryazhenets left in the stove (Q34).
  if (s.flags.arc && !s.flags.guardian) {
    const b = s.burners.findIndex((d) => d?.r === 'pryazhenets');
    if (b >= 0) {
      s.burners[b] = null;
      s.flags.guardian = true;
      report.guardian = true;
      s.scenes.push('guardian.born');
    }
  }
  report.thread = vowsAtDawn(s, C);
  if (s.night === C.nights.tutorial.night) s.scenes.push('n1.farewell');
  s.report = report;
  s.phase = 'day';
  if (s.night >= C.endings.finalNight) {
    const ending = s.flags.pieServed ? (s.flags.guardian ? 'new_spring' : 'remember') : 'letter';
    endCampaign(s, ending);
  } else s.scenes.push('dawn');
}

export function endCampaign(s: GameState, ending: string): void {
  s.phase = 'ended';
  s.ending = ending;
  s.scenes.push(`ending.${ending}`);
}

/** Candidate tremor pairs [joyCell, fearCell] for the coming boundary (Q24, Q60). */
export function tremorCandidates(s: GameState, C: Content): [number, number][] {
  const m = C.feelings.tremorMerge;
  if (s.night + 1 < m.fromNight) return [];
  const out: [number, number][] = [];
  s.shelf.forEach((j, i) => {
    if (!j || j.k !== m.joy || j.a > m.maxJoyAge || (m.requirePure && !j.p)) return;
    for (const nb of neighbors(i, s.cols)) {
      const o = s.shelf[nb];
      if (o && o.k === m.partner && (!m.requirePure || o.p)) out.push([i, nb]);
    }
  });
  return out;
}

export function defaultTremorPairs(s: GameState, C: Content): [number, number][] {
  const used = new Set<number>();
  const out: [number, number][] = [];
  for (const [a, b] of tremorCandidates(s, C)) {
    if (used.has(a) || used.has(b)) continue;
    used.add(a);
    used.add(b);
    out.push([a, b]);
  }
  return out;
}

export function validTremorPairs(s: GameState, C: Content, pairs: [number, number][]): boolean {
  const cand = tremorCandidates(s, C).map(([a, b]) => `${a}:${b}`);
  const used = new Set<number>();
  for (const [a, b] of pairs) {
    if (!cand.includes(`${a}:${b}`) || used.has(a) || used.has(b)) return false;
    used.add(a);
    used.add(b);
  }
  return true;
}

/** Forecast of the coming boundary step, evaluated on the current state (no chains). */
export function forecast(s: GameState, C: Content): { cell: Loc; from: Kind; to: Kind | null }[] {
  const out: { cell: Loc; from: Kind; to: Kind | null }[] = [];
  const pairs = s.tremorPairs ?? defaultTremorPairs(s, C);
  const merged = new Set(pairs.flat());
  for (const [a, b] of pairs) {
    out.push({ cell: a, from: 'joy', to: 'tremor' });
    out.push({ cell: b, from: 'fear', to: null });
  }
  forEachJar(s, (j, loc) => {
    if (typeof loc === 'number' && merged.has(loc)) return;
    const def = C.feelings.kinds[j.k];
    if (j.k === 'sediment') {
      const old = (j.s ?? []).filter((a) => a + 1 >= C.sediment.shelfLifeNights).length;
      if (old) out.push({ cell: loc, from: 'sediment', to: null });
    } else if (def.agesInto && j.a + 1 >= (def.agingSteps ?? 2)) out.push({ cell: loc, from: j.k, to: def.agesInto });
  });
  return out;
}

export function nextNight(s: GameState, C: Content, checkpoints: boolean): void {
  if (s.night + 1 === C.endings.finalNight && checkpoints) s.preFinale = stripCheckpoints(s);
  const pairs = s.tremorPairs ?? defaultTremorPairs(s, C);
  const merged = new Set<number>();
  for (const [a, b] of pairs) {
    s.shelf[a] = { k: 'tremor', p: true, a: 0, u: ++s.uid };
    s.shelf[b] = null;
    merged.add(a);
  }
  const age = (j: Jar | null, loc: Loc): Jar | null => {
    if (!j || (typeof loc === 'number' && merged.has(loc))) return j;
    if (j.k === 'sediment') {
      const ages = (j.s ?? []).map((a) => a + 1).filter((a) => a < C.sediment.shelfLifeNights);
      if (!ages.length) return null;
      return { ...j, s: ages, a: Math.max(...ages) };
    }
    const def = C.feelings.kinds[j.k];
    const next = { ...j, a: j.a + 1 };
    if (def.agesInto && next.a >= (def.agingSteps ?? 2)) next.k = def.agesInto;
    return next;
  };
  s.shelf = s.shelf.map((j, i) => age(j, i));
  s.tray = age(s.tray, 'tray');
  s.hist = [...s.hist, worldsOf(s.nt.sched)].slice(-(C.schedule.windowNights - 1));
  s.night++;
  s.report = null;
  startNight(s, C, checkpoints);
}

export function previewSchedule(s: GameState, C: Content, line: World | null) {
  const hist = [...s.hist, worldsOf(s.nt.sched)].slice(-(C.schedule.windowNights - 1));
  const vows = structuredClone(s.vows);
  return generateSchedule(C, s.seed, s.night + 1, line, hist, vows, C.nights.modes[s.mode].guarantees);
}
