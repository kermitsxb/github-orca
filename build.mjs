import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { firefoxManifest } from './scripts/firefox-manifest.mjs';

const extensionEntries = {
  background: 'extension/src/background/index.ts',
  content: 'extension/src/content/index.ts',
  options: 'extension/src/options/options.ts',
};

await Promise.all([
  build({
    entryPoints: ['host/src/main.ts'],
    outfile: 'host/dist/host.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    logLevel: 'info',
  }),
  Object.keys(extensionEntries).length > 0 &&
    build({
      entryPoints: extensionEntries,
      outdir: 'extension/dist',
      bundle: true,
      format: 'iife',
      target: ['chrome120', 'firefox128'],
      logLevel: 'info',
    }),
]);

// Firefox gets its own copy of the extension with a derived manifest (see scripts/firefox-manifest.mjs).
const FIREFOX_DIR = 'extension-firefox';
const chromeManifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const geckoId = (await readFile('extension/firefox-id.txt', 'utf8')).trim();
await rm(FIREFOX_DIR, { recursive: true, force: true });
await mkdir(FIREFOX_DIR);
await cp('extension/dist', `${FIREFOX_DIR}/dist`, { recursive: true });
await cp('extension/options.html', `${FIREFOX_DIR}/options.html`);
await writeFile(`${FIREFOX_DIR}/manifest.json`, `${JSON.stringify(firefoxManifest(chromeManifest, geckoId), null, 2)}\n`);
console.log(`Firefox extension: ${FIREFOX_DIR}/`);
