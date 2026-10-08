// Tavern (night) screen: stove left, hall centre, shelf right, clock + grandma HUD.
import { bindPlacementItem, bindPlacementSlot, createPlacement } from '@aegis/browser/ui';
import {
  dawnTick,
  dishFeelings,
  freshStage,
  isStoveCell,
  paletteTotal,
  resolve,
  serveCost,
  chimes,
  mirrorOpen,
  activeVows,
  type Action,
  type Dish,
  type GameState,
  type Guest,
  type Jar,
  type Kind,
  type Loc,
} from '../model/index.js';
import type { Ctx } from './app.js';
import { h, button, feelingIcon, jarSvg, guestSvg } from './dom.js';
import { chooseModal, showModal } from './modal.js';
import { shopPanel } from './day.js';
import { listenDialog } from './scene.js';

export interface UiState {
  selected: Loc | null;
  mode: 'normal' | 'experiment' | 'condense';
  multi: number[];
}

const reasonText = (ctx: Ctx, a: Action): string | null => {
  const r = resolve(ctx.state, a, ctx.C);
  return r.ok ? null : ctx.t(`rule.${r.code}`);
};

function disabledIf(b: HTMLButtonElement, reason: string | null): HTMLButtonElement {
  if (reason) {
    b.setAttribute('aria-disabled', 'true');
    b.title = reason;
    b.classList.add('disabled');
  }
  return b;
}

export function actButton(ctx: Ctx, label: string, a: Action, attrs: Record<string, string> = {}, before?: () => Promise<boolean>): HTMLButtonElement {
  const reason = reasonText(ctx, a);
  const b = button(label, async () => {
    if (reason) return ctx.say(reason);
    if (before && !(await before())) return;
    await ctx.act(a);
  }, attrs);
  return disabledIf(b, reason);
}

export function feelingName(ctx: Ctx, k: string): string {
  return ctx.t(`feeling.${k}`);
}

export function guestName(ctx: Ctx, g: Guest): string {
  return g.sp ? ctx.t(`special.${g.sp}`) : ctx.t(`world.${g.w}.guest`);
}

function jarLabel(ctx: Ctx, j: Jar): string {
  if (j.k === 'sediment') return `${feelingName(ctx, 'sediment')} · ${ctx.t('jar.stack', { n: j.s?.length ?? 1 })}`;
  return `${feelingName(ctx, j.k)} · ${ctx.t(j.p ? 'jar.pure' : 'jar.murky')} · ${ctx.t('jar.age', { n: j.a })}`;
}

function hud(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const dawn = dawnTick(s);
  const act = ctx.C.nights.acts.find((a) => s.night >= a.from && s.night <= a.to)?.act ?? 1;
  const track = h('div', { class: 'clock-track', role: 'img', 'aria-label': t('hud.tick', { tick: s.nt.tick, dawn }) });
  for (let i = 1; i <= dawn; i++) track.append(h('span', { class: `pip ${i <= s.nt.tick ? 'past' : ''}` }));
  for (const ch of chimes(s, ctx.C)) {
    const at = ch.t + s.nt.shift;
    const fired = s.nt.fired.includes(ch.id);
    track.append(h('span', { class: `chime-mark ${fired ? 'fired' : ''}`, style: `left:${(100 * at) / dawn}%`, title: t(`hud.chime.${ch.id}`) }, t(`hud.chimeShort.${ch.id}`)));
  }
  const stat = (icon: string, label: string, value: string | number, id: string) =>
    h('div', { class: `stat stat-${id}`, title: label, 'data-testid': `stat-${id}` }, ctx.art.icon(icon), h('span', { class: 'stat-label' }, label), h('b', {}, String(value)));
  const mutVisible = s.night >= ctx.C.nights.acts[1]!.from;
  const cuckooLeft = ctx.C.actions.cuckoo.perNight - s.nt.hints;
  const grandma = h('div', { class: 'grandma-hud', 'data-target': 'hud-cuckoo' },
    ctx.art.img(s.nt.lastHint ? 'grandma-agrafena-whisper' : 'grandma-agrafena-kind', 'grandma-portrait') ?? h('div', { class: 'grandma-portrait placeholder-portrait' }, '⌂'),
    s.night >= ctx.C.actions.cuckoo.fromNight
      ? actButton(ctx, t('hud.cuckoo', { n: cuckooLeft }), { t: 'cuckoo' }, { 'data-testid': 'cuckoo', title: t('hud.cuckoo.title', { n: cuckooLeft }) })
      : null,
    s.nt.lastHint ? h('p', { class: 'hint-text', 'data-testid': 'hint-text' }, hintText(ctx, s)) : null,
  );
  const windBtn = s.night > 1 && ctx.C.nights.modes[s.mode].winding
    ? actButton(ctx, t('hud.wind'), { t: 'windClock' }, { 'data-testid': 'wind' }, async () => {
        if (s.keys === 1 && s.night >= 11) return ctx.confirm(t('hud.windWarnLast'));
        return true;
      })
    : null;
  const face = ctx.art.img('hud-clock-face', 'clock-face');
  const clockArt = face
    ? h('div', { class: 'clock-art', 'aria-hidden': 'true' }, face,
        ctx.art.img('hud-clock-hands', 'clock-hand') ? (() => {
          const hand = ctx.art.img('hud-clock-hands', 'clock-hand')!;
          hand.style.transform = `rotate(${(360 * s.nt.tick) / Math.max(1, dawn)}deg)`;
          return hand;
        })() : null,
        s.night > 1 ? ctx.art.img('hud-pendulum', 'clock-pendulum') : null)
    : null;
  return h('header', { class: 'hud' },
    h('div', { class: 'hud-night' }, h('strong', {}, t('hud.night', { n: s.night })), h('span', {}, t('hud.act', { n: act })), clockArt),
    h('div', { class: 'hud-clock', 'data-target': 'hud-clock', 'data-testid': 'clock' },
      h('div', { class: 'clock-text' }, t('hud.tick', { tick: s.nt.tick, dawn }), ' · ', t('hud.left', { n: dawn - s.nt.tick })),
      track, windBtn,
      mirrorOpen(s, ctx.C) ? button(t('hud.mirror'), () => openMirror(ctx), { class: 'mirror-btn', 'data-target': 'hud-mirror', 'data-testid': 'mirror' }) : null,
    ),
    h('div', { class: 'hud-stats' },
      stat('icon-heat', t('hud.heat'), `${s.nt.heat}/5`, 'heat'),
      stat('icon-sparks', t('hud.sparks'), s.sparks, 'sparks'),
      stat('icon-key', t('hud.keys'), s.keys, 'keys'),
      stat('icon-thread', t('hud.threads'), s.threads, 'threads'),
      stat('icon-story', t('hud.stories'), s.halves ? `${s.stories} +½` : s.stories, 'stories'),
      s.water ? stat('icon-water', t('hud.water'), s.water, 'water') : null,
      s.gold ? stat('icon-empty-gold', t('hud.gold'), s.gold, 'gold') : null,
      stat('icon-mutnoe', t('hud.mut'), mutVisible ? s.mut : t('hud.mutHidden'), 'mut'),
    ),
    grandma,
    button(t('common.pause'), () => ctx.app.togglePause(), { class: 'pause-btn', 'data-testid': 'pause', title: 'Esc' }),
  );
}

export function hintText(ctx: Ctx, s: GameState): string {
  const hnt = s.nt.lastHint!;
  const seat = (hnt.seat ?? 0) + 1;
  const recipe = hnt.recipe ? ctx.t(`recipe.${hnt.recipe}`) : hnt.burner !== undefined ? ctx.t(`recipe.${s.burners[hnt.burner]?.r ?? '__fail'}`) : '';
  return ctx.t(`hint.${hnt.type}`, { seat, recipe, feeling: hnt.kind ? feelingName(ctx, hnt.kind) : '' });
}

function stove(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const heat = h('div', { class: 'heat-meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 5, 'aria-valuenow': s.nt.heat, 'aria-label': `${t('hud.heat')} ${s.nt.heat}` });
  for (let i = 0; i < ctx.C.nights.start.heatMax; i++) heat.append(h('span', { class: `heat-pip ${i < s.nt.heat ? 'on' : ''}` }));
  const burners = h('div', { class: 'burners' });
  s.burners.forEach((d, b) => burners.append(burnerCard(ctx, d, b)));
  return h('section', { class: 'panel stove', 'data-target': 'stove', 'aria-label': t('area.stove') },
    h('h2', {}, t('area.stove')),
    ctx.art.img(s.nt.cooked ? 'hud-stove-lit' : 'hud-stove-idle', 'stove-art') ?? h('div', { class: `stove-art placeholder-stove ${s.burners.some((x) => x && !x.ok) ? 'lit' : ''}` }),
    heat,
    burners,
    actButton(ctx, t('act.kupa'), { t: 'kupa' }, { 'data-testid': 'kupa', class: 'kupa-btn' }),
    s.night === ctx.C.economy.kupaReward.night && !s.flags.kupaReward ? h('p', { class: 'small' }, t('guest.kupaQuest')) : null,
  );
}

function burnerCard(ctx: Ctx, d: Dish | null, b: number): HTMLElement {
  const t = ctx.t;
  const s = ctx.state;
  if (!d) return h('div', { class: 'burner empty', 'data-testid': `burner-${b}` }, h('h3', {}, t('stove.burner', { n: b + 1 })), h('p', {}, t('stove.empty')));
  const stage = d.ok ? freshStage(s, ctx.C, d) : -1;
  const card = h('div', { class: `burner ${d.ok ? 'ready' : 'brewing'} stage-${stage}`, 'data-testid': `burner-${b}` },
    h('h3', {}, t('stove.burner', { n: b + 1 })),
    ctx.art.img(`dish-${d.r}`, 'dish-art'),
    h('p', { class: 'dish-name' }, d.exp ? t('stove.experiment') : t(`recipe.${d.r}`)),
    h('p', { class: 'small' }, d.ok ? `${t('stove.ready')} · ${t(`stove.fresh.${stage}`)}` : t('stove.brewing', { t: d.rt }), d.exp ? '' : ` · ${t('stove.purity', { p: d.pur })}`),
  );
  if (d.ok && !d.exp) {
    card.append(button(t('act.serve'), () => void serveFlow(ctx, b), { class: 'primary', 'data-testid': `serve-${b}` }));
  }
  if (!d.exp)
    card.append(actButton(ctx, t('stove.discard'), { t: 'discardDish', burner: b }, { class: 'ghost small', 'data-testid': `discard-${b}` }, () => ctx.confirm(t('stove.discardConfirm'))));
  return card;
}

async function serveFlow(ctx: Ctx, b: number): Promise<void> {
  const s = ctx.state;
  const t = ctx.t;
  const d = s.burners[b]!;
  const feel = dishFeelings(ctx.C, d.r);
  const choices: { label: string; value: Action; desc?: string; disabled?: string | null }[] = [];
  s.seats.forEach((x, seat) => {
    if (!x || x === 'dirty') return;
    const a: Action = { t: 'serve', burner: b, to: seat };
    const match = x.ord === 'any' || feel.includes(x.ord);
    const cost = serveCost(s, ctx.C, b);
    choices.push({
      label: `${seat + 1}. ${guestName(ctx, x)} — ${x.ord === 'any' ? t('guest.orderAny') : t('guest.order', { feeling: feelingName(ctx, x.ord) })}`,
      desc: `${match ? '✓ ' : '≈ '}${cost ? t('common.ticks', { n: cost }) : t('common.free')}`,
      value: a,
      disabled: reasonText(ctx, a),
    });
  });
  if (s.nt.nameless === 1) {
    const a: Action = { t: 'serve', burner: b, to: 'nameless' };
    choices.push({ label: t('guest.nameless'), value: a, disabled: reasonText(ctx, a) });
  }
  if (s.night === ctx.C.economy.kupaReward.night && !s.flags.kupaReward) {
    const a: Action = { t: 'serve', burner: b, to: 'kupa' };
    choices.push({ label: t('guest.kupa'), value: a, disabled: reasonText(ctx, a) });
  }
  const pick = await chooseModal(t('stove.serveTo', { who: t(`recipe.${d.r}`) }), null, choices, t('common.cancel'));
  if (pick) await ctx.act(pick);
}

function guestCard(ctx: Ctx, g: Guest, seat: number | 'door'): HTMLElement {
  const t = ctx.t;
  const s = ctx.state;
  const atDoor = seat === 'door';
  const ticksLeft = Math.max(0, Math.ceil(g.pat / ctx.C.nights.patience.quarters));
  const pct = Math.max(0, Math.min(100, (100 * g.pat) / g.pat0));
  const candle = h('div', { class: `candle ${g.out ? 'out' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct), 'aria-label': g.out ? t('guest.candleOut') : t('guest.patience', { n: ticksLeft }) },
    h('span', { class: 'candle-fill', style: `width:${pct}%` }),
    h('span', { class: 'candle-text' }, g.out ? t('guest.candleOut') : t('guest.patience', { n: ticksLeft })));
  const card = h('article', { class: `guest world-${g.w} ${g.out ? 'leaving' : ''} ${atDoor ? 'at-door' : ''}`, 'data-testid': atDoor ? 'guest-door' : `guest-${seat}`, 'aria-label': guestName(ctx, g) },
    h('div', { class: 'guest-portrait' }, ctx.art.img(g.sp ? `char-${g.sp}` : `guest-${g.w}-${(g.id % 3) + 1}`, 'guest-art') ?? guestSvg(g.w, g.sp, 84)),
    h('h3', {}, atDoor ? `${guestName(ctx, g)} · ${t('guest.atDoor')}` : `${(seat as number) + 1}. ${guestName(ctx, g)}`),
    atDoor ? null : h('p', { class: 'order' }, g.ord === 'any' ? t('guest.orderAny') : [feelingIcon(g.ord as Kind, 22), ' ', t('guest.order', { feeling: feelingName(ctx, g.ord) })]),
    candle,
    ctx.C.guests.worlds[g.w].reverseFreshness && !g.sp ? h('p', { class: 'small' }, t('guest.reverse')) : null,
  );
  if (atDoor) {
    card.append(actButton(ctx, t('act.refuse'), { t: 'refuse', seat: 'door' }, { class: 'ghost small' }, () => ctx.confirm(t('act.refuseConfirm'))));
    return card;
  }
  const pal = h('div', { class: 'palette', 'aria-label': t('guest.palette') });
  const total = paletteTotal(g);
  for (const [k, n] of Object.entries(g.pal)) {
    for (let i = 0; i < (n ?? 0); i++) {
      const isCore = total === 1;
      const a: Action = isCore ? { t: 'listenBottom', seat: seat as number } : { t: 'listen', seat: seat as number, kind: k as Kind, warm: true };
      const reason = reasonText(ctx, a);
      const b = button(feelingName(ctx, k), async () => {
        if (reason) return ctx.say(reason);
        if (isCore) {
          if (await ctx.confirm(t('act.listenBottomConfirm'), t('act.listenBottom'))) await ctx.act(a);
          return;
        }
        const warm = await listenDialog(ctx, g, k as Kind);
        if (warm !== null) await ctx.act({ t: 'listen', seat: seat as number, kind: k as Kind, warm });
      }, { class: `pal-jar ${isCore ? 'core' : ''}`, 'data-testid': `listen-${seat}-${k}`, 'aria-label': `${t('act.listenAbout', { feeling: feelingName(ctx, k) })}${isCore ? ' — ' + t('act.coreWarning') : ''}` }, feelingIcon(k as Kind, 26), h('span', { class: 'pal-label' }, feelingName(ctx, k)));
      pal.append(disabledIf(b, reason));
    }
  }
  card.append(h('p', { class: 'small' }, total === 1 ? t('act.coreWarning') : t('act.listen')), pal);
  if (g.st) {
    const story = ctx.i18n.cat.stories[g.st];
    if (story) card.append(h('p', { class: 'story-line' }, t('guest.story', { title: story.title }), ' · ', t('guest.fragments', { n: Math.min(3, s.col[g.st] ?? 0) })));
  }
  card.append(actButton(ctx, t('act.refuse'), { t: 'refuse', seat: seat as number }, { class: 'ghost small', 'data-testid': `refuse-${seat}` }, () => ctx.confirm(t('act.refuseConfirm'))));
  return card;
}

function hall(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const seats = h('div', { class: 'seats' });
  s.seats.forEach((x, i) => {
    if (x === null) seats.append(h('div', { class: 'seat empty', 'data-testid': `seat-${i}` }, h('h3', {}, `${i + 1}`), h('p', {}, t('guest.emptySeat'))));
    else if (x === 'dirty')
      seats.append(h('div', { class: 'seat dirty', 'data-testid': `seat-${i}` }, h('h3', {}, `${i + 1}`), h('p', {}, t('guest.dirty')), actButton(ctx, t('act.clean'), { t: 'clean', seat: i }, { class: 'primary', 'data-testid': `clean-${i}` })));
    else seats.append(guestCard(ctx, x, i));
  });
  const door = h('div', { class: 'door-area', 'aria-label': t('area.door') }, h('h3', {}, t('area.door')), s.door ? guestCard(ctx, s.door, 'door') : h('p', { class: 'small' }, '—'));
  const upcoming = s.nt.sched.filter((e) => !e.done);
  const final = s.night === ctx.C.guests.nameless.finalNight;
  const nameless = s.nt.nameless === 1
    ? h('div', { class: 'nameless', 'data-target': 'nameless', 'data-testid': 'nameless' },
        ctx.art.img('char-nameless', 'nameless-art') ?? h('div', { class: 'nameless-glow', 'aria-hidden': 'true' }),
        h('h3', {}, t('guest.nameless')), h('p', { class: 'caption-empty' }, t('guest.namelessCaption')),
        h('p', { class: 'small' }, final ? t('guest.namelessFinal') : t('guest.namelessHint')))
    : null;
  return h('section', { class: 'panel hall', 'data-target': 'hall', 'aria-label': t('area.hall') },
    h('h2', {}, t('area.hall'), upcoming.length ? h('span', { class: 'small upcoming' }, ` · ${upcoming.map((e) => e.t + (s.night > 1 ? s.nt.shift : 0)).join(', ')}`) : null),
    seats, h('div', { class: 'hall-bottom' }, door, nameless),
  );
}

export function renderShelfOnly(ctx: Ctx): HTMLElement {
  return shelf(ctx);
}

let shelfCleanups: (() => void)[] = [];

function shelf(ctx: Ctx): HTMLElement {
  for (const c of shelfCleanups) c();
  shelfCleanups = [];
  const s = ctx.state;
  const t = ctx.t;
  const ui = ctx.ui;
  const grid = h('div', { class: `shelf-grid cols-${s.cols}`, role: 'group', 'aria-label': t('area.shelf') });
  const cleanups = shelfCleanups;
  let updateSel = (): void => undefined;
  const placement = createPlacement({
    validate: (item, slot) => (item === slot ? { ok: false, messageKey: 'bad-cell' } : { ok: true }),
    commit: async (item, slot) => {
      const from: Loc = item === 'tray' ? 'tray' : Number(item);
      const to: Loc = slot === 'tray' ? 'tray' : Number(slot);
      ui.selected = null;
      await ctx.act({ t: 'move', from, to });
    },
    onChange: (st) => {
      ui.selected = st.selected === undefined ? null : st.selected === 'tray' ? 'tray' : Number(st.selected);
      grid.parentElement?.querySelectorAll('.cell').forEach((c) => c.classList.toggle('selected', (c as HTMLElement).dataset.loc === st.selected));
      updateSel();
      if (st.selected) ctx.say(t('a11y.chooseTarget'));
    },
    onError: () => undefined,
  });
  const slotAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-loc]') as HTMLElement | null)?.dataset.loc;
  const cell = (loc: Loc, j: Jar | null) => {
    const id = String(loc);
    const label = j ? jarLabel(ctx, j) : t('a11y.empty');
    const inMulti = typeof loc === 'number' && ui.multi.includes(loc);
    const b = h('button', {
      type: 'button',
      class: `cell ${j ? 'filled k-' + j.k : 'empty'} ${typeof loc === 'number' && isStoveCell(loc) ? 'by-stove' : ''} ${inMulti ? 'multi' : ''}`,
      'data-loc': id,
      'data-testid': loc === 'tray' ? 'tray' : `cell-${loc}`,
      'aria-label': loc === 'tray' ? `${t('area.tray')}: ${label}` : t('a11y.shelfCell', { n: (loc as number) + 1, content: label }),
      'aria-pressed': inMulti ? 'true' : null,
    }) as HTMLButtonElement;
    if (j) {
      b.append(ctx.art.jar(j.k, j.p) ?? jarSvg(j.k, j.p, 50));
      b.append(h('span', { class: 'cell-label' }, feelingName(ctx, j.k)));
      b.append(h('span', { class: 'cell-meta' }, j.k === 'sediment' ? `×${j.s?.length ?? 1}` : `${j.p ? '' : '≈ '}${j.a}`));
    }
    if (ui.mode !== 'normal') {
      b.addEventListener('click', () => {
        if (typeof loc !== 'number' || !j || j.k === 'sediment') return;
        ui.multi = inMulti ? ui.multi.filter((x) => x !== loc) : [...ui.multi, loc];
        ctx.rerender();
      });
    } else if (j) cleanups.push(bindPlacementItem(b, id, placement, { slotAt, onError: () => undefined }));
    else cleanups.push(bindPlacementSlot(b, id, placement, () => undefined));
    if (j && ui.mode === 'normal') {
      // Occupied cells are also destinations (swap) once something else is selected.
      b.addEventListener('click', (e) => {
        const sel = placement.selected();
        if (sel && sel !== id) {
          e.stopImmediatePropagation();
          void placement.place(id);
        }
      }, { capture: true });
    }
    return b;
  };
  for (let row = 0; row < 2; row++) for (let col = 0; col < s.cols; col++) grid.append(cell(col * 2 + row, s.shelf[col * 2 + row] ?? null));
  const selActions = h('div', { class: 'sel-actions' });
  updateSel = () => {
    selActions.replaceChildren();
    const sel = ui.selected !== null ? (ui.selected === 'tray' ? s.tray : s.shelf[ui.selected]) : null;
    if (!sel || ui.selected === null || ui.mode !== 'normal') return;
    const k = sel.k;
    const label = k === 'anger' && !s.nt.angerBurned ? t('act.burnAnger') : k === 'sediment' ? t('act.burnSediment') : t('act.burnOther');
    selActions.append(h('span', {}, t('a11y.selected', { what: jarLabel(ctx, sel) })), actButton(ctx, label, { t: 'burn', from: ui.selected }, { 'data-testid': 'burn-selected' }), button(t('act.cancelSelection'), () => placement.cancel()));
  };
  ui.selected = null;
  const tray = h('div', { class: 'tray-area', 'data-target': 'tray' }, h('h3', {}, t('area.tray')), cell('tray', s.tray));
  const silence = s.silence >= 0 ? h('div', { class: 'silence-jar' }, ctx.art.icon('icon-silence-jar'), t('area.silence', { n: s.silence }), s.silence > 0 ? actButton(ctx, t('act.burnSediment'), { t: 'burn', from: 'silence' }, { class: 'small' }) : null) : null;
  const panel = h('section', { class: 'panel shelf', 'data-target': 'shelf', 'aria-label': t('area.shelf') }, h('h2', {}, t('area.shelf')), grid, selActions, tray, silence);
  if (s.cols < 4 && s.night >= 9) panel.append(h('p', { class: 'warn small' }, t('day.shelfWarn')));
  return panel;
}

function vowStrip(ctx: Ctx): HTMLElement | null {
  const ids = activeVows(ctx.state, ctx.C);
  if (!ids.length) return null;
  return h('aside', { class: 'vow-strip', 'data-target': 'vows' }, ...ids.map((id) => h('span', { class: 'vow-chip' }, `${ctx.t('day.vows')}: ${vowTitle(ctx, id)}`)));
}

export function vowTitle(ctx: Ctx, id: string): string {
  const sc = ctx.i18n.cat.scenes[`vow.${id}.title`];
  return sc?.lines[0]?.t ?? id;
}

async function cookFlow(ctx: Ctx): Promise<void> {
  const s = ctx.state;
  const t = ctx.t;
  const choices: { label: string; value: Action; desc?: string; disabled?: string | null }[] = [];
  for (const id of s.known) {
    const r = ctx.C.recipes.recipes[id]!;
    const ing = Object.entries(r.ingredients).map(([k, n]) => `${t(k in ctx.C.feelings.kinds ? `feeling.${k}` : `ingredient.${k}`)} ${n}`).join(', ');
    const a: Action = { t: 'cook', recipe: id };
    const reason = reasonText(ctx, a);
    const wa: Action = { t: 'cook', recipe: id, water: true };
    const desc = `${ing} · ${t('recipe.brew', { n: r.brew })} · ${t('recipe.heat', { n: r.heat })}`;
    choices.push({ label: t(`recipe.${id}`), value: a, desc, disabled: reason });
    if (r.heat > 0 && s.water > 0 && reason === t('rule.no-heat')) choices.push({ label: `${t(`recipe.${id}`)} — ${t('act.cookWater')}`, value: wa, desc, disabled: reasonText(ctx, wa) });
  }
  const pick = await chooseModal(t('act.cook'), null, choices, t('common.cancel'));
  if (!pick) return;
  if (pick.t === 'cook' && pick.recipe === 'memory_pie' && s.threads === 1 && !(await ctx.confirm(t('warn.lastThread')))) return;
  await ctx.act(pick);
}

function actionBar(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const ui = ctx.ui;
  const bar = h('nav', { class: 'action-bar', 'data-target': 'actions', id: 'actions', 'aria-label': 'Действия' });
  if (ui.mode !== 'normal') {
    const a: Action = ui.mode === 'experiment' ? { t: 'experiment', cells: ui.multi } : { t: 'condense', cells: ui.multi };
    bar.append(
      h('span', { class: 'mode-hint' }, t(ui.mode === 'experiment' ? 'act.experimentPick' : 'act.condensePick')),
      actButton(ctx, t('common.confirm'), a, { class: 'primary', 'data-testid': 'multi-confirm' }),
      button(t('common.cancel'), () => {
        ui.mode = 'normal';
        ui.multi = [];
        ctx.rerender();
      }),
    );
    return bar;
  }
  const cook = button(t('act.cook'), () => void cookFlow(ctx), { class: 'primary', 'data-testid': 'cook', title: 'C' });
  bar.append(cook);
  bar.append(disabledIf(button(t('act.experiment'), () => {
    ui.mode = 'experiment';
    ui.multi = [];
    ctx.rerender();
  }, { 'data-testid': 'experiment' }), s.burners.every((d) => d) ? t('rule.no-burner') : null));
  if (s.night >= ctx.C.actions.condense.fromNight)
    bar.append(button(t('act.condense'), () => {
      ui.mode = 'condense';
      ui.multi = [];
      ctx.rerender();
    }, { 'data-testid': 'condense' }));
  bar.append(actButton(ctx, t('act.wait'), { t: 'wait' }, { 'data-testid': 'wait', title: 'W' }));
  bar.append(actButton(ctx, t('act.undo'), { t: 'undo' }, { 'data-testid': 'undo', title: 'Ctrl+Z' }));
  bar.append(actButton(ctx, t('act.endNight'), { t: 'endNight' }, { 'data-testid': 'end-night' }, () => ctx.confirm(t('act.endNightConfirm'))));
  bar.append(actButton(ctx, t('act.replay'), { t: 'restartNight' }, { class: 'ghost', 'data-testid': 'replay' }, () => ctx.confirm(t('act.replayConfirm'))));
  if (s.night === ctx.C.endings.finalNight) {
    bar.append(actButton(ctx, t('final.wind'), { t: 'windFinal' }, { class: 'final', 'data-testid': 'wind-final' }, () => ctx.confirm(t('final.windConfirm'), t('final.wind'))));
  }
  if (s.night >= ctx.C.endings.finalNight && s.preFinale)
    bar.append(actButton(ctx, t('final.restore'), { t: 'restorePreFinale' }, { class: 'ghost' }, () => ctx.confirm(t('final.restoreConfirm'))));
  const r = resolve(s, { t: 'wait' }, ctx.C);
  if (!r.ok && r.code === 'past-dawn') bar.append(h('span', { class: 'small' }, t('act.disabled.windHint')));
  return bar;
}

function openMirror(ctx: Ctx): void {
  const m = showModal(ctx.t('day.shop'), [shopPanel(ctx, true), h('div', { class: 'modal-actions' }, button(ctx.t('common.close'), () => m.close(), { class: 'primary' }))]);
}

export function renderTavern(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const night = h('div', { class: `tavern night-${s.night} ${s.nt.fired.includes('predawn') ? 'predawn' : ''} ${s.nt.nameless === 1 ? 'nameless-present' : ''}`, 'data-testid': 'tavern' },
    ctx.art.img(s.nt.fired.includes('predawn') ? 'bg-tavern-predawn' : 'bg-tavern-night', 'tavern-bg') ?? h('div', { class: 'tavern-bg placeholder-bg' }),
    hud(ctx),
    vowStrip(ctx),
    h('div', { class: 'tavern-main' }, stove(ctx), hall(ctx), shelf(ctx)),
    actionBar(ctx),
  );
  return night;
}
