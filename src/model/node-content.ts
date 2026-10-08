import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_FILES, mergeContent, stripBom, validateContentData } from './content.js';
import type { Content } from './content.js';

/** Node-side loader (tests, simulations, headless replay). Reads content/*.json directly. */
export function loadContentFromDisk(dir = join(process.cwd(), 'content')): Content {
  const files: Record<string, unknown> = {};
  for (const f of CONTENT_FILES) files[f] = JSON.parse(stripBom(readFileSync(join(dir, `${f}.json`), 'utf8')));
  const data = mergeContent(files);
  const errors = validateContentData(data);
  if (errors.length) throw new Error('Invalid content:\n' + errors.join('\n'));
  return data;
}
