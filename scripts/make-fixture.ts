// Generate a slot export file from a headless bot campaign: npx tsx scripts/make-fixture.ts <out.json> <stopNight> [route]
// The file is a normal "Сохранить в файл" export and can be imported through the title screen.
import { writeFileSync } from 'node:fs';
import { exportSave } from '@aegis/browser/save';
import type { RuntimeSnapshot } from '@aegis/runtime';
import { loadContentFromDisk } from '../src/model/node-content.js';
import { contentRevision, createCampaign, type Action } from '../src/model/index.js';
import { contentPack, createKrestetsHost } from '../src/engine/adapter.js';
import { ENGINE_REVISION, GAME_ID, slotPolicy } from '../src/platform/saves.js';
import { decide, playDay, FAST } from '../sim/bots.js';
import { POLICIES, type Route } from '../sim/policies.js';
import { applyInPlace } from '../src/model/index.js';

const [out = 'fixture.json', stopArg = '12', route = 'new_spring'] = process.argv.slice(2);
const stop = Number(stopArg);
const C = loadContentFromDisk();
const pack = contentPack(C, contentRevision(C));
const seed = 'fixture-1';
const P = POLICIES[route as Route]({ seed: 1 });
const s = createCampaign(C, seed, 'standard', false);
const trace: Action[] = [];
while (s.phase !== 'ended') {
  if (s.phase === 'night') {
    if (s.night >= stop && !s.scenes.length && !s.offers.length) break;
    const a = decide(s, C, P);
    if (!applyInPlace(s, a, C, FAST).ok) throw new Error('bot illegal');
    trace.push(a);
  } else {
    const day: Action[] = [];
    playDay(s, C, P, day);
    trace.push(...day);
  }
}
const host = createKrestetsHost(pack, seed, 'standard');
for (const a of trace) {
  const r = await host.dispatch(a);
  if (!r.ok) throw new Error(`replay failed at ${a.t}: ${r.error.code}`);
}
const st = host.getView().state;
const env = {
  format: 'aegis.save' as const,
  formatVersion: 1 as const,
  gameId: GAME_ID,
  profileId: 'slot-1',
  contentRevision: pack.revision,
  schemaVersion: 1,
  engine: { id: 'aegis-runtime', snapshotVersion: 1, revision: ENGINE_REVISION },
  revision: 1,
  state: host.snapshot() as RuntimeSnapshot,
  resume: { night: st.night, mode: st.mode, phase: st.phase, ending: st.ending, seed: st.seed },
};
writeFileSync(out, exportSave(env, slotPolicy('slot-1', () => true)));
console.log(`fixture ${out}: night ${st.night} ${st.phase} tick ${st.nt.tick}, actions ${trace.length}, preFinale ${!!st.preFinale}, guardian ${st.flags.guardian}, shelf ${st.shelf.map((j) => j?.k ?? '_').join(',')}`);
await host.dispose();
