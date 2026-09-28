import { interpolate, varsFromPr } from '../../shared/templates';
import type { Action, HostRequest, HostResponse } from '../../shared/types';
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

export function workspaceMarker(req: Pick<HostRequest, 'action' | 'owner' | 'repo' | 'prNumber'>): string {
  const base = `github-orca:${req.owner}/${req.repo}#${req.prNumber}`.toLowerCase();
  return req.action === 'continue' ? `${base}:branch` : base;
}

export function hasMarker(comment: string, marker: string): boolean {
  return comment.toLowerCase().split(/\s+/).includes(marker);
}

export function worktreeName(prNumber: number, title: string): string {
  const name = `PR #${prNumber} ${title.replace(/\s+/g, ' ').trim()}`;
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
}

async function ensureOrca(orca: OrcaApi): Promise<void> {
  if (await orca.isReachable()) return;
  await orca.open();
  if (!(await orca.isReachable())) throw new HostError('orca_unavailable', 'Orca ne répond pas');
}

async function run(req: HostRequest, { orca, git, gh }: Deps): Promise<HostResponse> {
  const pr = await gh.prView(req.owner, req.repo, req.prNumber);
  if (req.action !== 'checkout' && pr.state !== 'OPEN') {
    throw new HostError('pr_not_open', `PR ${pr.state === 'MERGED' ? 'mergée' : 'fermée'} : seul Checkout only est possible`);
  }
  if (req.action === 'continue' && pr.isCrossRepository) {
    throw new HostError('fork_unsupported', 'Continue work indisponible pour une PR de fork');
  }
  const prompt = req.template ? interpolate(req.template, varsFromPr(req.owner, req.repo, pr)) : undefined;
  const status = STATUS[req.action];

  await ensureOrca(orca);
  const project = await orca.findProject(req.owner, req.repo);
  if (!project) {
    throw new HostError('unknown_repo', `${req.owner}/${req.repo} n'est pas dans Orca (orca repo add --path <clone>)`);
  }

  const marker = workspaceMarker(req);
  const existing = (await orca.listWorktrees()).find((w) => !w.isArchived && hasMarker(w.comment, marker));
  if (existing) {
    if (prompt) await orca.startAgent(existing.id, req.agent, prompt);
    else await orca.reveal(existing.id);
    if (status) await orca.setStatus(existing.id, status);
    return { ok: true, worktreeName: existing.displayName, worktreePath: existing.path, reused: true };
  }

  const base =
    req.action === 'continue'
      ? await git.fetchBranch(project.repoPath, pr.headRefName)
      : await git.fetchPrRef(project.repoPath, pr.number);
  const wt = await orca.createWorktree({
    projectId: project.projectId,
    base,
    name: worktreeName(pr.number, pr.title),
    comment: marker,
    agent: prompt ? req.agent : undefined,
    prompt,
  });
  if (req.action === 'continue') await git.setUpstream(wt.path, pr.headRefName);
  if (status) await orca.setStatus(wt.id, status);
  return { ok: true, worktreeName: wt.displayName, worktreePath: wt.path, reused: false };
}

export async function handleRequest(req: HostRequest, deps: Deps): Promise<HostResponse> {
  try {
    return await run(req, deps);
  } catch (e) {
    if (e instanceof HostError) return { ok: false, code: e.code, message: e.message };
    return { ok: false, code: 'internal', message: e instanceof Error ? e.message : String(e) };
  }
}
