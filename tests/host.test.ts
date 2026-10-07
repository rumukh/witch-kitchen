import { describe, expect, it } from 'vitest';
import { requireValue } from '@aegis/runtime';
import { loadContentFromDisk } from '../src/model/node-content.js';
import { apply, contentRevision, type Action, type GameState } from '../src/model/index.js';
import { contentPack, createKrestetsHost } from '../src/engine/adapter.js';
import { averagePolicy } from '../sim/policies.js';
import { decide, playDay } from '../sim/bots.js';

const C = loadContentFromDisk();
const pack = contentPack(C, contentRevision(C));

/** Play nights 1–3 with the average bot on the pure model, recording the trace. */
function botTrace(seed: string, nights = 3): Action[] {
  const P = averagePolicy({ seed: 1 });
  let s = requireValue({ ok: true as const, value: null }) as unknown as GameState;
  const host0 = createKrestetsHost(pack, seed, 'standard');
  s = structuredClone(host0.getView().state);
  void host0.dispose();
  const trace: Action[] = [];
  while (s.night <= nights && s.phase !== 'ended') {
    if (s.phase === 'day') {
      if (s.night >= nights) break;
      const day: Action[] = [];
      const copy = structuredClone(s);
      playDay(copy, C, P, day);
      for (const a of day) {
        const r = apply(s, a, C);
        if (!r.ok) throw new Error(r.code);
        s = r.state;
        trace.push(a);
      }
      continue;
    }
    const a = decide(s, C, P);
    const r = apply(s, a, C);
    if (!r.ok) throw new Error(`${a.t} ${r.code}`);
    s = r.state;
    trace.push(a);
  }
  return trace;
}

describe('AEGIS host', () => {
  it('produces exactly the pure-model state for the same trace (3 nights)', async () => {
    const trace = botTrace('parity-1');
    const host = createKrestetsHost(pack, 'parity-1', 'standard');
    let pure = structuredClone(host.getView().state);
    let commits = 0;
    host.subscribeCommits(() => commits++);
    const t0 = performance.now();
    for (const a of trace) {
      requireValue(await host.dispatch(a));
      const r = apply(pure, a, C);
      if (!r.ok) throw new Error(r.code);
      pure = r.state;
    }
    const ms = (performance.now() - t0) / commits;
    expect(host.getView().state).toEqual(pure);
    expect(host.getView().state.night).toBe(3);
    console.log(`host: ${trace.length} actions, ${commits} commits, ${ms.toFixed(2)} ms/commit, state ${JSON.stringify(pure).length} bytes`);
    await host.dispose();
  });

  it('rejects illegal actions without committing and restores a snapshot exactly', async () => {
    const host = createKrestetsHost(pack, 'r1', 'standard');
    const before = host.getStatus().revision;
    const bad = await host.dispatch({ t: 'wait' });
    expect(bad.ok).toBe(false);
    expect(host.getStatus().revision).toBe(before);
    requireValue(await host.dispatch({ t: 'ackScene' }));
    const snap = JSON.parse(JSON.stringify(host.snapshot()));
    const other = createKrestetsHost(pack, 'r1', 'standard');
    requireValue(await other.restore(snap));
    expect(other.getView().state).toEqual(host.getView().state);
    await host.dispose();
    await other.dispose();
  });

  it('replays a night with identical guests after different actions (TURN-07, K19)', async () => {
    const trace = botTrace('replay-1', 1);
    const host = createKrestetsHost(pack, 'replay-1', 'standard');
    for (const a of trace) requireValue(await host.dispatch(a));
    while (host.getView().state.scenes.length) requireValue(await host.dispatch({ t: 'ackScene' }));
    requireValue(await host.dispatch({ t: 'nextNight' }));
    const sched = structuredClone(host.getView().state.nt.sched);
    while (host.getView().state.scenes.length) requireValue(await host.dispatch({ t: 'ackScene' }));
    for (const id of host.getView().state.offers) requireValue(await host.dispatch({ t: 'vow', id, accept: true }));
    while (host.getView().state.scenes.length) requireValue(await host.dispatch({ t: 'ackScene' }));
    requireValue(await host.dispatch({ t: 'kupa' }));
    requireValue(await host.dispatch({ t: 'wait' }));
    requireValue(await host.dispatch({ t: 'restartNight' }));
    const s = host.getView().state;
    expect(s.nt.tick).toBe(0);
    expect(s.nt.sched).toEqual(sched);
    expect(host.getStatus().revision).toBeGreaterThan(5);
    await host.dispose();
  });
});
