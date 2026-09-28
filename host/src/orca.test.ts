import { describe, expect, it, vi } from 'vitest';
import { fakeRunner, fixture } from '../test/fake-runner';
import { CommandError } from './exec';
import { HostError } from './errors';
import { OrcaCli } from './orca';

const projects = fixture('orca-project-list.json');
const repos = fixture('orca-repo-list.json');
const firstProject = JSON.parse(projects).result.projects[0];
const [owner, repo] = String(firstProject.id).replace('github:', '').split('/');

describe('OrcaCli.findProject', () => {
  it('matches the GitHub project case-insensitively and resolves the repo path', async () => {
    const run = fakeRunner([['orca project list', projects], ['orca repo list', repos]]);
    const found = await new OrcaCli(run).findProject(owner.toUpperCase(), repo.toLowerCase());
    const expectedRepo = JSON.parse(repos).result.repos.find((r: { id: string }) => firstProject.sourceRepoIds.includes(r.id));
    expect(found).toEqual({ projectId: firstProject.id, repoPath: expectedRepo.path });
  });

  it('returns null for an unknown project', async () => {
    const run = fakeRunner([['orca project list', projects], ['orca repo list', repos]]);
    expect(await new OrcaCli(run).findProject('nobody', 'nothing')).toBeNull();
  });
});

describe('OrcaCli.isReachable', () => {
  it('is true for the captured status', async () => {
    const run = fakeRunner([['orca status', fixture('orca-status.json')]]);
    expect(await new OrcaCli(run).isReachable()).toBe(true);
  });

  it('is false when the command fails', async () => {
    const run = fakeRunner([['orca status', new CommandError('orca', '', 'connect ECONNREFUSED', false)]]);
    expect(await new OrcaCli(run).isReachable()).toBe(false);
  });
});

describe('OrcaCli.listWorktrees', () => {
  it('maps the captured list', async () => {
    const run = fakeRunner([['orca worktree list', fixture('orca-worktree-list.json')]]);
    const list = await new OrcaCli(run).listWorktrees();
    expect(list.length).toBeGreaterThan(0);
    for (const w of list) {
      expect(typeof w.id).toBe('string');
      expect(typeof w.path).toBe('string');
      expect(typeof w.comment).toBe('string');
      expect(typeof w.isArchived).toBe('boolean');
    }
  });
});

describe('OrcaCli.createWorktree', () => {
  it('passes every value as its own argv element and parses the result', async () => {
    const run = fakeRunner([['orca worktree create', fixture('orca-worktree-create.json')]]);
    const name = 'PR #7 Fix "a" $(whoami) 🚀';
    const wt = await new OrcaCli(run).createWorktree({
      projectId: 'github:o/r', base: 'origin/pr/7', name, comment: 'github-orca:o/r#7', agent: 'claude', prompt: 'line1\nline2',
    });
    const { args, opts } = run.calls[0];
    expect(args).toEqual([
      'worktree', 'create', '--project', 'github:o/r', '--host', 'local', '--base-branch', 'origin/pr/7',
      '--name', name, '--comment', 'github-orca:o/r#7', '--no-parent', '--activate',
      '--agent', 'claude', '--prompt', 'line1\nline2', '--json',
    ]);
    expect(opts?.timeoutMs).toBe(180_000);
    expect(wt.id).toBeTruthy();
    expect(wt.path).toMatch(/^\//);
  });

  it('omits agent flags without a prompt', async () => {
    const run = fakeRunner([['orca worktree create', fixture('orca-worktree-create.json')]]);
    await new OrcaCli(run).createWorktree({ projectId: 'github:o/r', base: 'origin/pr/7', name: 'n', comment: 'c' });
    expect(run.calls[0].args).not.toContain('--agent');
    expect(run.calls[0].args).not.toContain('--prompt');
    expect(run.calls[0].args).not.toContain('--setup');
  });

  it('passes --setup skip when asked to skip setup hooks', async () => {
    const run = fakeRunner([['orca worktree create', fixture('orca-worktree-create.json')]]);
    await new OrcaCli(run).createWorktree({ projectId: 'github:o/r', base: 'origin/pr/7', name: 'n', comment: 'c', setup: 'skip' });
    const { args } = run.calls[0];
    expect(args[args.indexOf('--setup') + 1]).toBe('skip');
  });

  it('turns an ok:false envelope into orca_failed with orca\'s message', async () => {
    const stdout = JSON.stringify({ ok: false, error: { message: 'base ref not found' } });
    const run = fakeRunner([['orca worktree create', new CommandError('orca', stdout, '', false)]]);
    const err = await new OrcaCli(run).createWorktree({ projectId: 'p', base: 'b', name: 'n', comment: 'c' }).catch((e) => e);
    expect(err).toBeInstanceOf(HostError);
    expect(err).toMatchObject({ code: 'orca_failed', message: 'base ref not found' });
  });

  it('maps a killed process to timeout', async () => {
    const run = fakeRunner([['orca worktree create', new CommandError('orca', '', '', true)]]);
    const err = await new OrcaCli(run).createWorktree({ projectId: 'p', base: 'b', name: 'n', comment: 'c' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'timeout' });
  });
});

describe('OrcaCli.startAgent', () => {
  it('creates a focused terminal, waits for the TUI, then sends the prompt with Enter', async () => {
    const run = fakeRunner([
      ['orca terminal create', fixture('orca-terminal-create.json')],
      ['orca terminal wait', JSON.stringify({ ok: true, result: {} })],
      ['orca terminal send', JSON.stringify({ ok: true, result: {} })],
    ]);
    await new OrcaCli(run).startAgent('repo::/wt', 'claude', 'Review it');
    const [create, wait, send] = run.calls.map((c) => c.args);
    expect(create).toEqual(['terminal', 'create', '--worktree', 'id:repo::/wt', '--command', 'claude', '--focus', '--json']);
    const handle = wait[wait.indexOf('--terminal') + 1];
    expect(handle).toBeTruthy();
    expect(wait).toEqual(['terminal', 'wait', '--terminal', handle, '--for', 'tui-idle', '--timeout-ms', '60000', '--json']);
    expect(send).toEqual(['terminal', 'send', '--terminal', handle, '--text', 'Review it', '--enter', '--json']);
  });
});

describe('OrcaCli.setStatus / reveal', () => {
  it('builds the expected commands', async () => {
    const ok = JSON.stringify({ ok: true, result: {} });
    const run = fakeRunner([['orca worktree set', ok], ['orca terminal create', fixture('orca-terminal-create.json')]]);
    const orca = new OrcaCli(run);
    await orca.setStatus('repo::/wt', 'in-review');
    await orca.reveal('repo::/wt');
    expect(run.calls[0].args).toEqual(['worktree', 'set', '--worktree', 'id:repo::/wt', '--workspace-status', 'in-review', '--json']);
    expect(run.calls[1].args).toEqual(['terminal', 'create', '--worktree', 'id:repo::/wt', '--focus', '--json']);
  });
});

describe('OrcaCli.setupClone', () => {
  // Shape read by Orca's own formatter (formatProjectHostSetupResult): { project, setup: { path }, repo }.
  const cloned = JSON.stringify({
    ok: true,
    result: { project: { id: 'github:o/r' }, setup: { id: 's1', path: '/Users/me/orca-projects/r' }, repo: { id: 'r1' } },
  });

  it('creates the parent folder, then clones through Orca with a long timeout', async () => {
    const run = fakeRunner([['orca project setup-clone', cloned]]);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const res = await new OrcaCli(run, mkdir).setupClone({
      projectId: 'github:o/r', url: 'git@github.com:o/r.git', destination: '/Users/me/orca-projects',
    });
    expect(mkdir).toHaveBeenCalledWith('/Users/me/orca-projects');
    expect(run.calls[0].args).toEqual([
      'project', 'setup-clone', '--project', 'github:o/r', '--host', 'local',
      '--url', 'git@github.com:o/r.git', '--destination', '/Users/me/orca-projects', '--json',
    ]);
    expect(run.calls[0].opts?.timeoutMs).toBe(600_000);
    expect(res).toEqual({ path: '/Users/me/orca-projects/r' });
  });

  it('reports a folder that cannot be created as orca_failed', async () => {
    const run = fakeRunner([]);
    const mkdir = vi.fn().mockRejectedValue(new Error('EACCES: permission denied'));
    const err = await new OrcaCli(run, mkdir).setupClone({ projectId: 'p', url: 'u', destination: '/x' }).catch((e) => e);
    expect(err).toBeInstanceOf(HostError);
    expect(err).toMatchObject({ code: 'orca_failed', message: expect.stringContaining('/x') });
    expect(run.calls).toHaveLength(0);
  });
});
