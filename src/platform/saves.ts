// Slots, global profile and storage selection (SAVE-06, SAVE-07, WEBHOST-01).
import { exportSave, importSave, SaveService, type SaveEnvelope, type SavePolicy, type SaveStorage } from '@aegis/browser/save';
import { IndexedDbSaveStorage } from '@aegis/browser/indexeddb';
import { isRuntimeSnapshot, type RuntimeSnapshot } from '@aegis/runtime';
import type { Mode } from '../model/index.js';
import { nativeBridge, NativeSaveStorage } from './native.js';

export const GAME_ID = 'io.github.rumukh.krestets';
export const STORAGE_NAMESPACE = 'io.github.rumukh.krestets.saves';
export const SLOT_IDS = ['slot-1', 'slot-2', 'slot-3'] as const;
export type SlotId = (typeof SLOT_IDS)[number];
export const ENGINE_REVISION = 'cc9593b37cf72b72047ac0fc076fb80283652d50';

export interface SlotResume {
  night: number;
  mode: Mode;
  phase: 'night' | 'day' | 'ended';
  ending: string | null;
  seed: string;
}

export interface Profile {
  version: 1;
  settings: Settings;
  achievements: string[];
  endings: string[];
  onboarding: Record<string, string[]>;
  webNoticeSeen: boolean;
}
export interface Settings {
  volumes: { music: number; ambience: number; effects: number; voice: number; ui: number };
  textScale: number;
  colorBlind: boolean;
  reducedMotion: boolean;
  streamer: boolean;
  onboarding: boolean;
  captions: boolean;
}

export function defaultProfile(): Profile {
  return {
    version: 1,
    settings: {
      volumes: { music: 0.7, ambience: 0.6, effects: 0.8, voice: 0.9, ui: 0.6 },
      textScale: 100,
      colorBlind: false,
      reducedMotion: false,
      streamer: false,
      onboarding: true,
      captions: true,
    },
    achievements: [],
    endings: [],
    onboarding: {},
    webNoticeSeen: false,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isResume(v: unknown): v is SlotResume {
  return isObj(v) && typeof v.night === 'number' && typeof v.mode === 'string' && typeof v.phase === 'string' && typeof v.seed === 'string';
}
export function isProfile(v: unknown): v is Profile {
  return isObj(v) && v.version === 1 && isObj(v.settings) && Array.isArray(v.achievements) && Array.isArray(v.endings) && isObj(v.onboarding);
}

export function slotPolicy(slot: string, acceptsContent: (rev: string) => boolean): SavePolicy<RuntimeSnapshot, SlotResume> {
  return {
    gameId: GAME_ID,
    profileId: slot,
    schemaVersion: 1,
    engineId: 'aegis-runtime',
    engineSnapshotVersion: 1,
    acceptsContent: (rev) => acceptsContent(rev),
    validateState: (v) => isRuntimeSnapshot(v),
    isCurrentState: isRuntimeSnapshot,
    validateResume: (v): v is SlotResume => isResume(v),
    maxBytes: 2 * 1024 * 1024,
  };
}

export const profilePolicy: SavePolicy<Profile, null> = {
  gameId: GAME_ID,
  profileId: 'profile',
  schemaVersion: 1,
  engineId: 'krestets-profile',
  engineSnapshotVersion: 1,
  acceptsContent: () => true,
  validateState: (v) => isProfile(v),
  isCurrentState: isProfile,
  validateResume: (v): v is null => v === null,
};

export function createStorage(): SaveStorage {
  const native = nativeBridge();
  return native ? new NativeSaveStorage(native) : new IndexedDbSaveStorage(STORAGE_NAMESPACE);
}

/** Idempotent global profile: awards are set unions, never revoked by slot restore or import. */
export class ProfileStore {
  private service: SaveService<Profile, null>;
  profile: Profile = defaultProfile();
  constructor(storage: SaveStorage) {
    this.service = new SaveService(storage, profilePolicy);
  }
  async load(): Promise<Profile> {
    const saved = await this.service.load();
    if (saved) {
      const d = defaultProfile();
      this.profile = { ...d, ...saved.state, settings: { ...d.settings, ...saved.state.settings, volumes: { ...d.settings.volumes, ...saved.state.settings.volumes } } };
    }
    return this.profile;
  }
  async update(fn: (p: Profile) => void): Promise<void> {
    const next = structuredClone(this.profile);
    fn(next);
    next.achievements = [...new Set(next.achievements)].sort();
    next.endings = [...new Set(next.endings)].sort();
    if (JSON.stringify(next) === JSON.stringify(this.profile)) return;
    this.profile = next;
    await this.service.save({
      format: 'aegis.save',
      formatVersion: 1,
      gameId: GAME_ID,
      profileId: 'profile',
      contentRevision: 'profile-1',
      schemaVersion: 1,
      engine: { id: 'krestets-profile', snapshotVersion: 1, revision: ENGINE_REVISION },
      state: next,
      resume: null,
    });
  }
}

export interface SlotInfo {
  slot: SlotId;
  envelope: SaveEnvelope<RuntimeSnapshot, SlotResume> | null;
  error: string | null;
}

export async function readSlot(storage: SaveStorage, slot: SlotId): Promise<SlotInfo> {
  try {
    const service = new SaveService(storage, slotPolicy(slot, () => true));
    const env = await service.load();
    return { slot, envelope: env ?? null, error: null };
  } catch (e) {
    return { slot, envelope: null, error: (e as Error).message };
  }
}

export async function resetSlot(storage: SaveStorage, slot: SlotId): Promise<void> {
  const service = new SaveService(storage, slotPolicy(slot, () => true));
  try {
    await service.load();
  } catch {
    /* a broken record can still be reset after explicit confirmation */
  }
  await service.reset({ gameId: GAME_ID, profileId: slot });
}

export function exportSlot(env: SaveEnvelope<RuntimeSnapshot, SlotResume>, slot: SlotId): string {
  return exportSave(env, slotPolicy(slot, () => true));
}

/**
 * Bounded, validated import. The file may come from any slot; rebinding to the explicitly
 * chosen target slot is deliberate (engine issue #15).
 */
export function parseImport(text: string): SaveEnvelope<RuntimeSnapshot, SlotResume> {
  if (text.length > 2 * 1024 * 1024) throw new Error('file too large');
  let source = 'slot-1';
  try {
    const raw = JSON.parse(text) as { profileId?: unknown; gameId?: unknown };
    if (raw.gameId !== GAME_ID) throw new Error('not a Krestets save');
    if (typeof raw.profileId === 'string' && (SLOT_IDS as readonly string[]).includes(raw.profileId)) source = raw.profileId;
  } catch (e) {
    throw new Error((e as Error).message, { cause: e });
  }
  return importSave(text, slotPolicy(source, () => true));
}

export async function writeImported(
  storage: SaveStorage,
  target: SlotId,
  env: SaveEnvelope<RuntimeSnapshot, SlotResume>,
): Promise<void> {
  const service = new SaveService(storage, slotPolicy(target, () => true));
  await service.load().catch(() => undefined);
  const { revision: _r, ...draft } = env;
  void _r;
  await service.save({ ...draft, profileId: target });
}
