// Art library: delivered art via assets/art/manifest.json, procedural placeholders otherwise.
import type { Kind } from '../model/index.js';
import { h, svg, jarSvg } from './dom.js';

interface ArtEntry {
  id: string;
  file: string;
  width?: number;
  height?: number;
  variants?: Record<string, string> | string[];
}

const JAR_IDS: Partial<Record<Kind, string>> = { tremor: 'jar-trepet', amber: 'jar-amber-joy', burning: 'jar-burning-joy' };

const ICON_GLYPHS: Record<string, string> = {
  'icon-heat': '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-2 1-4 3-6 0 2 1 3 2 3-1-3 0-6 1-8z" fill="#d9542b"/>',
  'icon-sparks': '<path d="M12 2l2 7 7 3-7 3-2 7-2-7-7-3 7-3z" fill="#f2b632"/>',
  'icon-key': '<circle cx="8" cy="12" r="4" fill="none" stroke="#8a6a45" stroke-width="2.5"/><path d="M12 12h9M18 12v4M21 12v3" stroke="#8a6a45" stroke-width="2.5"/>',
  'icon-thread': '<path d="M4 18c4-10 8 4 12-6s4 4 4 4" fill="none" stroke="#b33a5b" stroke-width="2.5"/>',
  'icon-story': '<path d="M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-5a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h5z" fill="#efe3c6" stroke="#6b5235" stroke-width="1.5"/>',
  'icon-water': '<path d="M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" fill="#4fa7c6"/>',
  'icon-empty-gold': '<circle cx="12" cy="12" r="8" fill="none" stroke="#b9a35b" stroke-width="2.5" stroke-dasharray="3 2"/>',
  'icon-mutnoe': '<circle cx="12" cy="12" r="8" fill="#7d7468"/><circle cx="9" cy="10" r="1.5" fill="#cfc6ba"/><circle cx="14" cy="14" r="1.8" fill="#cfc6ba"/>',
  'icon-silence-jar': '<rect x="6" y="6" width="12" height="15" rx="3" fill="#cfd8e3" stroke="#56657a" stroke-width="1.5"/><rect x="8" y="3" width="8" height="3" fill="#56657a"/>',
  'icon-shelf': '<path d="M3 8h18M3 16h18M5 4v16M19 4v16" stroke="#8a6a45" stroke-width="2"/>',
  'icon-chair': '<path d="M7 3v18M17 12v9M7 12h10M7 3h4" stroke="#8a6a45" stroke-width="2.5" fill="none"/>',
  'icon-mittens': '<path d="M7 20v-9a4 4 0 0 1 8 0v2l3-2a2 2 0 0 1 2 3l-5 6v0z" fill="#c8423a"/>',
  'icon-double-burner': '<circle cx="8" cy="12" r="4" fill="none" stroke="#5c4630" stroke-width="2"/><circle cx="16" cy="12" r="4" fill="none" stroke="#5c4630" stroke-width="2"/>',
};

export class ArtLibrary {
  private entries = new Map<string, ArtEntry>();
  private base = './assets/art/';

  async load(): Promise<void> {
    try {
      const r = await fetch(`${this.base}manifest.json`, { cache: 'no-cache' });
      if (!r.ok) return;
      const m = (await r.json()) as { assets?: ArtEntry[]; entries?: ArtEntry[] } | ArtEntry[];
      const list = Array.isArray(m) ? m : (m.assets ?? m.entries ?? []);
      for (const e of list) if (e && typeof e.id === 'string' && typeof e.file === 'string') this.entries.set(e.id, e);
      const root = document.documentElement.style;
      const css = (id: string, v: string) => {
        const u = this.url(id);
        if (u) root.setProperty(v, `url("${u}")`);
      };
      css('ui-panel-paper', '--paper-tex');
      css('ui-frame', '--frame-img');
      css('ui-button-normal', '--btn-img');
      css('ui-button-hover', '--btn-hover-img');
      css('ui-button-pressed', '--btn-pressed-img');
      document.documentElement.dataset.art = 'on';
    } catch {
      /* placeholders */
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  url(id: string): string | null {
    const e = this.entries.get(id);
    return e ? this.base + e.file : null;
  }

  img(id: string, cls: string, alt = ''): HTMLImageElement | null {
    const url = this.url(id);
    if (!url) return null;
    return h('img', { src: url, class: cls, alt, draggable: 'false', decoding: 'async' });
  }

  jar(kind: Kind, pure: boolean): HTMLElement | null {
    const id = JAR_IDS[kind] ?? `jar-${kind}`;
    const img = this.img(id, 'jar-img');
    if (!img) return null;
    const wrap = h('span', { class: 'jar-wrap' }, img);
    if (!pure) wrap.append(this.img('jar-murky-overlay', 'jar-murk') ?? h('span', { class: 'jar-murk-css' }));
    return wrap;
  }

  icon(id: string): Element {
    const img = this.img(id, 'icon');
    if (img) return img;
    const glyph = ICON_GLYPHS[id];
    return glyph ? svg(`<svg viewBox="0 0 24 24" width="22" height="22">${glyph}</svg>`, 'icon') : h('span', { class: 'icon' });
  }

  placeholderJar(kind: Kind, pure: boolean): SVGSVGElement {
    return jarSvg(kind, pure);
  }
}
