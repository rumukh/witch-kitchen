// Dialogue presenter: portraits, skippable text reveal with per-speaker murmur, vow offers.
import { projectPresentation } from '@aegis/browser/ui';
import type { Guest, Kind } from '../model/index.js';
import type { Ctx } from './app.js';
import type { Scene } from './i18n.js';
import { h, button, feelingIcon, guestSvg } from './dom.js';
import { showModal } from './modal.js';
import { feelingName, guestName, guestPortrait } from './tavern.js';

function sceneFor(ctx: Ctx, id: string): { scene: Scene | null; params: Record<string, string> } {
  const [base, param] = id.split(':') as [string, string | undefined];
  const params: Record<string, string> = {};
  if (param !== undefined) {
    params.param = param;
    params.n = param;
    if (base === 'door.open') params.world = ctx.t(`world.${param}`);
    if (base === 'recipe.learned') params.recipe = ctx.t(`recipe.${param}`);
  }
  params.mut = String(ctx.state.mut);
  return { scene: ctx.i18n.cat.scenes[id] ?? ctx.i18n.cat.scenes[base] ?? null, params };
}

function speakerName(ctx: Ctx, s: string): string {
  if (s === 'narrator') return '';
  const key = `special.${s}`;
  return ctx.i18n.has(key) ? ctx.t(key) : s;
}

function portrait(ctx: Ctx, s: string): Node | null {
  if (s === 'narrator') return null;
  const ids: Record<string, string> = { grandma: 'grandma-agrafena-kind', mira: 'mira-neutral', kupa: 'char-kupa-portrait' };
  const img = ctx.art.img(ids[s] ?? `char-${s}`, 'scene-portrait') ?? (s === 'kupa' ? ctx.art.img('kupa', 'scene-portrait') : null);
  if (img) return img;
  const world = s === 'dubodyor' ? 'forest' : s === 'tikhaya' ? 'river' : s === 'prosha' || s === 'commis' ? 'city' : 'memorial';
  return guestSvg(world, s, 120);
}

function fill(text: string, params: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v);
  return out;
}

/** Shows lines one by one; resolves when the player has read them all. */
function presentLines(ctx: Ctx, id: string, lines: { s: string; t: string; e?: string }[], extra?: (done: () => void) => Node): Promise<void> {
  const reduced = ctx.profile.profile.settings.reducedMotion;
  return new Promise((resolve) => {
    let i = 0;
    let revealing: number | null = null;
    const who = h('div', { class: 'scene-who' });
    const text = h('p', { class: 'scene-text', 'aria-live': 'polite', 'data-testid': 'scene-text' });
    const pic = h('div', { class: 'scene-pic' });
    const actions = h('div', { class: 'modal-actions' });
    const next = button(ctx.t('common.next'), () => advance(), { class: 'primary', 'data-testid': 'scene-next' });
    const skip = button(ctx.t('common.skip'), () => finishAll(), { class: 'ghost', 'data-testid': 'scene-skip' });
    actions.append(next, skip);
    const m = showModal('', [h('div', { class: 'scene-layout' }, pic, h('div', { class: 'scene-col' }, who, text)), actions], { cls: 'scene', dismissible: false, initial: () => next });
    m.dialog.dataset.scene = id;
    const show = () => {
      const line = lines[i]!;
      who.textContent = speakerName(ctx, line.s);
      pic.replaceChildren(...[portrait(ctx, line.s)].filter(Boolean) as Node[]);
      if (line.e) ctx.audio.whisper(line.e, line.t);
      const full = line.t;
      if (reduced || full.length < 2) {
        text.textContent = full;
        return;
      }
      ctx.audio.murmur(line.s);
      let n = 0;
      text.textContent = '';
      revealing = window.setInterval(() => {
        n += 2;
        text.textContent = full.slice(0, n);
        if (n >= full.length) stopReveal();
      }, 18);
    };
    const stopReveal = () => {
      if (revealing !== null) clearInterval(revealing);
      revealing = null;
      ctx.audio.stopMurmur();
      const line = lines[Math.min(i, lines.length - 1)];
      if (line) text.textContent = line.t;
    };
    const advance = () => {
      if (revealing !== null) return stopReveal();
      i++;
      if (i >= lines.length) return end();
      show();
    };
    const finishAll = () => {
      stopReveal();
      end();
    };
    const end = () => {
      if (extra) {
        actions.replaceChildren(extra(() => close()));
        (actions.querySelector('button') as HTMLElement | null)?.focus();
        i = lines.length - 1;
        return;
      }
      close();
    };
    const close = () => {
      stopReveal();
      m.close();
      resolve();
    };
    m.dialog.addEventListener('keydown', (e) => {
      if (e.key === ' ' && document.activeElement === next) return;
    });
    if (!lines.length) return end();
    show();
  });
}

function resolveLines(ctx: Ctx, id: string): { s: string; t: string; e?: string }[] {
  const { scene, params } = sceneFor(ctx, id);
  if (!scene) return [];
  const streamer = ctx.profile.profile.settings.streamer;
  const entries = scene.lines.map((l, idx) => ({
    id: `${id}.${idx}`,
    content: { label: l.s, text: fill(l.t, params) },
    spoiler: !!scene.spoiler,
    safeAlternative: scene.safe?.[idx] ? { label: scene.safe[idx]!.s, text: fill(scene.safe[idx]!.t, params) } : undefined,
  }));
  const projected = projectPresentation(entries, { hideSpoilers: streamer });
  if (!projected.length && scene.spoiler) return [{ s: 'narrator', t: ctx.t('codex.hidden') }];
  return projected.map((p, idx) => ({ s: p.content.label, t: ctx.i18n.filter(p.content.text ?? ''), e: scene.lines[idx]?.e }));
}

export async function playScenes(ctx0: Ctx): Promise<void> {
  let guard = 0;
  while (guard++ < 40) {
    const ctx = ctx0.app.ctx();
    if (!ctx) return;
    const s = ctx.state;
    if (s.scenes.length) {
      const id = s.scenes[0]!;
      ctx.audio.sceneCue(id);
      const lines = resolveLines(ctx, id);
      if (lines.length) await presentLines(ctx, id, lines);
      const ok = await ctx.act({ t: 'ackScene' });
      if (!ok) return;
      continue;
    }
    if (s.offers.length) {
      const id = s.offers[0]!;
      const lines = resolveLines(ctx, `vow.${id}.offer`);
      const def = ctx.C.vows.vows[id]!;
      let accept: boolean | null = null;
      await presentLines(ctx, `vow.${id}.offer`, lines.length ? lines : [{ s: def.giver, t: id }], (done) =>
        h('div', { class: 'vow-choice' },
          !def.tutorial && s.threads === 1 ? h('p', { class: 'warn' }, ctx.t('warn.lastThread')) : null,
          button('Взяться за завет', () => {
            accept = true;
            done();
          }, { class: 'primary', 'data-testid': 'vow-accept' }),
          button('Отказаться', () => {
            accept = false;
            done();
          }, { 'data-testid': 'vow-decline' }),
        ),
      );
      if (accept === null) return;
      const ok = await ctx.act({ t: 'vow', id, accept });
      if (!ok) return;
      continue;
    }
    return;
  }
}

/** Listening: topic is the chosen feeling; the reply's tone sets purity. Returns warm?/null. */
export function listenDialog(ctx: Ctx, g: Guest, kind: Kind): Promise<boolean | null> {
  const cat = ctx.i18n.cat.listen;
  const pick = (arr: string[] | undefined, salt: number) => (arr && arr.length ? arr[(g.id * 7 + salt + g.fr * 3) % arr.length]! : '…');
  const question = pick(cat.topics?.[kind], 1);
  const answer = pick(cat.guest?.[g.sp ?? g.w], 2);
  const warm = pick(cat.warm, 3);
  const hasty = pick(cat.hasty, 5);
  const warmFirst = (g.id + g.fr) % 2 === 0;
  return new Promise((resolve) => {
    let result: boolean | null = null;
    const opts = [
      { label: warm, value: true },
      { label: hasty, value: false },
    ];
    if (!warmFirst) opts.reverse();
    const list = h('div', { class: 'choice-list' });
    const m = showModal(ctx.t('listen.title'), [
      h('div', { class: 'scene-layout' }, h('div', { class: 'scene-pic' }, guestPortrait(ctx, g, 'scene-portrait', 96)),
        h('div', { class: 'scene-col' },
          h('p', { class: 'scene-who' }, guestName(ctx, g)),
          h('p', {}, feelingIcon(kind, 22), ' ', h('em', {}, ctx.i18n.filter(fill(question, { feeling: feelingName(ctx, kind).toLowerCase() })))),
          h('p', { class: 'scene-text' }, ctx.i18n.filter(answer)))),
      h('p', { class: 'small' }, ctx.t('listen.tone'), ' ', ctx.t('listen.purityNote')),
      list,
    ], { onClose: () => resolve(result) });
    opts.forEach((o, i) =>
      list.append(button(o.label, () => {
        result = o.value;
        m.close();
      }, { class: 'choice', 'data-testid': o.value ? 'reply-warm' : 'reply-hasty', 'data-order': i })),
    );
    list.append(button(ctx.t('common.cancel'), () => m.close(), { class: 'ghost' }));
    (list.querySelector('button') as HTMLElement).focus();
    ctx.audio.murmur(g.sp ?? `guest-${g.w}`);
  });
}
