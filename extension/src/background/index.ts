import type { HostResponse } from '../../../shared/types';
import { mergeSettings, SETTINGS_KEY } from '../settings';
import { buildHostRequest, createInFlight, HOST_NAME, inFlightKey, sendViaPort, type RunActionMessage } from './logic';

const inFlight = createInFlight<HostResponse>();

async function runAction(msg: RunActionMessage): Promise<HostResponse> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const built = buildHostRequest(msg, mergeSettings(stored[SETTINGS_KEY]));
  return 'ok' in built ? built : sendViaPort(() => chrome.runtime.connectNative(HOST_NAME), built);
}

chrome.runtime.onMessage.addListener((msg: RunActionMessage, _sender, sendResponse) => {
  if (msg?.type !== 'run-action') return false;
  // A second click (or a re-created button) on the same PR joins the pending request.
  void inFlight(inFlightKey(msg), () => runAction(msg)).then(sendResponse, (e: unknown) =>
    sendResponse({ ok: false, code: 'internal', message: e instanceof Error ? e.message : String(e) } satisfies HostResponse),
  );
  return true; // keeps the channel open for the async response
});
