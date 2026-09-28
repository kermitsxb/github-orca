import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES } from '../../shared/templates';
import { DEFAULT_SETTINGS, mergeSettings, resolveTemplate } from './settings';

describe('mergeSettings', () => {
  it('returns defaults for nothing stored', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps stored values and fills missing templates', () => {
    const s = mergeSettings({ agent: 'codex', templates: { review: 'R' }, overrides: [{ repo: 'a/b', action: 'review', template: 'X' }] });
    expect(s.agent).toBe('codex');
    expect(s.templates).toEqual({ ...DEFAULT_TEMPLATES, review: 'R' });
    expect(s.overrides).toHaveLength(1);
  });

  it('drops malformed overrides and blank agent', () => {
    const s = mergeSettings({ agent: ' ', overrides: [{ repo: 'a/b' }, 'x', { repo: 'a/b', action: 'delete', template: 't' }] });
    expect(s.agent).toBe('claude');
    expect(s.overrides).toEqual([]);
  });
});

describe('resolveTemplate', () => {
  const s = mergeSettings({ overrides: [{ repo: 'Acme/Web-App', action: 'review', template: '/web-review {pr_url}' }] });

  it('uses the repo override, case-insensitively', () => {
    expect(resolveTemplate(s, 'review', 'acme', 'web-app')).toBe('/web-review {pr_url}');
  });

  it('falls back to the global template for other repos and actions', () => {
    expect(resolveTemplate(s, 'review', 'x', 'y')).toBe(DEFAULT_TEMPLATES.review);
    expect(resolveTemplate(s, 'continue', 'Acme', 'Web-App')).toBe(DEFAULT_TEMPLATES.continue);
  });

  it('returns undefined for checkout and the trimmed text for custom', () => {
    expect(resolveTemplate(s, 'checkout', 'a', 'b')).toBeUndefined();
    expect(resolveTemplate(s, 'custom', 'a', 'b', '  do it  ')).toBe('do it');
    expect(resolveTemplate(s, 'custom', 'a', 'b', '   ')).toBeUndefined();
  });
});
