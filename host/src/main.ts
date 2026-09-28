import type { HostResponse } from '../../shared/types';
import { HostError } from './errors';
import { nodeRunner } from './exec';
import { GhCli } from './gh';
import { GitCli } from './git';
import { handleRequest, type Deps } from './handler';
import { log } from './log';
import { OrcaCli } from './orca';
import { encodeMessage, readMessage } from './protocol';
import { parseRequest } from './validate';

export async function processMessage(raw: unknown, deps: Deps): Promise<HostResponse> {
  try {
    const req = parseRequest(raw);
    log('request', req);
    return await handleRequest(req, deps);
  } catch (e) {
    if (e instanceof HostError) return { ok: false, code: e.code, message: e.message };
    return { ok: false, code: 'internal', message: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  let response: HostResponse;
  try {
    const raw = await readMessage(process.stdin);
    response = await processMessage(raw, {
      orca: new OrcaCli(nodeRunner),
      git: new GitCli(nodeRunner),
      gh: new GhCli(nodeRunner),
    });
  } catch (e) {
    response = { ok: false, code: 'internal', message: e instanceof Error ? e.message : String(e) };
  }
  log('response', response);
  process.stdout.write(encodeMessage(response), () => process.exit(0));
}

if (process.env.GITHUB_ORCA_HOST_MAIN === '1') void main();
