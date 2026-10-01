import { describe, expect, it, vi } from 'vitest';
import { HostError } from './errors';
import { orcaCommandName, parseLauncherVars, resolveOrcaLauncher } from './orca-launcher';

/** In-memory fs: `files` maps a path to its content; `links` maps a path to its real path. */
function fakeFs(files: Record<string, string>, links: Record<string, string> = {}) {
  return {
    readFile: (p: string): string => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    realpath: (p: string): string => {
      if (p in links) return links[p];
      if (p in files) return p;
      throw new Error(`ENOENT: ${p}`);
    },
  };
}

const linuxWrapper = [
  '#!/usr/bin/env bash',
  "ELECTRON='/opt/Orca/orca'",
  "CLI='/opt/Orca/resources/app.asar.unpacked/out/cli/index.js'",
  "export ORCA_USER_DATA_PATH='/home/me/.config/Orca'",
  'ELECTRON_RUN_AS_NODE=1 exec "$ELECTRON" "$CLI" "$@"',
  '',
].join('\n');

const linuxAppImage = [
  '#!/usr/bin/env bash',
  "APPIMAGE='/home/me/Apps/Orca.AppImage'",
  `ELECTRON_RUN_AS_NODE=1 exec "$APPIMAGE" -e 'require("x")' -- "$@"`,
  '',
].join('\n');

const winLauncher = [
  '@echo off',
  'setlocal',
  'set "ELECTRON=C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\Orca.exe"',
  'set "CLI=C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\resources\\app.asar.unpacked\\out\\cli\\index.js"',
  'set "ORCA_USER_DATA_PATH=C:\\Users\\me\\AppData\\Roaming\\Orca"',
  'if not defined ORCA_APP_EXECUTABLE (',
  '  set "ORCA_APP_EXECUTABLE=%ELECTRON%"',
  '  set "ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT=1"',
  ')',
  'set "ORCA_NODE_OPTIONS=%NODE_OPTIONS%"',
  'set "ORCA_NODE_REPL_EXTERNAL_MODULE=%NODE_REPL_EXTERNAL_MODULE%"',
  'set NODE_OPTIONS=',
  'set NODE_REPL_EXTERNAL_MODULE=',
  'set ELECTRON_RUN_AS_NODE=1',
  '"%ELECTRON%" "%CLI%" %*',
  '',
].join('\r\n');

const winForwarder = (target: string) => ['@echo off', `set "ORCA_LAUNCHER=${target}"`, '"%ORCA_LAUNCHER%" %*', ''].join('\r\n');

describe('orcaCommandName', () => {
  it('names the launcher per platform (never the GNOME screen reader on Linux)', () => {
    expect(orcaCommandName('darwin')).toBe('orca');
    expect(orcaCommandName('linux')).toBe('orca-ide');
    expect(orcaCommandName('win32')).toBe('orca.exe');
  });
});

describe('parseLauncherVars', () => {
  it('reads single-quoted bash values, with or without export', () => {
    expect(parseLauncherVars(linuxWrapper)).toEqual({
      ELECTRON: '/opt/Orca/orca',
      CLI: '/opt/Orca/resources/app.asar.unpacked/out/cli/index.js',
      ORCA_USER_DATA_PATH: '/home/me/.config/Orca',
    });
  });

  it("undoes the '\"'\"' escape inside single-quoted values", () => {
    expect(parseLauncherVars(`CLI='/home/me/it'"'"'s/index.js'`)).toEqual({ CLI: "/home/me/it's/index.js" });
  });

  it('reads double-quoted bash values and skips those referencing variables', () => {
    const text = 'CONTENTS="/Applications/Orca.app/Contents"\nCLI="$CONTENTS/Resources/app.asar.unpacked/out/cli/index.js"';
    expect(parseLauncherVars(text)).toEqual({ CONTENTS: '/Applications/Orca.app/Contents' });
  });

  it('reads cmd set "NAME=value" lines literally and skips %VAR% references', () => {
    expect(parseLauncherVars(winLauncher)).toEqual({
      ELECTRON: 'C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\Orca.exe',
      CLI: 'C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\resources\\app.asar.unpacked\\out\\cli\\index.js',
      ORCA_USER_DATA_PATH: 'C:\\Users\\me\\AppData\\Roaming\\Orca',
      ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1',
    });
  });

  it('ignores unquoted assignments and command lines', () => {
    expect(parseLauncherVars(linuxAppImage)).toEqual({ APPIMAGE: '/home/me/Apps/Orca.AppImage' });
  });
});

describe('resolveOrcaLauncher', () => {
  it('runs the packaged Windows executable without reading it as a script', () => {
    const fs = fakeFs({ 'C:\\Orca\\resources\\bin\\orca.exe': 'binary' });
    const readFile = vi.fn(fs.readFile);
    expect(resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Orca\\resources\\bin', env: {}, ...fs, readFile })).toEqual({
      cmd: 'C:\\Orca\\resources\\bin\\orca.exe', args: [],
      runtimeClient: 'C:\\Orca\\resources\\app.asar.unpacked\\out\\cli\\runtime-client.js',
    });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('prefers the packaged executable over a legacy cmd launcher on PATH', () => {
    const fs = fakeFs({
      'C:\\Legacy\\orca.cmd': winLauncher,
      'C:\\Orca\\resources\\bin\\orca.exe': 'binary',
    });
    expect(resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Legacy;C:\\Orca\\resources\\bin', env: {}, ...fs }).cmd).toBe(
      'C:\\Orca\\resources\\bin\\orca.exe',
    );
  });

  it('follows a Windows cmd forwarder to the packaged executable', () => {
    const fs = fakeFs({
      'C:\\Commands\\orca.cmd': winForwarder('C:\\Orca\\resources\\bin\\orca.exe'),
      'C:\\Orca\\resources\\bin\\orca.exe': 'binary',
    });
    expect(resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Commands', env: {}, ...fs })).toEqual({
      cmd: 'C:\\Orca\\resources\\bin\\orca.exe', args: [],
      runtimeClient: 'C:\\Orca\\resources\\app.asar.unpacked\\out\\cli\\runtime-client.js',
    });
  });

  it('locates the Windows runtime client relative to the executable symlink target', () => {
    const fs = fakeFs({ 'C:\\Orca\\resources\\bin\\orca.exe': 'binary' }, {
      'C:\\Commands\\orca.exe': 'C:\\Orca\\resources\\bin\\orca.exe',
    });
    expect(resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Commands', env: {}, ...fs }).runtimeClient).toBe(
      'C:\\Orca\\resources\\app.asar.unpacked\\out\\cli\\runtime-client.js',
    );
  });

  it('keeps the plain `orca` command on macOS and finds the runtime client inside the app bundle', () => {
    const fs = fakeFs(
      { '/Applications/Orca.app/Contents/Resources/bin/orca': '#!/bin/bash' },
      { '/usr/local/bin/orca': '/Applications/Orca.app/Contents/Resources/bin/orca' },
    );
    const realpath = vi.fn(fs.realpath);
    expect(resolveOrcaLauncher({ platform: 'darwin', pathEnv: '/usr/bin:/usr/local/bin', ...fs, realpath })).toEqual({
      cmd: 'orca',
      args: [],
      runtimeClient: '/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/cli/runtime-client.js',
    });
    expect(realpath.mock.calls.filter(([p]) => p === '/usr/local/bin/orca')).toHaveLength(1);
  });

  it('runs the Linux wrapper launcher directly, with the runtime client next to its CLI', () => {
    const fs = fakeFs({ '/home/me/.local/bin/orca-ide': linuxWrapper });
    expect(resolveOrcaLauncher({ platform: 'linux', pathEnv: '/usr/bin:/home/me/.local/bin', ...fs })).toEqual({
      cmd: '/home/me/.local/bin/orca-ide',
      args: [],
      runtimeClient: '/opt/Orca/resources/app.asar.unpacked/out/cli/runtime-client.js',
      userDataPath: '/home/me/.config/Orca',
    });
  });

  it('runs the Linux AppImage launcher without a known runtime client', () => {
    const fs = fakeFs({ '/usr/local/bin/orca-ide': linuxAppImage });
    expect(resolveOrcaLauncher({ platform: 'linux', pathEnv: '/usr/local/bin', ...fs })).toEqual({
      cmd: '/usr/local/bin/orca-ide',
      args: [],
      runtimeClient: undefined,
    });
  });

  it('never picks `orca` (the screen reader) on Linux', () => {
    const fs = fakeFs({ '/usr/bin/orca': '#!/usr/bin/python3' });
    expect(() => resolveOrcaLauncher({ platform: 'linux', pathEnv: '/usr/bin', ...fs })).toThrow(
      'Orca CLI not found on PATH (orca-ide)',
    );
  });

  it('bypasses orca.cmd on Windows: runs Electron with the CLI and the env the launcher sets', () => {
    const fs = fakeFs({ 'C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\bin\\orca.cmd': winLauncher });
    const launcher = resolveOrcaLauncher({
      platform: 'win32',
      pathEnv: 'C:\\Windows\\System32;C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\bin',
      env: {},
      ...fs,
    });
    expect(launcher).toEqual({
      cmd: 'C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\Orca.exe',
      args: ['C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\resources\\app.asar.unpacked\\out\\cli\\index.js'],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        ORCA_APP_EXECUTABLE: 'C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\Orca.exe',
        ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1',
        ORCA_USER_DATA_PATH: 'C:\\Users\\me\\AppData\\Roaming\\Orca',
        ORCA_NODE_OPTIONS: '',
        ORCA_NODE_REPL_EXTERNAL_MODULE: '',
        NODE_OPTIONS: '',
        NODE_REPL_EXTERNAL_MODULE: '',
      },
      runtimeClient: 'C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\resources\\app.asar.unpacked\\out\\cli\\runtime-client.js',
      userDataPath: 'C:\\Users\\me\\AppData\\Roaming\\Orca',
    });
  });

  it('moves NODE_OPTIONS / NODE_REPL_EXTERNAL_MODULE aside on Windows, as orca.cmd does', () => {
    const fs = fakeFs({ 'C:\\Orca\\bin\\orca.cmd': winLauncher });
    const env = { NODE_OPTIONS: '--max-old-space-size=4096', NODE_REPL_EXTERNAL_MODULE: 'C:\\Users\\me\\repl.js' };
    const launcher = resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Orca\\bin', env, ...fs });
    expect(launcher.env).toMatchObject({
      ORCA_NODE_OPTIONS: '--max-old-space-size=4096',
      ORCA_NODE_REPL_EXTERNAL_MODULE: 'C:\\Users\\me\\repl.js',
      NODE_OPTIONS: '',
      NODE_REPL_EXTERNAL_MODULE: '',
    });
  });

  it('keeps an ORCA_APP_EXECUTABLE already set on Windows, as orca.cmd does', () => {
    const fs = fakeFs({ 'C:\\Orca\\bin\\orca.cmd': winLauncher });
    const env = { ORCA_APP_EXECUTABLE: 'C:\\Other\\Orca.exe' };
    const launcher = resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Orca\\bin', env, ...fs });
    expect(launcher.env).not.toHaveProperty('ORCA_APP_EXECUTABLE');
    expect(launcher.env).not.toHaveProperty('ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT');
  });

  it('follows ORCA_LAUNCHER forwarders on Windows', () => {
    const fs = fakeFs({
      'C:\\Users\\me\\bin\\orca.cmd': winForwarder('C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\bin\\orca.cmd'),
      'C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\bin\\orca.cmd': winLauncher,
    });
    const launcher = resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Users\\me\\bin', ...fs });
    expect(launcher.cmd).toBe('C:\\Users\\me\\AppData\\Local\\Programs\\Orca\\Orca.exe');
  });

  it('gives up on a forwarder loop on Windows', () => {
    const fs = fakeFs({ 'C:\\Users\\me\\bin\\orca.cmd': winForwarder('C:\\Users\\me\\bin\\orca.cmd') });
    const err = (() => {
      try {
        return resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Users\\me\\bin', ...fs });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(HostError);
    expect(err).toMatchObject({ code: 'orca_unavailable', message: expect.stringContaining('Unrecognised Orca launcher') });
  });

  it('rejects a Windows launcher without ELECTRON and CLI', () => {
    const fs = fakeFs({ 'C:\\Orca\\orca.cmd': '@echo off\r\nstart Orca.exe %*\r\n' });
    expect(() => resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Orca', ...fs })).toThrow(
      'Unrecognised Orca launcher: C:\\Orca\\orca.cmd',
    );
  });

  it('reports a missing CLI as orca_unavailable', () => {
    const err = (() => {
      try {
        return resolveOrcaLauncher({ platform: 'darwin', pathEnv: '/usr/bin:/bin', ...fakeFs({}) });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(HostError);
    expect(err).toMatchObject({
      code: 'orca_unavailable',
      message: 'Orca CLI not found on PATH (orca): enable the shell command in Orca, then re-run the install script',
    });
  });

  it('reports both supported Windows launchers when neither is on PATH', () => {
    expect(() => resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Commands', env: {}, ...fakeFs({}) })).toThrow(
      'Orca CLI not found on PATH (orca.exe or orca.cmd)',
    );
  });

  it('reports a stale Windows executable forwarder as orca_unavailable', () => {
    const fs = fakeFs({ 'C:\\Commands\\orca.cmd': winForwarder('C:\\Orca\\resources\\bin\\orca.exe') });
    expect(() => resolveOrcaLauncher({ platform: 'win32', pathEnv: 'C:\\Commands', env: {}, ...fs })).toThrow(
      'Unrecognised Orca launcher: C:\\Commands\\orca.cmd',
    );
  });
});
