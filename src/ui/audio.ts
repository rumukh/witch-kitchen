// Audio (AUDIO-06): five buses mapped onto three AEGIS audio controllers.
//   main: narration = voice (whispers), music = music, effects = voice murmur
//   room: music = ambience + ticking (authored loops), effects = kitchen effects
//   ui:   effects = interface sounds
import { createNarration, type AudioAsset, type NarrationController } from '@aegis/browser/audio';
import type { RuntimeEvent } from '@aegis/runtime';
import type { GameState } from '../model/index.js';
import type { App } from './app.js';
import { h } from './dom.js';

interface Cue {
  id: string;
  kind?: string;
  bus?: string;
  files?: { ogg?: string; m4a?: string } | (string | { id?: string; ogg?: string; m4a?: string })[];
}

const PACK = 'krestets-audio';
const MURMUR_SETS: Record<string, string> = {
  kupa: 'kupa', commis: 'commis', dubodyor: 'dubodyor', tikhaya: 'tikhaya', prosha: 'prosha', tram33: 'tram33', guardian: 'guardian',
  'guest-forest': 'guest-forest', 'guest-river': 'guest-river', 'guest-city': 'guest-city', 'guest-memorial': 'guest-memorial',
  tutorialA: 'guest-forest', tutorialB: 'guest-river', mira: 'guest-city',
};

export class AudioDirector {
  private main: NarrationController | null = null;
  private room: NarrationController | null = null;
  private uiBus: NarrationController | null = null;
  private assets: AudioAsset[] = [];
  private murmurs = new Map<string, string[]>();
  private available = new Set<string>();
  private unlocked = false;
  private musicId: string | null = null;
  private ambienceId: string | null = null;
  private nameless = false;
  private caption = h('div', { class: 'caption-bar', 'aria-live': 'polite', 'data-testid': 'caption' });
  private captionTimer = 0;

  constructor(private app: App) {}

  async load(): Promise<void> {
    const cues = new Map<string, Cue>();
    for (const base of ['./assets/placeholder/audio/', './assets/audio/']) {
      try {
        const r = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
        if (!r.ok) continue;
        const m = (await r.json()) as { cues?: Cue[] };
        for (const c of m.cues ?? []) cues.set(c.id, { ...c, files: rebase(c.files, base) });
      } catch {
        /* silent */
      }
    }
    for (const c of cues.values()) {
      if (Array.isArray(c.files)) {
        const srcs = c.files.map((f) => (typeof f === 'string' ? f : (f.ogg ?? f.m4a ?? ''))).filter(Boolean);
        const ids = srcs.map((_f, i) => `${c.id}.${i}`);
        srcs.forEach((f, i) => this.assets.push({ id: ids[i]!, src: f }));
        ids.forEach((id) => this.available.add(id));
        this.murmurs.set(c.id.replace(/^murmur-/, ''), ids);
      } else if (c.files) {
        const src = c.files.ogg ?? c.files.m4a;
        if (src) {
          this.assets.push({ id: c.id, src });
          this.available.add(c.id);
        }
      }
    }
  }

  private build(): void {
    if (this.main || typeof AudioContext === 'undefined') return;
    const lines = Object.entries(this.app.i18n.cat.whispers).map(([id, caption]) => ({ id, asset: id, caption }));
    const pack = { id: PACK, revision: 'v1', assets: this.assets, lines: lines.filter((l) => this.available.has(l.asset)) };
    const mk = () => createNarration({ baseUrl: new URL('./', location.href).href, onState: () => undefined });
    this.main = mk();
    this.room = mk();
    this.uiBus = mk();
    for (const c of [this.main, this.room, this.uiBus]) c.registerPack(pack);
    this.applyVolumes();
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.build();
    if (!this.main) return;
    this.unlocked = true;
    await Promise.all([this.main.unlock(), this.room!.unlock(), this.uiBus!.unlock()].map((p) => p.catch(() => undefined)));
    const m = this.musicId;
    const a = this.ambienceId;
    this.musicId = null;
    this.ambienceId = null;
    this.setMusic(m);
    this.setAmbience(a);
  }

  applyVolumes(): void {
    const v = this.app.profile?.profile.settings.volumes;
    if (!v || !this.main) return;
    this.main.setVolume('narration', v.voice);
    this.main.setVolume('effects', v.voice);
    this.main.setVolume('music', this.nameless ? 0 : v.music);
    this.room!.setVolume('music', this.nameless ? 0 : v.ambience);
    this.room!.setVolume('effects', v.effects * (this.nameless ? 0.35 : 1));
    this.uiBus!.setVolume('effects', v.ui);
  }

  private setMusic(id: string | null): void {
    if (id === this.musicId) return;
    this.musicId = id;
    if (!this.main || !this.unlocked) return;
    void this.main.setAtmosphere(id && this.available.has(id) ? { packId: PACK, asset: id, fadeSeconds: 2.5 } : null).catch(() => undefined);
  }

  private setAmbience(id: string | null): void {
    if (id === this.ambienceId) return;
    this.ambienceId = id;
    if (!this.room || !this.unlocked) return;
    void this.room.setAtmosphere(id && this.available.has(id) ? { packId: PACK, asset: id, fadeSeconds: 1.5 } : null).catch(() => undefined);
  }

  setScene(scene: 'title'): void {
    if (scene === 'title') {
      this.setMusic('music-title');
      this.setAmbience(null);
      this.setNameless(false);
    }
  }

  private setNameless(on: boolean): void {
    if (on === this.nameless) return;
    this.nameless = on;
    this.applyVolumes();
  }

  /** Select the current authored state from committed state only (restores never replay chimes). */
  syncState(s: GameState): void {
    if (s.phase === 'ended') {
      this.setMusic(`ending-${(s.ending ?? 'letter').replace('_', '-')}`);
      this.setAmbience(null);
      this.setNameless(false);
      return;
    }
    if (s.phase === 'day') {
      this.setMusic('music-mezhsvetye');
      this.setAmbience('amb-tavern-room');
      this.setNameless(false);
      return;
    }
    if (s.night === 1) {
      this.setMusic('music-night1');
      this.setAmbience('amb-tavern-room');
    } else {
      const f = s.nt.fired;
      this.setMusic(f.includes('predawn') ? 'music-night-predawn' : f.includes('wind') ? 'music-night-middle' : 'music-night-calm');
      this.setAmbience('amb-clock-ticking');
    }
    this.setNameless(s.nt.nameless === 1);
  }

  clear(): void {
    for (const c of [this.main, this.room, this.uiBus]) c?.clear();
    const m = this.musicId;
    const a = this.ambienceId;
    this.musicId = null;
    this.ambienceId = null;
    this.setMusic(m);
    this.setAmbience(a);
  }

  private fx(id: string): void {
    if (this.room && this.unlocked && this.available.has(id)) void this.room.playEffect(PACK, id).catch(() => undefined);
  }
  ui(id: string): void {
    if (this.uiBus && this.unlocked && this.available.has(id)) void this.uiBus.playEffect(PACK, id).catch(() => undefined);
  }

  showCaption(text: string, signal = false): void {
    if (signal && !this.app.profile.profile.settings.captions) return;
    if (!this.caption.isConnected) this.app.root.append(this.caption);
    this.caption.textContent = text;
    this.caption.classList.add('on');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.caption.classList.remove('on'), signal ? 2600 : 6500);
  }

  whisper(key: string, text: string): void {
    this.showCaption(`${this.app.t('caption.whisper')}: «${text}»`);
    if (this.main && this.unlocked && this.available.has(key)) void this.main.playLine(PACK, key).catch(() => undefined);
  }

  murmur(speaker: string): void {
    const set = this.murmurs.get(MURMUR_SETS[speaker] ?? speaker);
    if (!set?.length || !this.main || !this.unlocked) return;
    const id = set[Math.floor(Math.random() * set.length)]!;
    void this.main.playEffect(PACK, id).catch(() => undefined);
  }
  stopMurmur(): void {
    /* clips are short; nothing to cut */
  }

  sceneCue(id: string): void {
    if (id.startsWith('vow.') && id.endsWith('.success')) this.fx('key-gain');
    if (id === 'thread.lost' || id === 'thread.last') {
      this.fx('thread-snap');
      this.whisper(`whisper.${id}`, this.app.i18n.cat.whispers[`whisper.${id}`] ?? '');
    }
    if (id === 'dawn') this.whisper('whisper.dawn', this.app.i18n.cat.whispers['whisper.dawn'] ?? '');
    if (id.startsWith('door.open')) this.fx('page-turn');
    if (id.startsWith('recipe.learned')) this.fx('experiment-success');
    if (id === 'n1.farewell') this.whisper('whisper.tutorial.farewell', this.app.i18n.cat.whispers['whisper.tutorial.farewell'] ?? '');
  }

  onCommit(events: readonly RuntimeEvent[], s: GameState): void {
    const t = this.app.t;
    for (const e of events) {
      if (e.type === 'chime') {
        this.fx(`chime-${e.data}`);
        this.showCaption(t('caption.chime', { name: t(`hud.chime.${e.data}`) }), true);
      } else if (e.type === 'arrive') {
        this.fx('guest-arrive-door');
        this.showCaption(t('caption.arrive'), true);
      } else if (e.type === 'ready') {
        this.fx('brew-ready-bell');
        this.showCaption(t('caption.ready'), true);
      } else if (e.type === 'served') this.fx('serve-plate');
      else if (e.type === 'unhappy') this.fx('guest-leave');
      else if (e.type === 'nameless' && e.data === 1) {
        this.fx('nameless-arrive');
        this.showCaption(t('caption.nameless'), true);
      } else if (e.type === 'phase' && e.data === 'day') this.fx('chime-dawn');
      else if (e.type === 'action') {
        const map: Record<string, string> = {
          listen: 'listen-extract', listenBottom: 'listen-extract', cook: 'stove-ignite', experiment: 'stove-whoosh', burn: 'burn',
          kupa: 'heat-gain', clean: 'broom-clean', windClock: 'clock-wind', windFinal: 'clock-wind', discardDish: 'dish-discard',
          move: 'jar-place', undo: 'undo', buy: 'coins-sparks', buyMurky: 'coins-sparks', tarot: 'tarot-reveal', tram: 'tram-bell',
          mirrorTrade: 'mirror-shimmer', condense: 'pour',
        };
        if (map[String(e.data)]) this.fx(map[String(e.data)]!);
        if (e.data === 'cuckoo' && s.nt.lastHint) {
          this.fx('cuckoo');
          const key = `whisper.cuckoo.${s.nt.lastHint.type}`;
          this.whisper(key, this.app.i18n.cat.whispers[key] ?? '');
        }
      }
    }
  }
}

function rebase(files: Cue['files'], base: string): Cue['files'] {
  const fix = (f: string | undefined) => {
    if (!f) return undefined;
    if (f.startsWith('assets/')) return f;
    return (f.startsWith('./') || f.includes('://') ? f : `${base}${f}`).replace(/^\.\//, '');
  };
  if (!files) return files;
  if (Array.isArray(files)) return files.map((f) => (typeof f === 'string' ? fix(f)! : { ...f, ogg: fix(f.ogg), m4a: fix(f.m4a) }));
  return { ogg: fix(files.ogg), m4a: fix(files.m4a) };
}