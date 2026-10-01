import { toHostError } from './errors';
import { CommandError, type Runner } from './exec';
import type { GitApi } from './ports';

/** Never block on a credentials prompt: the host has no terminal. */
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0' };

export class GitCli implements GitApi {
  constructor(private readonly run: Runner) {}

  private async git(args: string[]): Promise<void> {
    try {
      await this.run('git', args, { timeoutMs: 60_000, env: GIT_ENV });
    } catch (e) {
      throw toHostError(e, 'git_failed');
    }
  }

  async fetchPrRef(repoPath: string, prNumber: number): Promise<string> {
    await this.git(['-C', repoPath, 'fetch', 'origin', `+pull/${prNumber}/head:refs/remotes/origin/pr/${prNumber}`]);
    return `origin/pr/${prNumber}`;
  }

  async fetchBranch(repoPath: string, branch: string): Promise<string> {
    await this.git(['-C', repoPath, 'fetch', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
    return `origin/${branch}`;
  }

  async setUpstream(worktreePath: string, branch: string): Promise<void> {
    await this.git(['-C', worktreePath, 'branch', `--set-upstream-to=origin/${branch}`]);
  }

  async renameBranch(worktreePath: string, name: string): Promise<boolean> {
    return this.tolerateRefusal(['-C', worktreePath, 'branch', '-m', name]);
  }

  async fastForward(worktreePath: string, ref: string): Promise<boolean> {
    return this.tolerateRefusal(['-C', worktreePath, 'merge', '--ff-only', ref]);
  }

  /** true when git succeeds, false when it refuses: not fatal, the caller warns instead. Timeouts still throw. */
  private async tolerateRefusal(args: string[]): Promise<boolean> {
    try {
      await this.run('git', args, { timeoutMs: 60_000, env: GIT_ENV });
      return true;
    } catch (e) {
      if (e instanceof CommandError && !e.timedOut) return false;
      throw toHostError(e, 'git_failed');
    }
  }
}
