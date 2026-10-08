// npm run build:win — portable Windows x64 Electron archive wrapping dist/web.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packager } from '@electron/packager';

if (!existsSync('dist/web/index.html') || process.argv.includes('--rebuild-web')) execSync('node scripts/build-web.mjs', { stdio: 'inherit' });
const stage = 'dist/electron-app';
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync('electron/main.cjs', join(stage, 'main.cjs'));
cpSync('electron/preload.cjs', join(stage, 'preload.cjs'));
cpSync('dist/web', join(stage, 'web'), { recursive: true });
writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: 'krestets', productName: 'Krestets', version: '1.0.0', main: 'main.cjs', private: true }, null, 2));
const electronVersion = JSON.parse(execSync('npx electron --version', { encoding: 'utf8' }).trim().replace(/^v/, '"') + '"');
rmSync('dist/win', { recursive: true, force: true });
const [out] = await packager({
  dir: stage,
  out: 'dist/win',
  name: 'Krestets',
  executableName: 'Krestets',
  platform: 'win32',
  arch: 'x64',
  electronVersion,
  overwrite: true,
  asar: true,
  prune: false,
  appCopyright: 'Krestets authors',
  win32metadata: { ProductName: 'Крестец', FileDescription: 'Крестец. Ведьмина кухня на границе миров', CompanyName: 'rumukh' },
});
for (const f of ['THIRD_PARTY_NOTICES.md']) if (existsSync(f)) cpSync(f, join(out, 'THIRD_PARTY_NOTICES.txt'));
writeFileSync(join(out, 'README.txt'), 'Крестец. Ведьмина кухня на границе миров — Windows x64.\r\nЗапуск: Krestets.exe. Работает без интернета.\r\nСохранения: %APPDATA%\\Krestets\\saves (обновление игры их не трогает).\r\nF11 — полный экран.\r\n');
mkdirSync('release', { recursive: true });
rmSync('release/krestets-win-x64.zip', { force: true });
execSync(`tar -a -c -f release/krestets-win-x64.zip -C "${out}" .`, { stdio: 'inherit' });
console.log(`win build: ${out} → release/krestets-win-x64.zip (${(statSync('release/krestets-win-x64.zip').size / 1048576).toFixed(1)} MiB), Electron ${electronVersion}`);
