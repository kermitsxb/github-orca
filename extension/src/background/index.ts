import type { HostRequest, HostResponse } from '../../../shared/types';
import { mergeSettings, SETTINGS_KEY } from '../settings';
import { buildHostRequest, HOST_NAME, mapNativeError, type RunActionMessage } from './logic';

function sendToHost(req: HostRequest): Promise<HostResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, req, (response) => {
      const err = chrome.runtime.lastError;
      resolve(err ? mapNativeError(err.message ?? '') : (response as HostResponse));
    });
  });
}

chrome.runtime.onMessage.addListener((msg: RunActionMessage, _sender, sendResponse) => {
  if (msg?.type !== 'run-action') return false;
  void (async () => {
    const stored = await chrome.storage.sync.get(SETTINGS_KEY);
    const built = buildHostRequest(msg, mergeSettings(stored[SETTINGS_KEY]));
    sendResponse('ok' in built ? built : await sendToHost(built));
  })();
  return true; // keeps the channel open for the async response
});
