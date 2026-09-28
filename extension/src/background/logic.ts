import type { Action, HostRequest, HostResponse } from '../../../shared/types';
import { resolveTemplate, type Settings } from '../settings';

export const HOST_NAME = 'com.stocki.github_orca';

export interface RunActionMessage {
  type: 'run-action';
  action: Action;
  owner: string;
  repo: string;
  prNumber: number;
  customPrompt?: string;
}

export function buildHostRequest(msg: RunActionMessage, s: Settings): HostRequest | HostResponse {
  const template = resolveTemplate(s, msg.action, msg.owner, msg.repo, msg.customPrompt);
  if (msg.action !== 'checkout' && !template) return { ok: false, code: 'invalid_request', message: 'Prompt vide' };
  const req: HostRequest = { action: msg.action, owner: msg.owner, repo: msg.repo, prNumber: msg.prNumber, agent: s.agent };
  if (template) req.template = template;
  return req;
}

export function mapNativeError(message: string): HostResponse {
  if (/not found/i.test(message)) return { ok: false, code: 'host_missing', message: 'Host non installé : lance scripts/install.sh' };
  if (/forbidden/i.test(message)) {
    return { ok: false, code: 'host_missing', message: "Host refusé : l'ID de l'extension ne correspond pas, relance scripts/install.sh" };
  }
  return { ok: false, code: 'internal', message };
}
