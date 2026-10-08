import { readFileSync } from 'node:fs';
import { requireValue } from '@aegis/runtime';
import { loadContentFromDisk } from '../src/model/node-content.js';
import { contentRevision } from '../src/model/index.js';
import { contentPack, createKrestetsHost } from '../src/engine/adapter.js';
import { parseImport } from '../src/platform/saves.js';
const C = loadContentFromDisk();
const pack = contentPack(C, contentRevision(C));
for (const f of process.argv.slice(2)) {
  const env = parseImport(readFileSync(f, 'utf8'));
  const host = createKrestetsHost(pack, env.resume.seed, env.resume.mode);
  requireValue(await host.restore(env.state));
  const s = host.getView().state;
  requireValue(await host.dispatch(s.scenes.length ? { t: 'ackScene' } : { t: 'wait' }));
  console.log(f, 'restored on new engine: night', s.night, 'revision', host.getStatus().revision, 'OK');
  await host.dispose();
}
