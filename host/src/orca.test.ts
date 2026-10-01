import { describe, expect, it, vi } from 'vitest';
import { fakeRunner, fixture } from '../test/fake-runner';
import { CommandError } from './exec';
import { HostError } from './errors';
import { OrcaCli, loadOrcaRpc, runtimeClientPath } from './orca';

vi.mock('./log', () => ({ log: vi.fn() }));

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

describe('OrcaCli.linkPr', () => {
  const noRun = fakeRunner([]);
  const noMkdir = vi.fn();

  it('sets linkedPR and the push target through the runtime RPC (the CLI has no flag for them)', async () => {
    const rpc = vi.fn().mockResolvedValue({ result: { worktree: { linkedPR: 12 } } });
    await new OrcaCli(noRun, noMkdir, async () => rpc).linkPr('repo::/wt', 12, 'fix/login');
    expect(rpc).toHaveBeenCalledWith('worktree.set', {
      worktree: 'id:repo::/wt', linkedPR: 12, pushTarget: { remoteName: 'origin', branchName: 'fix/login' },
    });
    expect(noRun.calls).toEqual([]);
  });

  it('sets linkedPR alone when there is no push branch (fork PR)', async () => {
    const rpc = vi.fn().mockResolvedValue({});
    await new OrcaCli(noRun, noMkdir, async () => rpc).linkPr('repo::/wt', 12);
    expect(rpc).toHaveBeenCalledWith('worktree.set', { worktree: 'id:repo::/wt', linkedPR: 12 });
  });

  it('is best effort: a missing or failing runtime client does not throw', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('runtime_unavailable'));
    await expect(new OrcaCli(noRun, noMkdir, async () => failing).linkPr('repo::/wt', 12)).resolves.toBeUndefined();
    const unloadable = async () => {
      throw new Error('Cannot find module');
    };
    await expect(new OrcaCli(noRun, noMkdir, unloadable).linkPr('repo::/wt', 12)).resolves.toBeUndefined();
  });
});

describe('OrcaCli launcher', () => {
  const electron = 'C:\\Orca\\Orca.exe';
  const cli = 'C:\\Orca\\resources\\app.asar.unpacked\\out\\cli\\index.js';
  const env = { ELECTRON_RUN_AS_NODE: '1' };

  it('runs the resolved launcher with its leading args and env', async () => {
    const run = fakeRunner([[`${electron} ${cli} status`, fixture('orca-status.json')]]);
    const orca = new OrcaCli(run, undefined, undefined, { cmd: electron, args: [cli], env });
    expect(await orca.isReachable()).toBe(true);
    expect(run.calls[0]).toEqual({ cmd: electron, args: [cli, 'status', '--json'], opts: { timeoutMs: 30_000, env } });
  });

  it('uses the launcher for `open` too', async () => {
    const run = fakeRunner([[`${electron} ${cli} open`, '']]);
    await new OrcaCli(run, undefined, undefined, { cmd: electron, args: [cli], env }).open();
    expect(run.calls[0]).toMatchObject({ cmd: electron, args: [cli, 'open'], opts: { env } });
  });

  it('resolves a lazy launcher once', async () => {
    const ok = JSON.stringify({ ok: true, result: {} });
    const run = fakeRunner([['orca', ok]]);
    const resolve = vi.fn(() => ({ cmd: 'orca', args: [] }));
    const orca = new OrcaCli(run, undefined, undefined, resolve);
    expect(resolve).not.toHaveBeenCalled();
    await orca.setStatus('w', 's');
    await orca.setStatus('w', 's');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('surfaces a launcher that cannot be resolved as its HostError', async () => {
    const run = fakeRunner([]);
    const missing = new HostError('orca_unavailable', 'Orca CLI not found on PATH (orca)');
    const resolve = vi.fn(() => {
      throw missing;
    });
    const orca = new OrcaCli(run, undefined, undefined, resolve);
    await expect(orca.isReachable()).rejects.toBe(missing);
    await expect(orca.findProject('o', 'r')).rejects.toBe(missing);
    await expect(orca.open()).rejects.toBe(missing);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(run.calls).toEqual([]);
  });

  it('loads the runtime RPC from the launcher\'s runtime client', async () => {
    const rpc = vi.fn().mockResolvedValue({});
    const loadRpc = vi.fn(async () => rpc);
    const launcher = { cmd: 'orca', args: [], runtimeClient: '/opt/Orca/out/cli/runtime-client.js' };
    await new OrcaCli(fakeRunner([]), vi.fn(), loadRpc, launcher).linkPr('w', 3);
    expect(loadRpc).toHaveBeenCalledWith('/opt/Orca/out/cli/runtime-client.js');
    expect(rpc).toHaveBeenCalled();
  });
});

describe('loadOrcaRpc', () => {
  it('fails without a runtime client path', async () => {
    await expect(loadOrcaRpc(undefined)).rejects.toThrow();
  });
});

describe('runtimeClientPath', () => {
  it('finds the runtime client next to the orca binary inside the app bundle', () => {
    expect(runtimeClientPath('/Applications/Orca.app/Contents/Resources/bin/orca')).toBe(
      '/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/cli/runtime-client.js',
    );
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
