import type { Action, HostResponse } from '../../../shared/types';
import { mapNativeError } from '../native-errors';

export type Send = (action: Action, customPrompt?: string) => Promise<HostResponse>;

export const ACTION_LABELS: Record<Action, string> = {
  review: 'Review in Orca',
  checkout: 'Checkout only',
  continue: 'Continue work',
  'address-comments': 'Address comments',
  custom: 'Custom prompt…',
};

const MENU_ACTIONS: Action[] = ['checkout', 'continue', 'address-comments'];
const TOAST_AUTO_HIDE_MS = 6000;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  Object.assign(node, props);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function createOrcaButton(key: string, send: Send, doc: Document = document): HTMLElement {
  const root = el(doc, 'div', { className: 'gho-root' }, { 'data-github-orca': key });
  const main = el(doc, 'button', { type: 'button', className: 'gho-main', textContent: ACTION_LABELS.review });
  const toggle = el(doc, 'button', { type: 'button', className: 'gho-toggle', textContent: '▾' }, {
    'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Autres actions Orca',
  });
  const group = el(doc, 'div', { className: 'gho-group' });
  group.append(main, toggle);

  const menu = el(doc, 'div', { className: 'gho-menu', hidden: true }, { role: 'menu' });
  const items = MENU_ACTIONS.map((action) =>
    el(doc, 'button', { type: 'button', textContent: ACTION_LABELS[action] }, { role: 'menuitem', 'data-action': action }),
  );
  const custom = el(doc, 'form', { className: 'gho-custom' });
  const textarea = el(doc, 'textarea', { rows: 3, placeholder: ACTION_LABELS.custom });
  const submit = el(doc, 'button', { type: 'submit', textContent: 'Lancer' });
  custom.append(textarea, submit);
  menu.append(...items, custom);

  root.append(group, menu);

  // The status lives in a toast attached to <body>, so it never changes the header layout.
  const toast = el(doc, 'div', { className: 'gho-toast', hidden: true }, { role: 'status' });
  const toastText = el(doc, 'span', { className: 'gho-toast-text' });
  const toastClose = el(doc, 'button', { type: 'button', className: 'gho-toast-close', textContent: '×' }, { 'aria-label': 'Fermer' });
  toast.append(toastText, toastClose);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const controls = [main, toggle, ...items, submit];
  let busy = false;

  const setMenu = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  const hideToast = () => {
    clearTimeout(hideTimer);
    toast.hidden = true;
  };
  const showStatus = (text: string, state: 'busy' | 'ok' | 'warning' | 'error') => {
    clearTimeout(hideTimer);
    if (!toast.isConnected) doc.body.append(toast);
    toastText.textContent = text;
    toast.dataset.state = state;
    toast.hidden = false;
    if (state === 'ok') hideTimer = setTimeout(hideToast, TOAST_AUTO_HIDE_MS);
  };

  const run = async (action: Action, customPrompt?: string) => {
    if (busy) return;
    busy = true;
    setMenu(false);
    controls.forEach((c) => (c.disabled = true));
    showStatus('⏳ Lancement dans Orca…', 'busy');
    let res: HostResponse;
    try {
      res = await send(action, customPrompt);
    } catch (e) {
      res = mapNativeError(e instanceof Error ? e.message : String(e));
    }
    if (res.ok && res.warning) showStatus(`⚠️ ${res.worktreeName} (réutilisé) — ${res.warning}`, 'warning');
    else if (res.ok) showStatus(`✅ ${res.worktreeName}${res.reused ? ' (réutilisé)' : ''}`, 'ok');
    else showStatus(`❌ ${res.message}`, 'error');
    controls.forEach((c) => (c.disabled = false));
    busy = false;
  };

  toastClose.addEventListener('click', hideToast);
  main.addEventListener('click', () => void run('review'));
  toggle.addEventListener('click', () => setMenu(!!menu.hidden));
  for (const item of items) item.addEventListener('click', () => void run(item.dataset.action as Action));
  custom.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (text) void run('custom', text);
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
  doc.addEventListener('click', (e) => {
    if (root.isConnected && !menu.hidden && !root.contains(e.target as Node)) setMenu(false);
  });
  return root;
}
