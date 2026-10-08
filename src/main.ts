import { App } from './ui/app.js';

const app = new App();
app.boot().then(
  () => document.getElementById('app')?.removeAttribute('aria-busy'),
  (e: unknown) => {
    const root = document.getElementById('app')!;
    root.removeAttribute('aria-busy');
    root.textContent = '';
    const p = document.createElement('p');
    p.setAttribute('role', 'alert');
    p.textContent = 'Не удалось открыть игру: ' + String((e as Error)?.message ?? e);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Повторить';
    retry.addEventListener('click', () => location.reload());
    root.append(p, retry);
  },
);
