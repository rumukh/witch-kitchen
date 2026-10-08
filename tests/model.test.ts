import { describe, expect, it } from 'vitest';
import { loadContentFromDisk } from '../src/model/node-content.js';
import {
  apply,
  createCampaign,
  dawnTick,
  generateSchedule,
  neighbors,
  resolve,
  type Action,
  type GameState,
} from '../src/model/index.js';

const C = loadContentFromDisk();

function run(s: GameState, ...actions: Action[]): GameState {
  for (const a of actions) {
    const r = apply(s, a, C);
    if (!r.ok) throw new Error(`${JSON.stringify(a)} rejected: ${r.code} (tick ${s.nt.tick})`);
    s = r.state;
  }
  return s;
}
function ackAll(s: GameState): GameState {
  while (s.scenes.length) s = run(s, { t: 'ackScene' });
  return s;
}

describe('night 1 tutorial', () => {
  it('starts with grandma stock, a seated guest and 10 ticks', () => {
    const s = createCampaign(C, 'seed-a', 'standard');
    expect(s.night).toBe(1);
    expect(dawnTick(s)).toBe(10);
    expect(s.nt.heat).toBe(1);
    expect(s.threads).toBe(3);
    expect(s.shelf.filter(Boolean).map((j) => j!.k)).toEqual(['sadness']);
    expect(s.seats[0]).toMatchObject({ sp: 'tutorialA', ord: 'sadness' });
    expect(s.known).toEqual(['smoke_tea']);
    expect(s.scenes).toContain('n1.ramen');
  });

  it('blocks play while a scene is pending; ramen leaves a dirty seat; full tutorial loop works', () => {
    let s = createCampaign(C, 'seed-a', 'standard');
    expect(resolve(s, { t: 'wait' }, C)).toEqual({ ok: false, code: 'scene-pending' });
    s = ackAll(s);
    expect(s.seats[0]).toBe('dirty');
    s = run(s, { t: 'clean', seat: 0 });
    expect(s.nt.tick).toBe(1);
    s = run(s, { t: 'cook', recipe: 'smoke_tea' });
    expect(s.burners[0]).toMatchObject({ r: 'smoke_tea', ok: true, h: 0 });
    s = run(s, { t: 'wait' });
    expect(s.nt.tick).toBe(3);
    const g = s.seats[0];
    expect(g && g !== 'dirty' && g.sp).toBe('tutorialB');
    // Ready at tick 2, now h = 1 → still "from the oven": serving costs 0.
    expect(resolve(s, { t: 'serve', burner: 0, to: 0 }, C)).toEqual({ ok: true, cost: 0 });
    s = run(s, { t: 'serve', burner: 0, to: 0 });
    expect(s.nt.stats.satisfied).toBe(2);
    expect(s.water).toBe(1); // river pays water
    expect(s.sparks).toBe(5); // tips
    s = run(s, { t: 'endNight' });
    expect(s.phase).toBe('day');
    expect(s.scenes).toContain('n1.farewell');
  });
});

describe('core rules', () => {
  it('adjacency is orthogonal on the column-major shelf', () => {
    expect(neighbors(0, 3)).toEqual([1, 2]);
    expect(neighbors(3, 3)).toEqual([1, 2, 5]);
    expect(neighbors(5, 3)).toEqual([3, 4]);
    expect(neighbors(5, 4)).toEqual([3, 4, 7]);
  });

  it('schedules are deterministic and independent of actions', () => {
    const a = generateSchedule(C, 'x', 5, null, [], {}, true);
    const b = generateSchedule(C, 'x', 5, null, [], {}, true);
    expect(a).toEqual(b);
    expect(a.map((e) => e.slot)).toEqual(['s0', 's2', 's5', 's8']);
    expect(a.find((e) => e.slot === 's5')!.wind).toBe(true);
  });

  it('night 6 brings two memorial guests; line forces at least 2 of 4', () => {
    for (let i = 0; i < 50; i++) {
      const s6 = generateSchedule(C, 'seed' + i, 6, null, [], {}, true);
      expect(s6.filter((e) => e.w === 'memorial').length).toBeGreaterThanOrEqual(2);
      const s3 = generateSchedule(C, 'seed' + i, 3, 'city', [], {}, true);
      expect(s3.filter((e) => e.w === 'city' && !e.sp).length).toBeGreaterThanOrEqual(2);
      expect(s3.find((e) => e.wind)!.w).not.toBe('city');
    }
  });
});
