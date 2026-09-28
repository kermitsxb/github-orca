import type { Action, CloneRequest, HostMessage, HostRequest, HostResponse } from '../../../shared/types';
import { mapNativeError } from '../native-errors';
import { resolveTemplate, type Settings } from '../settings';

export { mapNativeError };

export const HOST_NAME = 'com.stocki.github_orca';

export interface RunActionMessage {
  type: 'run-action';
  action: Action;
  owner: string;
  repo: string;
  prNumber: number;
  customPrompt?: string;
}

export interface CloneRepoMessage {
  type: 'clone-repo';
  owner: string;
  repo: string;
}

export function buildCloneRequest(msg: CloneRepoMessage, s: Settings): CloneRequest {
  return { action: 'clone', owner: msg.owner, repo: msg.repo, destination: s.cloneDir };
}

export function cloneInFlightKey(msg: Pick<CloneRepoMessage, 'owner' | 'repo'>): string {
  return `clone:${msg.owner}/${msg.repo}`.toLowerCase();
}

export function buildHostRequest(msg: RunActionMessage, s: Settings): HostRequest | HostResponse {
  const template = resolveTemplate(s, msg.action, msg.owner, msg.repo, msg.customPrompt);
  if (msg.action !== 'checkout' && !template) return { ok: false, code: 'invalid_request', message: 'Empty prompt' };
  const req: HostRequest = { action: msg.action, owner: msg.owner, repo: msg.repo, prNumber: msg.prNumber, agent: s.agent };
  if (template) req.template = template;
  return req;
}

/** De-duplication key: one pending request per PR (and per branch workspace), like the host's marker. */
export function inFlightKey(msg: Pick<RunActionMessage, 'action' | 'owner' | 'repo' | 'prNumber'>): string {
  const base = `${msg.owner}/${msg.repo}#${msg.prNumber}`.toLowerCase();
  return msg.action === 'continue' || msg.action === 'address-comments' ? `${base}:branch` : base;
}

/** `run(key, fn)`: while a run for `key` is pending, later calls get the same promise instead of calling `fn`. */
export function createInFlight<T>(): (key: string, fn: () => Promise<T>) => Promise<T> {
  const pending = new Map<string, Promise<T>>();
  return (key, fn) => {
    const current = pending.get(key);
    if (current) return current;
    const p = fn().finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  };
}

/** Minimal slice of chrome.runtime.Port used by sendViaPort. */
export interface PortLike {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/**
 * Sends one request over a native messaging port. An open port keeps the service worker alive while
 * the host works (sendNativeMessage does not). Resolves with the first message, or with a mapped
 * error when the port disconnects first.
 */
export function sendViaPort(
  connect: () => PortLike,
  req: HostMessage,
  lastError: () => string | undefined = () => chrome.runtime.lastError?.message,
): Promise<HostResponse> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (res: HostResponse, port?: PortLike) => {
      if (done) return;
      done = true;
      resolve(res);
      try {
        port?.disconnect();
      } catch {
        // already disconnected
      }
    };
    let port: PortLike;
    try {
      port = connect();
    } catch (e) {
      finish(mapNativeError(e instanceof Error ? e.message : String(e)));
      return;
    }
    port.onMessage.addListener((message) => finish(message as HostResponse, port));
    port.onDisconnect.addListener(() => finish(mapNativeError(lastError() ?? 'Native host has exited.')));
    port.postMessage(req);
  });
}
