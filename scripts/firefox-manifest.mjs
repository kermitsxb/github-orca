/** Firefox MV3 manifest derived from the Chrome one: event-page background, gecko id, no `key`. */
export function firefoxManifest(chromeManifest, geckoId) {
  const { key: _key, background, options_page, ...rest } = chromeManifest;
  return {
    ...rest,
    background: { scripts: [background.service_worker] },
    ...(options_page ? { options_ui: { page: options_page, open_in_tab: true } } : {}),
    browser_specific_settings: {
      gecko: { id: geckoId, strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } },
    },
  };
}
