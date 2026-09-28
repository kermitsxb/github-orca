import type { Action, HostResponse } from '../../../shared/types';
import type { RunActionMessage } from '../background/logic';
import type { PrRef } from '../pr-url';

interface RuntimeLike {
  id?: string;
  sendMessage(msg: RunActionMessage): Promise<unknown>;
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
