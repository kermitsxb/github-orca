// scripts/gen-key.mjs — run once; commits a stable `key` so the unpacked extension keeps its ID.
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { extensionIdFromPublicKey } from './extension-id.mjs';

const manifestPath = new URL('../extension/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.key && !process.argv.includes('--force')) {
  console.error('manifest.json already has a key (use --force to replace it: the extension ID will change)');
  process.exit(1);
}
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
manifest.key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const id = extensionIdFromPublicKey(manifest.key);
writeFileSync(new URL('../extension/extension-id.txt', import.meta.url), `${id}\n`);
console.log(`Extension ID: ${id}`);
