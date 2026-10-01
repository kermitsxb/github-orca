import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { HostError } from './errors';

/** How to run Orca's CLI: `execFile(cmd, [...args, ...orcaArgs], { env })`. */
export interface OrcaLauncher {
  /** Executable to execFile. */
  cmd: string;
  /** Prepended before the orca arguments. */
  args: string[];
  env?: Record<string, string>;
  /** Absolute path of Orca's runtime-client.js, when known. */
  runtimeClient?: string;
  /** Profile selected by the launcher, so in-process RPC uses the same runtime as the CLI. */
  userDataPath?: string;
}

export interface LauncherDeps {
  platform: NodeJS.Platform;
  pathEnv: string;
  /** The host's environment: orca.cmd's env handling depends on it. */
  env: NodeJS.ProcessEnv;
  readFile: (file: string) => string;
  /** Resolves symlinks; throws when the file does not exist. */
  realpath: (file: string) => string;
}

const MAX_FORWARDS = 3;

/** `orca` on Linux is usually the GNOME screen reader: Orca installs its CLI as `orca-ide` there. */
export function orcaCommandName(platform: NodeJS.Platform): string {
  if (platform === 'win32') return 'orca.exe';
  if (platform === 'linux') return 'orca-ide';
  return 'orca';
}

/** Packaged CLI layout: <Resources>/bin/orca[.exe] → <Resources>/app.asar.unpacked/… */
export function runtimeClientPath(orcaBinary: string, paths: typeof path.posix = path.posix): string {
  return paths.join(orcaBinary, '..', '..', 'app.asar.unpacked', 'out', 'cli', 'runtime-client.js');
}

const BASH_VAR = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*?)\s*$/;
const CMD_VAR = /^\s*set\s+"([A-Za-z_][A-Za-z0-9_]*)=(.*)"\s*$/i;

/**
 * Reads the literal variable assignments of Orca's launcher scripts: bash `NAME='value'` / `export NAME='value'` /
 * `NAME="value"` and cmd `set "NAME=value"`. Values referencing other variables (`$…`, `%…%`) are skipped.
 */
export function parseLauncherVars(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const cmd = CMD_VAR.exec(line);
    if (cmd) {
      if (!/%[^%]*%/.test(cmd[2])) vars[cmd[1]] = cmd[2];
      continue;
    }
    const bash = BASH_VAR.exec(line);
    if (!bash) continue;
    const raw = bash[2];
    const single = /^'(.*)'$/.exec(raw);
    if (single) {
      const parts = single[1].split(`'"'"'`);
      if (!parts.some((part) => part.includes("'"))) vars[bash[1]] = parts.join("'");
      continue;
    }
    const double = /^"([^"\\$`]*)"$/.exec(raw);
    if (double) vars[bash[1]] = double[1];
  }
  return vars;
}

/** Returns the launcher found on PATH and its real path (symlinks resolved). */
function findOnPath(names: string[], deps: LauncherDeps, paths: typeof path.posix): { found: string; real: string } {
  for (const name of names) {
    for (const entry of deps.pathEnv.split(paths.delimiter)) {
      const dir = entry.replace(/^"(.*)"$/, '$1');
      if (!dir) continue;
      const candidate = paths.join(dir, name);
      try {
        return { found: candidate, real: deps.realpath(candidate) };
      } catch {
        // not in this directory
      }
    }
  }
  throw new HostError(
    'orca_unavailable',
    `Orca CLI not found on PATH (${names.join(' or ')}): enable the shell command in Orca, then re-run the install script`,
  );
}

/** Runs the native CLI or follows legacy `orca.cmd` forwarders and bypasses their shell for prompt safety. */
function windowsLauncher(found: string, deps: LauncherDeps): OrcaLauncher {
  let file = found;
  for (let hop = 0; hop <= MAX_FORWARDS; hop++) {
    let vars: Record<string, string>;
    try {
      if (/\.exe$/i.test(file)) {
        return { cmd: file, args: [], runtimeClient: runtimeClientPath(deps.realpath(file), path.win32) };
      }
      vars = parseLauncherVars(deps.readFile(file));
    } catch {
      break;
    }
    if (vars.ELECTRON && vars.CLI) {
      // Mirrors orca.cmd. The runner merges over process.env and cannot unset: an empty value stands for `set NAME=`.
      const env: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' };
      if (deps.env.ORCA_APP_EXECUTABLE === undefined) {
        env.ORCA_APP_EXECUTABLE = vars.ELECTRON;
        env.ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT = '1';
      }
      if (vars.ORCA_USER_DATA_PATH) env.ORCA_USER_DATA_PATH = vars.ORCA_USER_DATA_PATH;
      env.ORCA_NODE_OPTIONS = deps.env.NODE_OPTIONS ?? '';
      env.ORCA_NODE_REPL_EXTERNAL_MODULE = deps.env.NODE_REPL_EXTERNAL_MODULE ?? '';
      env.NODE_OPTIONS = '';
      env.NODE_REPL_EXTERNAL_MODULE = '';
      return {
        cmd: vars.ELECTRON,
        args: [vars.CLI],
        env,
        runtimeClient: path.win32.join(path.win32.dirname(vars.CLI), 'runtime-client.js'),
        ...(vars.ORCA_USER_DATA_PATH ? { userDataPath: vars.ORCA_USER_DATA_PATH } : {}),
      };
    }
    if (!vars.ORCA_LAUNCHER) break;
    file = vars.ORCA_LAUNCHER;
  }
  throw new HostError('orca_unavailable', `Unrecognised Orca launcher: ${found}`);
}

/** Finds Orca's CLI launcher on PATH and works out how to run it on this platform. fs and env are injectable. */
export function resolveOrcaLauncher(deps: Partial<LauncherDeps> = {}): OrcaLauncher {
  const env = deps.env ?? process.env;
  const d: LauncherDeps = {
    platform: deps.platform ?? process.platform,
    pathEnv: deps.pathEnv ?? env.PATH ?? env.Path ?? '',
    env,
    readFile: deps.readFile ?? ((file) => readFileSync(file, 'utf8')),
    realpath: deps.realpath ?? ((file) => realpathSync(file)),
  };
  const paths = d.platform === 'win32' ? path.win32 : path.posix;
  const name = orcaCommandName(d.platform);
  const { found, real } = findOnPath(d.platform === 'win32' ? [name, 'orca.cmd'] : [name], d, paths);

  if (d.platform === 'win32') return windowsLauncher(found, d);
  if (d.platform === 'darwin') return { cmd: 'orca', args: [], runtimeClient: runtimeClientPath(real) };

  let vars: Record<string, string> = {};
  try {
    vars = parseLauncherVars(d.readFile(found));
  } catch {
    // unreadable launcher: still runnable, without the runtime client
  }
  return {
    cmd: found, args: [],
    runtimeClient: vars.CLI ? path.posix.join(path.posix.dirname(vars.CLI), 'runtime-client.js') : undefined,
    ...(vars.ORCA_USER_DATA_PATH ? { userDataPath: vars.ORCA_USER_DATA_PATH } : {}),
  };
}
