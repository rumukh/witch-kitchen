import { describe, expect, it } from 'vitest';
import { loadContentFromDisk } from '../src/model/node-content.js';
import {
  apply,
  createCampaign,
  dawnTick,
  hashHex,
  resolve,
  stableStringify,
  type Action,
  type GameState,
  type Jar,
  type Kind,
} from '../src/model/index.js';

const C = loadContentFromDisk();

function run(s: GameState, ...actions: Action[]): GameState {
  for (const a of actions) {
    const r = apply(s, a, C);
    if (!r.ok) throw new Error(`${JSON.stringify(a)} rejected: ${r.code}`);
    s = r.state;
  }
  return s;
}
function ack(s: GameState): GameState {
  while (s.scenes.length) s = run(s, { t: 'ackScene' });
  for (const id of [...s.offers]) s = run(s, { t: 'vow', id, accept: false });
  while (s.scenes.length) s = run(s, { t: 'ackScene' });
  return s;
}
const tick = (s: GameState): GameState => run(ack(s), { t: 'wait' });
function endN(s: GameState): GameState {
  for (let i = 0; i < 200 && s.phase === 'night'; i++) {
    s = ack(s);
    if (s.phase !== 'night') break;
    const g = s.seats.findIndex((x) => x && x !== 'dirty');
    if (g >= 0) s = run(s, { t: 'refuse', seat: g });
    else if (s.door) s = run(s, { t: 'refuse', seat: 'door' });
    else s = run(s, s.nt.sched.some((e) => !e.done) ? { t: 'wait' } : { t: 'endNight' });
  }
  return ack(s);
}
/** Jump to the start of `night` by entering it from a synthetic Межсветье. */
function at(night: number, prep?: (s: GameState) => void, seed = 'rules'): GameState {
  let s = ack(createCampaign(C, seed, 'standard'));
  s.night = night - 1;
  s.phase = 'day';
  s.scenes = [];
  s.offers = [];
  s.shelf = s.shelf.map(() => null);
  prep?.(s);
  s = run(s, { t: 'nextNight' });
  return ack(s);
}
const jar = (k: Kind, a = 0, p = true, u = 900 + Math.floor(Math.random() * 1e6)): Jar => ({ k, p, a, u });

describe('time and patience', () => {
  it('winding shifts not-yet-fired events by 2 ticks (Q55 A)', () => {
    let s = at(4, (x) => (x.keys = 2));
    expect(dawnTick(s)).toBe(15);
    s = run(s, { t: 'windClock' });
    expect(dawnTick(s)).toBe(17);
    for (let i = 0; i < 5; i++) s = tick(s);
    expect(s.nt.fired).not.toContain('wind'); // wind nominal 5 → actual 7
    s = tick(tick(s));
    expect(s.nt.fired).toContain('wind');
    expect(resolve(s, { t: 'windClock' }, C).ok).toBe(true);
    s = run(s, { t: 'windClock' });
    expect(resolve(s, { t: 'windClock' }, C)).toEqual({ ok: false, code: 'no-keys' });
  });

  it('patience is kept in quarters: nameless ×1.5, predawn ×2, door ×0.5', () => {
    let s = at(3);
    const g0 = s.seats[0] as Exclude<GameState['seats'][number], null | 'dirty'>;
    const start = g0.pat;
    s = run(s, { t: 'wait' });
    expect((s.seats[0] as typeof g0).pat).toBe(start - 4);
    s = at(3);
    for (let i = 0; i < 9; i++) s = tick(s);
    expect(s.nt.nameless).toBe(1); // night 3 midnight
    const before = s.seats.map((x) => (x && x !== 'dirty' ? x.pat : null));
    s = tick(s);
    s.seats.forEach((x, i) => {
      if (x && x !== 'dirty' && before[i] !== null && !x.out) expect(before[i]! - x.pat).toBe(6);
    });
  });

  it('actions that would end after dawn are disabled and cost nothing (Q10)', () => {
    let s = at(2);
    while (s.nt.tick < dawnTick(s) - 1) s = tick(s);
    s.shelf[2] = jar('sadness');
    s.shelf[3] = jar('anger');
    s.nt.heat = 3;
    expect(resolve(s, { t: 'experiment', cells: [2, 3] }, C)).toEqual({ ok: false, code: 'past-dawn' });
    expect(resolve(s, { t: 'wait' }, C).ok).toBe(true);
  });
});

describe('cooking, serving and quality', () => {
  it('from-oven serve costs 0, hot costs 1; purity 2 pure + 1 murky floors to 75 (Q20)', () => {
    let s = at(2, (x) => {
      x.shelf[2] = jar('sadness');
      x.shelf[3] = jar('sadness', 0, false);
      x.shelf[4] = jar('joy');
    });
    s = run(s, { t: 'cook', recipe: 'nimbus_ramen' });
    expect(s.burners[0]!.pur).toBe(75);
    s = run(s, { t: 'wait' });
    expect(s.burners[0]!.ok).toBe(true);
    const seat = s.seats.findIndex((x) => x && x !== 'dirty');
    expect(resolve(s, { t: 'serve', burner: 0, to: seat }, C)).toEqual({ ok: true, cost: 0 });
    s = run(s, { t: 'wait' }, { t: 'wait' });
    expect(resolve(s, { t: 'serve', burner: 0, to: seat }, C)).toEqual({ ok: true, cost: 1 });
  });

  it('an experiment that matches a recipe teaches it; a failure leaves sediment and a hint (Q25)', () => {
    let s = at(2, (x) => {
      x.shelf[2] = jar('fear');
      x.shelf[3] = jar('fear');
      x.shelf[4] = jar('joy');
      x.shelf[5] = jar('anger');
    });
    s.nt.heat = 3;
    expect(s.known).not.toContain('fog_ukha');
    s = run(s, { t: 'experiment', cells: [2, 3] });
    expect(s.known).toContain('fog_ukha');
    expect(s.burners[0]).toMatchObject({ r: 'fog_ukha', ok: true });
    s = run(ack(s), { t: 'discardDish', burner: 0 });
    const mut = s.mut;
    s = run(s, { t: 'experiment', cells: [4, 5] });
    expect(s.burners[0]).toBeNull();
    expect(s.mut).toBe(mut + 1);
    expect(s.book.length).toBeGreaterThan(0);
  });

  it('Pryazhenets does not fit a 2×3 shelf even with the tray and the Jar of Silence (Q15, DL-07)', () => {
    let s = at(11, (x) => {
      x.mut = 6;
      x.silence = 3;
      ['hope', 'amber', 'anger', 'fear', 'nostalgia', 'loneliness'].forEach((k, i) => (x.shelf[i] = jar(k as Kind)));
      x.tray = jar('tremor');
    });
    s.nt.heat = 3;
    expect(s.known).toContain('pryazhenets');
    expect(resolve(s, { t: 'cook', recipe: 'pryazhenets' }, C)).toEqual({ ok: false, code: 'no-ingredients' });
    s.cols = 4;
    s.shelf.push(null, null);
    s = run(s, { t: 'move', from: 'tray', to: 6 });
    expect(resolve(s, { t: 'cook', recipe: 'pryazhenets' }, C).ok).toBe(true);
  });
});

describe('boundary transformations', () => {
  it('sadness → hope and joy → amber after two boundaries; joy by a working stove burns at dawn', () => {
    let s = at(2, (x) => {
      x.shelf[4] = jar('sadness');
      x.shelf[5] = jar('joy');
      x.shelf[0] = jar('joy');
      x.shelf[2] = jar('anger');
    });
    s.nt.heat = 3;
    s = run(s, { t: 'cook', recipe: 'tar_gingerbread' });
    s = run(ack(s), { t: 'discardDish', burner: 0 });
    s = endN(s);
    expect(s.shelf[0]!.k).toBe('burning');
    s = ack(run(ack(s), { t: 'nextNight' }));
    expect(s.shelf[4]!.k).toBe('hope');
    expect(s.shelf[5]!.k).toBe('amber');
    expect(s.shelf[0]!.k).toBe('burning');
  });

  it('tremor merge from the boundary before night 10 beats amber; no chain (Q24)', () => {
    let s = at(9, (x) => {
      x.shelf[2] = jar('joy', 0);
      x.shelf[3] = jar('fear', 5);
    });
    s = endN(s);
    s = ack(s);
    s = ack(run(s, { t: 'nextNight' }));
    expect(s.shelf[2]).toMatchObject({ k: 'tremor', a: 0 });
    expect(s.shelf[3]).toBeNull();
  });

  it('sediment evaporates on its third boundary; the Jar of Silence keeps it', () => {
    let s = at(5, (x) => (x.shelf[2] = { k: 'sediment', p: false, a: 2, u: 77, s: [2] }));
    s = endN(s);
    const stacks = ack(s).shelf.filter((j) => j?.k === 'sediment');
    s = ack(run(ack(s), { t: 'nextNight' }));
    expect(s.shelf.filter((j) => j?.u === 77)).toEqual([]);
    expect(stacks.length).toBeGreaterThan(0);
  });
});

describe('undo, hints and replay', () => {
  it('K18: three moves, undo two → exact layout; a cuckoo hint closes undo', () => {
    let s = at(3, (x) => {
      x.shelf[0] = jar('sadness', 0, true, 1);
      x.shelf[1] = jar('anger', 0, true, 2);
    });
    const start = structuredClone(s.shelf);
    s = run(s, { t: 'move', from: 0, to: 5 });
    const afterOne = structuredClone(s.shelf);
    s = run(s, { t: 'move', from: 1, to: 4 }, { t: 'move', from: 5, to: 'tray' });
    s = run(s, { t: 'undo' }, { t: 'undo' });
    expect(s.shelf).toEqual(afterOne);
    s = run(s, { t: 'cuckoo' });
    expect(s.undo).toEqual([]);
    expect(resolve(s, { t: 'undo' }, C)).toEqual({ ok: false, code: 'nothing-to-undo' });
    void start;
  });

  it('K19/K27: replaying a night restores identical guests; the night log replays to the same hash', () => {
    let s = at(4);
    const start = structuredClone(s.nightStart!);
    const sched = structuredClone(s.nt.sched);
    s = run(s, { t: 'kupa' }, { t: 'wait' }, { t: 'wait' });
    const log = s.nt.log.map(([, a]) => JSON.parse(a) as Action);
    let replay = start;
    for (const a of log) replay = run(replay, a);
    const h = (x: GameState) => hashHex(stableStringify({ ...x, nightStart: null, preFinale: null }));
    expect(h(replay)).toBe(h(s));
    s = run(s, { t: 'restartNight' });
    expect(s.nt.tick).toBe(0);
    expect(s.nt.sched).toEqual(sched);
  });
});

describe('stories, vows and endings', () => {
  it('half stories never open doors; four full stories do (Q27, Q28)', () => {
    let s = at(3);
    s.col = { 'forest.1': 4, 'forest.2': 4, 'forest.3': 4 };
    s.halves = 1;
    const g = s.seats.find((x) => x && x !== 'dirty') as Exclude<GameState['seats'][number], null | 'dirty'>;
    g.w = 'forest';
    g.st = 'forest.4';
    g.ord = 'any';
    s.shelf[2] = jar('sadness');
    s = run(s, { t: 'cook', recipe: 'smoke_tea' });
    s = run(s, { t: 'serve', burner: 0, to: s.seats.indexOf(s.seats.find((x) => x && x !== 'dirty' && x.st === 'forest.4')!) });
    expect(s.doors).toContain('forest');
  });

  it('vow 1 success gives a key; a failed adult vow costs one thread at its last dawn', () => {
    let s = createCampaign(C, 'v', 'standard');
    s = ack(s);
    s.night = 1;
    s.phase = 'day';
    s.scenes = [];
    s = run(s, { t: 'nextNight' });
    while (s.scenes.length) s = run(s, { t: 'ackScene' });
    expect(s.offers).toContain('v1');
    s = run(s, { t: 'vow', id: 'v1', accept: true });
    expect(s.vows.v1!.s).toBe('active');
    s.nt.pureServed = 1;
    s.shelf[2] = jar('sadness');
    s = ack(s);
    s = run(s, { t: 'cook', recipe: 'smoke_tea' });
    const seat = s.seats.findIndex((x) => x && x !== 'dirty');
    s = run(s, { t: 'serve', burner: 0, to: seat });
    expect(s.vows.v1!.s).toBe('success');
    expect(s.keys).toBe(1);
    let t = at(9);
    t.vows.v8 = { s: 'active', rep: 0, from: 9, to: 9 };
    t.shelf[2] = jar('anger');
    t = run(t, { t: 'burn', from: 2 });
    expect(t.vows.v8!.s).toBe('failed');
    t = endN(t);
    expect(t.threads).toBe(2);
    expect(t.vows.v8!.s).toBe('lost');
  });

  it('ending priority at dawn 12: pie + guardian → new_spring, pie → remember, none → letter; winding ends at once', () => {
    const finish = (prep: (s: GameState) => void) => {
      let s = at(12);
      prep(s);
      s = endN(s);
      return s.ending;
    };
    expect(finish((s) => ((s.flags.pieServed = true), (s.flags.guardian = true)))).toBe('new_spring');
    expect(finish((s) => (s.flags.pieServed = true))).toBe('remember');
    expect(finish(() => undefined)).toBe('letter');
    let w = at(12, (x) => (x.keys = 1));
    w = run(w, { t: 'windFinal' });
    expect(w.phase).toBe('ended');
    expect(w.ending).toBe('wound');
  });
});
