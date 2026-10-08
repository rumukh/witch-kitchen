import { loadContentFromDisk } from '../src/model/node-content.js';
import { createCampaign, type GameState, type Mode } from '../src/model/index.js';
import { playDay, playNight, type NightResult } from './bots.js';
import { averagePolicy, POLICIES, type Route } from './policies.js';
import { runCampaign } from './campaign.js';

const C = loadContentFromDisk();

export type Task =
  | { kind: 'q14'; from: number; to: number; good: boolean; variants: number }
  | { kind: 'q26'; from: number; to: number; line: 'none' | 'city' | 'forest' | 'river' }
  | { kind: 'load'; from: number; to: number }
  | { kind: 'route'; from: number; to: number; route: Route; mode: Mode; variant: 'base' | 'zero' | 'double' };

export interface Q14Row {
  seed: number;
  nights: { n: number; sat: number; arrived: number; third: number | null; last: number }[];
}

function nightScore(r: NightResult): number {
  return r.satisfied * 100 - (r.thirdTick ?? 99) - r.lastTick / 100;
}

function q14(seed: number, good: boolean, variants: number): Q14Row {
  const s = createCampaign(C, 'q14-' + seed, 'standard', false);
  const P = averagePolicy({ seed });
  const nights: Q14Row['nights'] = [];
  let state: GameState = s;
  while (state.night <= 4 && state.phase !== 'ended') {
    if (state.phase === 'day') {
      playDay(state, C, P);
      continue;
    }
    if (good && state.night >= 2) {
      let best: { st: GameState; r: NightResult } | null = null;
      for (let v = 0; v < variants; v++) {
        const trial = structuredClone(state);
        const Pv = v === 0 ? P : averagePolicy({ seed: seed * 1000 + v, noise: 0.35 });
        const r = playNight(trial, C, Pv);
        if (!best || nightScore(r) > nightScore(best.r)) best = { st: trial, r };
      }
      state = best!.st;
      nights.push({ n: best!.r.night, sat: best!.r.satisfied, arrived: best!.r.arrived, third: best!.r.thirdTick, last: best!.r.lastTick });
    } else {
      const r = playNight(state, C, P);
      if (r.night >= 2) nights.push({ n: r.night, sat: r.satisfied, arrived: r.arrived, third: r.thirdTick, last: r.lastTick });
    }
  }
  return { seed, nights };
}

export function runTask(task: Task): unknown[] {
  const out: unknown[] = [];
  for (let seed = task.from; seed < task.to; seed++) {
    switch (task.kind) {
      case 'q14':
        out.push(q14(seed, task.good, task.variants));
        break;
      case 'q26': {
        const r = runCampaign(C, 'q26-' + seed, 'standard', averagePolicy({ seed, line: task.line }), { untilNight: 11 });
        out.push({
          seed,
          purchases: r.purchases,
          income: r.nights.filter((n) => n.night >= 2 && n.night <= 11).map((n) => n.sparks),
          error: r.error,
        });
        break;
      }
      case 'load': {
        const r = runCampaign(C, 'load-' + seed, 'standard', averagePolicy({ seed }), { untilNight: 11 });
        out.push({ seed, nights: r.nights.map((n) => ({ n: n.night, sat: n.satisfied, arrived: n.arrived, last: n.lastTick })) });
        break;
      }
      case 'route': {
        const P = POLICIES[task.route]({
          seed,
          buyDoubleBurner: task.variant === 'double',
          forbidSparks: task.variant === 'zero',
        });
        const r = runCampaign(C, `${task.route}-${seed}`, task.mode, P, {
          onNightStart: task.variant === 'zero' ? (s) => ((s.sparks = 0), (s.keys = 0)) : undefined,
        });
        out.push({ seed, ending: r.ending, error: r.error ?? null, mut: r.mut, threads: r.threads, keys: r.keys, double: r.purchases.double_burner ?? null });
        break;
      }
    }
  }
  return out;
}
