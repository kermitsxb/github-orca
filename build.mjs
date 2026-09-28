import { build } from 'esbuild';

const extensionEntries = {};

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
      target: 'chrome120',
      logLevel: 'info',
    }),
]);
