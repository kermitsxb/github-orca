import type { Action, HostResponse } from '../../../shared/types';
import type { CloneRepoMessage, RunActionMessage } from '../background/logic';
import type { PrRef } from '../pr-url';
import type { RepoRef } from '../repo-url';

interface RuntimeLike {
  id?: string;
  sendMessage(msg: RunActionMessage | CloneRepoMessage): Promise<unknown>;
}

/**
 * Sends a run-action message to the service worker. `getRuntime` is read at click time: once the
 * extension is reloaded, an orphaned content script sees `chrome.runtime` (or its id) disappear.
 */
export function createSender(getRuntime: () => RuntimeLike | undefined, pr: PrRef) {
  return async (action: Action, customPrompt: string | undefined): Promise<HostResponse> => {
    const runtime = getRuntime();
    if (!runtime?.id) throw new Error('Extension context invalidated.');
    const msg: RunActionMessage = { type: 'run-action', action, ...pr, customPrompt };
    return (await runtime.sendMessage(msg)) as HostResponse;
  };
}

/** Same as createSender, for the repo page's "Clone in Orca" button. */
export function createCloneSender(getRuntime: () => RuntimeLike | undefined, repo: RepoRef) {
  return async (): Promise<HostResponse> => {
    const runtime = getRuntime();
    if (!runtime?.id) throw new Error('Extension context invalidated.');
    const msg: CloneRepoMessage = { type: 'clone-repo', owner: repo.owner, repo: repo.repo };
    return (await runtime.sendMessage(msg)) as HostResponse;
  };
}
