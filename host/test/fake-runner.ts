import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RunOptions, RunResult, Runner } from '../src/exec';

export interface Call {
  cmd: string;
  args: string[];
  opts?: RunOptions;
}

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

/** Replies with the first route whose prefix matches `cmd args…`. */
export function fakeRunner(routes: Array<[prefix: string, reply: string | Error]>): Runner & { calls: Call[] } {
  const calls: Call[] = [];
  const run = (async (cmd: string, args: string[], opts?: RunOptions): Promise<RunResult> => {
    calls.push({ cmd, args, opts });
    const line = [cmd, ...args].join(' ');
    const route = routes.find(([prefix]) => line.startsWith(prefix));
    if (!route) throw new Error(`no fake route for: ${line}`);
    if (route[1] instanceof Error) throw route[1];
    return { stdout: route[1], stderr: '' };
  }) as Runner & { calls: Call[] };
  run.calls = calls;
  return run;
}
