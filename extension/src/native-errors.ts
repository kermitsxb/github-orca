import type { HostResponse } from '../../shared/types';

/** Turns a Chrome runtime / native messaging error message into a French, actionable response. */
export function mapNativeError(message: string): HostResponse {
  if (/not found/i.test(message)) return { ok: false, code: 'host_missing', message: 'Host not installed: run scripts/install.sh' };
  if (/forbidden/i.test(message)) {
    return { ok: false, code: 'host_missing', message: "Host refused: the extension ID does not match, re-run scripts/install.sh" };
  }
  if (/exited|communicating/i.test(message)) {
    return {
      ok: false,
      code: 'internal',
      message: "The native host stopped: see ~/Library/Logs/github-orca/host.log or re-run scripts/install.sh",
    };
  }
  if (/context invalidated|reading 'sendMessage'/i.test(message)) return { ok: false, code: 'internal', message: 'Extension reloaded: reload the page' };
  return { ok: false, code: 'internal', message };
}
