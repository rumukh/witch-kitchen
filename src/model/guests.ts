import type { Content, Kind, World } from './content.js';
import type { Dish, GameState, Guest, ScheduleEntry } from './types.js';
import { addSediment, dishFeelings, floorStep, freshStage, gainHeat } from './shelf.js';
import { paletteFor } from './schedule.js';
import { vowOnLeave, vowOnServe } from './vows.js';

export function storyIds(C: Content, w: World): string[] {
  return Array.from({ length: C.economy.storiesPerWorld }, (_, i) => `${w}.${i + 1}`);
}

export function storyComplete(s: GameState, C: Content, id: string): boolean {
  return (s.col[id] ?? 0) > C.economy.fragmentsPerStory;
}

export function completeStories(s: GameState, C: Content, w: World): number {
  return storyIds(C, w).filter((id) => storyComplete(s, C, id)).length;
}

function presentGuests(s: GameState): Guest[] {
  const out: Guest[] = [];
  for (const x of s.seats) if (x && x !== 'dirty') out.push(x);
  if (s.door) out.push(s.door);
  return out;
}

function assignStory(s: GameState, C: Content, w: World, u: number): string {
  const reserved = new Set(presentGuests(s).map((g) => g.st));
  const ids = storyIds(C, w);
  const next = ids.find((id) => !storyComplete(s, C, id) && !reserved.has(id));
  return next ?? ids[Math.floor(u * ids.length)]!;
}

export function chooseOrder(s: GameState, C: Content, g: Guest, u: number): string {
  if (g.sp) {
    const o = C.guests.special[g.sp]?.order;
    if (g.sp === 'dubodyor') return 'anger';
    if (o) return o;
  }
  const options: [string, number][] = [];
  for (const [k, n] of Object.entries(g.pal)) {
    const rec = C.guests.orderRecipes[k];
    if (rec && s.known.includes(rec) && n) options.push([k, n]);
  }
  if (options.length === 0) return 'any';
  const total = options.reduce((a, [, n]) => a + n, 0);
  let x = u * total;
  for (const [k, n] of options) {
    if (x < n) return k;
    x -= n;
  }
  return options[options.length - 1]![0];
}

export function makeGuest(s: GameState, C: Content, e: ScheduleEntry): Guest {
  const sp = e.sp ? C.guests.special[e.sp] : null;
  const candle = sp?.candle ?? C.guests.worlds[e.w].candle;
  const ticks = Math.max(1, Math.round(candle * C.nights.modes[s.mode].patienceMult));
  const pat = ticks * C.nights.patience.quarters * (sp?.candleMult ?? 1);
  const isStory = e.sp !== null && !['tutorialA', 'tutorialB'].includes(e.sp);
  return {
    id: ++s.gid,
    w: e.w,
    sp: e.sp,
    pal: paletteFor(C, e.w, s.night),
    ord: 'any',
    pat,
    pat0: pat,
    arr: s.nt.tick,
    out: false,
    st: isStory ? null : assignStory(s, C, e.w, e.u),
    fr: 0,
    dw: 0,
    u: e.u,
  };
}

export function seatGuest(s: GameState, C: Content, g: Guest): boolean {
  const seat = s.seats.findIndex((x) => x === null);
  if (seat < 0) return false;
  g.ord = chooseOrder(s, C, g, g.u);
  s.seats[seat] = g;
  return true;
}

export function arrive(s: GameState, C: Content, e: ScheduleEntry): void {
  e.done = true;
  const g = makeGuest(s, C, e);
  s.nt.stats.arrived++;
  if (seatGuest(s, C, g)) return;
  if (!s.door) {
    s.door = g;
    return;
  }
  s.nt.stats.turnedAway++;
  unhappyOutcome(s, C, g);
}

export function seatFromDoor(s: GameState, C: Content): void {
  if (s.door && seatGuest(s, C, s.door)) s.door = null;
}
function addHalves(s: GameState, C: Content, n: number): void {
  s.halves += n;
  s.nt.stats.halves += n;
  while (s.halves >= C.economy.halvesPerStory) {
    s.halves -= C.economy.halvesPerStory;
    s.stories++;
  }
}

/** Refused, dead candle, turned away, or left at dawn (§6.7). */
export function unhappyOutcome(s: GameState, C: Content, g: Guest): void {
  s.nt.stats.unhappy++;
  addSediment(s, C, C.guests.unhappy.sediment, true);
  if (g.st) addHalves(s, C, C.guests.unhappy.storyHalves);
  vowOnLeave(s, C, g, false);
}

export function overdrawnOutcome(s: GameState, C: Content, g: Guest): void {
  s.nt.stats.overdrawn++;
  s.gold += C.guests.overdrawn.emptyGold;
  addSediment(s, C, C.guests.overdrawn.sediment, true);
  vowOnLeave(s, C, g, false);
}

export function removeGuest(s: GameState, g: Guest): void {
  const i = s.seats.indexOf(g);
  if (i >= 0) s.seats[i] = 'dirty';
  else if (s.door === g) s.door = null;
}

export interface ServeResult {
  satisfied: boolean;
  quality: number;
  stage: number;
  sparks: number;
  story: 'full' | 'half' | 'none';
}

export function serveOutcome(s: GameState, C: Content, g: Guest, d: Dish): ServeResult {
  const stage = freshStage(s, C, d);
  const reverse = C.guests.worlds[g.w].reverseFreshness && !g.sp;
  const fresh = (reverse ? C.recipes.freshness.reverse : C.recipes.freshness.values)[stage]!;
  const quality = Math.max(C.recipes.qualityMin, floorStep((d.pur * fresh) / 100, C.recipes.qualityStep));
  const satisfied = g.ord === 'any' || dishFeelings(C, d.r).includes(g.ord);
  let sparks = 0;
  const wd = C.guests.worlds[g.w];
  if (wd.pay === 'sparks') {
    sparks = C.economy.citySparks[String(quality)] ?? 0;
    if (!satisfied) sparks = Math.floor(sparks * C.economy.satedPayFactor);
  }
  if (satisfied) sparks += wd.tips;
  if (s.doors.includes('city') && sparks > 0)
    sparks = Math.floor((sparks * (100 + C.economy.doors.city.sparksBonusPercent)) / 100);
  let story: ServeResult['story'] = 'none';
  if (satisfied && g.st) story = quality >= C.economy.fullStoryMinQuality ? 'full' : 'half';
  return { satisfied, quality, stage, sparks, story };
}

/** Apply serving a dish to a seated guest: payment, story, vows; the guest leaves. */
export function serveGuest(s: GameState, C: Content, g: Guest, d: Dish): ServeResult {
  const r = serveOutcome(s, C, g, d);
  const wd = C.guests.worlds[g.w];
  s.sparks += r.sparks;
  s.nt.stats.sparks += r.sparks;
  if (wd.pay === 'wood') gainHeat(s, C, 1);
  if (wd.pay === 'water') s.water = Math.min(C.nights.start.waterMax, s.water + 1);
  if (wd.pay === 'story' && r.satisfied) {
    let n = 1;
    if (s.doors.includes('memorial')) n += C.economy.doors.memorial.storyPerSatisfied;
    s.stories += n;
    s.nt.stats.stories += n;
  }
  if (r.story === 'full' && g.st) {
    s.col[g.st] = C.economy.fragmentsPerStory + 1;
    s.stories++;
    s.nt.stats.stories++;
    checkDoor(s, C, g.w);
  } else if (r.story === 'half') addHalves(s, C, 1);
  s.nt.stats.served++;
  if (r.satisfied) s.nt.stats.satisfied++;
  else s.nt.stats.sated++;
  s.nt.stats.lastServeTick = s.nt.tick;
  vowOnServe(s, C, g, d, r.quality, r.stage);
  removeGuest(s, g);
  vowOnLeave(s, C, g, r.satisfied);
  return r;
}

export function checkDoor(s: GameState, C: Content, w: World): void {
  if (s.doors.includes(w)) return;
  if (completeStories(s, C, w) >= C.economy.doors.storiesToOpen) {
    s.doors.push(w);
    s.scenes.push(`door.open:${w}`);
  }
}

export function paletteTotal(g: Guest): number {
  return Object.values(g.pal).reduce((a, n) => a + (n ?? 0), 0);
}

export function takeFromPalette(g: Guest, k: Kind): boolean {
  const n = g.pal[k] ?? 0;
  if (n <= 0) return false;
  if (n === 1) delete g.pal[k];
  else g.pal[k] = n - 1;
  return true;
}

export function seatedGuests(s: GameState): { seat: number; g: Guest }[] {
  const out: { seat: number; g: Guest }[] = [];
  s.seats.forEach((x, seat) => {
    if (x && x !== 'dirty') out.push({ seat, g: x });
  });
  return out;
}
