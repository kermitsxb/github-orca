import { describe, expect, it } from 'vitest';
import { firefoxManifest } from './firefox-manifest.mjs';

const chrome = {
  manifest_version: 3,
  name: 'Ext',
  version: '1.2.3',
  permissions: ['nativeMessaging', 'storage'],
  background: { service_worker: 'dist/background.js' },
  content_scripts: [{ matches: ['https://example.com/*'], js: ['dist/content.js'] }],
  options_page: 'options.html',
  key: 'AAAA',
};

describe('firefoxManifest', () => {
  const ff = firefoxManifest(chrome, 'ext@example');

  it('turns the service worker into a background script', () => {
    expect(ff.background).toEqual({ scripts: ['dist/background.js'] });
  });

  it('drops the Chrome-only key', () => {
    expect(ff).not.toHaveProperty('key');
  });

  it('declares the gecko id, minimum version and no data collection', () => {
    expect(ff.browser_specific_settings).toEqual({
      gecko: { id: 'ext@example', strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } },
    });
  });

  it('exposes the options page through options_ui', () => {
    expect(ff).not.toHaveProperty('options_page');
    expect(ff.options_ui).toEqual({ page: 'options.html', open_in_tab: true });
  });

  it('copies everything else verbatim', () => {
    expect(ff).toMatchObject({
      manifest_version: 3, name: 'Ext', version: '1.2.3', permissions: chrome.permissions, content_scripts: chrome.content_scripts,
    });
  });

  it('does not mutate its input', () => {
    expect(chrome).toHaveProperty('key', 'AAAA');
    expect(chrome.background).toEqual({ service_worker: 'dist/background.js' });
  });
});
