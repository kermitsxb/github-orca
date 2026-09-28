import { describe, expect, it } from 'vitest';
import { CommandError, nodeRunner } from './exec';

describe('CommandError', () => {
  it('prefers stderr, then stdout', () => {
    expect(new CommandError('gh', 'out', 'err', false).message).toBe('gh: err');
    expect(new CommandError('gh', 'out', '', false).message).toBe('gh: out');
  });

  it('falls back to the underlying error message when both outputs are empty', () => {
    expect(new CommandError('gh', '', '', false, 'spawn gh ENOENT').message).toBe('gh: spawn gh ENOENT');
    expect(new CommandError('gh', '', '', false).message).toBe('gh: échec');
  });
});

describe('nodeRunner', () => {
  it('reports a missing command with the spawn error', async () => {
    const err = await nodeRunner('github-orca-definitely-missing-cmd', []).catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err.message).toContain('ENOENT');
  });

  it('merges opts.env over process.env', async () => {
    const script = 'process.stdout.write(`${process.env.GHO_TEST_VAR}|${typeof process.env.PATH}`)';
    const { stdout } = await nodeRunner(process.execPath, ['-e', script], { env: { GHO_TEST_VAR: '0' } });
    expect(stdout).toBe('0|string');
  });
});
