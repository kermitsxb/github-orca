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
      fastForward: vi.fn().mockResolvedValue(true),
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
      linkPr: vi.fn().mockResolvedValue(undefined),
      setupClone: vi.fn().mockResolvedValue({ path: '/Users/me/orca-projects/Web-App' }),
    },
  };
  return deps satisfies Deps;
}

const existing = (comment: string, isArchived = false): WorktreeInfo => ({
  id: 'repo::/wt/old', path: '/wt/old', displayName: 'PR #12 old', branch: 'refs/heads/old', comment, isArchived,
});

describe('helpers', () => {
  it('builds lower-cased markers, with a suffix for branch actions (continue, address-comments)', () => {
    expect(workspaceMarker(review)).toBe('github-orca:acme/web-app#12');
    expect(workspaceMarker({ ...review, action: 'custom' })).toBe('github-orca:acme/web-app#12');
    expect(workspaceMarker({ ...review, action: 'continue' })).toBe('github-orca:acme/web-app#12:branch');
    expect(workspaceMarker({ ...review, action: 'address-comments' })).toBe('github-orca:acme/web-app#12:branch');
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

  it('prefixes branch workspace names with (branch), same bound', () => {
    expect(worktreeName(12, 'Fix login', true)).toBe('PR #12 (branch) Fix login');
    expect(worktreeName(12, 'Fix login', false)).toBe('PR #12 Fix login');
    const long = worktreeName(1, 'x'.repeat(200), true);
    expect(long.length).toBe(80);
    expect(long.startsWith('PR #1 (branch) x')).toBe(true);
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
    expect(deps.orca.createWorktree).toHaveBeenCalledWith(expect.objectContaining({
      base: 'origin/fix/login', comment: 'github-orca:acme/web-app#12:branch', name: 'PR #12 (branch) Fix login',
    }));
    expect(deps.git.setUpstream).toHaveBeenCalledWith(created.path, 'fix/login');
    expect(deps.orca.setStatus).toHaveBeenCalledWith(created.id, 'in-progress');
  });

  it('address-comments: behaves like continue for git (real branch, upstream, :branch marker)', async () => {
    await handleRequest({ ...review, action: 'address-comments' }, deps);
    expect(deps.git.fetchBranch).toHaveBeenCalledWith('/repo', 'fix/login');
    expect(deps.git.fetchPrRef).not.toHaveBeenCalled();
    expect(deps.orca.createWorktree).toHaveBeenCalledWith(expect.objectContaining({
      base: 'origin/fix/login', comment: 'github-orca:acme/web-app#12:branch', name: 'PR #12 (branch) Fix login',
    }));
    expect(deps.git.setUpstream).toHaveBeenCalledWith(created.path, 'fix/login');
    expect(deps.orca.setStatus).toHaveBeenCalledWith(created.id, 'in-progress');
  });

  it('runs repo setup hooks for same-repo PRs', async () => {
    await handleRequest(review, deps);
    expect(deps.orca.createWorktree.mock.calls[0][0]).not.toHaveProperty('setup');
  });

  it('skips repo setup hooks for fork PRs (review and checkout)', async () => {
    deps = makeDeps({ pr: { isCrossRepository: true } });
    await handleRequest(review, deps);
    await handleRequest({ ...review, action: 'checkout', template: undefined }, deps);
    expect(deps.orca.createWorktree).toHaveBeenCalledTimes(2);
    for (const [opts] of deps.orca.createWorktree.mock.calls) expect(opts).toMatchObject({ setup: 'skip' });
  });

  it('links the PR to the new workspace, pushing to the PR branch (Orca\'s PR panel)', async () => {
    for (const action of ['review', 'checkout', 'continue'] as const) {
      const deps = makeDeps();
      await handleRequest({ ...review, action }, deps);
      expect(deps.orca.linkPr).toHaveBeenCalledWith(created.id, 12, 'fix/login');
    }
  });

  it('fork PR: links the PR without a push target', async () => {
    const deps = makeDeps({ pr: { isCrossRepository: true } });
    await handleRequest(review, deps);
    expect(deps.orca.linkPr).toHaveBeenCalledWith(created.id, 12, undefined);
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
    expect(deps.orca.createWorktree).not.toHaveBeenCalled();
  });

  it('links the PR to the existing workspace (backfills older workspaces)', async () => {
    const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12')] });
    await handleRequest(review, deps);
    expect(deps.orca.linkPr).toHaveBeenCalledWith('repo::/wt/old', 12, 'fix/login');
  });

  it('refreshes the PR ref and fast-forwards the existing workspace before starting the agent', async () => {
    const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12')] });
    const order: string[] = [];
    deps.git.fetchPrRef.mockImplementation(async () => (order.push('fetch'), 'origin/pr/12'));
    deps.git.fastForward.mockImplementation(async () => (order.push('ff'), true));
    deps.orca.startAgent.mockImplementation(async () => void order.push('agent'));
    const res = await handleRequest(review, deps);
    expect(deps.git.fetchPrRef).toHaveBeenCalledWith('/repo', 12);
    expect(deps.git.fastForward).toHaveBeenCalledWith('/wt/old', 'origin/pr/12');
    expect(deps.git.fetchBranch).not.toHaveBeenCalled();
    expect(order).toEqual(['fetch', 'ff', 'agent']);
    expect(res).not.toHaveProperty('warning');
  });

  it('refreshes checkout and custom workspaces from the PR ref too', async () => {
    for (const req of [{ ...review, action: 'checkout' as const, template: undefined }, { ...review, action: 'custom' as const }]) {
      const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12')] });
      await handleRequest(req, deps);
      expect(deps.git.fastForward).toHaveBeenCalledWith('/wt/old', 'origin/pr/12');
    }
  });

  it('refreshes branch workspaces (continue, address-comments) from origin/<headRef>', async () => {
    for (const action of ['continue', 'address-comments'] as const) {
      const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12:branch')] });
      const res = await handleRequest({ ...review, action }, deps);
      expect(res).toMatchObject({ ok: true, reused: true });
      expect(deps.git.fetchBranch).toHaveBeenCalledWith('/repo', 'fix/login');
      expect(deps.git.fastForward).toHaveBeenCalledWith('/wt/old', 'origin/fix/login');
      expect(deps.git.fetchPrRef).not.toHaveBeenCalled();
      expect(deps.orca.startAgent).toHaveBeenCalled();
    }
  });

  it('still starts the agent but returns a warning when the fast-forward fails', async () => {
    const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12')] });
    deps.git.fastForward.mockResolvedValue(false);
    const res = await handleRequest(review, deps);
    expect(res).toEqual({
      ok: true, worktreeName: 'PR #12 old', worktreePath: '/wt/old', reused: true,
      warning: "Workspace not updated (local changes or diverged history): the agent works on an older version of the PR",
    });
    expect(deps.orca.startAgent).toHaveBeenCalled();
    expect(deps.orca.setStatus).toHaveBeenCalledWith('repo::/wt/old', 'in-review');
  });

  it('address-comments reuses the continue workspace (shared :branch marker)', async () => {
    const deps = makeDeps({ worktrees: [existing('github-orca:acme/web-app#12'), { ...existing('github-orca:acme/web-app#12:branch'), id: 'b', path: '/wt/b' }] });
    await handleRequest({ ...review, action: 'address-comments' }, deps);
    expect(deps.orca.startAgent).toHaveBeenCalledWith('b', 'claude', expect.any(String));
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

  it('fork_unsupported for continue and address-comments on a fork PR', async () => {
    const deps = makeDeps({ pr: { isCrossRepository: true } });
    for (const action of ['continue', 'address-comments'] as const) {
      expect(await handleRequest({ ...review, action }, deps)).toEqual({
        ok: false, code: 'fork_unsupported', message: 'Continue work / Address comments are not available for a fork PR',
      });
    }
    expect(deps.orca.createWorktree).not.toHaveBeenCalled();
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

describe('handleRequest — clone', () => {
  const clone = { action: 'clone' as const, owner: 'Acme', repo: 'Web-App', destination: '/Users/me/orca-projects' };
  const cloneDeps = (project: { projectId: string; repoPath: string } | null) => {
    const deps = makeDeps();
    deps.orca.findProject.mockResolvedValue(project);
    return deps;
  };

  it('clones over SSH into the destination under a lower-cased project id', async () => {
    const deps = cloneDeps(null);
    const res = await handleRequest(clone, deps);
    expect(deps.orca.setupClone).toHaveBeenCalledWith({
      projectId: 'github:acme/web-app', url: 'git@github.com:Acme/Web-App.git', destination: '/Users/me/orca-projects',
    });
    expect(res).toEqual({ ok: true, worktreeName: 'Acme/Web-App', worktreePath: '/Users/me/orca-projects/Web-App', reused: false });
    expect(deps.gh.prView).not.toHaveBeenCalled();
  });

  it('does not clone a repo Orca already has', async () => {
    const deps = cloneDeps({ projectId: 'github:acme/web-app', repoPath: '/src/web-app' });
    const res = await handleRequest(clone, deps);
    expect(deps.orca.setupClone).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, worktreeName: 'Acme/Web-App', worktreePath: '/src/web-app', reused: true });
  });

  it('starts Orca first when it is not running', async () => {
    const deps = cloneDeps(null);
    deps.orca.isReachable.mockResolvedValueOnce(false).mockResolvedValue(true);
    await handleRequest(clone, deps);
    expect(deps.orca.open).toHaveBeenCalled();
  });

  it('returns the Orca error', async () => {
    const deps = cloneDeps(null);
    deps.orca.setupClone.mockRejectedValue(new HostError('orca_failed', 'destination exists'));
    expect(await handleRequest(clone, deps)).toEqual({ ok: false, code: 'orca_failed', message: 'destination exists' });
  });
});
