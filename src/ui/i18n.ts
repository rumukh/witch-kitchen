// Browser-side loading of content/*.json and Russian catalogs. Fetched at runtime so a
// balance edit only needs a page reload in dev (no TypeScript rebuild).
import { CONTENT_FILES, contentRevision, mergeContent, stripBom, validateContentData, type Content } from '../model/index.js';
import { contentPack } from '../engine/adapter.js';
import type { ContentPack } from '@aegis/runtime';

export const LOCALE_FILES = ['ui', 'whispers', 'onboarding', 'scenes', 'stories', 'listen'] as const;

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return JSON.parse(stripBom(await r.text()));
}

export async function loadContent(base = './'): Promise<ContentPack<Content>> {
  const files: Record<string, unknown> = {};
  await Promise.all(CONTENT_FILES.map(async (f) => (files[f] = await getJson(`${base}content/${f}.json`))));
  const data = mergeContent(files);
  const errors = validateContentData(data);
  if (errors.length) throw new Error('Content invalid:\n' + errors.join('\n'));
  return contentPack(data, contentRevision(data));
}

export interface Scene {
  lines: { s: string; t: string; e?: string }[];
  spoiler?: boolean;
  safe?: { s: string; t: string }[];
}
export interface Story {
  title: string;
  fragments: string[];
  ending: string;
}
export interface ListenCatalog {
  topics: Record<string, string[]>;
  warm: string[];
  hasty: string[];
  guest: Record<string, string[]>;
}

export interface Catalogs {
  ui: Record<string, string>;
  whispers: Record<string, string>;
  onboarding: Record<string, { target: string; title: string; what: string; why: string; whisper?: string }>;
  scenes: Record<string, Scene>;
  stories: Record<string, Story>;
  listen: ListenCatalog;
}

export async function loadCatalogs(base = './'): Promise<Catalogs> {
  const out: Record<string, unknown> = {};
  await Promise.all(
    LOCALE_FILES.map(async (f) => {
      try {
        out[f] = await getJson(`${base}content/locales/ru/${f}.json`);
      } catch {
        out[f] = f === 'listen' ? { topics: {}, warm: [], hasty: [], guest: {} } : {};
      }
    }),
  );
  return out as unknown as Catalogs;
}

/** Spoiler-aware message lookup (streamer mode hides twists, Q42). */
export class I18n {
  streamer = false;
  constructor(readonly cat: Catalogs) {}
  t(key: string, params: Record<string, string | number> = {}): string {
    let s = this.cat.ui[key] ?? this.cat.whispers[key] ?? key;
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }
  has(key: string): boolean {
    return key in this.cat.ui;
  }
  /** Dialogue text only: the spirit's name «Крестец» is replaced in streamer mode. */
  filter(s: string): string {
    if (!this.streamer) return s;
    return s.replace(/Крестец(а|у|ом|е)?/g, 'хозяин перекрёстка');
  }
}
