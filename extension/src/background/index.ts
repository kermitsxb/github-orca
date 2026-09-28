import type { HostResponse } from '../../../shared/types';
import { mergeSettings, SETTINGS_KEY } from '../settings';
import {
  buildCloneRequest,
  buildHostRequest,
  cloneInFlightKey,
  createInFlight,
  HOST_NAME,
  inFlightKey,
  sendViaPort,
  type CloneRepoMessage,
  type RunActionMessage,
} from './logic';

const inFlight = createInFlight<HostResponse>();

async function loadSettings() {
  return mergeSettings((await chrome.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY]);
}

async function runAction(msg: RunActionMessage): Promise<HostResponse> {
  const built = buildHostRequest(msg, await loadSettings());
  return 'ok' in built ? built : sendViaPort(() => chrome.runtime.connectNative(HOST_NAME), built);
}

async function cloneRepo(msg: CloneRepoMessage): Promise<HostResponse> {
  return sendViaPort(() => chrome.runtime.connectNative(HOST_NAME), buildCloneRequest(msg, await loadSettings()));
}

chrome.runtime.onMessage.addListener((msg: RunActionMessage | CloneRepoMessage, _sender, sendResponse) => {
  // A second click (or a re-created button) on the same PR / repo joins the pending request.
  let pending: Promise<HostResponse>;
  if (msg?.type === 'run-action') pending = inFlight(inFlightKey(msg), () => runAction(msg));
  else if (msg?.type === 'clone-repo') pending = inFlight(cloneInFlightKey(msg), () => cloneRepo(msg));
  else return false;
  void pending.then(sendResponse, (e: unknown) =>
    sendResponse({ ok: false, code: 'internal', message: e instanceof Error ? e.message : String(e) } satisfies HostResponse),
  );
  return true; // keeps the channel open for the async response
});
