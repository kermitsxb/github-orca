import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostRequest, PrMeta } from '../../shared/types';
import { HostError } from './errors';
import { handleRequest, hasMarker, workspaceMarker, worktreeName, type Deps } from './handler';
import type { WorktreeInfo } from './ports';

const pr: PrMeta = {
  number: 12, title: 'Fix login', url: 'https://github.com/Acme/Web-App/pull/12',
  headRefName: 'fix/login', baseRefName: 'main', state: 'OPEN', isCrossRepository: false,
};
const created: WorktreeInfo = { id: 'repo::/wt/pr-12', path: '/wt/pr-12', displayName: 'PR #12 Fix login', branch: 'refs/heads/x', comment: '', isArchived: false };
const review: HostRequest = { action: 'review', owner: 'Acme', repo: 'Web-App', prNumber: 12, agent: 'claude', template: 'Review {pr_url} ({head_ref})' };

function makeDeps(overrides: { pr?: Partial<PrMeta>; worktrees?: WorktreeInfo[] } = {}) {
  const deps = {
    gh: { prView: vi.fn().mockResolvedValue({ ...pr, ...overrides.pr }) },
    git: {
      fetchPrRef: vi.fn().mockResolvedValue('origin/pr/12'),
      fetchBranch: vi.fn().mockResolvedValue('origin/fix/login'),
      setUpstream: vi.fn().mockResolvedValue(undefined),
    },
    orca: {
      isReachable: vi.fn().mockResolvedValue(true),
      open: vi.fn().mockResolvedValue(undefined),
      findProject: vi.fn().mockResolvedValue({ projectId: 'github:Acme/Web-App', repoPath: '/repo' }),
      listWorktrees: vi.fn().mockResolvedValue(overrides.worktrees ?? []),
      createWorktree: vi.fn().mockResolvedValue(created),
      setStatus: vi.fn().mockResolvedValue(undefined),
      startAgent: vi.fn().mockResolvedValue(undefined),
      reveal: vi.fn().mockResolvedValue(undefined),
    },
  };
  return deps satisfies Deps;
}

const existing = (comment: string, isArchived = false): WorktreeInfo => ({
  id: 'repo::/wt/old', path: '/wt/old', displayName: 'PR #12 old', branch: 'refs/heads/old', comment, isArchived,
});

describe('helpers', () => {
  it('builds lower-cased markers, with a suffix for continue', () => {
    expect(workspaceMarker(review)).toBe('github-orca:acme/web-app#12');
    expect(workspaceMarker({ ...review, action: 'continue' })).toBe('github-orca:acme/web-app#12:branch');
  });

  it('matches markers as whole tokens only', () => {
    expect(hasMarker('github-orca:o/r#12', 'github-orca:o/r#12')).toBe(true);
    expect(hasMarker('note\ngithub-orca:o/r#12', 'github-orca:o/r#12')).toBe(true);
    expect(hasMarker('github-orca:o/r#123', 'github-orca:o/r#12')).toBe(false);
    expect(hasMarker('github-orca:o/r#12:branch', 'github-orca:o/r#12')).toBe(false);
  });

  it('builds a single-line, bounded worktree name', () => {
    expect(worktreeName(12, 'Fix\n  "login"\t$(x)')).toBe('PR #12 Fix "login" $(x)');
    const long = worktreeName(1, 'x'.repeat(200));
    expect(long.length).toBe(80);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('handleRequest — new workspace', () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('review: fetches the PR ref, creates the worktree with the interpolated prompt, sets in-review', async () => {
    const res = await handleRequest(review, deps);
    expect(res).toEqual({ ok: true, worktreeName: created.displayName, worktreePath: created.path, reused: false });
    expect(deps.git.fetchPrRef).toHaveBeenCalledWith('/repo', 12);
    expect(deps.orca.createWorktree).toHaveBeenCalledWith({
      projectId: 'github:Acme/Web-App', base: 'origin/pr/12', name: 'PR #12 Fix login',
      comment: 'github-orca:acme/web-app#12', agent: 'claude', prompt: `Review ${pr.url} (fix/login)`,
    });
    expect(deps.orca.setStatus).toHaveBeenCalledWith(created.id, 'in-review');
  });

  it('checkout: no agent, no prompt, no status change', async () => {
    const res = await handleRequest({ ...review, action: 'checkout', template: undefined }, deps);
    expect(res.ok).toBe(true);
    expect(deps.orca.createWorktree).toHaveBeenCalledWith(expect.objectContaining({ agent: undefined, prompt: undefined }));
    expect(deps.orca.setStatus).not.toHaveBeenCalled();
  });

  it('continue: fetches the real branch, sets the upstream, marks in-progress', async () => {
    await handleRequest({ ...review, action: 'continue' }, deps);
    expect(deps.git.fetchBranch).toHaveBeenCalledWith('/repo', 'fix/login');
    expect(deps.git.fetchPrRef).not.toHaveBeenCalled();
    expect(deps.orca.createWorktree).toHaveBeenCalledWith(expect.objectContaining({ base: 'origin/fix/login', comment: 'github-orca:acme/web-app#12:branch' }));
    expect(deps.git.setUpstream).toHaveBeenCalledWith(created.path, 'fix/login');
    expect(deps.orca.setStatus).toHaveBeenCalledWith(created.id, 'in-progress');
  });

  it('passes a hostile title through as data', async () => {
    deps = makeDeps({ pr: { title: 'a"b\n$(rm -rf ~) 🚀' } });
    await handleRequest({ ...review, template: '{pr_title}' }, deps);
    expect(deps.orca.createWorktree).toHaveBeenCalledWith(expect.objectContaining({ name: 'PR #12 a"b $(rm -rf ~) 🚀', prompt: 'a"b\n$(rm -rf ~) 🚀' }));
  });
});

describe('handleRequest — reuse', () => {
  it('starts the agent in the existing workspace instead of creating one', async () => {
    const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12')] });
    const res = await handleRequest(review, deps);
    expect(res).toEqual({ ok: true, worktreeName: 'PR #12 old', worktreePath: '/wt/old', reused: true });
    expect(deps.orca.startAgent).toHaveBeenCalledWith('repo::/wt/old', 'claude', `Review ${pr.url} (fix/login)`);
    expect(deps.orca.setStatus).toHaveBeenCalledWith('repo::/wt/old', 'in-review');
    expect(deps.git.fetchPrRef).not.toHaveBeenCalled();
    expect(deps.orca.createWorktree).not.toHaveBeenCalled();
  });

  it('checkout on an existing workspace only reveals it', async () => {
    const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12')] });
    await handleRequest({ ...review, action: 'checkout', template: undefined }, deps);
    expect(deps.orca.reveal).toHaveBeenCalledWith('repo::/wt/old');
    expect(deps.orca.startAgent).not.toHaveBeenCalled();
  });

  it('ignores archived workspaces and near-miss markers', async () => {
    const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12', true), existing('github-orca:acme/web-app#123')] });
    const res = await handleRequest(review, deps);
    expect(res).toMatchObject({ ok: true, reused: false });
    expect(deps.orca.createWorktree).toHaveBeenCalled();
  });
});

describe('handleRequest — errors', () => {
  it('unknown_repo when the project is not in Orca', async () => {
    const deps = makeDeps();
    deps.orca.findProject.mockResolvedValue(null);
    expect(await handleRequest(review, deps)).toMatchObject({ ok: false, code: 'unknown_repo', message: expect.stringContaining('Acme/Web-App') });
  });

  it('opens Orca once when unreachable, then continues', async () => {
    const deps = makeDeps();
    deps.orca.isReachable.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await handleRequest(review, deps)).ok).toBe(true);
    expect(deps.orca.open).toHaveBeenCalledTimes(1);
  });

  it('orca_unavailable when Orca stays unreachable', async () => {
    const deps = makeDeps();
    deps.orca.isReachable.mockResolvedValue(false);
    expect(await handleRequest(review, deps)).toMatchObject({ ok: false, code: 'orca_unavailable' });
    expect(deps.orca.createWorktree).not.toHaveBeenCalled();
  });

  it('pr_not_open for an agent action on a merged PR, but checkout still works', async () => {
    const deps = makeDeps({ pr: { state: 'MERGED' } });
    expect(await handleRequest(review, deps)).toMatchObject({ ok: false, code: 'pr_not_open' });
    expect((await handleRequest({ ...review, action: 'checkout', template: undefined }, deps)).ok).toBe(true);
  });

  it('fork_unsupported for continue on a fork PR', async () => {
    const deps = makeDeps({ pr: { isCrossRepository: true } });
    expect(await handleRequest({ ...review, action: 'continue' }, deps)).toMatchObject({ ok: false, code: 'fork_unsupported' });
  });

  it('returns HostErrors from adapters as responses', async () => {
    const deps = makeDeps();
    deps.git.fetchPrRef.mockRejectedValue(new HostError('git_failed', 'fatal: nope'));
    expect(await handleRequest(review, deps)).toEqual({ ok: false, code: 'git_failed', message: 'fatal: nope' });
  });

  it('wraps unexpected errors as internal', async () => {
    const deps = makeDeps();
    deps.gh.prView.mockRejectedValue(new TypeError('boom'));
    expect(await handleRequest(review, deps)).toEqual({ ok: false, code: 'internal', message: 'boom' });
  });
});
