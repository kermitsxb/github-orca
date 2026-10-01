import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logDir } from './log-dir';

const DIR = logDir(process.platform, process.env, homedir());

/** Appends one JSON line to host.log. stdout is reserved for the native messaging frame. */
export function log(event: string, data?: unknown): void {
  try {
    mkdirSync(DIR, { recursive: true });
    appendFileSync(join(DIR, 'host.log'), `${JSON.stringify({ at: new Date().toISOString(), event, data })}\n`);
  } catch {
    // logging must never break the host
  }
}
