// DIAG-01: replay an exported night report headlessly and check the outcome hash.
// Usage: npx tsx scripts/replay-report.ts <report.json>
import { readFileSync } from 'node:fs';
import { loadContentFromDisk } from '../src/model/node-content.js';
import { apply, contentRevision, hashHex, stableStringify, type Action, type GameState } from '../src/model/index.js';

const file = process.argv[2];
if (!file) throw new Error('usage: replay-report <report.json>');
const rep = JSON.parse(readFileSync(file, 'utf8')) as {
  format: string;
  content: string;
  seed: string;
  night: number;
  actions: [number, string][];
  nightStart: GameState;
  outcome: string;
};
if (rep.format !== 'krestets.night-report/1') throw new Error('not a Krestets night report');
const C = loadContentFromDisk();
const rev = contentRevision(C);
if (rev !== rep.content) console.warn(`warning: report content ${rep.content}, installed ${rev}`);
let s = structuredClone(rep.nightStart);
s.nightStart = structuredClone(rep.nightStart);
for (const [tick, json] of rep.actions) {
  const a = JSON.parse(json) as Action;
  if (s.nt.tick !== tick && s.phase === 'night') throw new Error(`tick mismatch before ${a.t}: report ${tick}, replay ${s.nt.tick}`);
  const r = apply(s, a, C);
  if (!r.ok) throw new Error(`action ${a.t} rejected on replay: ${r.code}`);
  s = r.state;
}
const outcome = hashHex(stableStringify({ ...s, nightStart: null, preFinale: null }));
console.log(JSON.stringify({ seed: rep.seed, night: rep.night, actions: rep.actions.length, tick: s.nt.tick, phase: s.phase, outcome, expected: rep.outcome, match: outcome === rep.outcome }));
process.exit(outcome === rep.outcome ? 0 : 1);
