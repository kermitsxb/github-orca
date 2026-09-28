import type { PrMeta } from '../../shared/types';

export interface WorktreeInfo {
  id: string;
  path: string;
  displayName: string;
  branch: string;
  comment: string;
  isArchived: boolean;
}

export interface ProjectRef {
  projectId: string;
  repoPath: string;
}

export interface CreateWorktreeOptions {
  projectId: string;
  base: string;
  name: string;
  comment: string;
  agent?: string;
  prompt?: string;
  /** 'skip' passes `--setup skip` (fork PRs: do not run the repo's setup hooks). */
  setup?: 'skip';
}

export interface OrcaApi {
  isReachable(): Promise<boolean>;
  open(): Promise<void>;
  findProject(owner: string, repo: string): Promise<ProjectRef | null>;
  listWorktrees(): Promise<WorktreeInfo[]>;
  createWorktree(opts: CreateWorktreeOptions): Promise<WorktreeInfo>;
  setStatus(worktreeId: string, status: string): Promise<void>;
  startAgent(worktreeId: string, agent: string, prompt: string): Promise<void>;
  reveal(worktreeId: string): Promise<void>;
}

export interface GitApi {
  /** Fetches the PR head into refs/remotes/origin/pr/<n>; returns the base ref `origin/pr/<n>`. */
  fetchPrRef(repoPath: string, prNumber: number): Promise<string>;
  /** Fetches origin/<branch>; returns the base ref `origin/<branch>`. */
  fetchBranch(repoPath: string, branch: string): Promise<string>;
  setUpstream(worktreePath: string, branch: string): Promise<void>;
  /** `merge --ff-only <ref>` in the worktree: true when done or already up to date, false when git refuses. */
  fastForward(worktreePath: string, ref: string): Promise<boolean>;
}

export interface GhApi {
  prView(owner: string, repo: string, prNumber: number): Promise<PrMeta>;
}
