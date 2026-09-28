import type { HostResponse } from '../../shared/types';

/** Turns a Chrome runtime / native messaging error message into a French, actionable response. */
export function mapNativeError(message: string): HostResponse {
  if (/not found/i.test(message)) return { ok: false, code: 'host_missing', message: 'Host non installé : lance scripts/install.sh' };
  if (/forbidden/i.test(message)) {
    return { ok: false, code: 'host_missing', message: "Host refusé : l'ID de l'extension ne correspond pas, relance scripts/install.sh" };
  }
  if (/exited|communicating/i.test(message)) {
    return {
      ok: false,
      code: 'internal',
      message: "Le host natif s'est arrêté : voir ~/Library/Logs/github-orca/host.log ou relancer scripts/install.sh",
    };
  }
  if (/context invalidated|reading 'sendMessage'/i.test(message)) return { ok: false, code: 'internal', message: 'Extension rechargée : recharge la page' };
  return { ok: false, code: 'internal', message };
}
