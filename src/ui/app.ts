// Application shell: boot, title screen, settings, routing between game screens.
import type { SaveStorage } from '@aegis/browser/save';
import type { ContentPack } from '@aegis/runtime';
import { applyPresentationPreferences } from '@aegis/browser/ui';
import type { Action, Content, GameState, Mode } from '../model/index.js';
import { createStorage, ProfileStore, readSlot, resetSlot, exportSlot, parseImport, writeImported, SLOT_IDS, type SlotId, type SlotInfo } from '../platform/saves.js';
import { SlotSession, GAME_VERSION } from '../platform/session.js';
import { downloadText, nativeBridge, pickTextFile } from '../platform/native.js';
import { I18n, loadCatalogs, loadContent } from './i18n.js';
import { h, button, announce } from './dom.js';
import { chooseModal, confirmModal, infoModal, modalOpen, showModal } from './modal.js';
import { renderTavern, type UiState } from './tavern.js';
import { renderDay } from './day.js';
import { renderEnding } from './ending.js';
import { playScenes } from './scene.js';
import { Onboarding } from './onboarding.js';
import { AudioDirector } from './audio.js';
import { ArtLibrary } from './art.js';

export interface Ctx {
  C: Content;
  i18n: I18n;
  t: (k: string, p?: Record<string, string | number>) => string;
  profile: ProfileStore;
  session: SlotSession;
  state: GameState;
  ui: UiState;
  act: (a: Action) => Promise<boolean>;
  confirm: (text: string, yes?: string) => Promise<boolean>;
  rerender: () => void;
  say: (text: string) => void;
  audio: AudioDirector;
  art: ArtLibrary;
  onboarding: Onboarding;
  app: App;
}

export class App {
  root = document.getElementById('app')!;
  live = h('div', { class: 'sr-live', 'aria-live': 'polite', role: 'status' });
  storage!: SaveStorage;
  pack!: ContentPack<Content>;
  i18n!: I18n;
  profile!: ProfileStore;
  session: SlotSession | null = null;
  audio!: AudioDirector;
  art!: ArtLibrary;
  onboarding!: Onboarding;
  ui: UiState = { selected: null, mode: 'normal', multi: [] };
  private screen = h('main', { class: 'screen', id: 'screen' });
  private saveBar = h('div', { class: 'save-bar', role: 'status', 'data-testid': 'save-status' });
  private paused = false;
  private scenePlaying = false;
  private saveFailure: { close(): void } | null = null;

  async boot(): Promise<void> {
    this.root.replaceChildren(h('p', { class: 'loading' }, 'Крестец…'));
    this.pack = await loadContent();
    this.i18n = new I18n(await loadCatalogs());
    this.storage = createStorage();
    this.profile = new ProfileStore(this.storage);
    await this.profile.load();
    this.art = new ArtLibrary();
    await this.art.load();
    this.audio = new AudioDirector(this);
    await this.audio.load();
    this.onboarding = new Onboarding(this);
    this.applySettings();
    this.root.replaceChildren(this.screen, this.saveBar, this.live);
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerdown', () => void this.audio.unlock(), { once: false, capture: true });
    document.addEventListener('keydown', () => void this.audio.unlock(), { capture: true });
    await this.showTitle();
  }

  t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);

  applySettings(): void {
    const s = this.profile.profile.settings;
    this.i18n.streamer = s.streamer;
    applyPresentationPreferences(document.documentElement, {
      locale: 'ru',
      textScale: s.textScale / 100,
      reducedMotion: s.reducedMotion,
      comfort: false,
      hideSpoilers: s.streamer,
      volumes: { narration: s.volumes.voice, music: s.volumes.music, effects: s.volumes.effects },
    });
    document.documentElement.style.setProperty('--text-scale', String(s.textScale / 100));
    document.documentElement.dataset.colorBlind = String(s.colorBlind);
    document.documentElement.dataset.reducedMotion = String(s.reducedMotion);
    this.audio?.applyVolumes();
  }

  say(text: string): void {
    announce(this.live, text);
    const toast = h('div', { class: 'toast', role: 'presentation' }, text);
    document.getElementById('toasts')?.remove();
    const holder = h('div', { id: 'toasts', class: 'toasts' }, toast);
    this.root.append(holder);
    setTimeout(() => holder.remove(), 3200);
  }

  // ---------- Title ----------
  async showTitle(): Promise<void> {
    await this.session?.dispose();
    this.session = null;
    this.audio.setScene('title');
    const infos = await Promise.all(SLOT_IDS.map((s) => readSlot(this.storage, s)));
    const t = this.t;
    const slots = h('div', { class: 'slots' });
    for (const info of infos) slots.append(this.slotCard(info));
    const title = h(
      'section',
      { class: 'title-screen' },
      this.art.img('bg-title', 'title-bg') ?? h('div', { class: 'title-bg placeholder-bg' }),
      h(
        'div',
        { class: 'title-card' },
        h('h1', {}, t('game.title')),
        h('p', { class: 'subtitle' }, t('game.subtitle')),
        h('p', { class: 'hook' }, t('game.hook')),
        h('p', { class: 'hook' }, t('game.hook2')),
        slots,
        h(
          'nav',
          { class: 'title-nav' },
          button(t('title.import'), () => void this.importFlow(), { 'data-testid': 'import' }),
          button(t('title.settings'), () => this.openSettings(), { 'data-testid': 'settings' }),
          button(t('title.codex'), () => this.openCodex(), { 'data-testid': 'codex' }),
          button(t('title.credits'), () => void infoModal(t('title.credits'), t('credits.text', { version: GAME_VERSION }), t('common.close'))),
        ),
      ),
    );
    this.screen.replaceChildren(title);
    this.saveBar.textContent = '';
    (title.querySelector('button') as HTMLElement | null)?.focus();
    if (!nativeBridge() && !this.profile.profile.webNoticeSeen) {
      await infoModal(t('title.slot', { n: '' }).trim(), t('title.webNotice'), t('title.webNoticeOk'));
      await this.profile.update((p) => (p.webNoticeSeen = true));
    }
  }

  private slotCard(info: SlotInfo): HTMLElement {
    const t = this.t;
    const n = SLOT_IDS.indexOf(info.slot) + 1;
    const env = info.envelope;
    const r = env?.resume;
    const summary = info.error
      ? t('title.slot.broken')
      : !r
        ? t('title.slot.empty')
        : r.phase === 'ended'
          ? t('title.slot.ended', { mode: t(`mode.${r.mode}`) })
          : t(r.phase === 'day' ? 'title.slot.summaryDay' : 'title.slot.summary', { night: r.night, mode: t(`mode.${r.mode}`) });
    const card = h('div', { class: 'slot-card', 'data-testid': `slot-${n}` }, h('h3', {}, t('title.slot', { n })), h('p', {}, summary));
    const actions = h('div', { class: 'slot-actions' });
    if (env && !info.error) {
      actions.append(button(t('title.continue'), () => void this.openSlot(info.slot), { class: 'primary', 'data-testid': `continue-${n}` }));
      actions.append(button(t('title.export'), () => void this.exportFlow(info), { 'data-testid': `export-${n}` }));
    } else if (!info.error) {
      actions.append(button(t('title.new'), () => void this.newGame(info.slot), { class: 'primary', 'data-testid': `new-${n}` }));
    }
    if (env || info.error)
      actions.append(
        button(t('title.delete'), async () => {
          if (await confirmModal(t('title.delete'), t('title.deleteConfirm', { n }), t('title.delete'), t('common.cancel'))) {
            await resetSlot(this.storage, info.slot);
            await this.showTitle();
          }
        }, { 'data-testid': `delete-${n}` }),
      );
    card.append(actions);
    return card;
  }

  private async newGame(slot: SlotId): Promise<void> {
    const t = this.t;
    const mode = await chooseModal<Mode>(
      t('title.chooseMode'),
      null,
      (['standard', 'granny', 'wolf'] as const).map((m) => ({ label: t(`mode.${m}`), value: m, desc: t(`mode.${m}.desc`) })),
      t('common.cancel'),
    );
    if (!mode) return;
    const forced = new URLSearchParams(location.search).get('seed');
    const seed = forced && /^[a-z0-9-]{1,40}$/i.test(forced) ? forced : Array.from(crypto.getRandomValues(new Uint32Array(2)), (x) => x.toString(16).padStart(8, '0')).join('');
    const session = new SlotSession(this.storage, slot, this.pack);
    await session.create(seed, mode);
    await this.startSession(session);
  }

  private async openSlot(slot: SlotId): Promise<void> {
    const session = new SlotSession(this.storage, slot, this.pack);
    try {
      await session.open();
    } catch (e) {
      await infoModal(this.t('title.slot.broken'), String((e as Error).message), this.t('common.close'));
      return;
    }
    await this.startSession(session);
  }

  private async exportFlow(info: SlotInfo): Promise<void> {
    if (!info.envelope) return;
    const text = exportSlot(info.envelope, info.slot);
    const n = SLOT_IDS.indexOf(info.slot) + 1;
    if (await downloadText(`krestets-slot-${n}-night-${info.envelope.resume.night}.json`, text)) this.say(this.t('title.exportDone'));
  }

  private async importFlow(): Promise<void> {
    const t = this.t;
    const text = await pickTextFile();
    if (!text) return;
    let env;
    try {
      env = parseImport(text);
      if (env.contentRevision !== this.pack.revision) throw new Error('другая версия игры');
      const probe = new SlotSession(this.storage, 'slot-1', this.pack);
      await probe.restoreEnvelope(env, false).finally(() => void probe.dispose());
    } catch (e) {
      await infoModal(t('title.import'), t('title.importFailed', { reason: (e as Error).message }), t('common.close'));
      return;
    }
    const target = await chooseModal<SlotId>(t('title.import'), t('title.importTarget'), SLOT_IDS.map((s, i) => ({ label: t('title.slot', { n: i + 1 }), value: s })), t('common.cancel'));
    if (!target) return;
    await writeImported(this.storage, target, env);
    this.say(t('title.importDone', { n: SLOT_IDS.indexOf(target) + 1 }));
    await this.showTitle();
  }

  // ---------- Settings & codex ----------
  openSettings(): void {
    const t = this.t;
    const s = this.profile.profile.settings;
    const save = () => void this.profile.update((p) => (p.settings = structuredClone(s))).then(() => this.applySettings());
    const slider = (key: keyof typeof s.volumes) => {
      const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s.volumes[key] * 100), 'data-testid': `vol-${key}` }) as HTMLInputElement;
      input.addEventListener('change', () => {
        s.volumes[key] = Number(input.value) / 100;
        save();
      });
      return h('label', { class: 'setting' }, h('span', {}, t(`settings.volume.${key}`)), input);
    };
    const check = (key: 'colorBlind' | 'reducedMotion' | 'streamer' | 'onboarding' | 'captions', label: string) => {
      const input = h('input', { type: 'checkbox', 'data-testid': `set-${key}` }) as HTMLInputElement;
      input.checked = s[key];
      input.addEventListener('change', () => {
        s[key] = input.checked;
        save();
        this.rerender();
      });
      return h('label', { class: 'setting check' }, input, h('span', {}, label));
    };
    const size = h('select', { 'data-testid': 'set-text' }) as HTMLSelectElement;
    for (const v of [100, 115, 125, 135, 150]) size.append(h('option', { value: v, selected: v === s.textScale }, `${v}%`));
    size.addEventListener('change', () => {
      s.textScale = Number(size.value);
      save();
    });
    const report = button(t('settings.report'), () => void this.exportReport(), { 'data-testid': 'export-report' });
    const body = [
      slider('music'), slider('ambience'), slider('effects'), slider('voice'), slider('ui'),
      h('label', { class: 'setting' }, h('span', {}, t('settings.textSize')), size),
      check('colorBlind', t('settings.colorBlind')),
      check('reducedMotion', t('settings.reducedMotion')),
      check('streamer', t('settings.streamer')),
      check('onboarding', t('settings.onboarding')),
      check('captions', t('settings.captions')),
      button(t('settings.onboardingReset'), () => void this.profile.update((p) => (p.onboarding = {})).then(() => this.say(t('common.ok')))),
      nativeBridge() ? button(t('settings.fullscreen'), () => void nativeBridge()!.toggleFullscreen()) : button(t('settings.fullscreen'), () => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => undefined))),
      h('h3', {}, t('keys.title')), h('p', { class: 'small' }, t('keys.text')),
      h('h3', {}, t('settings.testers')), h('p', { class: 'small' }, t('settings.reportHint')), report,
    ];
    const m = showModal(t('settings.title'), [...body, h('div', { class: 'modal-actions' }, button(t('common.close'), () => m.close(), { class: 'primary' }))], { cls: 'settings' });
  }

  async exportReport(): Promise<void> {
    const rep = this.session?.nightReport();
    if (!rep) return this.say(this.t('settings.reportNone'));
    const r = rep as { night: number; seed: string };
    if (await downloadText(`krestets-night-${r.night}-report.json`, JSON.stringify(rep))) this.say(this.t('msg.reportSaved'));
  }

  openCodex(): void {
    const t = this.t;
    const p = this.profile.profile;
    const streamer = p.settings.streamer;
    const endings = h('ul', { class: 'codex' });
    for (const e of ['new_spring', 'remember', 'wound', 'letter']) {
      const seen = p.endings.includes(e);
      endings.append(h('li', { class: seen ? 'seen' : 'locked' }, streamer && seen ? t('codex.hidden') : seen ? t(`ending.${e}`) : t('codex.locked')));
    }
    const ach = h('ul', { class: 'codex' });
    for (const [id, def] of Object.entries(this.pack.data.endings.achievements)) {
      const got = p.achievements.includes(id);
      const hide = streamer && def.spoiler;
      ach.append(h('li', { class: got ? 'seen' : 'locked' }, hide ? t('codex.hidden') : h('strong', {}, t(`ach.${id}`)), hide ? '' : ' — ' + t(`ach.${id}.desc`), got ? ' ✓' : ''));
    }
    const m = showModal(t('codex.title'), [h('h3', {}, t('codex.endings')), endings, h('h3', {}, t('codex.achievements')), ach, h('div', { class: 'modal-actions' }, button(t('common.close'), () => m.close(), { class: 'primary' }))]);
  }

  // ---------- Game ----------
  private async startSession(session: SlotSession): Promise<void> {
    this.session = session;
    this.ui = { selected: null, mode: 'normal', multi: [] };
    session.onView((view, reason) => {
      if (reason === 'restore') this.audio.clear();
      this.rerender();
    });
    session.onCommit((c) => {
      this.audio.onCommit(c.events, c.view.state);
      this.onboarding.onCommit(c.view.state);
      void this.awards(c.view.state);
    });
    session.onSaveStatus((st) => this.onSaveStatus(st.status));
    this.rerender();
  }

  private onSaveStatus(status: string): void {
    const t = this.t;
    this.saveBar.textContent = status === 'saved' ? t('save.ok') : status === 'pending' ? t('save.pending') : status === 'idle' ? '' : t('save.failed');
    this.saveBar.dataset.status = status;
    const failed = status === 'failed' || status === 'conflict' || status === 'unavailable';
    if (failed && !this.saveFailure) {
      const m = showModal(
        t('save.failed'),
        [
          h('p', {}, status === 'conflict' ? t('save.conflict') : t('save.blocked')),
          h('div', { class: 'modal-actions' },
            button(t('save.retry'), async () => {
              const ok = await this.session?.retrySave();
              if (ok) {
                this.saveFailure = null;
                m.close();
              }
            }, { class: 'primary', 'data-testid': 'save-retry' }),
            button(t('common.toTitle'), () => {
              this.saveFailure = null;
              m.close();
              void this.showTitle();
            }),
          ),
        ],
        { dismissible: false },
      );
      this.saveFailure = m;
    }
  }

  private async awards(s: GameState): Promise<void> {
    const C = this.pack.data;
    const add: string[] = [];
    if (s.ending) {
      for (const [id, def] of Object.entries(C.endings.achievements)) {
        if (def.when === 'ending' && def.endings?.includes(s.ending)) add.push(id);
        if (def.when === 'campaignEnd' && s.mut === (def.mutnoe ?? 0)) add.push(id);
      }
    }
    const memorialDone = Array.from({ length: C.economy.storiesPerWorld }, (_, i) => `memorial.${i + 1}`).every((id) => (s.col[id] ?? 0) > C.economy.fragmentsPerStory);
    if (memorialDone) add.push('all_memorial');
    const p = this.profile.profile;
    if (add.every((a) => p.achievements.includes(a)) && (!s.ending || p.endings.includes(s.ending))) return;
    await this.profile.update((pr) => {
      pr.achievements.push(...add);
      if (s.ending) pr.endings.push(s.ending);
    });
  }

  ctx(): Ctx | null {
    if (!this.session) return null;
    return {
      C: this.pack.data,
      i18n: this.i18n,
      t: this.t,
      profile: this.profile,
      session: this.session,
      state: this.session.state,
      ui: this.ui,
      act: (a) => this.act(a),
      confirm: (text, yes) => confirmModal(this.t('common.confirm'), text, yes ?? this.t('common.yes'), this.t('common.cancel')),
      rerender: () => this.rerender(),
      say: (x) => this.say(x),
      audio: this.audio,
      art: this.art,
      onboarding: this.onboarding,
      app: this,
    };
  }

  async act(a: Action): Promise<boolean> {
    if (!this.session || this.paused) return false;
    const r = await this.session.dispatch(a);
    if (!r.ok) {
      const key = r.error.code.startsWith('rule.') ? r.error.code : `rule.${r.error.code}`;
      if (r.progress.accepted) return true;
      this.say(this.i18n.has(key) ? this.t(key) : this.t('rule.bad-action'));
      this.audio.ui('ui-error');
      return false;
    }
    this.audio.ui('ui-click');
    return true;
  }

  rerender(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const s = ctx.state;
    this.audio.syncState(s);
    let view: HTMLElement;
    if (s.phase === 'ended' && s.scenes.length === 0) view = renderEnding(ctx);
    else if (s.phase === 'night') view = renderTavern(ctx);
    else view = renderDay(ctx);
    const focusId = (document.activeElement as HTMLElement | null)?.dataset?.testid;
    this.screen.replaceChildren(view);
    if (focusId && !modalOpen()) (this.screen.querySelector(`[data-testid="${CSS.escape(focusId)}"]`) as HTMLElement | null)?.focus();
    if (s.scenes.length && !this.scenePlaying) void this.runScenes();
    else if (!s.scenes.length) this.onboarding.check(s);
  }

  private async runScenes(): Promise<void> {
    const ctx = this.ctx();
    if (!ctx) return;
    this.scenePlaying = true;
    try {
      await playScenes(ctx);
    } finally {
      this.scenePlaying = false;
    }
    this.rerender();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.session) return;
    if (e.key === 'Escape' && !modalOpen()) {
      e.preventDefault();
      this.togglePause();
      return;
    }
    if (modalOpen() || this.scenePlaying) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      void this.act({ t: 'undo' });
      return;
    }
    const s = this.session.state;
    if (s.phase !== 'night') return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'ц') void this.act({ t: 'wait' });
    else if (k === 'k' || k === 'л') void this.act({ t: 'kupa' });
    else if (k === 'h' || k === 'р') void this.act({ t: 'cuckoo' });
    else if (k === 'c' || k === 'с') (document.querySelector('[data-testid="cook"]') as HTMLElement | null)?.click();
    else if (/^[1-8]$/.test(k)) (document.querySelector(`[data-testid="cell-${Number(k) - 1}"]`) as HTMLElement | null)?.focus();
  }

  togglePause(): void {
    const t = this.t;
    if (this.paused) return;
    this.paused = true;
    this.session?.host.pause('user');
    const m = showModal(t('pause.title'), [
      h('p', {}, t('pause.desc')),
      h('div', { class: 'modal-actions' },
        button(t('common.resume'), () => m.close(), { class: 'primary', 'data-testid': 'resume' }),
        button(t('title.settings'), () => this.openSettings()),
        button(t('help.title'), () => this.onboarding.openHelp()),
        button(t('common.toTitle'), () => {
          m.close();
          void this.showTitle();
        }, { 'data-testid': 'to-title' }),
      ),
    ], {
      onClose: () => {
        this.paused = false;
        this.session?.host.resume('user');
      },
    });
  }
}
