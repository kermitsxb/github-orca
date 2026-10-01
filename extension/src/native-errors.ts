import type { HostResponse } from '../../shared/types';

const HOST_LOGS: Record<string, string> = {
  mac: '~/Library/Logs/github-orca/host.log',
  win: '%LOCALAPPDATA%\\github-orca\\logs\\host.log',
  linux: '~/.local/state/github-orca/host.log',
};

/**
 * Turns a browser runtime / native messaging error message into an actionable response.
 * `os` is `chrome.runtime.PlatformOs`; when unknown, the log hint is generic and the installer is `install.sh`.
 */
export function mapNativeError(message: string, os?: string): HostResponse {
  const installer = os === 'win' ? 'scripts\\install.ps1' : 'scripts/install.sh';
  const log = (os !== undefined && HOST_LOGS[os]) || 'the host log (README → Troubleshooting)';
  if (/not found|no such native application/i.test(message)) return { ok: false, code: 'host_missing', message: `Host not installed: run ${installer}` };
  if (/forbidden|does not have permission/i.test(message)) {
    return { ok: false, code: 'host_missing', message: `Host refused: the extension ID does not match, re-run ${installer}` };
  }
  if (/exited|communicating/i.test(message)) {
    return { ok: false, code: 'internal', message: `The native host stopped: see ${log} or re-run ${installer}` };
  }
  if (/context invalidated|reading 'sendMessage'/i.test(message)) return { ok: false, code: 'internal', message: 'Extension reloaded: reload the page' };
  return { ok: false, code: 'internal', message };
}
