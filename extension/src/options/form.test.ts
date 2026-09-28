// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../settings';
import { addOverrideRow, readForm, renderOptions, validateSettings } from './form';

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
});

describe('options form', () => {
  it('round-trips settings', () => {
    const s = mergeSettings({
      agent: 'codex',
      cloneDir: '/src',
      templates: { review: 'R {pr_url}' },
      overrides: [{ repo: 'Acme/Web-App', action: 'review', template: '/web-review {pr_url}' }],
    });
    renderOptions(root, s);
    expect(readForm(root)).toEqual(s);
  });

  it('adds and removes override rows', () => {
    renderOptions(root, DEFAULT_SETTINGS);
    addOverrideRow(root, { repo: 'a/b', action: 'continue', template: 'C' });
    expect(readForm(root).overrides).toEqual([{ repo: 'a/b', action: 'continue', template: 'C' }]);
    root.querySelector<HTMLButtonElement>('.override .remove')!.click();
    expect(readForm(root).overrides).toEqual([]);
  });

  it('drops rows with an empty repo or template', () => {
    renderOptions(root, DEFAULT_SETTINGS);
    addOverrideRow(root, { repo: ' ', action: 'review', template: 'x' });
    addOverrideRow(root, { repo: 'a/b', action: 'review', template: '  ' });
    expect(readForm(root).overrides).toEqual([]);
  });

  it('restores the default template when a global one is emptied', () => {
    renderOptions(root, DEFAULT_SETTINGS);
    root.querySelector<HTMLTextAreaElement>('textarea[name="template-review"]')!.value = '';
    expect(readForm(root).templates.review).toBe(DEFAULT_SETTINGS.templates.review);
  });
});

describe('validateSettings', () => {
  it('accepts the defaults and a valid agent', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, agent: 'codex-2' })).toBeNull();
  });

  it('rejects an agent the host would refuse', () => {
    for (const agent of ['', 'Claude', 'claude --yolo', 'a'.repeat(41), 'x;rm']) {
      expect(validateSettings({ ...DEFAULT_SETTINGS, agent })).toBe('Invalid agent');
    }
  });
});

describe('validateSettings — cloneDir', () => {
  it('accepts an absolute or ~ folder', () => {
    for (const cloneDir of ['~', '~/orca-projects', '/Users/me/src']) {
      expect(validateSettings({ ...DEFAULT_SETTINGS, cloneDir })).toBeNull();
    }
  });

  it('rejects a folder the host would refuse', () => {
    for (const cloneDir of ['src', '~bob/src', './x']) {
      expect(validateSettings({ ...DEFAULT_SETTINGS, cloneDir })).toMatch(/Invalid clone folder/);
    }
  });
});
