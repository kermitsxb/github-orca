import { describe, expect, it } from 'vitest';
import { fakeRunner } from '../test/fake-runner';
import { CommandError } from './exec';
import { GitCli } from './git';

describe('GitCli', () => {
  it('fetches the PR head into origin/pr/<n>, forcing the update', async () => {
    const run = fakeRunner([['git', '']]);
    expect(await new GitCli(run).fetchPrRef('/repo', 12)).toBe('origin/pr/12');
    expect(run.calls[0]).toMatchObject({
      cmd: 'git',
      args: ['-C', '/repo', 'fetch', 'origin', '+pull/12/head:refs/remotes/origin/pr/12'],
      opts: { timeoutMs: 60_000 },
    });
  });

  it('fetches a branch into origin/<branch>', async () => {
    const run = fakeRunner([['git', '']]);
    expect(await new GitCli(run).fetchBranch('/repo', 'feat/x')).toBe('origin/feat/x');
    expect(run.calls[0].args).toEqual(['-C', '/repo', 'fetch', 'origin', '+refs/heads/feat/x:refs/remotes/origin/feat/x']);
  });

  it('sets the upstream in the worktree', async () => {
    const run = fakeRunner([['git', '']]);
    await new GitCli(run).setUpstream('/wt', 'feat/x');
    expect(run.calls[0].args).toEqual(['-C', '/wt', 'branch', '--set-upstream-to=origin/feat/x']);
  });

  it('maps failures to git_failed with stderr', async () => {
    const run = fakeRunner([['git', new CommandError('git', '', "fatal: couldn't find remote ref pull/12/head", false)]]);
    await expect(new GitCli(run).fetchPrRef('/repo', 12)).rejects.toMatchObject({ code: 'git_failed', message: expect.stringContaining('pull/12/head') });
  });

  it('runs git without terminal prompts', async () => {
    const run = fakeRunner([['git', '']]);
    const git = new GitCli(run);
    await git.fetchPrRef('/repo', 12);
    await git.fastForward('/wt', 'origin/pr/12');
    for (const c of run.calls) expect(c.opts?.env).toEqual({ GIT_TERMINAL_PROMPT: '0' });
  });

  it('fast-forwards the worktree onto the ref', async () => {
    const run = fakeRunner([['git', '']]);
    expect(await new GitCli(run).fastForward('/wt', 'origin/pr/12')).toBe(true);
    expect(run.calls[0].args).toEqual(['-C', '/wt', 'merge', '--ff-only', 'origin/pr/12']);
  });

  it('returns false when git refuses the fast-forward (dirty tree or diverged)', async () => {
    const run = fakeRunner([['git', new CommandError('git', '', 'fatal: Not possible to fast-forward, aborting.', false)]]);
    expect(await new GitCli(run).fastForward('/wt', 'origin/pr/12')).toBe(false);
  });

  it('still throws timeout when the fast-forward is killed', async () => {
    const run = fakeRunner([['git', new CommandError('git', '', '', true)]]);
    await expect(new GitCli(run).fastForward('/wt', 'origin/pr/12')).rejects.toMatchObject({ code: 'timeout' });
  });
});
