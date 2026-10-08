import {
  dawnTick,
  isStoveCell,
  neighbors,
  sedimentAvailable,
  type Action,
  type Content,
  type GameState,
  type Kind,
  type World,
} from '../src/model/index.js';
import { reservedCells, rngOf, type KeepSpec, type Policy } from './bots.js';

const TUTORIAL_VOWS = ['v1', 'v2', 'v3'];

export interface PolicyOptions {
  seed: number;
  noise?: number;
  line?: 'none' | 'first' | World;
  buyDoubleBurner?: boolean;
  forbidSparks?: boolean;
}

function shopper(opts: PolicyOptions, order: string[], storyFloor: (s: GameState) => number) {
  let lastBuyNight = -1;
  return (s: GameState, C: Content): Action[] => {
    if (opts.forbidSparks) return [];
    const out: Action[] = [];
    if (lastBuyNight !== s.night) {
      for (const item of order) {
        const price = C.economy.prices[item]!;
        if (item === 'silence_jar' && order.indexOf('mittens') >= 0 && order.indexOf('mittens') < order.indexOf('silence_jar') && !s.up.includes('mittens')) continue;
        if (item === 'silence_jar' && s.stories - (price.stories ?? 99) >= storyFloor(s))
          out.push({ t: 'buy', item, pay: 'stories' });
        out.push({ t: 'buy', item });
      }
    }
    // Only one purchase per Межсветье (PM model): the wrapper marks the night when one succeeds.
    return out.map((a) => {
      const wrapped = a as Action & { onDone?: () => void };
      wrapped.onDone = () => (lastBuyNight = s.night);
      return wrapped;
    });
  };
}

function tramDay(opts: PolicyOptions) {
  return (s: GameState): Action[] => {
    if (!opts.line || opts.line === 'none' || s.tarot) return [];
    const want = opts.line === 'first' ? (s.doors[0] ?? null) : s.doors.includes(opts.line) ? opts.line : null;
    return want && s.line !== want ? [{ t: 'tram', line: want }] : [];
  };
}

export function averagePolicy(opts: PolicyOptions): Policy {
  const shop = shopper(opts, ['shelf', 'mittens', 'silence_jar', 'chair', ...(opts.buyDoubleBurner ? ['double_burner'] : [])], () => 2);
  const tram = tramDay(opts);
  return {
    name: 'average',
    noise: opts.noise ?? 0,
    rng: rngOf(opts.seed * 7919 + 13),
    acceptVow: (_s, id) => TUTORIAL_VOWS.includes(id),
    keep: () => [],
    keepSediment: () => 0,
    collectFirst: () => false,
    shopping: shop,
    day: (s) => tram(s),
    special: () => null,
    forbidSparks: opts.forbidSparks,
  };
}

export function letterPolicy(opts: PolicyOptions): Policy {
  return { ...averagePolicy(opts), name: 'letter' };
}

export function woundPolicy(opts: PolicyOptions): Policy {
  const base = averagePolicy(opts);
  return {
    ...base,
    name: 'wound',
    day: (s, C) => {
      const out = base.day(s, C);
      if (s.keys === 0 && !s.flags.mirrorTraded && s.stories >= C.economy.mirrorTrade.stories && s.night >= 9)
        out.unshift({ t: 'mirrorTrade' });
      return out;
    },
    special: (s, C) => (s.phase === 'night' && s.night === C.endings.finalNight && s.keys > 0 ? { t: 'windFinal' } : null),
  };
}

function pieSpecial(s: GameState, C: Content): Action | null {
  if (s.phase !== 'night' || s.night !== C.endings.finalNight || s.flags.pieServed) return null;
  const pieB = s.burners.findIndex((d) => d?.r === 'memory_pie');
  if (pieB >= 0) {
    if (s.burners[pieB]!.ok && s.nt.nameless === 1) return { t: 'serve', burner: pieB, to: 'nameless' };
    return null;
  }
  const midnight = C.nights.events.midnight + s.nt.shift;
  if (s.nt.tick < midnight - 2 && s.nt.nameless !== 1) return null;
  if (s.burners.every((d) => d !== null)) {
    const b = s.burners.findIndex((d) => d?.ok);
    if (b >= 0) return { t: 'discardDish', burner: b };
    return null;
  }
  if (s.nt.heat < 1) {
    const sed = s.shelf.findIndex((j) => j?.k === 'sediment');
    if (sed >= 0) return { t: 'burn', from: sed };
    return { t: 'kupa' };
  }
  return { t: 'cook', recipe: 'memory_pie' };
}

export function rememberPolicy(opts: PolicyOptions): Policy {
  const base = averagePolicy(opts);
  const shop = shopper(opts, ['shelf', 'mittens', 'silence_jar', 'chair'], (s) => (s.night >= 9 ? 3 : 2));
  return {
    ...base,
    name: 'remember',
    shopping: shop,
    keep: (s) => (s.night >= 11 ? [{ kind: 'nostalgia', n: 2 }] : []),
    collectFirst: (s) => s.night >= 12,
    special: pieSpecial,
  };
}

const PRYA_KINDS: Kind[] = ['hope', 'amber', 'anger', 'fear', 'nostalgia', 'loneliness', 'tremor'];

function has(s: GameState, k: Kind, pure = false): number {
  return s.shelf.filter((j) => j && j.k === k && (!pure || j.p)).length;
}

function prjCooked(s: GameState): boolean {
  return s.flags.guardian || s.burners.some((d) => d?.r === 'pryazhenets');
}

function springKeep(s: GameState): KeepSpec[] {
  const n = s.night;
  const specs: KeepSpec[] = [];
  if (prjCooked(s)) return n >= 11 ? [{ kind: 'nostalgia', n: 2 }] : [];
  if (n >= 5) {
    specs.push(has(s, 'amber') ? { kind: 'amber', n: 1 } : { kind: 'joy', n: 1 });
    specs.push(has(s, 'hope') ? { kind: 'hope', n: 1 } : { kind: 'sadness', n: 1 });
  }
  if (n >= 8) specs.push({ kind: 'anger', n: 1 }, { kind: 'nostalgia', n: 1 }, { kind: 'fear', n: 1 });
  if (n >= 10) specs.push({ kind: 'loneliness', n: 1 });
  if (has(s, 'tremor')) specs.push({ kind: 'tremor', n: 1 });
  else if (n >= 9 && n <= 10) specs.push({ kind: 'joy', n: 1, pure: true }, { kind: 'fear', n: 1, pure: true });
  return specs;
}

/** Day plan: protect amber joy, line up a pure young joy with a pure fear for the merge. */
function springDay(s: GameState, C: Content): Action[] {
  const out: Action[] = [];
  const next = s.night + 1;
  if (next < C.feelings.tremorMerge.fromNight) return [];
  const joys = s.shelf
    .map((j, i) => ({ j, i }))
    .filter(({ j }) => j?.k === 'joy')
    .sort((a, b) => b.j!.a - a.j!.a);
  const needTremor = !has(s, 'tremor') && next <= 11;
  let pairs: [number, number][] = [];
  if (needTremor) {
    // Oldest joy is the amber candidate unless amber already exists.
    const amberDone = has(s, 'amber') > 0;
    const cands = joys.filter(({ j }, idx) => j!.p && j!.a <= C.feelings.tremorMerge.maxJoyAge && (amberDone || idx > 0 || joys.length > 1 ? true : false));
    const pick = amberDone ? cands[0] : cands.find((c) => c !== joys[0]);
    if (pick) {
      const fears = s.shelf.map((j, i) => ({ j, i })).filter(({ j }) => j?.k === 'fear' && j.p);
      if (fears.length >= 2 || (fears.length >= 1 && has(s, 'fear') >= 2)) {
        const adj = neighbors(pick.i, s.cols);
        const near = fears.find(({ i }) => adj.includes(i));
        if (near) pairs = [[pick.i, near.i]];
        else {
          const slot = adj.find((i) => !s.shelf[i] || (s.shelf[i]!.k !== 'joy' && s.shelf[i]!.k !== 'amber' && s.shelf[i]!.k !== 'tremor'));
          if (slot !== undefined) return [{ t: 'move', from: fears[0]!.i, to: slot }];
        }
      }
    }
  }
  const cur = JSON.stringify(s.tremorPairs);
  if (cur !== JSON.stringify(pairs)) out.push({ t: 'tremorPairs', pairs });
  return out;
}

function springSpecial(s: GameState, C: Content): Action | null {
  if (s.phase !== 'night') return null;
  if (s.night === C.endings.finalNight) return pieSpecial(s, C);
  if (s.night !== 11 || prjCooked(s)) return null;
  const dawn = dawnTick(s);
  const late = s.nt.tick >= dawn - 4;
  const reserved = reservedCells(s, springKeep(s));
  const spare = s.shelf.map((j, i) => ({ j, i })).filter(({ j, i }) => j && j.k !== 'sediment' && !reserved.has(i));
  if (late && (s.mut < C.sediment.mutGate || sedimentAvailable(s) < 3)) {
    if (spare.length >= 2) return { t: 'condense', cells: [spare[0]!.i, spare[1]!.i] };
    const g = s.seats.findIndex((x) => x && x !== 'dirty');
    if (g >= 0) return { t: 'refuse', seat: g };
    if (s.door) return { t: 'refuse', seat: 'door' };
  }
  if (!late) return null;
  if (!PRYA_KINDS.every((k) => has(s, k) > 0)) return null;
  if (s.burners.every((d) => d !== null)) {
    const b = s.burners.findIndex((d) => d?.ok);
    return b >= 0 ? { t: 'discardDish', burner: b } : null;
  }
  if (s.nt.heat < 2) {
    if (sedimentAvailable(s) > 3) {
      const sed = s.shelf.findIndex((j) => j?.k === 'sediment');
      return sed >= 0 ? { t: 'burn', from: sed } : { t: 'burn', from: 'silence' };
    }
    return { t: 'kupa' };
  }
  return { t: 'cook', recipe: 'pryazhenets' };
}

export function newSpringPolicy(opts: PolicyOptions): Policy {
  const base = averagePolicy(opts);
  const order = opts.buyDoubleBurner ? ['shelf', 'silence_jar', 'double_burner', 'mittens', 'chair'] : ['shelf', 'silence_jar', 'mittens', 'chair'];
  return {
    ...base,
    name: 'new_spring',
    shopping: shopper(opts, order, (s) => (s.night >= 10 ? 2 : 0)),
    keep: springKeep,
    keepSediment: (s) => (s.night >= 9 ? 3 : 0),
    minFree: (s) => (s.night >= 5 ? 2 : 1),
    collectFirst: (s) => s.night >= 9,
    day: (s, C) => [...springDay(s, C), ...base.day(s, C)],
    special: springSpecial,
  };
}

export const POLICIES = {
  letter: letterPolicy,
  wound: woundPolicy,
  remember: rememberPolicy,
  new_spring: newSpringPolicy,
} as const;
export type Route = keyof typeof POLICIES;

export { isStoveCell };
