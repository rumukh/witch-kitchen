import type { Ctx } from './app.js';
import { h, button } from './dom.js';
import { actButton } from './tavern.js';

export function renderEnding(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  const t = ctx.t;
  const e = s.ending ?? 'letter';
  const streamer = ctx.profile.profile.settings.streamer;
  const scene = ctx.i18n.cat.scenes[`ending.${e}`];
  const epilogue = streamer ? [] : (scene?.lines ?? []).slice(-2).map((l) => h('p', {}, ctx.i18n.filter(l.t)));
  return h('section', { class: `ending ending-${e}`, 'data-testid': 'ending', 'data-ending': e },
    ctx.art.img(`ending-${e.replace('_', '-')}`, 'ending-bg') ?? h('div', { class: `ending-bg placeholder-ending ending-${e}` }),
    h('div', { class: 'ending-card' },
      h('p', { class: 'small' }, t('ending.title')),
      h('h1', {}, streamer ? t('ending.streamer') : t(`ending.${e}`)),
      ...epilogue,
      h('nav', { class: 'ending-nav' },
        s.preFinale ? actButton(ctx, t('ending.again'), { t: 'restorePreFinale' }, { 'data-testid': 'restore-prefinale' }, () => ctx.confirm(t('final.restoreConfirm'))) : null,
        button(t('title.codex'), () => ctx.app.openCodex()),
        button(t('ending.toTitle'), () => void ctx.app.showTitle(), { class: 'primary', 'data-testid': 'ending-title' }),
      ),
    ),
  );
}
