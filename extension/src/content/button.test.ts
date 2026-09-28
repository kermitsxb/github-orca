// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostResponse } from '../../../shared/types';
import { createCloneButton, createOrcaButton, type Send } from './button';

const ok: HostResponse = { ok: true, worktreeName: 'PR #3 Fix', worktreePath: '/wt', reused: false };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function mount(send: Send) {
  const root = createOrcaButton('a/b#3', send, document);
  document.body.replaceChildren(root);
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  return { root, q };
}

const toast = () => document.querySelector<HTMLElement>('.gho-toast');
const toastText = () => toast()?.querySelector('.gho-toast-text')?.textContent;

afterEach(() => {
  vi.useRealTimers();
});

describe('createOrcaButton', () => {
  it('is tagged with the PR key', () => {
    const { root } = mount(vi.fn());
    expect(root.dataset.githubOrca).toBe('a/b#3');
  });

  it('main click sends review and shows success', async () => {
    const send = vi.fn<Send>().mockResolvedValue(ok);
    const { q } = mount(send);
    q<HTMLButtonElement>('.gho-main').click();
    expect(send).toHaveBeenCalledWith('review', undefined);
    await vi.waitFor(() => expect(toastText()).toContain('PR #3 Fix'));
    expect(toastText()).toContain('✅');
  });

  it('marks a reused workspace', async () => {
    const { q } = mount(vi.fn<Send>().mockResolvedValue({ ...ok, reused: true }));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(toastText()).toContain('reused'));
  });

  it('shows the stale-workspace warning on a reused workspace', async () => {
    const { q } = mount(vi.fn<Send>().mockResolvedValue({ ...ok, reused: true, warning: 'Workspace not updated' }));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(toastText()).toBe('⚠️ PR #3 Fix (reused) — Workspace not updated'));
    expect(toast()!.dataset.state).toBe('warning');
  });

  it('explains a reloaded extension when the send rejects', async () => {
    const { q } = mount(vi.fn<Send>().mockRejectedValue(new Error('Extension context invalidated.')));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(toastText()).toBe('❌ Extension reloaded: reload the page'));
  });

  it('ignores clicks while a request is pending', async () => {
    const d = deferred<HostResponse>();
    const send = vi.fn<Send>().mockReturnValue(d.promise);
    const { q } = mount(send);
    q<HTMLButtonElement>('.gho-main').click();
    q<HTMLButtonElement>('.gho-main').click();
    q<HTMLButtonElement>('[data-action="checkout"]').click();
    expect(send).toHaveBeenCalledTimes(1);
    d.resolve(ok);
    await vi.waitFor(() => expect(q<HTMLButtonElement>('.gho-main').disabled).toBe(false));
  });

  it('shows host errors and rejected sends', async () => {
    const send = vi.fn<Send>()
      .mockResolvedValueOnce({ ok: false, code: 'unknown_repo', message: 'a/b is not in Orca' })
      .mockRejectedValueOnce(new Error('Extension context invalidated.'));
    const { q } = mount(send);
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(toastText()).toBe('❌ a/b is not in Orca'));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(toastText()).toContain('Extension reloaded'));
  });

  it('toggles the menu and runs a menu action', async () => {
    const send = vi.fn<Send>().mockResolvedValue(ok);
    const { q } = mount(send);
    const menu = q<HTMLElement>('.gho-menu');
    expect(menu.hidden).toBe(true);
    q<HTMLButtonElement>('.gho-toggle').click();
    expect(menu.hidden).toBe(false);
    expect(q('.gho-toggle').getAttribute('aria-expanded')).toBe('true');
    q<HTMLButtonElement>('[data-action="continue"]').click();
    expect(send).toHaveBeenCalledWith('continue', undefined);
    expect(menu.hidden).toBe(true);
  });

  it('closes the menu on Escape', () => {
    const { q } = mount(vi.fn());
    q<HTMLButtonElement>('.gho-toggle').click();
    q('.gho-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q<HTMLElement>('.gho-menu').hidden).toBe(true);
  });

  it('sends a custom prompt, and ignores an empty one', () => {
    const send = vi.fn<Send>().mockResolvedValue(ok);
    const { q } = mount(send);
    const form = q<HTMLFormElement>('.gho-custom');
    form.requestSubmit();
    expect(send).not.toHaveBeenCalled();
    q<HTMLTextAreaElement>('.gho-custom textarea').value = 'Write tests';
    form.requestSubmit();
    expect(send).toHaveBeenCalledWith('custom', 'Write tests');
  });

  it('keeps the status out of the header: the toast lives in the body, not in the button', async () => {
    const { q, root } = mount(vi.fn<Send>().mockResolvedValue(ok));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(toastText()).toContain('PR #3 Fix'));
    expect(root.contains(toast())).toBe(false);
    expect(toast()!.parentElement).toBe(document.body);
    expect(toast()!.getAttribute('role')).toBe('status');
  });

  it('reuses a single toast per button across runs', async () => {
    const { q } = mount(vi.fn<Send>().mockResolvedValue(ok));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(toastText()).toContain('✅'));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(toastText()).toContain('✅'));
    expect(document.querySelectorAll('.gho-toast')).toHaveLength(1);
  });

  it('hides a success toast automatically', async () => {
    vi.useFakeTimers();
    const { q } = mount(vi.fn<Send>().mockResolvedValue(ok));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(toast()!.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(6000);
    expect(toast()!.hidden).toBe(true);
  });

  it('keeps an error toast until it is closed', async () => {
    vi.useFakeTimers();
    const { q } = mount(vi.fn<Send>().mockResolvedValue({ ok: false, code: 'orca_unavailable', message: 'Orca is not responding' }));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(toast()!.hidden).toBe(false);
    expect(toast()!.dataset.state).toBe('error');
    toast()!.querySelector<HTMLButtonElement>('.gho-toast-close')!.click();
    expect(toast()!.hidden).toBe(true);
  });

  it('does not hide a newer toast with an older timer', async () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>()
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ ok: false, code: 'gh_failed', message: 'gh: failed' });
    const { q } = mount(send);
    q<HTMLButtonElement>('.gho-main').click();
    await vi.advanceTimersByTimeAsync(1000);
    q<HTMLButtonElement>('.gho-main').click();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(toast()!.hidden).toBe(false);
    expect(toastText()).toBe('❌ gh: failed');
  });
});

describe('createCloneButton', () => {
  const cloned: HostResponse = { ok: true, worktreeName: 'a/b', worktreePath: '/Users/me/orca-projects/b', reused: false };
  const mountClone = (send: () => Promise<HostResponse>) => {
    const ul = document.createElement('ul');
    const root = createCloneButton('a/b', send, document);
    ul.append(root);
    document.body.replaceChildren(ul);
    return { root, button: root.querySelector<HTMLButtonElement>('button')! };
  };

  it('is a list item tagged with the repo key, fitting the repo header list', () => {
    const { root, button } = mountClone(vi.fn());
    expect(root.tagName).toBe('LI');
    expect(root.dataset.githubOrca).toBe('a/b');
    expect(button.textContent).toBe('Clone in Orca');
  });

  it('clones and reports the clone path', async () => {
    const send = vi.fn().mockResolvedValue(cloned);
    const { button } = mountClone(send);
    button.click();
    expect(send).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    await vi.waitFor(() => expect(toastText()).toBe('✅ a/b cloned into /Users/me/orca-projects/b'));
    expect(button.disabled).toBe(false);
  });

  it('says when the repo is already in Orca', async () => {
    const { button } = mountClone(vi.fn().mockResolvedValue({ ...cloned, worktreePath: '/src/b', reused: true }));
    button.click();
    await vi.waitFor(() => expect(toastText()).toBe('ℹ️ a/b is already in Orca (/src/b)'));
  });

  it('shows host errors and rejected sends', async () => {
    const { button } = mountClone(vi.fn().mockResolvedValue({ ok: false, code: 'orca_failed', message: 'boom' }));
    button.click();
    await vi.waitFor(() => expect(toastText()).toBe('❌ boom'));
    const second = mountClone(vi.fn().mockRejectedValue(new Error('Extension context invalidated.')));
    second.button.click();
    await vi.waitFor(() => expect(toastText()).toContain('Extension reloaded'));
  });
});
