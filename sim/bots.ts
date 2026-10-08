// Headless player policies for the simulation sweeps (Q14, Q26, Q37/Q50).
import {
  addSediment as _unused,
  applyInPlace,
  canCookNow,
  dishFeelings,
  freshStage,
  isStoveCell,
  neighbors,
  paletteTotal,
  resolve,
  sedimentAvailable,
  tremorCandidates,
  type Action,
  type Content,
  type GameState,
  type Guest,
  type Jar,
  type Kind,
  type ModelOptions,
} from '../src/model/index.js';

void _unused;
export const FAST: ModelOptions = { checkpoints: false, log: false };

export interface KeepSpec {
  kind: Kind;
  n: number;
  pure?: boolean;
}

export interface Policy {
  name: string;
  noise: number;
  rng: () => number;
  acceptVow: (s: GameState, id: string) => boolean;
  keep: (s: GameState, C: Content) => KeepSpec[];
  keepSediment: (s: GameState) => number;
  /** Collection of keep targets outranks serving on these nights. */
  collectFirst: (s: GameState) => boolean;
  shopping: (s: GameState, C: Content) => Action[];
  day: (s: GameState, C: Content) => Action[];
  special: (s: GameState, C: Content) => Action | null;
  forbidSparks?: boolean;
  minFree?: (s: GameState) => number;
}

export function rngOf(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

function ok(s: GameState, C: Content, a: Action): boolean {
  return resolve(s, a, C).ok;
}

/** Reserve shelf cells for keep targets (pure-required specs first). */
export function reservedCells(s: GameState, specs: KeepSpec[]): Set<number> {
  const res = new Set<number>();
  const ordered = [...specs].sort((a, b) => Number(!!b.pure) - Number(!!a.pure));
  for (const spec of ordered) {
    let need = spec.n;
    const cells = s.shelf
      .map((j, i) => ({ j, i }))
      .filter(({ j, i }) => j && j.k === spec.kind && !res.has(i) && (!spec.pure || j.p))
      .sort((a, b) => Number(b.j!.p) - Number(a.j!.p) || b.j!.a - a.j!.a);
    for (const { i } of cells) {
      if (need <= 0) break;
      res.add(i);
      need--;
    }
  }
  return res;
}

export function missingKeep(s: GameState, specs: KeepSpec[]): KeepSpec[] {
  const res = new Set<number>();
  const out: KeepSpec[] = [];
  const ordered = [...specs].sort((a, b) => Number(!!b.pure) - Number(!!a.pure));
  for (const spec of ordered) {
    let have = 0;
    s.shelf.forEach((j, i) => {
      if (have < spec.n && j && j.k === spec.kind && !res.has(i) && (!spec.pure || j.p)) {
        res.add(i);
        have++;
      }
    });
    if (s.tray && s.tray.k === spec.kind && (!spec.pure || s.tray.p) && have < spec.n) have++;
    if (have < spec.n) out.push({ ...spec, n: spec.n - have });
  }
  return out;
}

function seated(s: GameState): { seat: number; g: Guest }[] {
  const out: { seat: number; g: Guest }[] = [];
  s.seats.forEach((x, seat) => {
    if (x && x !== 'dirty') out.push({ seat, g: x });
  });
  return out;
}

function ingredientNeeds(C: Content, recipe: string): string[] {
  const out: string[] = [];
  for (const [k, n] of Object.entries(C.recipes.recipes[recipe]!.ingredients))
    if (!['sediment', 'empty_gold', 'thread', 'story'].includes(k)) for (let i = 0; i < n; i++) out.push(k);
  return out;
}

function acc(C: Content, k: string): Kind[] {
  return C.feelings.ingredientAccepts[k] ?? [k as Kind];
}

/** Pick cells for a recipe avoiding reserved cells. */
export function pickFree(s: GameState, C: Content, recipe: string, reserved: Set<number>): number[] | null {
  const used = new Set<number>();
  const out: number[] = [];
  for (const k of ingredientNeeds(C, recipe)) {
    let best = -1;
    s.shelf.forEach((j, i) => {
      if (!j || used.has(i) || reserved.has(i) || j.k === 'sediment' || !acc(C, k).includes(j.k)) return;
      if (best < 0 || (j.p && !s.shelf[best]!.p)) best = i;
    });
    if (best < 0) return null;
    used.add(best);
    out.push(best);
  }
  return out;
}

function missingFor(s: GameState, C: Content, recipe: string, reserved: Set<number>): Kind[] {
  const used = new Set<number>();
  const miss: Kind[] = [];
  for (const k of ingredientNeeds(C, recipe)) {
    const i = s.shelf.findIndex(
      (j, idx) => j && !used.has(idx) && !reserved.has(idx) && j.k !== 'sediment' && acc(C, k).includes(j.k),
    );
    if (i >= 0) used.add(i);
    else miss.push(acc(C, k)[0]!);
  }
  return miss;
}

function orderRecipes(s: GameState, C: Content, ord: string): string[] {
  const out: string[] = [];
  for (const id of s.known) {
    const r = C.recipes.recipes[id]!;
    if (r.story) continue;
    if (ord !== 'any' && !dishFeelings(C, id).includes(ord)) continue;
    if (Object.keys(r.ingredients).some((k) => ['sediment', 'empty_gold', 'thread', 'story'].includes(k))) continue;
    out.push(id);
  }
  const main = C.guests.orderRecipes[ord];
  return out.sort((a, b) => Number(b === main) - Number(a === main) || ingredientNeeds(C, a).length - ingredientNeeds(C, b).length);
}

function matches(C: Content, recipe: string, g: Guest): boolean {
  return g.ord === 'any' || dishFeelings(C, recipe).includes(g.ord);
}

function heatAction(s: GameState, C: Content, reserved: Set<number>, P: Policy, need: number): Action | null {
  if (s.nt.heat >= need) return null;
  const keepSed = P.keepSediment(s);
  if (sedimentAvailable(s) > keepSed) {
    const stack = s.shelf.findIndex((j) => j?.k === 'sediment');
    if (stack >= 0) return { t: 'burn', from: stack };
    if (s.silence > 0) return { t: 'burn', from: 'silence' };
  }
  if (!s.nt.angerBurned) {
    const a = s.shelf.findIndex((j, i) => j?.k === 'anger' && !reserved.has(i));
    if (a >= 0 && need - s.nt.heat <= 1) return { t: 'burn', from: a };
  }
  return ok(s, C, { t: 'kupa' }) ? { t: 'kupa' } : null;
}

function nextArrivalSoon(s: GameState): boolean {
  return s.nt.sched.some((e) => !e.done);
}

/** One night decision. */
export function decide(s: GameState, C: Content, P: Policy): Action {
  if (s.scenes.length) return { t: 'ackScene' };
  if (s.offers.length) return { t: 'vow', id: s.offers[0]!, accept: P.acceptVow(s, s.offers[0]!) };
  const keep = P.keep(s, C);
  const reserved = reservedCells(s, keep);
  // Hygiene: tray → free cell; young joy away from the stove.
  if (s.tray) {
    const free = s.shelf.findIndex((j, i) => !j && !isStoveCell(i));
    const any = free >= 0 ? free : s.shelf.findIndex((j) => !j);
    if (any >= 0) return { t: 'move', from: 'tray', to: any };
    return { t: 'burn', from: 'tray' };
  }
  for (const [i, j] of s.shelf.entries()) {
    if (j?.k === 'joy' && isStoveCell(i)) {
      const target = s.shelf.findIndex((x, k) => !isStoveCell(k) && (!x || (x.k !== 'joy' && x.k !== 'tremor')));
      if (target >= 0) return { t: 'move', from: i, to: target };
    }
  }
  const special = P.special(s, C);
  if (special && ok(s, C, special)) return special;
  // Tidy: keep free cells by burning surplus jars (never reserved ones).
  const freeCells = s.shelf.filter((j) => !j).length;
  if (freeCells < (P.minFree?.(s) ?? 1)) {
    const needed = new Set<string>();
    for (const { g } of seated(s)) for (const r of orderRecipes(s, C, g.ord).slice(0, 1)) ingredientNeeds(C, r).forEach((k) => acc(C, k).forEach((x) => needed.add(x)));
    const victims = s.shelf
      .map((j, i) => ({ j, i }))
      .filter(({ j, i }) => j && !reserved.has(i) && j.k !== 'sediment')
      .sort((a, b) => Number(needed.has(a.j!.k)) - Number(needed.has(b.j!.k)) || Number(a.j!.p) - Number(b.j!.p) || b.j!.a - a.j!.a);
    if (victims.length) return { t: 'burn', from: victims[0]!.i };
    const sed = s.shelf.findIndex((j) => j?.k === 'sediment');
    if (sed >= 0 && sedimentAvailable(s) > P.keepSediment(s)) return { t: 'burn', from: sed };
  }

  const cands: Action[] = [];
  const guests = seated(s).filter(({ g }) => !g.out || true);
  const urgent = [...guests].sort((a, b) => a.g.pat - b.g.pat);
  // 1. Free serves.
  for (const [b, d] of s.burners.entries()) {
    if (!d?.ok || d.r === 'pryazhenets' || d.r === 'memory_pie') continue;
    const hit = urgent.find(({ g }) => matches(C, d.r, g));
    if (hit && ok(s, C, { t: 'serve', burner: b, to: hit.seat }) && freshStage(s, C, d) === 0)
      cands.push({ t: 'serve', burner: b, to: hit.seat });
  }
  if (s.nt.nameless === 1) {
    const b = s.burners.findIndex((d) => d?.ok && d.r === C.guests.nameless.accepts);
    if (b >= 0 && ok(s, C, { t: 'serve', burner: b, to: 'nameless' })) cands.push({ t: 'serve', burner: b, to: 'nameless' });
  }
  // 2. Door guest waits behind a dirty seat.
  const dirty = s.seats.findIndex((x) => x === 'dirty');
  if (s.door && dirty >= 0) cands.push({ t: 'clean', seat: dirty });
  // 3. Paid serves of matching dishes.
  for (const [b, d] of s.burners.entries()) {
    if (!d?.ok || d.r === 'pryazhenets' || d.r === 'memory_pie') continue;
    const hit = urgent.find(({ g }) => !g.out && matches(C, d.r, g));
    if (hit && ok(s, C, { t: 'serve', burner: b, to: hit.seat })) cands.push({ t: 'serve', burner: b, to: hit.seat });
  }
  // Collect-first nights.
  const missing = missingKeep(s, keep);
  const listenFor = (kinds: Kind[]): Action | null => {
    for (const k of kinds)
      for (const { seat, g } of urgent)
        if (!g.out && (g.pal[k] ?? 0) > 0 && paletteTotal(g) > 1) {
          const a: Action = { t: 'listen', seat, kind: k, warm: true };
          if (ok(s, C, a)) return a;
        }
    return null;
  };
  if (P.collectFirst(s) && missing.length) {
    const a = listenFor(missing.map((m) => m.kind));
    if (a) cands.push(a);
  }
  // 4. Cook for uncovered orders.
  const covered = new Set<number>();
  for (const d of s.burners) {
    if (!d) continue;
    const g = urgent.find(({ g: x }) => !covered.has(x.id) && matches(C, d.r, x));
    if (g) covered.add(g.g.id);
  }
  const uncovered = urgent.filter(({ g }) => !covered.has(g.id) && !g.out);
  const burnerFree = s.burners.some((d) => d === null);
  const listenNeeds: Kind[] = [];
  if (burnerFree) {
    for (const { g } of uncovered) {
      let planned = false;
      for (const recipe of orderRecipes(s, C, g.ord)) {
        const cells = pickFree(s, C, recipe, reserved);
        if (!cells) continue;
        const r = C.recipes.recipes[recipe]!;
        if (s.nt.heat < r.heat) {
          if (s.water > 0) {
            const a: Action = { t: 'cook', recipe, cells, water: true };
            if (ok(s, C, a)) cands.push(a);
          } else {
            const h = heatAction(s, C, reserved, P, r.heat);
            if (h) cands.push(h);
          }
        } else {
          const a: Action = { t: 'cook', recipe, cells };
          if (ok(s, C, a)) cands.push(a);
        }
        planned = true;
        break;
      }
      if (!planned) {
        const recipe = orderRecipes(s, C, g.ord)[0];
        if (recipe) listenNeeds.push(...missingFor(s, C, recipe, reserved));
      }
    }
  }
  // Nameless: empty shchi if gold allows.
  if (s.nt.nameless === 1 && s.gold >= 2 && burnerFree && s.known.includes(C.guests.nameless.accepts) && s.night < 12) {
    const a: Action = { t: 'cook', recipe: C.guests.nameless.accepts };
    if (ok(s, C, a)) cands.push(a);
  }
  // 5. Listen for missing ingredients.
  const la = listenFor(listenNeeds);
  if (la) cands.push(la);
  if (missing.length) {
    const a = listenFor(missing.map((m) => m.kind));
    if (a) cands.push(a);
  }
  // 6. Clean if someone may come.
  if (dirty >= 0 && (nextArrivalSoon(s) || s.door)) cands.push({ t: 'clean', seat: dirty });
  // 7. Sated serve for guests about to leave.
  for (const [b, d] of s.burners.entries()) {
    if (!d?.ok || d.r === 'pryazhenets' || d.r === 'memory_pie' || d.r === C.guests.nameless.accepts) continue;
    const leaving = urgent.find(({ g }) => g.pat <= C.nights.patience.quarters * 1);
    if (leaving && ok(s, C, { t: 'serve', burner: b, to: leaving.seat })) cands.push({ t: 'serve', burner: b, to: leaving.seat });
  }
  // 8. Discard a useless cold dish blocking the only burner.
  if (!burnerFree && uncovered.length) {
    const b = s.burners.findIndex((d) => d?.ok && d.r !== 'pryazhenets' && d.r !== 'memory_pie' && !urgent.some(({ g }) => matches(C, d.r, g)));
    if (b >= 0) cands.push({ t: 'discardDish', burner: b });
  }
  const valid = cands.filter((a) => ok(s, C, a));
  if (valid.length) {
    if (P.noise > 0 && valid.length > 1 && P.rng() < P.noise) return valid[Math.floor(P.rng() * Math.min(3, valid.length))]!;
    return valid[0]!;
  }
  if (ok(s, C, { t: 'endNight' }) && !s.burners.some((d) => d && !d.ok)) return { t: 'endNight' };
  if (ok(s, C, { t: 'wait' })) return { t: 'wait' };
  // Cannot wait past dawn: refuse remaining guests or end.
  if (ok(s, C, { t: 'endNight' })) return { t: 'endNight' };
  const g = guests[0];
  if (g) return { t: 'refuse', seat: g.seat };
  if (s.door) return { t: 'refuse', seat: 'door' };
  return { t: 'wait' };
}

export function dayActions(s: GameState, C: Content, P: Policy): Action[] {
  return [...P.shopping(s, C), ...P.day(s, C)];
}

export interface NightResult {
  night: number;
  satisfied: number;
  served: number;
  arrived: number;
  ordinary: number;
  thirdTick: number | null;
  lastTick: number;
  sparks: number;
  actions: number;
}

/** Play the current night to dawn. Returns per-night metrics. */
export function playNight(s: GameState, C: Content, P: Policy, trace?: Action[]): NightResult {
  const night = s.night;
  let thirdTick: number | null = null;
  let guard = 0;
  while (s.phase === 'night' && s.night === night) {
    if (++guard > 500) throw new Error(`bot stuck night ${night} seed ${s.seed}`);
    const a = decide(s, C, P);
    const before = s.nt.stats.satisfied;
    const r = applyInPlace(s, a, C, FAST);
    if (!r.ok) throw new Error(`bot illegal ${JSON.stringify(a)} ${r.code} night ${night} seed ${s.seed}`);
    trace?.push(a);
    if (s.phase === 'night' && s.nt.stats.satisfied >= 3 && before < 3) thirdTick = s.nt.tick;
  }
  const st = s.report?.stats ?? s.nt.stats;
  if (thirdTick === null && st.satisfied >= 3) thirdTick = st.lastServeTick;
  return {
    night,
    satisfied: st.satisfied,
    served: st.served,
    arrived: st.arrived,
    ordinary: st.arrived,
    thirdTick,
    lastTick: st.lastServeTick,
    sparks: st.sparks,
    actions: guard,
  };
}

export function playDay(s: GameState, C: Content, P: Policy, trace?: Action[]): void {
  let guard = 0;
  while (s.phase === 'day') {
    if (++guard > 200) throw new Error('day stuck');
    if (s.scenes.length) {
      applyInPlace(s, { t: 'ackScene' }, C, FAST);
      trace?.push({ t: 'ackScene' });
      continue;
    }
    let did = false;
    for (const a of dayActions(s, C, P)) {
      if (ok(s, C, a)) {
        applyInPlace(s, a, C, FAST);
        (a as Action & { onDone?: () => void }).onDone?.();
        trace?.push(JSON.parse(JSON.stringify(a)) as Action);
        did = true;
        break;
      }
    }
    if (did) continue;
    const special = P.special(s, C);
    if (special && ok(s, C, special)) {
      applyInPlace(s, special, C, FAST);
      trace?.push(special);
      continue;
    }
    if (P.forbidSparks) s.sparks = 0;
    if (P.forbidSparks) s.keys = 0;
    applyInPlace(s, { t: 'nextNight' }, C, FAST);
    trace?.push({ t: 'nextNight' });
  }
}

export function canTremor(s: GameState, C: Content): boolean {
  return tremorCandidates(s, C).length > 0;
}

export function jarAt(s: GameState, i: number): Jar | null {
  return s.shelf[i] ?? null;
}

export { neighbors, canCookNow };
