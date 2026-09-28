import { mkdir } from 'node:fs/promises';
import { HostError, toHostError } from './errors';
import type { Runner } from './exec';
import type { CloneOptions, CreateWorktreeOptions, OrcaApi, ProjectRef, WorktreeInfo } from './ports';

type Json = Record<string, any>;

export function parseOrcaJson(stdout: string): Json {
  let data: Json;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new HostError('orca_failed', `Unexpected orca output: ${stdout.slice(0, 200)}`);
  }
  if (data.ok !== true) throw new HostError('orca_failed', data.error?.message ?? 'orca returned ok=false');
  return data.result ?? {};
}

function pickWorktree(result: Json): Json {
  return result.worktree ?? result;
}

function pickHandle(result: Json): string | undefined {
  return result.agentTerminalHandle ?? result.startupTerminal?.handle ?? result.terminal?.handle ?? result.handle;
}

function toWorktreeInfo(w: Json): WorktreeInfo {
  return {
    id: String(w.id),
    path: String(w.path),
    displayName: String(w.displayName ?? w.name ?? ''),
    branch: String(w.branch ?? ''),
    comment: String(w.comment ?? ''),
    isArchived: w.isArchived === true,
  };
}

export class OrcaCli implements OrcaApi {
  constructor(
    private readonly run: Runner,
    private readonly makeDir: (path: string) => Promise<unknown> = (path) => mkdir(path, { recursive: true }),
  ) {}

  private async call(args: string[], timeoutMs = 30_000): Promise<Json> {
    try {
      const { stdout } = await this.run('orca', [...args, '--json'], { timeoutMs });
      return parseOrcaJson(stdout);
    } catch (e) {
      throw toHostError(e, 'orca_failed');
    }
  }

  async isReachable(): Promise<boolean> {
    try {
      const result = await this.call(['status']);
      return result.runtime?.reachable === true;
    } catch {
      return false;
    }
  }

  async open(): Promise<void> {
    try {
      await this.run('orca', ['open'], { timeoutMs: 60_000 });
    } catch {
      // isReachable() decides afterwards whether Orca came up
    }
  }

  async findProject(owner: string, repo: string): Promise<ProjectRef | null> {
    const wanted = `github:${owner}/${repo}`.toLowerCase();
    const { projects = [] } = await this.call(['project', 'list']);
    const project = (projects as Json[]).find((p) => String(p.id).toLowerCase() === wanted);
    if (!project) return null;
    const { repos = [] } = await this.call(['repo', 'list']);
    const sourceIds: string[] = project.sourceRepoIds ?? [];
    const source = (repos as Json[]).find((r) => sourceIds.includes(r.id));
    return source ? { projectId: String(project.id), repoPath: String(source.path) } : null;
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const { worktrees = [] } = await this.call(['worktree', 'list']);
    return (worktrees as Json[]).map(toWorktreeInfo);
  }

  async createWorktree(o: CreateWorktreeOptions): Promise<WorktreeInfo> {
    const args = [
      'worktree', 'create', '--project', o.projectId, '--host', 'local', '--base-branch', o.base,
      '--name', o.name, '--comment', o.comment, '--no-parent', '--activate',
    ];
    if (o.setup === 'skip') args.push('--setup', 'skip');
    if (o.agent && o.prompt) args.push('--agent', o.agent, '--prompt', o.prompt);
    return toWorktreeInfo(pickWorktree(await this.call(args, 180_000)));
  }

  async setStatus(worktreeId: string, status: string): Promise<void> {
    await this.call(['worktree', 'set', '--worktree', `id:${worktreeId}`, '--workspace-status', status]);
  }

  async startAgent(worktreeId: string, agent: string, prompt: string): Promise<void> {
    const created = await this.call(['terminal', 'create', '--worktree', `id:${worktreeId}`, '--command', agent, '--focus']);
    const handle = pickHandle(created);
    if (!handle) throw new HostError('orca_failed', 'Orca returned no terminal');
    await this.call(['terminal', 'wait', '--terminal', handle, '--for', 'tui-idle', '--timeout-ms', '60000'], 70_000);
    await this.call(['terminal', 'send', '--terminal', handle, '--text', prompt, '--enter']);
  }

  async reveal(worktreeId: string): Promise<void> {
    await this.call(['terminal', 'create', '--worktree', `id:${worktreeId}`, '--focus']);
  }

  async setupClone(o: CloneOptions): Promise<{ path: string }> {
    // Orca does not create the parent folder (default ~/orca-projects may not exist yet).
    try {
      await this.makeDir(o.destination);
    } catch (e) {
      throw new HostError('orca_failed', `Cannot create ${o.destination}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const result = await this.call(
      ['project', 'setup-clone', '--project', o.projectId, '--host', 'local', '--url', o.url, '--destination', o.destination],
      600_000,
    );
    return { path: String(result.setup?.path ?? result.repo?.path ?? o.destination) };
  }
}
