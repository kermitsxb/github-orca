import { ACTIONS, type Action, type HostRequest } from '../../shared/types';
import { HostError } from './errors';

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const AGENT = /^[a-z0-9-]{1,40}$/;
const MAX_TEMPLATE = 10_000;

function fail(message: string): never {
  throw new HostError('invalid_request', message);
}

function isName(v: unknown): v is string {
  return typeof v === 'string' && NAME.test(v) && !/^\.+$/.test(v);
}

export function parseRequest(raw: unknown): HostRequest {
  if (typeof raw !== 'object' || raw === null) fail('Requête invalide : objet attendu');
  const r = raw as Record<string, unknown>;
  if (!ACTIONS.includes(r.action as Action)) fail(`Action inconnue : ${String(r.action)}`);
  if (!isName(r.owner)) fail('Propriétaire (owner) invalide');
  if (!isName(r.repo)) fail('Dépôt (repo) invalide');
  if (typeof r.prNumber !== 'number' || !Number.isInteger(r.prNumber) || r.prNumber <= 0) fail('Numéro de PR invalide');
  if (typeof r.agent !== 'string' || !AGENT.test(r.agent)) fail('Agent invalide');

  const action = r.action as Action;
  const req: HostRequest = { action, owner: r.owner, repo: r.repo, prNumber: r.prNumber, agent: r.agent };
  if (action !== 'checkout') {
    if (typeof r.template !== 'string' || r.template.trim() === '') fail('Prompt vide');
    if (r.template.length > MAX_TEMPLATE) fail('Prompt trop long');
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
