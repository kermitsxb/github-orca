import path from 'node:path';

/** Per-OS directory of host.log. `platform`, `env` and `home` are injected so tests do not depend on the host OS. */
export function logDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local');
    return path.win32.join(base, 'github-orca', 'logs');
  }
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Logs', 'github-orca');
  const state = env.XDG_STATE_HOME && path.posix.isAbsolute(env.XDG_STATE_HOME) ? env.XDG_STATE_HOME : path.posix.join(home, '.local', 'state');
  return path.posix.join(state, 'github-orca');
}
