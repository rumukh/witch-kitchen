import { createCampaign, type Action, type Content, type GameState, type Mode } from '../src/model/index.js';
import { playDay, playNight, type NightResult, type Policy } from './bots.js';

export interface CampaignResult {
  seed: string;
  ending: string | null;
  nights: NightResult[];
  purchases: Record<string, number>;
  mut: number;
  keys: number;
  threads: number;
  guardian: boolean;
  error?: string;
  trace?: Action[];
}

export function runCampaign(
  C: Content,
  seed: string,
  mode: Mode,
  P: Policy,
  opts: { untilNight?: number; trace?: boolean; onNightStart?: (s: GameState) => void } = {},
): CampaignResult {
  const s = createCampaign(C, seed, mode, false);
  const nights: NightResult[] = [];
  const purchases: Record<string, number> = {};
  const trace: Action[] | undefined = opts.trace ? [] : undefined;
  const until = opts.untilNight ?? C.nights.campaignNights;
  try {
    while (s.phase !== 'ended') {
      if (s.phase === 'night') {
        if (s.night > until) break;
        opts.onNightStart?.(s);
        nights.push(playNight(s, C, P, trace));
      } else {
        const before = { cols: s.cols, seats: s.seatsN, burners: s.burnersN, up: [...s.up], silence: s.silence };
        if (s.night >= until) break;
        playDay(s, C, P, trace);
        const n = s.night - 1;
        if (s.cols > before.cols) purchases.shelf ??= n;
        if (s.seatsN > before.seats) purchases.chair ??= n;
        if (s.burnersN > before.burners) purchases.double_burner ??= n;
        if (s.silence >= 0 && before.silence < 0) purchases.silence_jar ??= n;
        for (const u of s.up) if (!before.up.includes(u)) purchases[u] ??= n;
      }
    }
  } catch (e) {
    return { seed, ending: null, nights, purchases, mut: s.mut, keys: s.keys, threads: s.threads, guardian: s.flags.guardian, error: (e as Error).message, trace };
  }
  return { seed, ending: s.ending, nights, purchases, mut: s.mut, keys: s.keys, threads: s.threads, guardian: s.flags.guardian, trace };
}
