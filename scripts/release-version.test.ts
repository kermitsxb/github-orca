import { describe, expect, it } from 'vitest';
import { releaseVersion } from './release-version.mjs';

describe('releaseVersion', () => {
  it('returns the version when the tag matches the manifest', () => {
    expect(releaseVersion('v1.2.3', '1.2.3')).toBe('1.2.3');
  });

  it('accepts a full ref name', () => {
    expect(releaseVersion('refs/tags/v1.2.3', '1.2.3')).toBe('1.2.3');
  });

  it('refuses a tag that does not match the manifest version', () => {
    expect(() => releaseVersion('v1.2.4', '1.2.3')).toThrow('Tag v1.2.4 does not match manifest version 1.2.3');
  });

  it('refuses a tag without the v prefix', () => {
    expect(() => releaseVersion('1.2.3', '1.2.3')).toThrow('Not a release tag: 1.2.3');
  });
});
