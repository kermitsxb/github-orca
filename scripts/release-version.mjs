import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Version released by a `vX.Y.Z` tag; throws unless it matches the manifest (AMO never re-signs a version). */
export function releaseVersion(ref, manifestVersion) {
  const tag = ref.replace(/^refs\/tags\//, '');
  if (!tag.startsWith('v')) throw new Error(`Not a release tag: ${tag}`);
  if (tag.slice(1) !== manifestVersion) throw new Error(`Tag ${tag} does not match manifest version ${manifestVersion}`);
  return manifestVersion;
}

// CLI: node scripts/release-version.mjs <tag> → prints the version, exits 1 on mismatch.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  try {
    console.log(releaseVersion(process.argv[2] ?? '', version));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
