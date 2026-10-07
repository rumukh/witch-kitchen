// Tiny DOM helpers and procedural placeholder visuals (SVG/CSS only).
import type { Kind } from '../model/index.js';

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function button(label: string, onClick: () => void, attrs: Attrs = {}, ...extra: Child[]): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs }, ...extra, extra.length ? null : label);
  if (extra.length) b.setAttribute('aria-label', String(attrs['aria-label'] ?? label));
  let busy = false;
  b.addEventListener('click', () => {
    if (busy || b.getAttribute('aria-disabled') === 'true') return;
    busy = true;
    try {
      onClick();
    } finally {
      setTimeout(() => (busy = false), 0);
    }
  });
  return b;
}

export function svg(markup: string, cls = ''): SVGSVGElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup;
  const el = wrap.firstElementChild as SVGSVGElement;
  if (cls) el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  return el;
}

export const FEELING_COLOR: Record<Kind, string> = {
  joy: '#f2b632',
  sadness: '#4f86c6',
  anger: '#c8423a',
  fear: '#7b5ea7',
  nostalgia: '#a7764a',
  loneliness: '#6f8193',
  tremor: '#2fa39a',
  hope: '#9fd0f0',
  amber: '#d98a1c',
  burning: '#a34a16',
  sediment: '#6b6259',
};

/** A distinct silhouette per feeling (colour is never the only cue). */
const SHAPES: Record<Kind, string> = {
  joy: '<circle cx="16" cy="18" r="6"/><g stroke-width="2.2" stroke-linecap="round"><path d="M16 7v3M16 26v3M5 18h3M24 18h3M8.5 10.5l2 2M21.5 23.5l2 2M8.5 25.5l2-2M21.5 12.5l2-2"/></g>',
  sadness: '<path d="M16 7c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z"/>',
  anger: '<path d="M10 28l3-9-4 1 7-13-1 9 5-1z"/>',
  fear: '<path d="M16 7l4 7 7 1-5 5 1 8-7-4-7 4 1-8-5-5 7-1z"/>',
  nostalgia: '<path fill="none" stroke-width="2.6" d="M16 18a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6 8 8 0 1 1-8-8"/>',
  loneliness: '<path d="M20 8a10 10 0 1 0 0 20 8 8 0 1 1 0-20z"/>',
  tremor: '<path fill="none" stroke-width="2.6" d="M5 14q3-4 6 0t6 0 6 0 6 0M5 21q3-4 6 0t6 0 6 0 6 0"/>',
  hope: '<path d="M16 7c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z"/><path fill="#fff" d="M16 15l1.4 3 3 .4-2.2 2 .6 3-2.8-1.6-2.8 1.6.6-3-2.2-2 3-.4z"/>',
  amber: '<path d="M16 7l9 5v11l-9 5-9-5V12z"/><path fill="#fff6" d="M16 11l5 3v6l-5 3z"/>',
  burning: '<circle cx="16" cy="19" r="7"/><path fill="#ffb347" d="M16 9c3 4 3 6 1 9 3-1 4-3 4-5 1 5-2 9-5 9s-5-3-4-6c1 1 2 1 3 0-1-2-1-4 1-7z"/>',
  sediment: '<rect x="8" y="10" width="16" height="16" rx="3"/><g fill="#fff8"><circle cx="12" cy="15" r="1.4"/><circle cx="19" cy="14" r="1.2"/><circle cx="15" cy="21" r="1.5"/><circle cx="21" cy="22" r="1.1"/></g>',
};

export function feelingIcon(kind: Kind, size = 28): SVGSVGElement {
  const color = FEELING_COLOR[kind];
  return svg(
    `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="${color}" stroke="${color}">${SHAPES[kind]}</svg>`,
    'feeling-icon',
  );
}

export function jarSvg(kind: Kind, pure: boolean, size = 56): SVGSVGElement {
  const color = FEELING_COLOR[kind];
  const murk = pure
    ? ''
    : '<rect x="9" y="17" width="30" height="27" rx="5" fill="url(#murk)" opacity="0.85"/>';
  return svg(
    `<svg viewBox="0 0 48 52" width="${size}" height="${size}">
      <defs><pattern id="murk" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="#5b4b3a" opacity="0.35"/><line x1="0" y1="0" x2="0" y2="6" stroke="#3a2c1f" stroke-width="2.4" opacity="0.6"/></pattern></defs>
      <rect x="15" y="3" width="18" height="7" rx="2" fill="#8a6a45"/>
      <path d="M13 10h22v5c4 2 6 5 6 9v20a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V24c0-4 2-7 6-9z" fill="#fdf8ec" stroke="#5c4630" stroke-width="2"/>
      <circle cx="24" cy="31" r="12" fill="${color}" opacity="0.22"/>
      <g transform="translate(10 17) scale(0.88)" fill="${color}" stroke="${color}">${SHAPES[kind]}</g>
      ${murk}
    </svg>`,
    'jar-svg',
  );
}

export function guestSvg(world: string, special: string | null, size = 96): SVGSVGElement {
  const palette: Record<string, [string, string]> = {
    forest: ['#5f7d3c', '#a9c27a'],
    river: ['#2d7d8c', '#9fd8d8'],
    city: ['#a0622f', '#f1c27d'],
    memorial: ['#8d93a6', '#e6e9f2'],
  };
  const [dark, light] = palette[world] ?? ['#777', '#ccc'];
  const accents: Record<string, string> = {
    dubodyor: '<path d="M30 14l-6-10M66 14l6-10M28 10l-8 0M68 10l8 0" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/>',
    tikhaya: '<path d="M20 60q28 18 56 0" fill="none" stroke="#e6fbff" stroke-width="4"/>',
    commis: '<rect x="30" y="8" width="36" height="10" rx="2" fill="#333"/><rect x="36" y="0" width="24" height="10" fill="#333"/>',
    prosha: '<circle cx="48" cy="40" r="22" fill="#c9a074" opacity="0.6"/>',
    tutorialA: '<path d="M38 12q10-12 20 0" stroke="#3d5a1e" stroke-width="5" fill="none"/>',
    tutorialB: '<path d="M30 30q-8 20 4 30M66 30q8 20-4 30" stroke="#bfe" stroke-width="4" fill="none"/>',
  };
  const face = world === 'memorial' && !special ? '' : '<circle cx="40" cy="40" r="3" fill="#1d1d1d"/><circle cx="56" cy="40" r="3" fill="#1d1d1d"/><path d="M42 50q6 4 12 0" stroke="#1d1d1d" stroke-width="2" fill="none"/>';
  return svg(
    `<svg viewBox="0 0 96 96" width="${size}" height="${size}">
      <path d="M14 96c0-26 14-40 34-40s34 14 34 40z" fill="${dark}"/>
      <ellipse cx="48" cy="40" rx="24" ry="26" fill="${light}" stroke="${dark}" stroke-width="3"/>
      ${face}${special ? (accents[special] ?? '') : ''}
    </svg>`,
    'guest-svg',
  );
}

export function announce(region: HTMLElement | null, text: string): void {
  if (!region) return;
  region.textContent = '';
  setTimeout(() => (region.textContent = text), 30);
}
