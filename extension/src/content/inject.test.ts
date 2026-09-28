// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { prKey, type PrRef } from '../pr-url';
import { syncButton } from './inject';

const factory = (pr: PrRef) => {
  const el = document.createElement('div');
  el.dataset.githubOrca = prKey(pr);
  return el;
};
const ME = 'instance-new';
const buttons = () => document.querySelectorAll('[data-github-orca]');

describe('syncButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="gh-header-actions"><a>Edit</a></div>';
  });

  it('inserts one button into the header actions on a PR page', () => {
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    syncButton(document, 'https://github.com/a/b/pull/12/files', factory, ME);
    expect(buttons()).toHaveLength(1);
    expect(document.querySelector('.gh-header-actions')!.firstElementChild).toBe(buttons()[0]);
  });

  it('follows Turbo navigation between PRs and removes the button elsewhere', () => {
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    syncButton(document, 'https://github.com/a/b/pull/13', factory, ME);
    expect(buttons()).toHaveLength(1);
    expect((buttons()[0] as HTMLElement).dataset.githubOrca).toBe('a/b#13');
    syncButton(document, 'https://github.com/a/b/issues', factory, ME);
    expect(buttons()).toHaveLength(0);
  });

  it('inserts after the title when only an h1 exists', () => {
    document.body.innerHTML = '<main><h1>Title</h1></main>';
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    expect(document.querySelector('h1')!.nextElementSibling).toBe(buttons()[0]);
  });

  it('floats when no anchor exists, then moves once the header renders', () => {
    document.body.innerHTML = '';
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    expect((buttons()[0] as HTMLElement).classList.contains('gho-floating')).toBe(true);
    const header = document.createElement('div');
    header.className = 'gh-header-actions';
    document.body.append(header);
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    expect(buttons()).toHaveLength(1);
    expect(header.contains(buttons()[0])).toBe(true);
  });

  it('replaces a button left by an older content script instance (extension reloaded)', () => {
    const orphan = factory({ owner: 'a', repo: 'b', prNumber: 12 });
    orphan.dataset.ghoInstance = 'instance-old';
    document.querySelector('.gh-header-actions')!.prepend(orphan);
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0]).not.toBe(orphan);
    expect((buttons()[0] as HTMLElement).dataset.ghoInstance).toBe(ME);
  });

  it('replaces an untagged button from a pre-instance version of the extension', () => {
    const legacy = factory({ owner: 'a', repo: 'b', prNumber: 12 });
    document.querySelector('.gh-header-actions')!.prepend(legacy);
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0]).not.toBe(legacy);
  });

  it('keeps its own button across repeated syncs', () => {
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    const mine = buttons()[0];
    syncButton(document, 'https://github.com/a/b/pull/12', factory, ME);
    expect(buttons()[0]).toBe(mine);
  });
});
