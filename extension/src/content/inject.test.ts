// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { prKey, type PrRef } from '../pr-url';
import { repoKey, type RepoRef } from '../repo-url';
import { resolveTarget, syncButton } from './inject';

const factory = (pr: PrRef) => {
  const el = document.createElement('div');
  el.dataset.githubOrca = prKey(pr);
  return el;
};
const repoFactory = (r: RepoRef) => {
  const el = document.createElement('li');
  el.dataset.githubOrca = repoKey(r);
  return el;
};
const ME = 'instance-new';
const sync = (url: string) => syncButton(document, resolveTarget(url, { pr: factory, repo: repoFactory }), ME);
const buttons = () => document.querySelectorAll('[data-github-orca]');

describe('syncButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="gh-header-actions"><a>Edit</a></div>';
  });

  it('inserts one button into the header actions on a PR page', () => {
    sync('https://github.com/a/b/pull/12');
    sync('https://github.com/a/b/pull/12/files');
    expect(buttons()).toHaveLength(1);
    expect(document.querySelector('.gh-header-actions')!.firstElementChild).toBe(buttons()[0]);
  });

  it('follows Turbo navigation between PRs and removes the button elsewhere', () => {
    sync('https://github.com/a/b/pull/12');
    sync('https://github.com/a/b/pull/13');
    expect(buttons()).toHaveLength(1);
    expect((buttons()[0] as HTMLElement).dataset.githubOrca).toBe('a/b#13');
    sync('https://github.com/a/b/issues');
    expect(buttons()).toHaveLength(0);
  });

  it('inserts after the title when only an h1 exists', () => {
    document.body.innerHTML = '<main><h1>Title</h1></main>';
    sync('https://github.com/a/b/pull/12');
    expect(document.querySelector('h1')!.nextElementSibling).toBe(buttons()[0]);
  });

  it('floats when no anchor exists, then moves once the header renders', () => {
    document.body.innerHTML = '';
    sync('https://github.com/a/b/pull/12');
    expect((buttons()[0] as HTMLElement).classList.contains('gho-floating')).toBe(true);
    const header = document.createElement('div');
    header.className = 'gh-header-actions';
    document.body.append(header);
    sync('https://github.com/a/b/pull/12');
    expect(buttons()).toHaveLength(1);
    expect(header.contains(buttons()[0])).toBe(true);
  });

  it('replaces a button left by an older content script instance (extension reloaded)', () => {
    const orphan = factory({ owner: 'a', repo: 'b', prNumber: 12 });
    orphan.dataset.ghoInstance = 'instance-old';
    document.querySelector('.gh-header-actions')!.prepend(orphan);
    sync('https://github.com/a/b/pull/12');
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0]).not.toBe(orphan);
    expect((buttons()[0] as HTMLElement).dataset.ghoInstance).toBe(ME);
  });

  it('replaces an untagged button from a pre-instance version of the extension', () => {
    const legacy = factory({ owner: 'a', repo: 'b', prNumber: 12 });
    document.querySelector('.gh-header-actions')!.prepend(legacy);
    sync('https://github.com/a/b/pull/12');
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0]).not.toBe(legacy);
  });

  it('keeps its own button across repeated syncs', () => {
    sync('https://github.com/a/b/pull/12');
    const mine = buttons()[0];
    sync('https://github.com/a/b/pull/12');
    expect(buttons()[0]).toBe(mine);
  });
});

describe('syncButton — repo page', () => {
  beforeEach(() => {
    document.body.innerHTML = '<ul data-testid="repo-header-actions"><li>Watch</li><li>Star</li></ul><main><h1>README</h1></main>';
  });
  const header = () => document.querySelector('[data-testid="repo-header-actions"]')!;

  it('prepends one Clone button to the repo header actions, on the code views too', () => {
    sync('https://github.com/a/b');
    sync('https://github.com/a/b/tree/main/src');
    expect(buttons()).toHaveLength(1);
    expect(header().firstElementChild).toBe(buttons()[0]);
    expect((buttons()[0] as HTMLElement).dataset.githubOrca).toBe('a/b');
  });

  it('waits for the repo header: no README h1 fallback, no floating button (404, non-repo pages)', () => {
    const saved = header();
    saved.remove();
    sync('https://github.com/a/b');
    expect(buttons()).toHaveLength(0);
    document.body.prepend(saved);
    sync('https://github.com/a/b');
    expect(saved.firstElementChild).toBe(buttons()[0]);
  });

  it('swaps the repo button for the PR button when navigating to a PR, and back', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="gh-header-actions"></div>');
    sync('https://github.com/a/b');
    sync('https://github.com/a/b/pull/12');
    expect(buttons()).toHaveLength(1);
    expect((buttons()[0] as HTMLElement).dataset.githubOrca).toBe('a/b#12');
    sync('https://github.com/a/b');
    expect(buttons()).toHaveLength(1);
    expect(header().firstElementChild).toBe(buttons()[0]);
  });

  it('removes the button on other repo pages', () => {
    sync('https://github.com/a/b');
    sync('https://github.com/a/b/actions');
    expect(buttons()).toHaveLength(0);
  });
});
