import { describe, expect, it, vi } from 'vitest';
import type { HostRequest, HostResponse } from '../../../shared/types';
import { DEFAULT_SETTINGS } from '../settings';
import { buildCloneRequest, buildHostRequest, cloneInFlightKey, createInFlight, inFlightKey, mapNativeError, sendViaPort, type PortLike, type RunActionMessage } from './logic';

const msg: RunActionMessage = { type: 'run-action', action: 'review', owner: 'a', repo: 'b', prNumber: 3 };

describe('buildHostRequest', () => {
  it('builds a host request with the resolved raw template and agent', () => {
    expect(buildHostRequest(msg, DEFAULT_SETTINGS)).toEqual({
      action: 'review', owner: 'a', repo: 'b', prNumber: 3, agent: 'claude', template: DEFAULT_SETTINGS.templates.review,
    });
  });

  it('omits the template for checkout', () => {
    expect(buildHostRequest({ ...msg, action: 'checkout' }, DEFAULT_SETTINGS)).not.toHaveProperty('template');
  });

  it('refuses an empty custom prompt without calling the host', () => {
    expect(buildHostRequest({ ...msg, action: 'custom', customPrompt: ' ' }, DEFAULT_SETTINGS)).toEqual({
      ok: false, code: 'invalid_request', message: 'Empty prompt',
    });
  });
});

describe('mapNativeError', () => {
  it('explains a missing host', () => {
    expect(mapNativeError('Specified native messaging host not found.')).toEqual({
      ok: false, code: 'host_missing', message: 'Host not installed: run scripts/install.sh',
    });
  });

  it('explains a missing host under Firefox', () => {
    expect(mapNativeError('No such native application com.stocki.github_orca')).toEqual({
      ok: false, code: 'host_missing', message: 'Host not installed: run scripts/install.sh',
    });
  });

  it('explains a forbidden host (extension ID mismatch)', () => {
    expect(mapNativeError('Access to the specified native messaging host is forbidden.')).toMatchObject({
      code: 'host_missing', message: expect.stringContaining('ID'),
    });
  });

  it('explains a refused host under Firefox', () => {
    expect(mapNativeError('This extension does not have permission to use native application com.stocki.github_orca (or the application is not installed)')).toMatchObject({
      code: 'host_missing', message: expect.stringContaining('ID'),
    });
  });

  it('explains a host that stopped, with a generic log hint when the OS is unknown', () => {
    for (const m of ['Native host has exited.', 'Error when communicating with the native messaging host.']) {
      expect(mapNativeError(m)).toEqual({
        ok: false, code: 'internal',
        message: 'The native host stopped: see the host log (README \u2192 Troubleshooting) or re-run scripts/install.sh',
      });
    }
  });

  it.each([
    ['mac', '~/Library/Logs/github-orca/host.log', 'scripts/install.sh'],
    ['linux', '~/.local/state/github-orca/host.log', 'scripts/install.sh'],
    ['win', '%LOCALAPPDATA%\\github-orca\\logs\\host.log', 'scripts\\install.ps1'],
  ])('points to the %s log and installer', (os, log, installer) => {
    expect(mapNativeError('Native host has exited.', os)).toEqual({
      ok: false, code: 'internal', message: `The native host stopped: see ${log} or re-run ${installer}`,
    });
    expect(mapNativeError('Specified native messaging host not found.', os)).toMatchObject({
      message: `Host not installed: run ${installer}`,
    });
    expect(mapNativeError('Access to the specified native messaging host is forbidden.', os)).toMatchObject({
      message: expect.stringContaining(`re-run ${installer}`),
    });
  });

  it('falls back to the generic log hint and install.sh for other platforms', () => {
    expect(mapNativeError('Native host has exited.', 'openbsd')).toMatchObject({
      message: 'The native host stopped: see the host log (README \u2192 Troubleshooting) or re-run scripts/install.sh',
    });
  });

  it('explains a reloaded extension', () => {
    expect(mapNativeError('Extension context invalidated.')).toEqual({ ok: false, code: 'internal', message: 'Extension reloaded: reload the page' });
  });

  it('passes other errors through', () => {
    expect(mapNativeError('Something odd')).toEqual({ ok: false, code: 'internal', message: 'Something odd' });
  });
});

describe('inFlightKey', () => {
  it('is case-insensitive per PR, with a :branch suffix for branch actions', () => {
    expect(inFlightKey({ ...msg, owner: 'Acme', repo: 'Webapp' })).toBe('acme/webapp#3');
    expect(inFlightKey({ ...msg, action: 'checkout' })).toBe('a/b#3');
    expect(inFlightKey({ ...msg, action: 'custom' })).toBe('a/b#3');
    expect(inFlightKey({ ...msg, action: 'continue' })).toBe('a/b#3:branch');
    expect(inFlightKey({ ...msg, action: 'address-comments' })).toBe('a/b#3:branch');
  });
});

describe('createInFlight', () => {
  it('shares the pending promise for the same key, and runs again once settled', async () => {
    let release!: (v: string) => void;
    const fn = vi.fn(() => new Promise<string>((r) => (release = r)));
    const run = createInFlight<string>();
    const a = run('k', fn);
    const b = run('k', fn);
    expect(a).toBe(b);
    expect(fn).toHaveBeenCalledTimes(1);
    release('done');
    expect(await a).toBe('done');
    await run('k', async () => 'again');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs different keys independently and forgets a rejected run', async () => {
    const run = createInFlight<string>();
    const fn = vi.fn(async () => 'x');
    await Promise.all([run('a', fn), run('b', fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(run('c', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await run('c', async () => 'ok')).toBe('ok');
  });
});

class FakePort implements PortLike {
  posted: unknown[] = [];
  disconnected = false;
  error: { message?: string } | null = null;
  private msgListeners: Array<(m: unknown) => void> = [];
  private discListeners: Array<() => void> = [];
  onMessage = { addListener: (f: (m: unknown) => void) => void this.msgListeners.push(f) };
  onDisconnect = { addListener: (f: () => void) => void this.discListeners.push(f) };
  postMessage(m: unknown) { this.posted.push(m); }
  disconnect() { this.disconnected = true; }
  emitMessage(m: unknown) { this.msgListeners.forEach((f) => f(m)); }
  emitDisconnect() { this.discListeners.forEach((f) => f()); }
}

describe('sendViaPort', () => {
  const req: HostRequest = { action: 'review', owner: 'a', repo: 'b', prNumber: 3, agent: 'claude', template: 't' };
  const ok: HostResponse = { ok: true, worktreeName: 'w', worktreePath: '/w', reused: false };

  it('posts the request and resolves with the first message, then disconnects', async () => {
    const port = new FakePort();
    const p = sendViaPort(() => port, req, () => undefined);
    expect(port.posted).toEqual([req]);
    port.emitMessage(ok);
    port.emitDisconnect();
    expect(await p).toEqual(ok);
    expect(port.disconnected).toBe(true);
  });

  it('maps a disconnect without a message to the "host stopped" error', async () => {
    const port = new FakePort();
    const p = sendViaPort(() => port, req, () => undefined);
    port.emitDisconnect();
    expect(await p).toMatchObject({ ok: false, code: 'internal', message: expect.stringContaining('host log') });
  });

  it('maps a disconnect using the given os', async () => {
    const port = new FakePort();
    const p = sendViaPort(() => port, req, () => 'Specified native messaging host not found.', 'win');
    port.emitDisconnect();
    expect(await p).toMatchObject({ message: 'Host not installed: run scripts\\install.ps1' });
  });

  it('maps a connect failure using the given os', async () => {
    const p = sendViaPort(() => { throw new Error('Native host has exited.'); }, req, () => undefined, 'linux');
    expect(await p).toMatchObject({ message: expect.stringContaining('~/.local/state/github-orca/host.log') });
  });

  it('maps lastError "not found" on disconnect to host_missing', async () => {
    const port = new FakePort();
    const p = sendViaPort(() => port, req, () => 'Specified native messaging host not found.');
    port.emitDisconnect();
    expect(await p).toMatchObject({ ok: false, code: 'host_missing' });
  });

  it('prefers port.error (Firefox) over lastError on disconnect', async () => {
    const port = new FakePort();
    const p = sendViaPort(() => port, req, () => undefined);
    port.error = { message: 'No such native application com.stocki.github_orca' };
    port.emitDisconnect();
    expect(await p).toMatchObject({ ok: false, code: 'host_missing' });
  });

  it('falls back to lastError when port.error is null (Chrome)', async () => {
    const port = new FakePort();
    const p = sendViaPort(() => port, req, () => 'Specified native messaging host not found.');
    port.emitDisconnect();
    expect(await p).toMatchObject({ ok: false, code: 'host_missing' });
  });

  it('turns a throwing connect into an error response', async () => {
    const p = sendViaPort(() => { throw new Error('Extension context invalidated.'); }, req, () => undefined);
    expect(await p).toEqual({ ok: false, code: 'internal', message: 'Extension reloaded: reload the page' });
  });
});

describe('clone', () => {
  it('builds a clone request with the configured folder', () => {
    expect(buildCloneRequest({ type: 'clone-repo', owner: 'a', repo: 'b' }, { ...DEFAULT_SETTINGS, cloneDir: '~/src' })).toEqual({
      action: 'clone', owner: 'a', repo: 'b', destination: '~/src',
    });
  });

  it('has its own in-flight key, distinct from any PR key', () => {
    expect(cloneInFlightKey({ owner: 'Acme', repo: 'Web' })).toBe('clone:acme/web');
  });
});
