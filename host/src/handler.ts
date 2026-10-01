import { interpolate, varsFromPr } from '../../shared/templates';
import type { Action, CloneRequest, HostMessage, HostRequest, HostResponse } from '../../shared/types';
import { HostError } from './errors';
import type { GhApi, GitApi, OrcaApi } from './ports';

export interface Deps {
  orca: OrcaApi;
  git: GitApi;
  gh: GhApi;
}

const STATUS: Record<Action, string | null> = {
  review: 'in-review',
  checkout: null,
  continue: 'in-progress',
  'address-comments': 'in-progress',
  custom: 'in-progress',
};

const MAX_NAME = 80;

export const STALE_WARNING =
  "Workspace not updated (local changes or diverged history): the agent works on an older version of the PR";

export function branchKeptWarning(current: string, wanted: string): string {
  return `Local branch kept as ${current}: ${wanted} already exists`;
}

/** Actions that work on the PR's real branch (fetch origin/<headRef>, upstream set, can push). */
export function isBranchAction(action: Action): boolean {
  return action === 'continue' || action === 'address-comments';
}

export function workspaceMarker(req: Pick<HostRequest, 'action' | 'owner' | 'repo' | 'prNumber'>): string {
  const base = `github-orca:${req.owner}/${req.repo}#${req.prNumber}`.toLowerCase();
  return isBranchAction(req.action) ? `${base}:branch` : base;
}

export function hasMarker(comment: string, marker: string): boolean {
  return comment.toLowerCase().split(/\s+/).includes(marker);
}

export function worktreeName(prNumber: number, title: string, branch = false): string {
  const name = `PR #${prNumber} ${branch ? '(branch) ' : ''}${title.replace(/\s+/g, ' ').trim()}`;
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
}

async function ensureOrca(orca: OrcaApi): Promise<void> {
  if (await orca.isReachable()) return;
  await orca.open();
  if (!(await orca.isReachable())) throw new HostError('orca_unavailable', 'Orca is not responding');
}

async function clone(req: CloneRequest, { orca }: Deps): Promise<HostResponse> {
  const name = `${req.owner}/${req.repo}`;
  await ensureOrca(orca);
  const existing = await orca.findProject(req.owner, req.repo);
  if (existing) return { ok: true, worktreeName: name, worktreePath: existing.repoPath, reused: true };
  const { path } = await orca.setupClone({
    projectId: `github:${name}`.toLowerCase(), // Orca's own ids are lower-cased (see findProject)
    url: `git@github.com:${name}.git`,
    destination: req.destination,
  });
  return { ok: true, worktreeName: name, worktreePath: path, reused: false };
}

async function run(req: HostRequest, { orca, git, gh }: Deps): Promise<HostResponse> {
  const pr = await gh.prView(req.owner, req.repo, req.prNumber);
  if (req.action !== 'checkout' && pr.state !== 'OPEN') {
    throw new HostError('pr_not_open', `PR ${pr.state === 'MERGED' ? 'merged' : 'closed'}: only Checkout only is available`);
  }
  const onBranch = isBranchAction(req.action);
  if (onBranch && pr.isCrossRepository) {
    throw new HostError('fork_unsupported', 'Continue work / Address comments are not available for a fork PR');
  }
  const prompt = req.template ? interpolate(req.template, varsFromPr(req.owner, req.repo, pr)) : undefined;
  const status = STATUS[req.action];

  await ensureOrca(orca);
  const project = await orca.findProject(req.owner, req.repo);
  if (!project) {
    throw new HostError('unknown_repo', `${req.owner}/${req.repo} is not in Orca (clone it from its GitHub page, or orca repo add --path <clone>)`);
  }

  const fetchBase = () =>
    onBranch ? git.fetchBranch(project.repoPath, pr.headRefName) : git.fetchPrRef(project.repoPath, pr.number);

  // Fork PRs: the head branch is not on origin, so the PR is only linked.
  const pushBranch = pr.isCrossRepository ? undefined : pr.headRefName;
  const marker = workspaceMarker(req);
  const existing = (await orca.listWorktrees()).find((w) => !w.isArchived && hasMarker(w.comment, marker));
  if (existing) {
    // Bring the workspace up to the current PR head before the agent looks at it.
    const upToDate = await git.fastForward(existing.path, await fetchBase());
    await orca.linkPr(existing.id, pr.number, pushBranch);
    if (prompt) await orca.startAgent(existing.id, req.agent, prompt);
    else await orca.reveal(existing.id);
    if (status) await orca.setStatus(existing.id, status);
    const res: HostResponse = { ok: true, worktreeName: existing.displayName, worktreePath: existing.path, reused: true };
    return upToDate ? res : { ...res, warning: STALE_WARNING };
  }

  const wt = await orca.createWorktree({
    projectId: project.projectId,
    base: await fetchBase(),
    name: worktreeName(pr.number, pr.title, onBranch),
    comment: marker,
    // Fork PRs: never run the repo's setup hooks on code from an outside contributor.
    ...(pr.isCrossRepository ? { setup: 'skip' as const } : {}),
  });
  // Orca names the branch after the workspace; give it the PR's branch name (taken when checked out elsewhere).
  const renamed = await git.renameBranch(wt.path, pr.headRefName);
  await orca.linkPr(wt.id, pr.number, pushBranch);
  if (onBranch) await git.setUpstream(wt.path, pr.headRefName);
  if (status) await orca.setStatus(wt.id, status);
  // The agent must see the final branch and upstream from its first command.
  if (prompt) await orca.startAgent(wt.id, req.agent, prompt);
  const res: HostResponse = { ok: true, worktreeName: wt.displayName, worktreePath: wt.path, reused: false };
  return renamed ? res : { ...res, warning: branchKeptWarning(wt.branch.replace(/^refs\/heads\//, ''), pr.headRefName) };
}

export async function handleRequest(req: HostMessage, deps: Deps): Promise<HostResponse> {
  try {
    return req.action === 'clone' ? await clone(req, deps) : await run(req, deps);
  } catch (e) {
    if (e instanceof HostError) return { ok: false, code: e.code, message: e.message };
    return { ok: false, code: 'internal', message: e instanceof Error ? e.message : String(e) };
  }
}
