// One open campaign slot: AEGIS host + strict checkpoint into the slot's SaveService.
import { SaveService, type SaveEnvelope, type SaveStatus } from '@aegis/browser/save';
import { createSaveCheckpoint } from '@aegis/browser/checkpoint';
import { requireValue, type ContentPack, type RuntimeSnapshot, type RuntimeCommit } from '@aegis/runtime';
import type { SaveStorage } from '@aegis/browser/save';
import { createKrestetsHost, type KrestetsHost, type KrestetsView } from '../engine/adapter.js';
import { hashHex, stableStringify, type Action, type Content, type GameState, type Mode } from '../model/index.js';
import { ENGINE_REVISION, GAME_ID, slotPolicy, type SlotId, type SlotResume } from './saves.js';

export const GAME_VERSION = '1.0.0';

export class SlotSession {
  readonly saves: SaveService<RuntimeSnapshot, SlotResume>;
  host!: KrestetsHost;
  private listeners = new Set<(view: KrestetsView, reason: 'commit' | 'restore') => void>();
  private commitListeners = new Set<(c: RuntimeCommit<KrestetsView>) => void>();
  constructor(
    readonly storage: SaveStorage,
    readonly slot: SlotId,
    readonly pack: ContentPack<Content>,
  ) {
    this.saves = new SaveService(storage, slotPolicy(slot, (rev) => rev === pack.revision));
  }

  private metadata() {
    return () => {
      const s = this.host.getView().state;
      return {
        format: 'aegis.save' as const,
        formatVersion: 1 as const,
        gameId: GAME_ID,
        profileId: this.slot,
        contentRevision: this.pack.revision,
        schemaVersion: 1,
        engine: { id: 'aegis-runtime', snapshotVersion: 1, revision: ENGINE_REVISION },
        resume: { night: s.night, mode: s.mode, phase: s.phase, ending: s.ending, seed: s.seed } satisfies SlotResume,
      };
    };
  }

  private wire(seed: string, mode: Mode) {
    const checkpoint = createSaveCheckpoint(this.saves, this.metadata());
    this.host = createKrestetsHost(this.pack, seed, mode, checkpoint);
    this.host.subscribe((view, reason) => this.listeners.forEach((l) => l(view, reason)));
    this.host.subscribeCommits((c) => this.commitListeners.forEach((l) => l(c)));
  }

  /** New campaign: write the initial state as revision 1 before play. */
  async create(seed: string, mode: Mode): Promise<void> {
    await this.saves.load().catch(() => undefined);
    this.wire(seed, mode);
    const snap = this.host.snapshot();
    await this.saves.save({ ...this.metadata()(), state: snap as RuntimeSnapshot });
  }

  async open(): Promise<void> {
    const env = await this.saves.load();
    if (!env) throw new Error('empty slot');
    await this.restoreEnvelope(env, true);
  }

  async restoreEnvelope(env: SaveEnvelope<RuntimeSnapshot, SlotResume>, durable: boolean): Promise<void> {
    if (env.contentRevision !== this.pack.revision)
      throw new Error(`content revision ${env.contentRevision} differs from installed ${this.pack.revision}`);
    this.wire(env.resume.seed, env.resume.mode);
    requireValue(await this.host.restore(env.state, durable ? { durableRevision: env.state.revision } : undefined));
  }

  onView(fn: (view: KrestetsView, reason: 'commit' | 'restore') => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onCommit(fn: (c: RuntimeCommit<KrestetsView>) => void): () => void {
    this.commitListeners.add(fn);
    return () => this.commitListeners.delete(fn);
  }
  onSaveStatus(fn: (s: SaveStatus) => void): () => void {
    return this.saves.subscribe(fn);
  }

  get state(): GameState {
    return this.host.getView().state;
  }

  dispatch(a: Action) {
    return this.host.dispatch(a, { expectedRevision: this.host.getStatus().revision });
  }

  async retrySave(): Promise<boolean> {
    const r = await this.host.retryCheckpoint();
    if (!r.ok) return false;
    if (this.host.getStatus().pendingAction !== null) {
      const c = await this.host.continuePending();
      return c.ok;
    }
    return true;
  }

  async exportEnvelope(): Promise<SaveEnvelope<RuntimeSnapshot, SlotResume>> {
    await this.saves.flush();
    const env = await this.saves.load();
    if (!env) throw new Error('nothing saved');
    return env;
  }

  /** DIAG-01: bounded night report with IDs, ticks and outcomes only. */
  nightReport(): object | null {
    const s = this.state;
    if (!s.nightStart) return null;
    const outcome = outcomeHash(s);
    return {
      format: 'krestets.night-report/1',
      game: GAME_VERSION,
      engine: ENGINE_REVISION,
      content: this.pack.revision,
      seed: s.seed,
      mode: s.mode,
      night: s.nt.n,
      phase: s.phase,
      tick: s.nt.tick,
      actions: s.nt.log,
      stats: s.report?.night === s.nt.n ? s.report.stats : s.nt.stats,
      nightStart: s.nightStart,
      outcome,
    };
  }

  async dispose(): Promise<void> {
    await this.host?.dispose();
  }
}

/** Hash of the authoritative state without embedded checkpoints. */
export function outcomeHash(s: GameState): string {
  return hashHex(stableStringify({ ...s, nightStart: null, preFinale: null }));
}
