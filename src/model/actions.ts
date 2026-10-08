import type { Content, Kind } from './content.js';
import { WORLDS } from './content.js';
import type { Action, Dish, GameState, Jar, ModelOptions, Resolution } from './types.js';
import {
  accepts,
  addSediment,
  freeCell,
  freshStage,
  gainHeat,
  getLoc,
  newJar,
  nonJarNeeds,
  pickIngredients,
  purityOf,
  sedimentAvailable,
  setLoc,
  snapshotLayout,
  takeSediment,
  validLoc,
} from './shelf.js';
import {
  checkArc,
  dawn,
  dawnTick,
  departOutGuests,
  endCampaign,
  isTutorial,
  nextNight,
  previewSchedule,
  stripCheckpoints,
  validTremorPairs,
  advanceTick,
} from './night.js';
import {
  chooseOrder,
  makeGuest,
  overdrawnOutcome,
  paletteTotal,
  removeGuest,
  seatFromDoor,
  serveGuest,
  takeFromPalette,
  unhappyOutcome,
} from './guests.js';
import { vowAccept, vowOnCuckoo, vowOnLivingBurn } from './vows.js';
import { computeHint } from './hints.js';

export const DEFAULT_OPTIONS: ModelOptions = { checkpoints: true, log: true };

const NIGHT_ONLY = new Set([
  'listen',
  'listenBottom',
  'cook',
  'experiment',
  'serve',
  'clean',
  'kupa',
  'condense',
  'discardDish',
  'refuse',
  'wait',
  'endNight',
  'windClock',
  'cuckoo',
  'windFinal',
]);
const DAY_ONLY = new Set(['tram', 'tarot', 'tremorPairs', 'nextNight', 'mirrorTrade']);

const no = (code: string): Resolution => ({ ok: false, code });

export function mirrorOpen(s: GameState, C: Content): boolean {
  return s.phase === 'night' && !isTutorial(s, C) && s.nt.mirrorTick >= 0 && s.nt.mirrorTick === s.nt.tick;
}

function seatGuestAt(s: GameState, seat: unknown) {
  if (typeof seat !== 'number') return null;
  const x = s.seats[seat];
  return x && x !== 'dirty' ? x : null;
}

function owned(s: GameState, item: string): boolean {
  switch (item) {
    case 'shelf':
      return s.cols > 3;
    case 'chair':
      return s.seatsN > 3;
    case 'double_burner':
      return s.burnersN > 1;
    case 'silence_jar':
      return s.silence >= 0;
    default:
      return s.up.includes(item);
  }
}

export function serveCost(s: GameState, C: Content, burner: number): number {
  const d = s.burners[burner];
  if (!d) return C.actions.serve.ticks;
  return freshStage(s, C, d) === 0 ? C.actions.serveFresh.ticks : C.actions.serve.ticks;
}

function freeBurner(s: GameState, b?: number): number | null {
  if (b !== undefined) return s.burners[b] === null && b < s.burners.length ? b : null;
  const i = s.burners.findIndex((d) => d === null);
  return i >= 0 ? i : null;
}

function matchExperiment(C: Content, jars: Jar[], known: string[]): string | null {
  for (const [id, r] of Object.entries(C.recipes.recipes)) {
    if (r.story) continue;
    const needs: string[] = [];
    let jarOnly = true;
    for (const [k, n] of Object.entries(r.ingredients)) {
      if (['sediment', 'empty_gold', 'thread', 'story'].includes(k)) jarOnly = false;
      for (let i = 0; i < n; i++) needs.push(k);
    }
    if (!jarOnly || needs.length !== jars.length) continue;
    const rem = [...needs];
    let ok = true;
    for (const j of jars) {
      const idx = rem.findIndex((k) => accepts(C, k).includes(j.k));
      if (idx < 0) {
        ok = false;
        break;
      }
      rem.splice(idx, 1);
    }
    if (ok) return id;
  }
  void known;
  return null;
}

function hintFor(s: GameState, C: Content, kinds: Kind[]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const [id, r] of Object.entries(C.recipes.recipes)) {
    if (r.story || s.known.includes(id)) continue;
    const keys = Object.keys(r.ingredients);
    if (keys.some((k) => ['sediment', 'empty_gold', 'thread', 'story'].includes(k))) continue;
    const score = kinds.filter((k) => keys.some((x) => accepts(C, x).includes(k))).length;
    if (!keys.some((k) => !s.book.includes(`${id}:${k}`))) continue;
    if (!best || score > best.score) best = { id, score };
  }
  if (!best) return null;
  const k = Object.keys(C.recipes.recipes[best.id]!.ingredients).find((x) => !s.book.includes(`${best!.id}:${x}`));
  return k ? `${best.id}:${k}` : null;
}

export function resolve(s: GameState, a: Action, C: Content): Resolution {
  if (!a || typeof a !== 'object' || typeof a.t !== 'string') return no('bad-action');
  if (s.phase === 'ended' && !['restorePreFinale', 'ackScene'].includes(a.t)) return no('ended');
  if (s.scenes.length > 0 && !['ackScene', 'restartNight', 'restorePreFinale'].includes(a.t))
    return no('scene-pending');
  if (NIGHT_ONLY.has(a.t) && s.phase !== 'night') return no('not-night');
  if (DAY_ONLY.has(a.t) && s.phase !== 'day') return no('not-day');
  const nt = s.nt;
  let cost = 0;
  switch (a.t) {
    case 'move': {
      if (!validLoc(s, a.from) || !validLoc(s, a.to) || a.from === a.to) return no('bad-cell');
      if (!getLoc(s, a.from)) return no('empty-cell');
      break;
    }
    case 'undo':
      if (!s.undo.length) return no('nothing-to-undo');
      break;
    case 'listen': {
      const g = seatGuestAt(s, a.seat);
      if (!g) return no('no-guest');
      if (g.out) return no('candle-out');
      if (!(g.pal[a.kind] ?? 0)) return no('no-such-feeling');
      if (paletteTotal(g) <= 1) return no('core');
      if (s.tray) return no('tray-full');
      if (a.cell !== undefined && (!validLoc(s, a.cell) || s.shelf[a.cell as number])) return no('bad-cell');
      cost = C.actions.listen.ticks;
      break;
    }
    case 'listenBottom': {
      const g = seatGuestAt(s, a.seat);
      if (!g) return no('no-guest');
      if (g.out) return no('candle-out');
      if (paletteTotal(g) !== 1) return no('not-core');
      if (s.tray) return no('tray-full');
      cost = C.actions.listenBottom.ticks;
      break;
    }
    case 'cook': {
      const r = C.recipes.recipes[a.recipe];
      if (!r || !s.known.includes(a.recipe)) return no('unknown-recipe');
      if (freeBurner(s, a.burner) === null) return no('no-burner');
      if (a.water) {
        if (s.water <= 0) return no('no-water');
      } else if (nt.heat < r.heat) return no('no-heat');
      const extra = nonJarNeeds(C, a.recipe);
      if (extra.thread > s.threads) return no('no-thread');
      if (extra.story > s.stories) return no('no-story');
      if (extra.gold > s.gold) return no('no-gold');
      if (extra.sediment > sedimentAvailable(s)) return no('no-sediment');
      if (!pickIngredients(s, C, a.recipe, a.cells)) return no('no-ingredients');
      cost = C.actions.cook.ticks;
      break;
    }
    case 'experiment': {
      const E = C.actions.experiment;
      if (!Array.isArray(a.cells) || a.cells.length < E.minJars || a.cells.length > E.maxJars) return no('bad-cell');
      if (new Set(a.cells).size !== a.cells.length) return no('bad-cell');
      for (const c of a.cells) {
        const j = typeof c === 'number' ? s.shelf[c] : null;
        if (!j || j.k === 'sediment') return no('bad-cell');
      }
      if (freeBurner(s, a.burner) === null) return no('no-burner');
      if (nt.heat < E.heat) return no('no-heat');
      cost = E.ticks;
      break;
    }
    case 'serve': {
      const d = s.burners[a.burner];
      if (!d) return no('no-dish');
      if (!d.ok) return no('not-ready');
      cost = serveCost(s, C, a.burner);
      if (a.to === 'nameless') {
        if (nt.nameless !== 1) return no('no-guest');
        const final = s.night === C.guests.nameless.finalNight;
        const want = final ? C.guests.nameless.acceptsFinal : C.guests.nameless.accepts;
        if (d.r !== want) return no('nameless-refuses');
      } else if (a.to === 'kupa') {
        if (s.night !== C.economy.kupaReward.night || s.flags.kupaReward) return no('no-guest');
        if (d.r !== C.economy.kupaReward.recipe) return no('kupa-refuses');
      } else {
        const g = seatGuestAt(s, a.to);
        if (!g) return no('no-guest');
        if (cost > 0 && g.out) return no('candle-out');
      }
      break;
    }
    case 'clean':
      if (s.seats[a.seat] !== 'dirty') return no('not-dirty');
      cost = C.actions.clean.ticks;
      break;
    case 'kupa':
      cost = C.actions.kupa.ticks;
      break;
    case 'condense': {
      if (s.night < C.actions.condense.fromNight) return no('locked');
      if (!Array.isArray(a.cells) || a.cells.length !== C.actions.condense.costJars) return no('bad-cell');
      if (new Set(a.cells).size !== a.cells.length) return no('bad-cell');
      for (const c of a.cells) {
        const j = typeof c === 'number' ? s.shelf[c] : null;
        if (!j || j.k === 'sediment') return no('bad-cell');
      }
      cost = C.actions.condense.ticks;
      break;
    }
    case 'burn':
      if (a.from === 'silence') {
        if (s.silence <= 0) return no('empty-cell');
      } else if (!validLoc(s, a.from) || !getLoc(s, a.from)) return no('empty-cell');
      break;
    case 'discardDish':
      if (!s.burners[a.burner]) return no('no-dish');
      break;
    case 'refuse':
      if (a.seat === 'door' ? !s.door : !seatGuestAt(s, a.seat)) return no('no-guest');
      break;
    case 'wait':
      cost = C.actions.wait.ticks;
      break;
    case 'endNight':
      if (s.seats.some((x) => x && x !== 'dirty') || s.door) return no('guests-present');
      if (nt.sched.some((e) => !e.done)) return no('guests-coming');
      break;
    case 'windClock':
      if (!C.nights.modes[s.mode].winding || isTutorial(s, C)) return no('winding-forbidden');
      if (s.keys < C.actions.windClock.costKeys) return no('no-keys');
      if (nt.winds >= C.actions.windClock.perNight) return no('winding-limit');
      break;
    case 'cuckoo':
      if (s.night < C.actions.cuckoo.fromNight) return no('locked');
      if (nt.hints >= C.actions.cuckoo.perNight) return no('no-hints');
      break;
    case 'vow':
      if (!s.offers.includes(a.id)) return no('no-offer');
      break;
    case 'buy': {
      const price = C.economy.prices[a.item];
      if (!price) return no('bad-item');
      if (!(s.phase === 'day' || mirrorOpen(s, C))) return no('shop-closed');
      if (owned(s, a.item)) return no('owned');
      if (a.pay === 'stories') {
        if (!price.stories || s.stories < price.stories) return no('no-story');
      } else if ((price.sparks ?? Infinity) > s.sparks) return no('no-sparks');
      break;
    }
    case 'mirrorTrade':
      if (s.flags.mirrorTraded) return no('traded');
      if (s.stories < C.economy.mirrorTrade.stories) return no('no-story');
      break;
    case 'buyMurky': {
      const okNight = s.night === C.economy.murky.night && (s.phase === 'day' || mirrorOpen(s, C));
      if (!okNight) return no('shop-closed');
      if (s.sparks < C.economy.murky.sparks) return no('no-sparks');
      break;
    }
    case 'tram':
      if (a.line !== null && (!WORLDS.includes(a.line) || !s.doors.includes(a.line))) return no('door-closed');
      if (s.tarot) return no('tram-locked');
      break;
    case 'tarot':
      if (s.tarot) return no('tarot-used');
      if (!['guest', 'wind', 'whisper'].includes(a.card)) return no('bad-card');
      break;
    case 'tremorPairs':
      if (!Array.isArray(a.pairs) || !validTremorPairs(s, C, a.pairs)) return no('bad-pairs');
      break;
    case 'nextNight':
      if (s.night >= C.nights.campaignNights) return no('ended');
      break;
    case 'windFinal':
      if (s.night !== C.endings.finalNight) return no('not-final');
      if (s.keys < 1) return no('no-keys');
      if (s.flags.pieServed) return no('pie-served');
      break;
    case 'restartNight':
      if (!s.nightStart || s.nightStart.night !== s.night) return no('no-checkpoint');
      break;
    case 'restorePreFinale':
      if (!s.preFinale || !(s.night >= C.endings.finalNight || s.phase === 'ended')) return no('no-checkpoint');
      break;
    case 'ackScene':
      if (!s.scenes.length) return no('no-scene');
      break;
    default:
      return no('bad-action');
  }
  if (cost > 0) {
    if (s.offers.length) return no('vow-pending');
    if (nt.tick + cost > dawnTick(s)) return no('past-dawn');
  }
  return { ok: true, cost };
}

function replaceState(s: GameState, next: GameState): void {
  for (const k of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[k];
  Object.assign(s, next);
}

/** First part of an action: effects that happen before any tick passes. */
export function begin(s: GameState, a: Action, C: Content, cost: number, opts: ModelOptions = DEFAULT_OPTIONS): void {
  if (cost > 0) departOutGuests(s, C);
  if (opts.log && s.phase !== 'ended') s.nt.log.push([s.nt.tick, JSON.stringify(a)]);
  if (a.t !== 'move' && a.t !== 'undo' && a.t !== 'ackScene') s.undo = [];
  const nt = s.nt;
  switch (a.t) {
    case 'move': {
      s.undo.push(snapshotLayout(s));
      if (s.undo.length > C.actions.undoDepth) s.undo.shift();
      const from = getLoc(s, a.from)!;
      const to = getLoc(s, a.to);
      const max = C.sediment.stackMax;
      if (to && to.k === 'sediment' && from.k === 'sediment' && (to.s!.length + from.s!.length) <= max) {
        to.s = [...to.s!, ...from.s!].sort((x, y) => y - x);
        to.a = to.s[0]!;
        setLoc(s, a.from, null);
      } else {
        setLoc(s, a.from, to);
        setLoc(s, a.to, from);
      }
      break;
    }
    case 'undo': {
      const prev = s.undo.pop()!;
      s.shelf = prev.shelf;
      s.tray = prev.tray;
      break;
    }
    case 'listen':
    case 'listenBottom': {
      const g = seatGuestAt(s, a.seat)!;
      const kind = a.t === 'listen' ? a.kind : (Object.keys(g.pal)[0] as Kind);
      takeFromPalette(g, kind);
      const jar = newJar(s, kind, a.t === 'listen' ? a.warm : false);
      const cell = freeCell(s, a.cell);
      if (cell !== null) s.shelf[cell] = jar;
      else s.tray = jar;
      if (a.t === 'listen') {
        if (g.st && (s.col[g.st] ?? 0) <= C.economy.fragmentsPerStory) {
          g.fr = Math.min(C.economy.fragmentsPerStory, g.fr + 1);
          s.col[g.st] = Math.max(s.col[g.st] ?? 0, g.fr);
        }
      } else {
        removeGuest(s, g);
        overdrawnOutcome(s, C, g);
      }
      break;
    }
    case 'cook': {
      const r = C.recipes.recipes[a.recipe]!;
      const cells = pickIngredients(s, C, a.recipe, a.cells)!;
      const jars = cells.map((c) => s.shelf[c]!);
      cells.forEach((c) => (s.shelf[c] = null));
      const extra = nonJarNeeds(C, a.recipe);
      for (let i = 0; i < extra.sediment; i++) takeSediment(s);
      s.gold -= extra.gold;
      s.threads -= extra.thread;
      s.stories -= extra.story;
      if (a.water) s.water--;
      else nt.heat -= r.heat;
      const b = freeBurner(s, a.burner)!;
      s.burners[b] = { r: a.recipe, rt: nt.tick + r.brew, ok: false, h: 0, pur: purityOf(C, jars) };
      nt.cooked = true;
      break;
    }
    case 'experiment': {
      const jars = a.cells.map((c) => s.shelf[c]!);
      a.cells.forEach((c) => (s.shelf[c] = null));
      nt.heat -= C.actions.experiment.heat;
      const match = matchExperiment(C, jars, s.known);
      const key = jars
        .map((j) => j.k)
        .sort()
        .join('+');
      if (!s.tried.includes(key)) s.tried.push(key);
      const b = freeBurner(s, a.burner)!;
      const dish: Dish = {
        r: match ?? '__fail',
        rt: nt.tick + C.actions.experiment.ticks,
        ok: false,
        h: 0,
        pur: purityOf(C, jars),
        exp: true,
        fail: !match,
      };
      if (!match) {
        const hint = hintFor(s, C, jars.map((j) => j.k));
        if (hint) s.book.push(hint);
      }
      s.burners[b] = dish;
      nt.cooked = true;
      break;
    }
    case 'serve': {
      const d = s.burners[a.burner]!;
      s.burners[a.burner] = null;
      if (a.to === 'nameless') {
        nt.nameless = 2;
        if (d.r === C.guests.nameless.acceptsFinal) {
          s.flags.pieServed = true;
          s.scenes.push('pie.served');
        } else {
          s.gold += C.guests.nameless.payEmptyGold;
          s.scenes.push('nameless.fed');
        }
      } else if (a.to === 'kupa') {
        s.flags.kupaReward = true;
        if (s.up.includes(C.economy.kupaReward.grants)) s.flags.kupaHeat += C.economy.kupaReward.ifOwnedStartHeat;
        else s.up.push(C.economy.kupaReward.grants);
        s.scenes.push('kupa.reward');
      } else serveGuest(s, C, seatGuestAt(s, a.to)!, d);
      break;
    }
    case 'clean': {
      s.seats[a.seat] = null;
      const fb = C.economy.doors.forest;
      if (s.doors.includes('forest') && nt.forestBonus < fb.maxPerNight) {
        nt.forestBonus++;
        gainHeat(s, C, fb.heatPerClean);
      }
      seatFromDoor(s, C);
      break;
    }
    case 'kupa':
      gainHeat(s, C, C.actions.kupa.heat);
      break;
    case 'condense':
      for (const c of a.cells) s.shelf[c] = null;
      addSediment(s, C, C.actions.condense.gainSediment, true);
      break;
    case 'burn': {
      if (a.from === 'silence') {
        s.silence--;
        gainHeat(s, C, C.feelings.kinds.sediment.burnHeat ?? 2);
        break;
      }
      const j = getLoc(s, a.from)!;
      if (j.k === 'sediment') {
        const ages = [...j.s!].sort((x, y) => y - x);
        ages.shift();
        setLoc(s, a.from, ages.length ? { ...j, s: ages, a: ages[0]! } : null);
        if (s.phase === 'night') gainHeat(s, C, C.feelings.kinds.sediment.burnHeat ?? 2);
      } else {
        setLoc(s, a.from, null);
        if (s.phase === 'night') {
          const def = C.feelings.kinds[j.k];
          if (def.burnHeat && !nt.angerBurned) {
            nt.angerBurned = true;
            gainHeat(s, C, def.burnHeat);
          }
          vowOnLivingBurn(s, C);
        }
      }
      break;
    }
    case 'discardDish':
      s.burners[a.burner] = null;
      addSediment(s, C, C.actions.discardDish.gainSediment, true);
      if (s.phase === 'night') vowOnLivingBurn(s, C);
      break;
    case 'refuse': {
      const g = a.seat === 'door' ? s.door! : seatGuestAt(s, a.seat)!;
      removeGuest(s, g);
      unhappyOutcome(s, C, g);
      break;
    }
    case 'wait':
      break;
    case 'endNight':
      nt.tick = Math.max(nt.tick, dawnTick(s));
      break;
    case 'windClock':
      s.keys -= C.actions.windClock.costKeys;
      nt.winds++;
      nt.shift += C.actions.windClock.gainTicks;
      break;
    case 'cuckoo':
      nt.hints++;
      nt.lastHint = computeHint(s, C);
      vowOnCuckoo(s, C);
      break;
    case 'vow':
      vowAccept(s, a.id, a.accept);
      break;
    case 'buy': {
      const price = C.economy.prices[a.item]!;
      if (a.pay === 'stories') s.stories -= price.stories!;
      else s.sparks -= price.sparks!;
      if (a.item === 'shelf') {
        s.cols++;
        s.shelf.push(null, null);
      } else if (a.item === 'chair') {
        s.seatsN++;
        s.seats.push(null);
      } else if (a.item === 'double_burner') {
        s.burnersN++;
        s.burners.push(null);
      } else if (a.item === 'silence_jar') s.silence = 0;
      else s.up.push(a.item);
      break;
    }
    case 'mirrorTrade':
      s.stories -= C.economy.mirrorTrade.stories;
      s.keys += C.economy.mirrorTrade.keys;
      s.flags.mirrorTraded = true;
      break;
    case 'buyMurky':
      s.sparks -= C.economy.murky.sparks;
      addSediment(s, C, 1, false);
      break;
    case 'tram':
      s.line = a.line;
      break;
    case 'tarot': {
      const sched = previewSchedule(s, C, s.line);
      if (a.card === 'guest') {
        s.tarot = {
          card: 'guest',
          guests: sched
            .filter((e) => e.t <= 2)
            .map((e) => {
              const probe = structuredClone(s);
              probe.night++;
              const g = makeGuest(probe, C, e);
              return { w: e.w, sp: e.sp, ord: chooseOrder(probe, C, g, e.u) };
            }),
        };
      } else if (a.card === 'wind') {
        s.tarot = { card: 'wind', wind: sched.find((e) => e.wind)?.w ?? null };
      } else {
        const hint = hintFor(s, C, []);
        if (hint) s.book.push(hint);
        s.tarot = { card: 'whisper', hint };
      }
      break;
    }
    case 'tremorPairs':
      s.tremorPairs = a.pairs.map(([x, y]) => [x, y] as [number, number]);
      break;
    case 'nextNight':
      nextNight(s, C, opts.checkpoints);
      break;
    case 'windFinal':
      s.keys -= 1;
      endCampaign(s, 'wound');
      break;
    case 'restartNight': {
      const start = structuredClone(s.nightStart!);
      const pre = s.preFinale;
      start.nightStart = stripCheckpoints(start);
      start.preFinale = pre;
      replaceState(s, start);
      break;
    }
    case 'restorePreFinale': {
      const pre = structuredClone(s.preFinale!);
      pre.preFinale = stripCheckpoints(pre);
      pre.nightStart = null;
      replaceState(s, pre);
      break;
    }
    case 'ackScene': {
      const scene = s.scenes.shift()!;
      if (scene === 'n1.ramen') {
        const i = s.seats.findIndex((x) => x && x !== 'dirty' && x.sp === 'tutorialA');
        if (i >= 0) {
          s.seats[i] = 'dirty';
          nt.stats.served++;
          nt.stats.satisfied++;
        }
      }
      break;
    }
  }
}

/** Last part of an action, after its ticks: experiment results, arcs, dawn. */
export function finish(s: GameState, a: Action, C: Content): void {
  if (a.t === 'experiment') {
    const b = s.burners.findIndex((d) => d?.exp && d.rt === s.nt.tick && !d.ok === false && true);
    const idx = b >= 0 ? b : s.burners.findIndex((d) => d?.exp);
    const d = idx >= 0 ? s.burners[idx] : null;
    if (d) {
      d.exp = false;
      if (d.fail) {
        s.burners[idx] = null;
        addSediment(s, C, 1, true);
      } else if (!s.known.includes(d.r)) {
        s.known.push(d.r);
        s.scenes.push(`recipe.learned:${d.r}`);
      }
    }
  }
  if (s.phase === 'night' || s.phase === 'day') checkArc(s, C);
  if (s.phase === 'night' && s.nt.tick >= dawnTick(s)) dawn(s, C);
}

export type ApplyResult = { ok: true; state: GameState; cost: number } | { ok: false; code: string };

/** Pure helper: clone, resolve, begin, ticks, finish. Used by bots and tests. */
export function apply(s0: GameState, a: Action, C: Content, opts: ModelOptions = DEFAULT_OPTIONS): ApplyResult {
  const r = resolve(s0, a, C);
  if (!r.ok) return r;
  const s = structuredClone(s0);
  begin(s, a, C, r.cost, opts);
  for (let i = 0; i < r.cost; i++) advanceTick(s, C);
  finish(s, a, C);
  return { ok: true, state: s, cost: r.cost };
}

/** In-place variant for fast simulations (caller owns `s`). */
export function applyInPlace(s: GameState, a: Action, C: Content, opts: ModelOptions): Resolution {
  const r = resolve(s, a, C);
  if (!r.ok) return r;
  begin(s, a, C, r.cost, opts);
  for (let i = 0; i < r.cost; i++) advanceTick(s, C);
  finish(s, a, C);
  return r;
}
