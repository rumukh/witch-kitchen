// Narrow desktop bridge (Electron preload). The page never gets general filesystem access.
import type { SaveHistory, SaveKey, SaveStorage, StoredSave } from '@aegis/browser/save';

export interface NativeBridge {
  platform: 'desktop';
  storageRead(key: SaveKey): Promise<SaveHistory>;
  storageCas(key: SaveKey, expected: number, next: StoredSave): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  storageReset(key: SaveKey, expected: number): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  saveFile(suggestedName: string, text: string): Promise<boolean>;
  openFile(): Promise<string | null>;
  toggleFullscreen(): Promise<boolean>;
  quit(): void;
}

export function nativeBridge(): NativeBridge | null {
  const w = globalThis as unknown as { krestetsNative?: NativeBridge };
  return w.krestetsNative ?? null;
}

class NativeStorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class NativeSaveStorage implements SaveStorage {
  constructor(private readonly bridge: NativeBridge) {}
  read(key: SaveKey): Promise<SaveHistory> {
    return this.bridge.storageRead({ gameId: key.gameId, profileId: key.profileId });
  }
  async compareAndSwap(key: SaveKey, expected: number, next: StoredSave): Promise<void> {
    const r = await this.bridge.storageCas({ gameId: key.gameId, profileId: key.profileId }, expected, { ...next });
    if (!r.ok) throw new NativeStorageError(r.code, r.message);
  }
  async reset(key: SaveKey, expected: number, confirmation: SaveKey): Promise<void> {
    if (key.gameId !== confirmation.gameId || key.profileId !== confirmation.profileId)
      throw new NativeStorageError('confirmation', 'Reset requires exact confirmation.');
    const r = await this.bridge.storageReset({ gameId: key.gameId, profileId: key.profileId }, expected);
    if (!r.ok) throw new NativeStorageError(r.code, r.message);
  }
}

export async function downloadText(name: string, text: string): Promise<boolean> {
  const native = nativeBridge();
  if (native) return native.saveFile(name, text);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

export async function pickTextFile(): Promise<string | null> {
  const native = nativeBridge();
  if (native) return native.openFile();
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f || f.size > 2 * 1024 * 1024) return resolve(null);
      resolve(await f.text());
    });
    input.click();
  });
}
