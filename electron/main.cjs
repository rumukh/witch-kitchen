// Electron main process: offline Windows wrapper for the static web build (DESKTOP-02, SAVE-07).
'use strict';
const { app, BrowserWindow, ipcMain, dialog, protocol, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const APP_ID = 'io.github.rumukh.krestets';
app.setName('Krestets');
app.setAppUserModelId(APP_ID);
// Saves live in %APPDATA%\Krestets, outside the installation folder; updates never touch them.
const dataRoot = path.join(app.getPath('appData'), 'Krestets');
app.setPath('userData', path.join(dataRoot, 'electron'));
const saveRoot = process.env.KRESTETS_SAVE_DIR || path.join(dataRoot, 'saves');
const webRoot = path.join(__dirname, 'web');

// Packaged files are served from a privileged, secure, standard app:// origin; AEGIS audio accepts it via schemes: ['app:'].
const ORIGIN = 'app://krestets/';
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) {
  // A second instance would write the same slot: refuse and focus the first one.
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
}

// ---------- File-backed SaveStorage (atomic temp + rename, previous copy, CAS) ----------
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function keyFile(key) {
  if (!key || !ID.test(key.gameId) || !ID.test(key.profileId)) throw Object.assign(new Error('bad key'), { code: 'invalid-data' });
  return path.join(saveRoot, key.gameId.replace(/:/g, '_'), `${key.profileId.replace(/:/g, '_')}.json`);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function withRetry(fn) {
  let last;
  for (let i = 0; i < 6; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      await sleep(40 * (i + 1));
    }
  }
  throw last;
}
function readHistory(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const h = JSON.parse(text);
    if (typeof h !== 'object' || h === null) throw new Error('corrupt');
    return h;
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    // Fall back to the previous copy if the current file is unreadable.
    try {
      return JSON.parse(fs.readFileSync(file + '.prev', 'utf8'));
    } catch {
      throw Object.assign(new Error('save file is corrupt'), { code: 'corrupt' });
    }
  }
}
function revisionOf(h) {
  return (h.current && h.current.revision) || h.revision || 0;
}
async function writeHistory(file, history) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(history));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(file)) await withRetry(async () => fs.copyFileSync(file, file + '.prev'));
  await withRetry(async () => fs.renameSync(tmp, file));
}
// Serialize all storage operations in this process.
let chain = Promise.resolve();
function serial(fn) {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}
ipcMain.handle('storage:read', (_e, key) => serial(async () => readHistory(keyFile(key))));
ipcMain.handle('storage:cas', (_e, key, expected, next) =>
  serial(async () => {
    try {
      const file = keyFile(key);
      if (!next || typeof next.payload !== 'string' || next.revision !== expected + 1 || next.payload.length > 8 * 1024 * 1024)
        return { ok: false, code: 'invalid-data', message: 'A save write must advance exactly one revision.' };
      const h = readHistory(file);
      if (revisionOf(h) !== expected) return { ok: false, code: 'conflict', message: 'Another writer changed the save.' };
      await writeHistory(file, { current: next, ...(h.current ? { previous: h.current } : {}) });
      return { ok: true };
    } catch (e) {
      return { ok: false, code: e.code === 'invalid-data' ? 'invalid-data' : 'failed', message: String(e.message) };
    }
  }),
);
ipcMain.handle('storage:reset', (_e, key, expected) =>
  serial(async () => {
    try {
      const file = keyFile(key);
      const h = readHistory(file);
      if (revisionOf(h) !== expected) return { ok: false, code: 'conflict', message: 'Another writer changed the save before reset.' };
      await writeHistory(file, { revision: expected + 1 });
      return { ok: true };
    } catch (e) {
      return { ok: false, code: 'failed', message: String(e.message) };
    }
  }),
);
ipcMain.handle('file:save', async (e, name, text) => {
  if (typeof text !== 'string' || text.length > 4 * 1024 * 1024) return false;
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { defaultPath: path.basename(String(name)), filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, text, 'utf8');
  return true;
});
ipcMain.handle('file:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const st = fs.statSync(r.filePaths[0]);
  if (st.size > 2 * 1024 * 1024) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});
ipcMain.handle('window:fullscreen', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  w.setFullScreen(!w.isFullScreen());
  return w.isFullScreen();
});
ipcMain.on('app:quit', () => app.quit());

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#1d2133',
    title: 'Крестец',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  // No outbound navigation or new windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) e.preventDefault();
  });
  win.loadURL(ORIGIN + 'index.html');
  return win;
}

app.whenReady().then(() => {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    if (url.host !== 'krestets') return new Response('not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(webRoot, rel));
    if (!file.startsWith(webRoot)) return new Response('forbidden', { status: 403 });
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
  // Deny all network access: the game runs fully offline.
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: !(details.url.startsWith(ORIGIN) || details.url.startsWith('devtools://') || details.url.startsWith('data:') || details.url.startsWith('blob:')) });
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
