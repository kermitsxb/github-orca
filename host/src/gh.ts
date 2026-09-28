import type { PrMeta } from '../../shared/types';
import { HostError, toHostError } from './errors';
import type { Runner } from './exec';
import type { GhApi } from './ports';
import { isValidGitRef } from './validate';

const FIELDS = 'number,title,url,headRefName,baseRefName,state,isCrossRepository';

export class GhCli implements GhApi {
  constructor(private readonly run: Runner) {}

  async prView(owner: string, repo: string, prNumber: number): Promise<PrMeta> {
    let stdout: string;
    try {
      ({ stdout } = await this.run('gh', ['pr', 'view', String(prNumber), '--repo', `${owner}/${repo}`, '--json', FIELDS]));
    } catch (e) {
      throw toHostError(e, 'gh_failed');
    }
    const pr = JSON.parse(stdout) as PrMeta;
    for (const ref of [pr.headRefName, pr.baseRefName]) {
      if (typeof ref !== 'string' || !isValidGitRef(ref)) throw new HostError('gh_failed', `Nom de branche inattendu : ${String(ref)}`);
    }
    return pr;
  }
}
