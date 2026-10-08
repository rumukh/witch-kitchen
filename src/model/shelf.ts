import type { Content, Kind } from './content.js';
import type { Dish, GameState, Jar, Loc } from './types.js';

export function cellCount(s: GameState): number {
  return s.cols * 2;
}

export function neighbors(i: number, cols: number): number[] {
  const col = Math.floor(i / 2);
  const row = i % 2;
  const out = [col * 2 + (1 - row)];
  if (col > 0) out.push((col - 1) * 2 + row);
  if (col < cols - 1) out.push((col + 1) * 2 + row);
  return out.sort((a, b) => a - b);
}

export function isStoveCell(i: number): boolean {
  return Math.floor(i / 2) === 0;
}

export function getLoc(s: GameState, loc: Loc): Jar | null {
  return loc === 'tray' ? s.tray : (s.shelf[loc] ?? null);
}

export function setLoc(s: GameState, loc: Loc, jar: Jar | null): void {
  if (loc === 'tray') s.tray = jar;
  else s.shelf[loc] = jar;
}

export function validLoc(s: GameState, loc: unknown): loc is Loc {
  return loc === 'tray' || (typeof loc === 'number' && Number.isInteger(loc) && loc >= 0 && loc < cellCount(s));
}

export function newJar(s: GameState, k: Kind, pure: boolean): Jar {
  return { k, p: pure, a: 0, u: ++s.uid };
}

export function freeCell(s: GameState, prefer?: number): number | null {
  if (prefer !== undefined && prefer >= 0 && prefer < cellCount(s) && !s.shelf[prefer]) return prefer;
  // Fill away from the stove first so young Joy is not left by the stove by default.
  for (let col = s.cols - 1; col >= 0; col--)
    for (let row = 0; row < 2; row++) {
      const i = col * 2 + row;
      if (!s.shelf[i]) return i;
    }
  return null;
}

export function jarCount(s: GameState, kind: Kind): number {
  let n = 0;
  for (const j of s.shelf) if (j && j.k === kind) n += j.k === 'sediment' ? (j.s?.length ?? 0) : 1;
  return n;
}

export function sedimentAvailable(s: GameState): number {
  let n = Math.max(0, s.silence);
  for (const j of s.shelf) if (j && j.k === 'sediment') n += j.s?.length ?? 0;
  return n;
}

/**
 * Create sediment following §5: Jar of Silence → stack with room → free cell →
 * tray → burn in the stove. Mutnoe grows when `countMut`.
 */
export function addSediment(s: GameState, C: Content, n: number, countMut: boolean): void {
  for (let i = 0; i < n; i++) {
    if (countMut) s.mut++;
    s.nt.stats.sediment++;
    if (s.silence >= 0) {
      s.silence++;
      continue;
    }
    const max = C.sediment.stackMax;
    const stack = s.shelf.findIndex((j) => j?.k === 'sediment' && (j.s?.length ?? 0) < max);
    if (stack >= 0) {
      const j = s.shelf[stack]!;
      j.s = [...(j.s ?? []), 0].sort((a, b) => b - a);
      j.a = j.s[0]!;
      continue;
    }
    const cell = freeCell(s);
    if (cell !== null) {
      s.shelf[cell] = { k: 'sediment', p: false, a: 0, u: ++s.uid, s: [0] };
      continue;
    }
    if (s.tray?.k === 'sediment' && (s.tray.s?.length ?? 0) < max) {
      s.tray.s = [...(s.tray.s ?? []), 0];
      continue;
    }
    if (!s.tray) {
      s.tray = { k: 'sediment', p: false, a: 0, u: ++s.uid, s: [0] };
      continue;
    }
    gainHeat(s, C, C.sediment.overflowBurnHeat);
    s.nt.stats.overflowBurned++;
  }
}

export function gainHeat(s: GameState, C: Content, n: number): void {
  const max = C.nights.start.heatMax;
  const next = s.nt.heat + n;
  if (next > max) s.nt.stats.heatLost += next - max;
  s.nt.heat = Math.min(max, next);
}

/** Remove one sediment item, preferring shelf stacks (they evaporate) then the Jar of Silence. */
export function takeSediment(s: GameState): boolean {
  let best = -1;
  for (let i = 0; i < s.shelf.length; i++) {
    const j = s.shelf[i];
    if (j?.k === 'sediment' && (best < 0 || j.a > s.shelf[best]!.a)) best = i;
  }
  if (best >= 0) {
    const j = s.shelf[best]!;
    const ages = [...(j.s ?? [])].sort((a, b) => b - a);
    ages.shift();
    if (ages.length === 0) s.shelf[best] = null;
    else {
      j.s = ages;
      j.a = ages[0]!;
    }
    return true;
  }
  if (s.silence > 0) {
    s.silence--;
    return true;
  }
  return false;
}

export function accepts(C: Content, ingredient: string): Kind[] {
  return C.feelings.ingredientAccepts[ingredient] ?? [ingredient as Kind];
}

/** Choose shelf cells for a recipe's jar ingredients. Prefers pure, then older jars. */
export function pickIngredients(
  s: GameState,
  C: Content,
  recipe: string,
  explicit?: number[],
): number[] | null {
  const def = C.recipes.recipes[recipe];
  if (!def) return null;
  const needs: string[] = [];
  for (const [k, n] of Object.entries(def.ingredients))
    if (k !== 'sediment' && k !== 'empty_gold' && k !== 'thread' && k !== 'story')
      for (let i = 0; i < n; i++) needs.push(k);
  if (explicit) {
    if (explicit.length !== needs.length || new Set(explicit).size !== explicit.length) return null;
    const remaining = [...needs];
    for (const c of explicit) {
      const j = s.shelf[c];
      if (!j || j.k === 'sediment') return null;
      const idx = remaining.findIndex((k) => accepts(C, k).includes(j.k));
      if (idx < 0) return null;
      remaining.splice(idx, 1);
    }
    return remaining.length === 0 ? [...explicit] : null;
  }
  const used = new Set<number>();
  const out: number[] = [];
  for (const k of needs) {
    let best = -1;
    for (let i = 0; i < s.shelf.length; i++) {
      const j = s.shelf[i];
      if (!j || used.has(i) || j.k === 'sediment' || !accepts(C, k).includes(j.k)) continue;
      if (best < 0) best = i;
      else {
        const b = s.shelf[best]!;
        if ((j.p && !b.p) || (j.p === b.p && j.a > b.a)) best = i;
      }
    }
    if (best < 0) return null;
    used.add(best);
    out.push(best);
  }
  return out;
}

export function nonJarNeeds(C: Content, recipe: string): { sediment: number; gold: number; thread: number; story: number } {
  const ing = C.recipes.recipes[recipe]?.ingredients ?? {};
  return {
    sediment: ing['sediment'] ?? 0,
    gold: ing['empty_gold'] ?? 0,
    thread: ing['thread'] ?? 0,
    story: ing['story'] ?? 0,
  };
}

export function floorStep(v: number, step: number): number {
  return Math.floor(v / step + 1e-9) * step;
}

export function purityOf(C: Content, jars: Jar[]): number {
  const feel = jars.filter((j) => j.k !== 'sediment');
  if (feel.length === 0) return 100;
  const sum = feel.reduce((a, j) => a + (j.p ? C.feelings.purity.pure : C.feelings.purity.murky), 0);
  return floorStep(sum / feel.length, C.recipes.qualityStep);
}

export function hasMittens(s: GameState): boolean {
  return s.up.includes('mittens');
}

export function freshBonus(s: GameState, C: Content): number {
  // Sets (сервизы) are a TODO stub in v1 (Д20): their +1 is never granted.
  return Math.min(C.recipes.freshness.maxBonus, hasMittens(s) ? C.economy.mittensBonus : 0);
}

/** 0 = from oven, 1 = hot, 2 = cold. */
export function freshStage(s: GameState, C: Content, d: Dish): number {
  const b = freshBonus(s, C);
  if (d.h <= C.recipes.freshness.fromOven + b) return 0;
  if (d.h <= C.recipes.freshness.hot + b) return 1;
  return 2;
}

export function dishFeelings(C: Content, recipe: string): string[] {
  const out = new Set<string>();
  for (const k of Object.keys(C.recipes.recipes[recipe]?.ingredients ?? {})) {
    const def = C.feelings.kinds[k as Kind];
    if (def?.orderFeeling) out.add(def.orderFeeling);
  }
  return [...out];
}

export function snapshotLayout(s: GameState) {
  return { shelf: structuredClone(s.shelf), tray: structuredClone(s.tray) };
}
