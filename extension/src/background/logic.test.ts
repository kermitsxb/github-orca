import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import { buildHostRequest, mapNativeError, type RunActionMessage } from './logic';

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
      ok: false, code: 'invalid_request', message: 'Prompt vide',
    });
  });
});

describe('mapNativeError', () => {
  it('explains a missing host', () => {
    expect(mapNativeError('Specified native messaging host not found.')).toEqual({
      ok: false, code: 'host_missing', message: 'Host non installé : lance scripts/install.sh',
    });
  });

  it('explains a forbidden host (extension ID mismatch)', () => {
    expect(mapNativeError('Access to the specified native messaging host is forbidden.')).toMatchObject({
      code: 'host_missing', message: expect.stringContaining('ID'),
    });
  });

  it('passes other errors through', () => {
    expect(mapNativeError('Native host has exited.')).toEqual({ ok: false, code: 'internal', message: 'Native host has exited.' });
  });
});
