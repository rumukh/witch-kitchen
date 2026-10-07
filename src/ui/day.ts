// Межсветье: report, shelf & forecast, tram, Mirror shop, tarot, recipes, stories/doors, vows.
import {
  forecast,
  tremorCandidates,
  defaultTremorPairs,
  completeStories,
  storyIds,
  neighbors,
  WORLDS,
  type Action,
  type Kind,
} from '../model/index.js';
import type { Ctx } from './app.js';
import { h, button, feelingIcon } from './dom.js';
import { actButton, feelingName, vowTitle, renderShelfOnly } from './tavern.js';

const TABS = ['report', 'shelf', 'tram', 'shop', 'tarot', 'recipes', 'stories', 'vows'] as const;
type Tab = (typeof TABS)[number];
let tab: Tab = 'report';

export function shopPanel(ctx: Ctx, night = false): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const list = h('div', { class: 'shop', 'data-target': 'day-shop' }, h('p', { class: 'small' }, t('day.shop.desc')));
  for (const [item, price] of Object.entries(ctx.C.economy.prices)) {
    const owned = item === 'shelf' ? s.cols > 3 : item === 'chair' ? s.seatsN > 3 : item === 'double_burner' ? s.burnersN > 1 : item === 'silence_jar' ? s.silence >= 0 : s.up.includes(item);
    const row = h('div', { class: `shop-item ${owned ? 'owned' : ''}`, 'data-testid': `shop-${item}` },
      ctx.art.icon(`icon-${item.replace('_', '-')}`),
      h('div', {}, h('strong', {}, t(`day.shop.${item}`)), h('p', { class: 'small' }, t(`day.shop.${item}.desc`))),
    );
    if (owned) row.append(h('span', { class: 'badge' }, t('day.shop.owned')));
    else {
      row.append(actButton(ctx, t('day.shop.buy', { n: price.sparks ?? 0 }), { t: 'buy', item }, { 'data-testid': `buy-${item}` }));
      if (price.stories) row.append(actButton(ctx, t('day.shop.buyStory'), { t: 'buy', item, pay: 'stories' }, { 'data-testid': `buy-${item}-story` }));
    }
    list.append(row);
  }
  if (!night) {
    list.append(h('div', { class: 'shop-item' }, h('div', {}, h('strong', {}, t('day.shop.trade')), h('p', { class: 'small' }, t('day.shop.trade.desc'))),
      s.flags.mirrorTraded ? h('span', { class: 'badge' }, t('day.shop.owned')) : actButton(ctx, t('common.confirm'), { t: 'mirrorTrade' }, { 'data-testid': 'mirror-trade' })));
  }
  if (s.night === ctx.C.economy.murky.night)
    list.append(h('div', { class: 'shop-item' }, h('div', {}, h('strong', {}, t('day.shop.murky')), h('p', { class: 'small' }, t('day.shop.murky.desc'))), actButton(ctx, t('day.shop.buy', { n: ctx.C.economy.murky.sparks }), { t: 'buyMurky' })));
  return list;
}

function report(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const r = s.report;
  if (!r) return h('p', {}, '—');
  const st = r.stats;
  return h('div', { class: 'report', 'data-testid': 'night-report' },
    h('h3', {}, t('day.after', { n: r.night })),
    h('ul', {},
      h('li', {}, t('day.report.served', { n: st.served })),
      h('li', {}, t('day.report.satisfied', { n: st.satisfied })),
      h('li', {}, t('day.report.unhappy', { n: st.unhappy + st.overdrawn })),
      h('li', {}, t('day.report.sparks', { n: st.sparks })),
      h('li', {}, t('day.report.stories', { n: st.stories })),
      h('li', {}, t('day.report.sediment', { n: st.sediment })),
      st.heatLost ? h('li', {}, t('day.report.heatLost', { n: st.heatLost })) : null,
      r.thread ? h('li', { class: 'warn' }, t('day.report.thread')) : null,
      r.guardian ? h('li', { class: 'good' }, t('day.report.guardian')) : null,
    ),
    s.threads === 1 ? h('p', { class: 'warn' }, t('warn.lastThread')) : s.threads === 0 ? h('p', { class: 'warn' }, t('warn.zeroThreads')) : null,
  );
}

function cellName(ctx: Ctx, loc: number | 'tray'): string {
  return loc === 'tray' ? ctx.t('day.trayName') : ctx.t('day.cellName', { n: loc + 1 });
}

function shelfTab(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const fc = forecast(s, ctx.C);
  const items = h('ul', { class: 'forecast', 'data-target': 'day-forecast', 'data-testid': 'forecast' });
  for (const f of fc) {
    if (f.from === 'joy' && f.to === 'tremor') items.append(h('li', {}, feelingIcon('tremor', 20), ' ', t('day.forecast.merge', { cell: cellName(ctx, f.cell) })));
    else if (f.to === null && f.from === 'sediment') items.append(h('li', {}, t('day.forecast.evaporates', { cell: cellName(ctx, f.cell) })));
    else if (f.to) items.append(h('li', {}, feelingIcon(f.to as Kind, 20), ' ', t('day.forecast.item', { cell: cellName(ctx, f.cell), from: feelingName(ctx, f.from), to: feelingName(ctx, f.to) })));
  }
  // Loneliness threat (Q23): honest countdown.
  const after = ctx.C.feelings.kinds.loneliness.drainsNeighborsAfterDawns ?? 3;
  s.shelf.forEach((j, i) => {
    if (j?.k !== 'loneliness') return;
    for (const nb of neighbors(i, s.cols)) {
      const o = s.shelf[nb];
      if (!o || o.k === 'loneliness' || o.k === 'sediment') continue;
      const n = after - (s.pairs[`${j.u}-${o.u}`] ?? 0);
      items.append(h('li', { class: 'warn' }, t('day.forecast.threat.lonely', { cell: cellName(ctx, nb), n })));
    }
  });
  if (s.shelf.some((j, i) => j?.k === 'joy' && i < 2)) items.append(h('li', { class: 'warn' }, t('day.forecast.threat.stove')));
  if (!items.children.length) items.append(h('li', {}, t('day.forecast.none')));
  const cands = tremorCandidates(s, ctx.C);
  const pairs = h('div', { class: 'pairs' });
  if (cands.length) {
    const cur = JSON.stringify(s.tremorPairs ?? defaultTremorPairs(s, ctx.C));
    pairs.append(h('h4', {}, t('day.forecast.pairs')));
    const opt = (label: string, value: [number, number][]) => {
      const b = actButton(ctx, label, { t: 'tremorPairs', pairs: value }, { class: JSON.stringify(value) === cur ? 'primary' : '', 'aria-pressed': String(JSON.stringify(value) === cur) });
      pairs.append(b);
    };
    for (const [a, b] of cands) opt(`${cellName(ctx, a)} + ${cellName(ctx, b)}`, [[a, b]]);
    opt(t('day.forecast.pairNone'), []);
  }
  return h('div', { class: 'shelf-tab' },
    renderShelfOnly(ctx),
    h('h3', {}, t('day.forecast')), h('p', { class: 'small' }, t('day.forecast.desc')), items, pairs,
    s.cols < 4 ? h('p', { class: 'warn' }, t('day.shelfWarn')) : null,
  );
}

function tram(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const box = h('div', { class: 'tram', 'data-target': 'day-tram' }, ctx.art.img('char-tram33', 'tram-art'), h('p', {}, t('day.tram.desc')));
  if (s.tarot) box.append(h('p', { class: 'warn' }, t('day.tram.locked')));
  const opt = (label: string, line: (typeof WORLDS)[number] | null) =>
    actButton(ctx, label, { t: 'tram', line }, { class: s.line === line ? 'primary' : '', 'aria-pressed': String(s.line === line), 'data-testid': `tram-${line ?? 'none'}` });
  box.append(opt(t('day.tram.none'), null));
  for (const w of WORLDS) box.append(opt(t(`world.${w}`), w));
  return box;
}

function tarot(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const box = h('div', { class: 'tarot', 'data-target': 'day-tarot' }, h('p', {}, t('day.tarot.desc')));
  if (!s.tarot) {
    for (const card of ['guest', 'wind', 'whisper'] as const)
      box.append(h('div', { class: 'tarot-card' }, ctx.art.img(`tarot-${card}`, 'tarot-art'), h('strong', {}, t(`day.tarot.${card}`)), h('p', { class: 'small' }, t(`day.tarot.${card}.desc`)), actButton(ctx, t('common.confirm'), { t: 'tarot', card }, { 'data-testid': `tarot-${card}` })));
    return box;
  }
  const r = s.tarot;
  let text = '';
  if (r.card === 'guest') text = t('day.tarot.result.guest', { list: (r.guests ?? []).map((g) => `${g.sp ? t(`special.${g.sp}`) : t(`world.${g.w}.guest`)} (${g.ord === 'any' ? t('feeling.any') : feelingName(ctx, g.ord)})`).join(', ') });
  else if (r.card === 'wind') text = r.wind ? t('day.tarot.result.wind', { world: t(`world.${r.wind}`) }) : t('day.tarot.result.windNone');
  else if (r.hint) {
    const [rec, ing] = r.hint.split(':');
    text = t('day.tarot.result.whisper', { recipe: t(`recipe.${rec}`), ingredient: ing! in ctx.C.feelings.kinds ? feelingName(ctx, ing!) : t(`ingredient.${ing}`) });
  } else text = t('day.tarot.result.whisperNone');
  box.append(h('div', { class: 'tarot-result', 'data-testid': 'tarot-result' }, ctx.art.img(`tarot-${r.card}`, 'tarot-art'), h('p', {}, text)));
  return box;
}

export function recipesBook(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const box = h('div', { class: 'recipes' });
  const chapters = new Map<string, HTMLElement>();
  for (const [id, r] of Object.entries(ctx.C.recipes.recipes)) {
    const known = s.known.includes(id);
    const hints = s.book.filter((b) => b.startsWith(id + ':')).map((b) => b.split(':')[1]!);
    if (!known && !hints.length && r.story) continue;
    let ch = chapters.get(r.chapter);
    if (!ch) {
      ch = h('section', { class: 'chapter' }, h('h4', {}, t(`chapter.${r.chapter}`)));
      chapters.set(r.chapter, ch);
      box.append(ch);
    }
    const ing = known
      ? Object.entries(r.ingredients).map(([k, n]) => h('span', { class: 'ing' }, k in ctx.C.feelings.kinds ? feelingIcon(k as Kind, 18) : null, `${k in ctx.C.feelings.kinds ? feelingName(ctx, k) : t(`ingredient.${k}`)} ${n}`))
      : hints.map((k) => h('span', { class: 'ing' }, t('recipe.hint', { ingredient: k in ctx.C.feelings.kinds ? feelingName(ctx, k) : t(`ingredient.${k}`) })));
    ch.append(h('div', { class: `recipe ${known ? '' : 'unknown'}` }, ctx.art.img(`dish-${id}`, 'dish-thumb'), h('strong', {}, known ? t(`recipe.${id}`) : t('recipe.unknown')), h('div', { class: 'ings' }, ...ing), known ? h('span', { class: 'small' }, `${t('recipe.brew', { n: r.brew })} · ${t('recipe.heat', { n: r.heat })}`) : null, id === 'pryazhenets' && known ? h('p', { class: 'small lore' }, t('recipe.prya.lore')) : null));
  }
  if (s.tried.length) box.append(h('p', { class: 'small' }, t('recipe.tried', { combo: s.tried.map((c) => c.split('+').map((k) => feelingName(ctx, k)).join(' + ')).join('; ') })));
  return box;
}

function stories(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const box = h('div', { class: 'stories', 'data-target': 'day-stories' }, h('p', { class: 'small' }, t('day.stories.halfNote')));
  for (const w of WORLDS) {
    const open = s.doors.includes(w);
    const sec = h('section', { class: `world-stories world-${w}` },
      ctx.art.img(`door-${w}-${open ? 'open' : 'closed'}`, 'door-art'),
      h('h4', {}, t('day.stories.door', { world: t(`world.${w}`) }), ' — ', open ? t('day.stories.doorOpen') : t('day.stories.doorClosed', { n: completeStories(s, ctx.C, w) })),
      h('p', { class: 'small' }, t(`day.stories.bonus.${w}`)));
    for (const id of storyIds(ctx.C, w)) {
      const v = s.col[id] ?? 0;
      const st = ctx.i18n.cat.stories[id];
      if (!v || !st) {
        sec.append(h('details', { class: 'story locked' }, h('summary', {}, t('day.stories.locked'))));
        continue;
      }
      const frags = st.fragments.slice(0, Math.min(3, v)).map((f) => h('p', {}, ctx.i18n.filter(f)));
      sec.append(h('details', { class: 'story' }, h('summary', {}, st.title, v > 3 ? ' ✓' : ` (${Math.min(3, v)}/3)`), ...frags, v > 3 ? h('p', { class: 'story-ending' }, ctx.i18n.filter(st.ending)) : null));
    }
    box.append(sec);
  }
  return box;
}

function vows(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const box = h('ul', { class: 'vows', 'data-target': 'vows' });
  for (const id of Object.keys(ctx.C.vows.vows)) {
    const v = s.vows[id];
    if (!v) continue;
    const spoiler = ctx.C.vows.vows[id]!.spoiler && ctx.profile.profile.settings.streamer;
    box.append(h('li', { class: `vow vow-${v.s}` }, h('strong', {}, spoiler ? '—' : vowTitle(ctx, id)), ' · ', t(`day.vow.status.${v.s}`), ` · ${v.from}${v.to !== v.from ? '–' + v.to : ''}`));
  }
  if (!box.children.length) box.append(h('li', {}, t('day.vows.none')));
  return box;
}

export function renderDay(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const nav = h('nav', { class: 'day-tabs', role: 'tablist', 'aria-label': t('day.title') });
  const labels: Record<Tab, string> = { report: t('day.report'), shelf: `${t('area.shelf')} · ${t('day.forecast')}`, tram: t('day.tram'), shop: t('day.shop'), tarot: t('day.tarot'), recipes: t('day.recipes'), stories: t('day.stories'), vows: t('day.vows') };
  for (const k of TABS) {
    const b = button(labels[k], () => {
      tab = k;
      ctx.rerender();
    }, { role: 'tab', 'aria-selected': String(tab === k), class: tab === k ? 'active' : '', 'data-testid': `tab-${k}`, 'data-target': `day-${k}` });
    nav.append(b);
  }
  const body = tab === 'report' ? report(ctx) : tab === 'shelf' ? shelfTab(ctx) : tab === 'tram' ? tram(ctx) : tab === 'shop' ? shopPanel(ctx) : tab === 'tarot' ? tarot(ctx) : tab === 'recipes' ? recipesBook(ctx) : tab === 'stories' ? stories(ctx) : vows(ctx);
  const finalNext = s.night + 1 === ctx.C.endings.finalNight;
  const next: Action = { t: 'nextNight' };
  return h('div', { class: 'day', 'data-testid': 'day' },
    ctx.art.img('bg-mezhsvetye-day', 'day-bg') ?? h('div', { class: 'day-bg placeholder-day' }),
    h('header', { class: 'day-head' }, h('h1', {}, t('day.title')), h('span', {}, t('day.after', { n: s.night })),
      h('span', { class: 'day-stats' }, `${t('hud.sparks')}: ${s.sparks} · ${t('hud.keys')}: ${s.keys} · ${t('hud.threads')}: ${s.threads} · ${t('hud.stories')}: ${s.stories}${s.halves ? ' +½' : ''}`),
      button(t('common.pause'), () => ctx.app.togglePause(), { class: 'pause-btn', 'data-testid': 'pause' })),
    h('div', { class: 'day-main' }, nav, h('section', { class: 'day-body panel', role: 'tabpanel' }, body)),
    h('footer', { class: 'day-foot' },
      finalNext ? h('p', { class: 'small' }, t('day.preFinaleNote')) : null,
      s.nightStart && s.nightStart.night === s.night ? actButton(ctx, t('day.replayPrev'), { t: 'restartNight' }, { class: 'ghost', 'data-testid': 'replay-prev' }, () => ctx.confirm(t('act.replayConfirm'))) : null,
      actButton(ctx, finalNext ? t('day.nextFinal') : t('day.next'), next, { class: 'primary big', 'data-testid': 'next-night' }),
    ),
  );
}
