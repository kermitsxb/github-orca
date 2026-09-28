import { describe, expect, it } from 'vitest';
import { parsePrUrl, prKey } from './pr-url';

describe('parsePrUrl', () => {
  it.each([
    ['https://github.com/Acme/Web-App/pull/12', { owner: 'Acme', repo: 'Web-App', prNumber: 12 }],
    ['https://github.com/a/b.js/pull/3/files', { owner: 'a', repo: 'b.js', prNumber: 3 }],
    ['https://github.com/a/b/pull/3?diff=split#r1', { owner: 'a', repo: 'b', prNumber: 3 }],
  ])('parses %s', (url, expected) => {
    expect(parsePrUrl(url)).toEqual(expected);
  });

  it.each([
    'https://github.com/a/b/pulls',
    'https://github.com/a/b/issues/3',
    'https://github.com/a/b/pull/3x',
    'https://gist.github.com/a/b/pull/3',
    'https://github.com/a/b/pull/new/feature',
  ])('ignores %s', (url) => {
    expect(parsePrUrl(url)).toBeNull();
  });

  it('builds a key', () => {
    expect(prKey({ owner: 'a', repo: 'b', prNumber: 3 })).toBe('a/b#3');
  });
});
