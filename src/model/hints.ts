import type { Content, Kind } from './content.js';
import type { GameState, Hint } from './types.js';
import { dishFeelings, nonJarNeeds, pickIngredients, sedimentAvailable } from './shelf.js';
import { seatedGuests } from './guests.js';

export function canCookNow(s: GameState, C: Content, recipe: string): boolean {
  const r = C.recipes.recipes[recipe];
  if (!r || !s.known.includes(recipe)) return false;
  if (!s.burners.some((d) => d === null)) return false;
  if (s.nt.heat < r.heat && s.water <= 0) return false;
  const extra = nonJarNeeds(C, recipe);
  if (extra.sediment > sedimentAvailable(s) || extra.gold > s.gold) return false;
  if (extra.thread > s.threads || extra.story > s.stories) return false;
  return pickIngredients(s, C, recipe) !== null;
}

/** Cuckoo hint (§10). Deterministic, reads state only. */
export function computeHint(s: GameState, C: Content): Hint {
  const seated = seatedGuests(s).filter(({ g }) => !g.out || true);
  for (const [b, d] of s.burners.entries()) {
    if (!d?.ok) continue;
    const feel = dishFeelings(C, d.r);
    const hit = seated.find(({ g }) => g.ord === 'any' || feel.includes(g.ord));
    if (hit) return { type: 'serve', burner: b, seat: hit.seat };
  }
  for (const { seat, g } of seated) {
    for (const recipe of s.known) {
      if (C.recipes.recipes[recipe]?.story) continue;
      if (g.ord !== 'any' && !dishFeelings(C, recipe).includes(g.ord)) continue;
      if (canCookNow(s, C, recipe)) return { type: 'recipe', seat, recipe };
    }
  }
  for (const { seat, g } of seated) if (!g.out && g.pat <= C.nights.patience.quarters) return { type: 'risk', seat };
  for (const { seat, g } of seated) {
    if (g.ord === 'any') continue;
    const rec = C.guests.orderRecipes[g.ord];
    if (!rec) continue;
    for (const k of Object.keys(C.recipes.recipes[rec]!.ingredients)) {
      const total = Object.values(g.pal).reduce((a, n) => a + (n ?? 0), 0);
      if ((g.pal[k as Kind] ?? 0) > 0 && total > 1) return { type: 'listen', seat, kind: k as Kind };
    }
  }
  if (s.burners.some((d) => d && !d.ok)) return { type: 'wait' };
  return { type: 'none' };
}
