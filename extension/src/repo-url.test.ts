import { describe, expect, it } from 'vitest';
import { parseRepoUrl, repoKey } from './repo-url';

describe('parseRepoUrl', () => {
  it.each([
    ['https://github.com/Acme/Web-App', { owner: 'Acme', repo: 'Web-App' }],
    ['https://github.com/a/b.js/', { owner: 'a', repo: 'b.js' }],
    ['https://github.com/a/b?tab=readme-ov-file#readme', { owner: 'a', repo: 'b' }],
    ['https://github.com/a/b/tree/main/src', { owner: 'a', repo: 'b' }],
    ['https://github.com/a/b/blob/main/README.md', { owner: 'a', repo: 'b' }],
  ])('parses %s', (url, expected) => {
    expect(parseRepoUrl(url)).toEqual(expected);
  });

  it.each([
    'https://github.com/',
    'https://github.com/a',
    'https://github.com/a/b/pull/3',
    'https://github.com/a/b/issues',
    'https://github.com/a/b/actions',
    'https://github.com/orgs/acme/repositories',
    'https://github.com/settings/profile',
    'https://github.com/notifications/beta',
    'https://github.com/marketplace/actions',
    'https://gist.github.com/a/b',
  ])('ignores %s', (url) => {
    expect(parseRepoUrl(url)).toBeNull();
  });

  it('builds a key', () => {
    expect(repoKey({ owner: 'a', repo: 'b' })).toBe('a/b');
  });
});
