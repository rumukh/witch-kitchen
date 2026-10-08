import type { Content } from './content.js';
import type { Dish, GameState, Guest } from './types.js';
import { dishFeelings } from './shelf.js';

export function activeVows(s: GameState, C: Content): string[] {
  return Object.keys(C.vows.vows).filter((id) => {
    const v = s.vows[id];
    return v && v.s === 'active' && v.from <= s.night && s.night <= v.to;
  });
}

function succeed(s: GameState, C: Content, id: string): void {
  const v = s.vows[id]!;
  if (v.s !== 'active') return;
  v.s = 'success';
  s.keys += C.vows.keysPerSuccess;
  s.scenes.push(`vow.${id}.success`);
}

export function failVow(s: GameState, C: Content, id: string): void {
  const v = s.vows[id]!;
  if (v.s !== 'active') return;
  v.s = 'failed';
  s.scenes.push(v.rep > 0 ? `vow.${id}.repeatFail` : `vow.${id}.fail`);
  void C;
}

/** Called when a dish is served to a seated guest. */
export function vowOnServe(
  s: GameState,
  C: Content,
  g: Guest,
  d: Dish,
  quality: number,
  stage: number,
): void {
  for (const id of activeVows(s, C)) {
    const def = C.vows.vows[id]!;
    switch (def.cond) {
      case 'pureDishes':
        if (d.pur >= 100) {
          s.nt.pureServed++;
          if (s.nt.pureServed >= (def.count ?? 2)) succeed(s, C, id);
        }
        break;
      case 'serveGiverCold':
        if (g.sp === def.guest && stage === 2 && dishFeelings(C, d.r).includes(def.feeling!)) succeed(s, C, id);
        break;
      case 'serveRecipe':
        if (g.sp === def.guest && d.r === def.recipe && (!def.serveNight || def.serveNight === s.night))
          succeed(s, C, id);
        break;
      case 'serveFeelingQuality':
        if (g.sp === def.guest && quality >= (def.minQuality ?? 0) && dishFeelings(C, d.r).includes(def.feeling!))
          succeed(s, C, id);
        break;
    }
  }
}

/** Called after a guest has left (served, sated, unhappy or overdrawn). */
export function vowOnLeave(s: GameState, C: Content, g: Guest, satisfied: boolean): void {
  for (const id of activeVows(s, C)) {
    const def = C.vows.vows[id]!;
    if (def.cond === 'allMemorialSatisfied' && g.w === 'memorial' && !g.sp && !satisfied) {
      s.nt.memorialFail = true;
      failVow(s, C, id);
    }
    if (def.guest && g.sp === def.guest && ['serveGiverCold', 'serveRecipe', 'serveFeelingQuality'].includes(def.cond)) {
      const lastChance = s.night === s.vows[id]!.to || (def.serveNight !== undefined && s.night === def.serveNight);
      if (lastChance) failVow(s, C, id);
    }
  }
}

export function vowOnDoorWait(s: GameState, C: Content, wait: number): void {
  for (const id of activeVows(s, C)) {
    const def = C.vows.vows[id]!;
    if (def.cond === 'doorWait' && wait > (def.maxWait ?? 2)) {
      s.nt.doorFail = true;
      failVow(s, C, id);
    }
  }
}

export function vowOnLivingBurn(s: GameState, C: Content): void {
  s.nt.living = true;
  for (const id of activeVows(s, C)) if (C.vows.vows[id]!.cond === 'noLivingBurn') failVow(s, C, id);
}

export function vowOnCuckoo(s: GameState, C: Content): void {
  s.nt.cuckooUsed = true;
  for (const id of activeVows(s, C)) if (C.vows.vows[id]!.cond === 'noCuckoo') failVow(s, C, id);
}

/** Night start: announcements, reminders, offers and early certain failures. */
export function vowsAtNightStart(s: GameState, C: Content): void {
  for (const [id, def] of Object.entries(C.vows.vows)) {
    const v = s.vows[id];
    if (def.announce === s.night && !v) {
      s.vows[id] = { s: 'announced', rep: 0, from: def.from, to: def.to };
      s.scenes.push(`vow.${id}.announce`);
    }
    const cur = s.vows[id];
    if ((!cur || cur.s === 'announced') && def.from === s.night) {
      s.vows[id] = { s: 'offered', rep: 0, from: def.from, to: def.to };
      s.offers.push(id);
    } else if (cur?.s === 'repeat' && cur.from === s.night) {
      cur.s = 'offered';
      s.offers.push(id);
    }
    if (cur?.s === 'active' && def.reminder === s.night) s.scenes.push(`vow.${id}.reminder`);
  }
  checkVowFeasibility(s, C);
}

/** Certain-failure detection that does not depend on an event (vow 4: no hope by night 7). */
export function checkVowFeasibility(s: GameState, C: Content): void {
  for (const id of activeVows(s, C)) {
    const def = C.vows.vows[id]!;
    if (def.cond === 'serveRecipe' && def.serveNight === s.night && def.needsKind) {
      const hasKind = s.shelf.some((j) => j?.k === def.needsKind) || s.tray?.k === def.needsKind;
      const hasDish = s.burners.some((d) => d?.r === def.recipe);
      if (!hasKind && !hasDish) failVow(s, C, id);
    }
  }
}

export function vowAccept(s: GameState, id: string, accept: boolean): void {
  const v = s.vows[id]!;
  v.s = accept ? 'active' : 'declined';
  s.offers = s.offers.filter((o) => o !== id);
  s.scenes.push(accept ? `vow.${id}.accept` : `vow.${id}.decline`);
}

/** Dawn: resolve windows ending tonight, take threads, schedule tutorial repeats. Returns true if a thread was lost. */
export function vowsAtDawn(s: GameState, C: Content): boolean {
  let lost = false;
  for (const [id, def] of Object.entries(C.vows.vows)) {
    const v = s.vows[id];
    if (!v || v.to !== s.night) continue;
    if (v.s === 'active') {
      let ok: boolean;
      switch (def.cond) {
        case 'pureDishes':
          ok = s.nt.pureServed >= (def.count ?? 2);
          break;
        case 'doorWait':
          ok = !s.nt.doorFail;
          break;
        case 'allMemorialSatisfied':
          ok = !s.nt.memorialFail;
          break;
        case 'noLivingBurn':
          ok = !s.nt.living;
          break;
        case 'noCuckoo':
          ok = !s.nt.cuckooUsed && s.nt.stats.satisfied >= (def.minSatisfied ?? 0);
          break;
        default:
          ok = false;
      }
      if (ok) succeed(s, C, id);
      else failVow(s, C, id);
    }
    if (v.s === 'failed') {
      if (def.tutorial) {
        if (v.rep === 0) {
          v.s = 'repeat';
          v.rep = 1;
          v.from = s.night + 1;
          v.to = s.night + 1;
        } else v.s = 'lost';
      } else {
        v.s = 'lost';
        if (s.threads > 0) {
          s.threads -= C.vows.threadsPerFailure;
          s.threads = Math.max(0, s.threads);
          lost = true;
          s.scenes.push(s.threads === 1 ? 'thread.last' : 'thread.lost');
        }
      }
    }
    if (v.s === 'offered') {
      v.s = 'declined';
      s.offers = s.offers.filter((o) => o !== id);
    }
  }
  return lost;
}
