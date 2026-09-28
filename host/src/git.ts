import { toHostError } from './errors';
import type { Runner } from './exec';
import type { GitApi } from './ports';

export class GitCli implements GitApi {
  constructor(private readonly run: Runner) {}

  private async git(args: string[]): Promise<void> {
    try {
      await this.run('git', args, { timeoutMs: 60_000 });
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
}
