import { describe, expect, it } from 'vitest';
import { fakeRunner, fixture } from '../test/fake-runner';
import { CommandError } from './exec';
import { GhCli } from './gh';

describe('GhCli.prView', () => {
  it('asks gh for the needed fields and returns PR metadata', async () => {
    const run = fakeRunner([['gh pr view', fixture('gh-pr-view.json')]]);
    const pr = await new GhCli(run).prView('O', 'R', 5);
    expect(run.calls[0].args).toEqual([
      'pr', 'view', '5', '--repo', 'O/R', '--json', 'number,title,url,headRefName,baseRefName,state,isCrossRepository',
    ]);
    expect(pr).toEqual(JSON.parse(fixture('gh-pr-view.json')));
  });

  it('rejects an unsafe branch name coming from GitHub', async () => {
    const bad = JSON.stringify({ ...JSON.parse(fixture('gh-pr-view.json')), headRefName: '-x --upload-pack=evil' });
    const run = fakeRunner([['gh pr view', bad]]);
    await expect(new GhCli(run).prView('O', 'R', 5)).rejects.toMatchObject({ code: 'gh_failed' });
  });

  it('maps gh failures to gh_failed', async () => {
    const run = fakeRunner([['gh pr view', new CommandError('gh', '', 'To get started with GitHub CLI, please run: gh auth login', false)]]);
    await expect(new GhCli(run).prView('O', 'R', 5)).rejects.toMatchObject({ code: 'gh_failed', message: expect.stringContaining('gh auth login') });
  });
});
