// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { HostResponse } from '../../../shared/types';
import { createOrcaButton, type Send } from './button';

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
    await vi.waitFor(() => expect(q('.gho-status').textContent).toContain('PR #3 Fix'));
    expect(q('.gho-status').textContent).toContain('✅');
  });

  it('marks a reused workspace', async () => {
    const { q } = mount(vi.fn<Send>().mockResolvedValue({ ...ok, reused: true }));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(q('.gho-status').textContent).toContain('réutilisé'));
  });

  it('shows the stale-workspace warning on a reused workspace', async () => {
    const { q, root } = mount(vi.fn<Send>().mockResolvedValue({ ...ok, reused: true, warning: 'Workspace non mis à jour' }));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(q('.gho-status').textContent).toBe('⚠️ PR #3 Fix (réutilisé) — Workspace non mis à jour'));
    expect(root.dataset.state).toBe('warning');
  });

  it('explains a reloaded extension when the send rejects', async () => {
    const { q } = mount(vi.fn<Send>().mockRejectedValue(new Error('Extension context invalidated.')));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(q('.gho-status').textContent).toBe('❌ Extension rechargée : recharge la page'));
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
      .mockResolvedValueOnce({ ok: false, code: 'unknown_repo', message: "a/b n'est pas dans Orca" })
      .mockRejectedValueOnce(new Error('Extension context invalidated.'));
    const { q } = mount(send);
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(q('.gho-status').textContent).toBe("❌ a/b n'est pas dans Orca"));
    q<HTMLButtonElement>('.gho-main').click();
    await vi.waitFor(() => expect(q('.gho-status').textContent).toContain('Extension rechargée'));
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
});
