import { describe, expect, it } from 'vitest';
import { HostError } from './errors';
import { isValidGitRef, parseRequest } from './validate';

const valid = { action: 'review', owner: 'Acme', repo: 'Web-App', prNumber: 12, agent: 'claude', template: 'Review {pr_url}' };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof HostError ? e.code : 'other';
  }
  return undefined;
}

describe('parseRequest', () => {
  it('accepts a valid review request', () => {
    expect(parseRequest(valid)).toEqual(valid);
  });

  it('accepts checkout without template and drops any template sent', () => {
    expect(parseRequest({ ...valid, action: 'checkout', template: 'x' })).toEqual({
      action: 'checkout', owner: 'Acme', repo: 'Web-App', prNumber: 12, agent: 'claude',
    });
  });

  it.each([
    ['non-object', null],
    ['unknown action', { ...valid, action: 'delete' }],
    ['owner with slash', { ...valid, owner: 'a/b' }],
    ['owner with space', { ...valid, owner: 'a b' }],
    ['repo only dots', { ...valid, repo: '..' }],
    ['prNumber zero', { ...valid, prNumber: 0 }],
    ['prNumber string', { ...valid, prNumber: '12' }],
    ['prNumber float', { ...valid, prNumber: 1.5 }],
    ['agent with space', { ...valid, agent: 'claude --dangerous' }],
    ['missing template for agent action', { ...valid, template: undefined }],
    ['blank template', { ...valid, template: '   ' }],
    ['template too long', { ...valid, template: 'x'.repeat(10_001) }],
  ])('rejects %s', (_label, raw) => {
    expect(codeOf(() => parseRequest(raw))).toBe('invalid_request');
  });
});

describe('isValidGitRef', () => {
  it.each(['main', 'feat/login', 'fix-123', 'user/feat.v2'])('accepts %s', (ref) => {
    expect(isValidGitRef(ref)).toBe(true);
  });

  it.each(['', '-x', 'a..b', 'a b', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[', 'a\\b', 'a/', '/a', 'a.lock', 'a@{1}', 'a.', 'a\nb'])(
    'rejects %j',
    (ref) => {
      expect(isValidGitRef(ref)).toBe(false);
    },
  );
});

describe('parseRequest — clone', () => {
  const clone = { action: 'clone', owner: 'Acme', repo: 'Web-App', destination: '~/orca-projects' };

  it('expands ~ against the home directory and normalizes the path', () => {
    expect(parseRequest(clone, '/Users/me')).toEqual({ ...clone, destination: '/Users/me/orca-projects' });
    expect(parseRequest({ ...clone, destination: '~' }, '/Users/me')).toMatchObject({ destination: '/Users/me' });
    expect(parseRequest({ ...clone, destination: '/src/./a/../b/' }, '/Users/me')).toMatchObject({ destination: '/src/b' });
  });

  it('ignores PR-only fields', () => {
    expect(parseRequest({ ...clone, prNumber: 3, agent: 'x', template: 't' }, '/h')).toEqual({ ...clone, destination: '/h/orca-projects' });
  });

  it.each([
    ['relative destination', { ...clone, destination: 'projects' }],
    ['~user destination', { ...clone, destination: '~bob/x' }],
    ['empty destination', { ...clone, destination: '' }],
    ['non-string destination', { ...clone, destination: 3 }],
    ['destination with newline', { ...clone, destination: '/a\nb' }],
    ['destination too long', { ...clone, destination: `/${'x'.repeat(1_000)}` }],
    ['invalid repo', { ...clone, repo: '..' }],
  ])('rejects %s', (_label, raw) => {
    expect(codeOf(() => parseRequest(raw, '/h'))).toBe('invalid_request');
  });
});
