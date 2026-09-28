import type { ErrorCode } from '../../shared/types';
import { CommandError } from './exec';

export class HostError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HostError';
  }
}

/** Converts a runner failure into a HostError. Orca prints `{ok:false,error:{message}}` on stdout. */
export function toHostError(e: unknown, code: ErrorCode): HostError {
  if (e instanceof HostError) return e;
  if (e instanceof CommandError) {
    if (e.timedOut) return new HostError('timeout', `Timed out: ${e.cmd}`);
    try {
      const parsed = JSON.parse(e.stdout) as { error?: { message?: string } };
      if (parsed.error?.message) return new HostError(code, parsed.error.message);
    } catch {
      // stdout is not JSON: fall back to the raw message
    }
    return new HostError(code, e.message);
  }
  return new HostError(code, e instanceof Error ? e.message : String(e));
}
