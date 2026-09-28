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
}

export interface GhApi {
  prView(owner: string, repo: string, prNumber: number): Promise<PrMeta>;
}
