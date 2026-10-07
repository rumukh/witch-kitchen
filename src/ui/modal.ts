// Accessible modal dialogs built on native <dialog> and AEGIS focus helpers.
import { openDialog, rememberFocus } from '@aegis/browser/ui';
import { h, button } from './dom.js';

let stack = 0;
export function modalOpen(): boolean {
  return stack > 0;
}

export interface ModalHandle {
  dialog: HTMLDialogElement;
  close(): void;
}

export function showModal(
  title: string,
  body: Node | Node[],
  options: { cls?: string; onClose?: () => void; dismissible?: boolean; initial?: () => HTMLElement | null } = {},
): ModalHandle {
  const bookmark = rememberFocus(document);
  const heading = h('h2', { class: 'modal-title', id: `m-${Date.now()}-${stack}` }, title);
  const content = h('div', { class: 'modal-body' }, ...(Array.isArray(body) ? body : [body]));
  const dialog = h('dialog', { class: `modal ${options.cls ?? ''}`, 'aria-labelledby': heading.id }, heading, content);
  document.getElementById('app')!.append(dialog);
  stack++;
  let closed = false;
  let undo: (() => void) | null = null;
  const close = () => {
    if (closed) return;
    closed = true;
    stack--;
    undo?.();
    dialog.close();
    dialog.remove();
    bookmark.restore();
    options.onClose?.();
  };
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (options.dismissible !== false) close();
  });
  undo = openDialog(dialog, options.initial?.() ?? (content.querySelector('button, [tabindex]') as HTMLElement | null) ?? undefined);
  return { dialog, close };
}

export function confirmModal(title: string, text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const m = showModal(
      title,
      [
        h('p', {}, text),
        h(
          'div',
          { class: 'modal-actions' },
          button(yes, () => {
            result = true;
            m.close();
          }, { class: 'primary', 'data-testid': 'confirm-yes' }),
          button(no, () => m.close(), { 'data-testid': 'confirm-no' }),
        ),
      ],
      { onClose: () => resolve(result), initial: () => null },
    );
  });
}

export function chooseModal<T>(
  title: string,
  text: string | null,
  choices: { label: string; value: T; desc?: string; disabled?: string | null }[],
  cancel: string,
): Promise<T | null> {
  return new Promise((resolve) => {
    let result: T | null = null;
    const list = h('div', { class: 'choice-list' });
    const m = showModal(title, [text ? h('p', {}, text) : null, list].filter(Boolean) as Node[], {
      onClose: () => resolve(result),
    });
    choices.forEach((c, i) => {
      const b = button(c.label, () => {
        if (c.disabled) return;
        result = c.value;
        m.close();
      }, { class: 'choice', 'data-testid': `choice-${i}`, 'aria-disabled': c.disabled ? 'true' : null });
      if (c.desc || c.disabled) b.append(h('span', { class: 'choice-desc' }, c.disabled ?? c.desc ?? ''));
      list.append(b);
    });
    list.append(button(cancel, () => m.close(), { class: 'ghost', 'data-testid': 'choice-cancel' }));
    (list.querySelector('button:not([aria-disabled="true"])') as HTMLElement | null)?.focus();
  });
}

export function infoModal(title: string, body: Node | Node[] | string, ok: string): Promise<void> {
  return new Promise((resolve) => {
    const m = showModal(
      title,
      [
        ...(typeof body === 'string' ? [h('p', {}, body)] : Array.isArray(body) ? body : [body]),
        h('div', { class: 'modal-actions' }, button(ok, () => m.close(), { class: 'primary', 'data-testid': 'info-ok' })),
      ],
      { onClose: () => resolve() },
    );
  });
}
