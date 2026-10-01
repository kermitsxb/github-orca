import { execFile } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Extra variables, merged over process.env. */
  env?: NodeJS.ProcessEnv;
}
export interface RunResult {
  stdout: string;
  stderr: string;
}
export type Runner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>;

export class CommandError extends Error {
  constructor(
    public readonly cmd: string,
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly timedOut: boolean,
    cause?: string,
  ) {
    super(`${cmd}: ${(stderr.trim() || stdout.trim() || cause?.trim() || 'failed').slice(0, 500)}`);
    this.name = 'CommandError';
  }
}

export const nodeRunner: Runner = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        env: opts.env ? { ...process.env, ...opts.env } : undefined,
        timeout: opts.timeoutMs ?? 30_000,
        maxBuffer: 20 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        if (err) {
          const timedOut = (err as { killed?: boolean }).killed === true;
          reject(new CommandError(cmd, String(stdout ?? ''), String(stderr ?? ''), timedOut, err.message));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
