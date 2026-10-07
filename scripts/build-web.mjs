// npm run build:web — static itch.io-ready folder (relative paths, no service worker) + zip.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist/web';
execSync('npx vite build', { stdio: 'inherit' });
cpSync('content', join(out, 'content'), { recursive: true });
for (const dir of ['assets/placeholder', 'assets/art', 'assets/audio']) {
  if (!existsSync(dir)) continue;
  cpSync(dir, join(out, dir), {
    recursive: true,
    filter: (src) => !/\.(wav|flac|psd|blend|md)$/i.test(src) || src.endsWith('.wav') && src.includes('placeholder'),
  });
}
for (const f of ['THIRD_PARTY_NOTICES.md', 'LICENSE']) if (existsSync(f)) cpSync(f, join(out, f.replace('.md', '.txt')));
const html = readFileSync(join(out, 'index.html'), 'utf8');
if (/serviceWorker|\/\/[a-z]+\.(com|net|org)/i.test(html)) throw new Error('index.html must stay offline-neutral and SW-free');
const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((a, f) => a + size(join(p, f)), 0) : statSync(p).size);
const files = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((a, f) => a + files(join(p, f)), 0) : 1);
writeFileSync(join(out, 'build.json'), JSON.stringify({ game: '1.0.0', engine: '0abd61b5a679020bfb66bf4db24888df9e339d4d', built: new Date().toISOString(), files: files(out), bytes: size(out) }, null, 2));
mkdirSync('release', { recursive: true });
rmSync('release/krestets-web.zip', { force: true });
execSync(`tar -a -c -f release/krestets-web.zip -C ${out} .`, { stdio: 'inherit' });
console.log(`web build: ${out} (${files(out)} files, ${(size(out) / 1048576).toFixed(1)} MiB) → release/krestets-web.zip (${(statSync('release/krestets-web.zip').size / 1048576).toFixed(1)} MiB)`);
