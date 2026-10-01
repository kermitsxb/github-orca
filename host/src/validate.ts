import { homedir } from 'node:os';
import path from 'node:path';
import { ACTIONS, type Action, type CloneRequest, type HostMessage, type HostRequest } from '../../shared/types';
import { HostError } from './errors';

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const AGENT = /^[a-z0-9-]{1,40}$/;
const MAX_TEMPLATE = 10_000;
const MAX_PATH = 1_000;

function fail(message: string): never {
  throw new HostError('invalid_request', message);
}

function isName(v: unknown): v is string {
  return typeof v === 'string' && NAME.test(v) && !/^\.+$/.test(v);
}

type Paths = typeof path.posix;

/**
 * Absolute path, or `~` / `~/…` (and `~\…` on Windows) expanded against `home`; normalized (no `.`, `..`,
 * trailing separator). Windows accepts drive-letter paths only (no `\foo`, `/foo`, UNC).
 */
function parseDestination(v: unknown, home: string, paths: Paths): string {
  if (typeof v !== 'string' || v.length > MAX_PATH || /[\x00-\x1f\x7f]/.test(v)) fail('Invalid clone folder');
  const win = paths === path.win32;
  if (v === '~' || v.startsWith('~/') || (win && v.startsWith('~\\'))) return paths.resolve(home, `.${v.slice(1)}`);
  const absolute = win ? /^[A-Za-z]:[\\/]/.test(v) : v.startsWith('/');
  if (!absolute) fail('Invalid clone folder: expected an absolute path or ~/…');
  return paths.resolve(v);
}

export function parseRequest(
  raw: unknown,
  home: string = homedir(),
  paths: Paths = process.platform === 'win32' ? path.win32 : path.posix,
): HostMessage {
  if (typeof raw !== 'object' || raw === null) fail('Invalid request: object expected');
  const r = raw as Record<string, unknown>;
  if (r.action !== 'clone' && !ACTIONS.includes(r.action as Action)) fail(`Unknown action: ${String(r.action)}`);
  if (!isName(r.owner)) fail('Invalid owner');
  if (!isName(r.repo)) fail('Invalid repo');
  if (r.action === 'clone') {
    const clone: CloneRequest = { action: 'clone', owner: r.owner, repo: r.repo, destination: parseDestination(r.destination, home, paths) };
    return clone;
  }
  if (typeof r.prNumber !== 'number' || !Number.isInteger(r.prNumber) || r.prNumber <= 0) fail('Invalid PR number');
  if (typeof r.agent !== 'string' || !AGENT.test(r.agent)) fail('Invalid agent');

  const action = r.action as Action;
  const req: HostRequest = { action, owner: r.owner, repo: r.repo, prNumber: r.prNumber, agent: r.agent };
  if (action !== 'checkout') {
    if (typeof r.template !== 'string' || r.template.trim() === '') fail('Empty prompt');
    if (r.template.length > MAX_TEMPLATE) fail('Prompt too long');
    req.template = r.template;
  }
  return req;
}

export function isValidGitRef(ref: string): boolean {
  return (
    ref.length > 0 &&
    ref.length <= 255 &&
    !ref.startsWith('-') &&
    !ref.startsWith('/') &&
    !ref.endsWith('/') &&
    !ref.endsWith('.') &&
    !ref.endsWith('.lock') &&
    !ref.includes('..') &&
    !ref.includes('@{') &&
    !/[\s~^:?*[\\\x00-\x1f\x7f]/.test(ref)
  );
}
