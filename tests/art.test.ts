import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('assets/art/manifest.json', 'utf8')) as { assets: { id: string; file: string; transparent?: boolean }[] };
const guests = JSON.parse(readFileSync('content/guests.json', 'utf8')) as { worlds: Record<string, unknown>; special: Record<string, unknown> };
const byId = new Map(manifest.assets.map((a) => [a.id, a]));

// Every guest the tavern can seat must have delivered art, or the UI falls back to the procedural SVG placeholder.
describe('guest art coverage', () => {
  const ids = [
    ...Object.keys(guests.worlds).flatMap((w) => [1, 2, 3].map((n) => `guest-${w}-${n}`)),
    ...Object.keys(guests.special).map((sp) => `char-${sp}`),
  ];
  it.each(ids)('%s is in the art manifest with a transparent file on disk', (id) => {
    const e = byId.get(id);
    expect(e, id).toBeDefined();
    expect(e!.transparent).toBe(true);
    expect(existsSync(`assets/art/${e!.file}`)).toBe(true);
  });
});
