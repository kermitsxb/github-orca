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

type ToastState = 'busy' | 'ok' | 'warning' | 'error';

/** The status lives in a toast attached to <body>, so it never changes the header layout. */
function createToast(doc: Document): (text: string, state: ToastState) => void {
  const toast = el(doc, 'div', { className: 'gho-toast', hidden: true }, { role: 'status' });
  const toastText = el(doc, 'span', { className: 'gho-toast-text' });
  const toastClose = el(doc, 'button', { type: 'button', className: 'gho-toast-close', textContent: '×' }, { 'aria-label': 'Close' });
  toast.append(toastText, toastClose);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hideToast = () => {
    clearTimeout(hideTimer);
    toast.hidden = true;
  };
  toastClose.addEventListener('click', hideToast);
  return (text, state) => {
    clearTimeout(hideTimer);
    if (!toast.isConnected) doc.body.append(toast);
    toastText.textContent = text;
    toast.dataset.state = state;
    toast.hidden = false;
    if (state === 'ok') hideTimer = setTimeout(hideToast, TOAST_AUTO_HIDE_MS);
  };
}

/** Rejected sends (host missing, extension reloaded…) become an error response. */
async function sendSafely(send: () => Promise<HostResponse>): Promise<HostResponse> {
  try {
    return await send();
  } catch (e) {
    return mapNativeError(e instanceof Error ? e.message : String(e));
  }
}

export function createOrcaButton(key: string, send: Send, doc: Document = document): HTMLElement {
  const root = el(doc, 'div', { className: 'gho-root' }, { 'data-github-orca': key });
  const main = el(doc, 'button', { type: 'button', className: 'gho-main', textContent: ACTION_LABELS.review });
  const toggle = el(doc, 'button', { type: 'button', className: 'gho-toggle', textContent: '▾' }, {
    'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More Orca actions',
  });
  const group = el(doc, 'div', { className: 'gho-group' });
  group.append(main, toggle);

  const menu = el(doc, 'div', { className: 'gho-menu', hidden: true }, { role: 'menu' });
  const items = MENU_ACTIONS.map((action) =>
    el(doc, 'button', { type: 'button', textContent: ACTION_LABELS[action] }, { role: 'menuitem', 'data-action': action }),
  );
  const custom = el(doc, 'form', { className: 'gho-custom' });
  const textarea = el(doc, 'textarea', { rows: 3, placeholder: ACTION_LABELS.custom });
  const submit = el(doc, 'button', { type: 'submit', textContent: 'Run' });
  custom.append(textarea, submit);
  menu.append(...items, custom);

  root.append(group, menu);

  const showStatus = createToast(doc);
  const controls = [main, toggle, ...items, submit];
  let busy = false;

  const setMenu = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };

  const run = async (action: Action, customPrompt?: string) => {
    if (busy) return;
    busy = true;
    setMenu(false);
    controls.forEach((c) => (c.disabled = true));
    showStatus('⏳ Starting in Orca…', 'busy');
    const res = await sendSafely(() => send(action, customPrompt));
    if (res.ok && res.warning) showStatus(`⚠️ ${res.worktreeName} (reused) — ${res.warning}`, 'warning');
    else if (res.ok) showStatus(`✅ ${res.worktreeName}${res.reused ? ' (reused)' : ''}`, 'ok');
    else showStatus(`❌ ${res.message}`, 'error');
    controls.forEach((c) => (c.disabled = false));
    busy = false;
  };

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

/** Repo page button: `<li>` so it sits in the repo header's action list (Watch / Fork / Star). */
export function createCloneButton(key: string, send: () => Promise<HostResponse>, doc: Document = document): HTMLElement {
  const root = el(doc, 'li', { className: 'gho-root gho-clone' }, { 'data-github-orca': key });
  const button = el(doc, 'button', { type: 'button', className: 'gho-single', textContent: 'Clone in Orca' });
  root.append(button);
  const showStatus = createToast(doc);

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    showStatus(`⏳ Cloning ${key} into Orca…`, 'busy');
    const res = await sendSafely(send);
    if (res.ok && res.reused) showStatus(`ℹ️ ${res.worktreeName} is already in Orca (${res.worktreePath})`, 'ok');
    else if (res.ok) showStatus(`✅ ${res.worktreeName} cloned into ${res.worktreePath}`, 'ok');
    else showStatus(`❌ ${res.message}`, 'error');
    button.disabled = false;
  });
  return root;
}
