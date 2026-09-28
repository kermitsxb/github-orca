export type Action = 'review' | 'checkout' | 'continue' | 'address-comments' | 'custom';
export const ACTIONS: readonly Action[] = ['review', 'checkout', 'continue', 'address-comments', 'custom'];

export type AgentAction = 'review' | 'continue' | 'address-comments';
export const AGENT_ACTIONS: readonly AgentAction[] = ['review', 'continue', 'address-comments'];

export interface HostRequest {
  action: Action;
  owner: string;
  repo: string;
  prNumber: number;
  agent: string;
  /** Raw, non-interpolated template. Absent for `checkout`. */
  template?: string;
}

/** Clone a repository into Orca (repo page button). `destination` is the parent folder. */
export interface CloneRequest {
  action: 'clone';
  owner: string;
  repo: string;
  destination: string;
}

export type HostMessage = HostRequest | CloneRequest;

export type ErrorCode =
  | 'host_missing'
  | 'invalid_request'
  | 'orca_unavailable'
  | 'unknown_repo'
  | 'gh_failed'
  | 'git_failed'
  | 'orca_failed'
  | 'pr_not_open'
  | 'fork_unsupported'
  | 'timeout'
  | 'internal';

export type HostResponse =
  | { ok: true; worktreeName: string; worktreePath: string; reused: boolean; warning?: string }
  | { ok: false; code: ErrorCode; message: string };

export interface PrMeta {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isCrossRepository: boolean;
}
