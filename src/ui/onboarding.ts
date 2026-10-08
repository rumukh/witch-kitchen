// Onboarding (Доп-1, UI-08): first-encounter cards anchored to logical targets.
import { mirrorOpen, paletteTotal, tremorCandidates, type GameState } from '../model/index.js';
import type { App } from './app.js';
import { h, button } from './dom.js';
import { showModal, modalOpen } from './modal.js';

type Pred = (s: GameState) => boolean;
const seated = (s: GameState) => s.seats.filter((x) => x && x !== 'dirty') as Exclude<GameState['seats'][number], 'dirty' | null>[];
const anyJar = (s: GameState, k: string) => s.shelf.some((j) => j?.k === k) || s.tray?.k === k;

const TRIGGERS: [string, Pred][] = [
  ['first-night', (s) => s.phase === 'night' && s.night === 1],
  ['first-dirty', (s) => s.phase === 'night' && s.seats.includes('dirty')],
  ['first-guest', (s) => s.phase === 'night' && seated(s).length > 0],
  ['first-listen', (s) => s.phase === 'night' && seated(s).some((g) => paletteTotal(g) > 1)],
  ['first-core', (s) => s.phase === 'night' && seated(s).some((g) => paletteTotal(g) === 1)],
  ['first-shelf', (s) => s.shelf.filter(Boolean).length >= 2],
  ['first-cook', (s) => s.phase === 'night' && s.nt.tick >= 1],
  ['first-ready', (s) => s.burners.some((d) => d?.ok && !d.exp)],
  ['first-door', (s) => !!s.door],
  ['first-tray', (s) => !!s.tray],
  ['first-heat', (s) => s.phase === 'night' && s.night >= 2],
  ['first-chime', (s) => s.nt.fired.includes('wind')],
  ['first-cuckoo', (s) => s.phase === 'night' && s.night >= 2 && s.nt.tick >= 1],
  ['first-nameless', (s) => s.nt.nameless === 1],
  ['first-sediment', (s) => anyJar(s, 'sediment') || s.silence > 0],
  ['first-hope', (s) => anyJar(s, 'hope')],
  ['first-amber', (s) => anyJar(s, 'amber')],
  ['first-burning', (s) => anyJar(s, 'burning')],
  ['first-condense', (s) => s.phase === 'night' && s.night >= 5],
  ['first-loneliness', (s) => anyJar(s, 'loneliness')],
  ['first-vow', (s) => Object.keys(s.vows).length > 0],
  ['day-shop', (s) => s.phase === 'day'],
  ['day-tarot', (s) => s.phase === 'day' && s.night >= 2],
  ['day-forecast', (s) => s.phase === 'day' && s.night >= 2],
  ['day-stories', (s) => s.phase === 'day' && Object.keys(s.col).length > 0],
  ['day-tram', (s) => s.phase === 'day' && s.doors.length > 0],
  ['first-tremor', (s) => s.phase === 'day' && s.night >= 9],
];

export class Onboarding {
  private showing = false;
  constructor(private app: App) {}

  private slotKey(): string {
    return this.app.session?.slot ?? 'none';
  }
  private seen(): string[] {
    return this.app.profile.profile.onboarding[this.slotKey()] ?? [];
  }

  onCommit(_s: GameState): void {
    // Cards are evaluated after the view is rendered (check) so focus can return correctly.
  }

  check(s: GameState): void {
    if (this.showing || modalOpen() || !this.app.profile.profile.settings.onboarding) return;
    const seen = this.seen();
    const C = this.app.pack.data;
    for (const [id, pred] of TRIGGERS) {
      if (seen.includes(id)) continue;
      if (id === 'first-mirror' && !mirrorOpen(s, C)) continue;
      if (id === 'first-tremor' && !tremorCandidates(s, C).length && s.phase === 'day') continue;
      if (!pred(s)) continue;
      void this.show(id, true);
      return;
    }
    if (mirrorOpen(s, C) && !seen.includes('first-mirror')) void this.show('first-mirror', true);
  }

  async show(id: string, mark: boolean): Promise<void> {
    const card = this.app.i18n.cat.onboarding[id];
    if (!card) return;
    this.showing = true;
    const t = this.app.t;
    const target = document.querySelector(`[data-target="${card.target}"]`) as HTMLElement | null;
    target?.classList.add('coachmark');
    target?.scrollIntoView({ block: 'nearest', behavior: this.app.profile.profile.settings.reducedMotion ? 'auto' : 'smooth' });
    if (card.whisper) this.app.audio.whisper(card.whisper, this.app.i18n.cat.whispers[card.whisper] ?? '');
    if (mark) await this.app.profile.update((p) => (p.onboarding[this.slotKey()] = [...new Set([...(p.onboarding[this.slotKey()] ?? []), id])]));
    await new Promise<void>((resolve) => {
      const m = showModal(card.title, [
        h('p', {}, h('strong', {}, `${t('common.whatIsThis')}: `), card.what),
        h('p', {}, h('strong', {}, `${t('common.why')}: `), card.why),
        card.whisper ? h('p', { class: 'whisper-caption' }, `«${this.app.i18n.cat.whispers[card.whisper]}»`) : null,
        h('div', { class: 'modal-actions' }, button(t('common.ok'), () => m.close(), { class: 'primary', 'data-testid': 'coach-ok' })),
      ].filter(Boolean) as Node[], { cls: 'coach', onClose: () => resolve() });
      m.dialog.dataset.card = id;
    });
    target?.classList.remove('coachmark');
    this.showing = false;
    const s = this.app.session?.state;
    if (s && !s.scenes.length) this.check(s);
  }

  openHelp(): void {
    const t = this.app.t;
    const list = h('div', { class: 'choice-list' });
    const m = showModal(t('help.title'), [list, h('div', { class: 'modal-actions' }, button(t('common.close'), () => m.close(), { class: 'primary' }))]);
    for (const id of Object.keys(this.app.i18n.cat.onboarding)) {
      const card = this.app.i18n.cat.onboarding[id]!;
      list.append(button(card.title, () => {
        m.close();
        void this.show(id, false);
      }, { class: 'choice' }));
    }
  }
}
