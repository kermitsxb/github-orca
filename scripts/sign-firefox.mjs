import { mkdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmd } from 'web-ext';
import Client, { JwtApiAuth } from 'web-ext/util/submit-addon';

const AMO_BASE_URL = 'https://addons.mozilla.org/api/v5/';

/** Reuse submitted versions so retries never ask AMO to sign the same version twice. */
export async function signFirefox({ sourceDir, artifactsDir, apiKey, apiSecret }, { sign = cmd.sign } = {}) {
  if (!apiKey || !apiSecret) throw new Error('WEB_EXT_API_KEY and WEB_EXT_API_SECRET are required.');
  const manifest = JSON.parse(await readFile(join(sourceDir, 'manifest.json'), 'utf8'));
  const { version } = manifest;
  const id = manifest.browser_specific_settings?.gecko?.id;
  if (!id || !version) throw new Error('The Firefox manifest needs a gecko ID and version.');

  await mkdir(artifactsDir, { recursive: true });
  const client = new Client({
    apiAuth: new JwtApiAuth({ apiKey, apiSecret }),
    baseUrl: new URL(AMO_BASE_URL),
    downloadDir: artifactsDir,
    userAgentString: `github-orca/${version}`,
  });
  // Prefix with v so even a single-component version is interpreted as a version, not an AMO database ID.
  const versionUrl = new URL(`addons/addon/${encodeURIComponent(id)}/versions/v${encodeURIComponent(version)}/`, AMO_BASE_URL);
  const response = await client.fetch(versionUrl);
  let result;
  if (response.status === 404) {
    result = await sign({
      sourceDir, artifactsDir, apiKey, apiSecret,
      channel: 'unlisted',
      amoBaseUrl: AMO_BASE_URL,
      webextVersion: `github-orca/${version}`,
    });
  } else {
    if (!response.ok) throw new Error(`AMO version lookup failed: HTTP ${response.status}.`);
    const existing = await response.json();
    if (existing.version !== version || existing.channel !== 'unlisted' || !Number.isInteger(existing.id)
      || !existing.file || !['public', 'unreviewed', 'disabled'].includes(existing.file.status)
      || typeof existing.file.url !== 'string') {
      throw new Error('AMO version metadata does not describe the requested unlisted extension.');
    }
    result = existing.file.status === 'public'
      ? await client.downloadSignedFile(new URL(existing.file.url), id)
      : await client.doAfterSubmit(id, existing.id, existing.edit_url);
  }

  if (result?.downloadedFiles?.length !== 1) throw new Error('AMO did not return a downloaded signed XPI.');
  const artifact = join(artifactsDir, `github-orca-firefox-${version}.xpi`);
  const downloaded = join(artifactsDir, result.downloadedFiles[0]);
  if (downloaded !== artifact) await rename(downloaded, artifact);
  return artifact;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(await signFirefox({
      sourceDir: 'extension-firefox',
      artifactsDir: 'web-ext-artifacts',
      apiKey: process.env.WEB_EXT_API_KEY,
      apiSecret: process.env.WEB_EXT_API_SECRET,
    }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
