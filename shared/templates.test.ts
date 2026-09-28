import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES, interpolate, varsFromPr } from './templates';
import type { PrMeta } from './types';

const pr: PrMeta = {
  number: 42,
  title: 'Fix "login" $(rm -rf /)',
  url: 'https://github.com/Acme/Web-App/pull/42',
  headRefName: 'fix/login',
  baseRefName: 'main',
  state: 'OPEN',
  isCrossRepository: false,
};

describe('varsFromPr', () => {
  it('maps PR metadata to template variables', () => {
    expect(varsFromPr('Acme', 'Web-App', pr)).toEqual({
      pr_url: pr.url,
      pr_number: '42',
      pr_title: pr.title,
      owner: 'Acme',
      repo: 'Web-App',
      head_ref: 'fix/login',
      base_ref: 'main',
    });
  });
});

describe('interpolate', () => {
  const vars = varsFromPr('Acme', 'Web-App', pr);

  it('replaces every known variable, repeatedly', () => {
    expect(interpolate('{pr_number} {head_ref}→{base_ref} #{pr_number}', vars)).toBe('42 fix/login→main #42');
  });

  it('leaves unknown variables untouched', () => {
    expect(interpolate('{unknown} {pr_url}', vars)).toBe(`{unknown} ${pr.url}`);
  });

  it('inserts the title verbatim, without evaluating it', () => {
    expect(interpolate('{pr_title}', vars)).toBe('Fix "login" $(rm -rf /)');
  });

  it('does not re-interpolate braces coming from values', () => {
    const v = varsFromPr('o', 'r', { ...pr, title: '{pr_url}' });
    expect(interpolate('{pr_title}', v)).toBe('{pr_url}');
  });
});

describe('DEFAULT_TEMPLATES', () => {
  it('has a template for each agent action, all mentioning the PR url', () => {
    for (const t of Object.values(DEFAULT_TEMPLATES)) expect(t).toContain('{pr_url}');
  });

  it('tells the continue agent how to push', () => {
    expect(DEFAULT_TEMPLATES.continue).toContain('git push origin HEAD:{head_ref}');
  });

  it('tells the address-comments agent how to push, as its last sentence', () => {
    expect(DEFAULT_TEMPLATES['address-comments'].endsWith(' Push with `git push origin HEAD:{head_ref}`.')).toBe(true);
  });
});
