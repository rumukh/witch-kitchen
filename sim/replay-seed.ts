// Reproduce one sweep seed with a full action trace: npx tsx sim/replay-seed.ts <route> <mode> <seed>
import { loadContentFromDisk } from '../src/model/node-content.js';
import { POLICIES, type Route } from './policies.js';
import { runCampaign } from './campaign.js';
import type { Mode } from '../src/model/index.js';
const [route, mode, seedArg] = process.argv.slice(2) as [Route, Mode, string];
const seed = Number(seedArg);
const C = loadContentFromDisk();
const r = runCampaign(C, `${route}-${seed}`, mode, POLICIES[route]({ seed }), { trace: true });
console.log(JSON.stringify({ seed: `${route}-${seed}`, mode, ending: r.ending, error: r.error, mut: r.mut, threads: r.threads, keys: r.keys, nights: r.nights, trace: r.trace }, null, 1));
