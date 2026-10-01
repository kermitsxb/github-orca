import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signFirefox } from './sign-firefox.mjs';

const addonId = 'extension@example.com';
const versionUrl = 'https://addons.mozilla.org/api/v5/addons/addon/extension%40example.com/versions/v1.2.3/';
const fileUrl = 'https://addons.mozilla.org/api/v5/files/42/example-1.2.3.xpi';
const signedBytes = Buffer.from('fictional signed XPI');
const details = (status = 'public') => ({
  id: 42,
  version: '1.2.3',
  channel: 'unlisted',
  edit_url: 'https://addons.mozilla.org/developers/addon/example/versions/42',
  file: { id: 7, status, url: fileUrl },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('signFirefox', () => {
  let directory: string;
  let options: { sourceDir: string; artifactsDir: string; apiKey: string; apiSecret: string };
  let fetcher: ReturnType<typeof vi.fn>;
  let sign: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'release-signing-'));
    options = {
      sourceDir: join(directory, 'extension'),
      artifactsDir: join(directory, 'artifacts'),
      apiKey: 'fictional-api-key',
      apiSecret: 'fictional-api-secret',
    };
    await mkdir(options.sourceDir);
    await writeFile(join(options.sourceDir, 'manifest.json'), JSON.stringify({
      version: '1.2.3',
      browser_specific_settings: { gecko: { id: addonId } },
    }));
    fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    sign = vi.fn().mockImplementation(async () => {
      await mkdir(options.artifactsDir, { recursive: true });
      await writeFile(join(options.artifactsDir, 'example.xpi'), signedBytes);
      return { id: addonId, downloadedFiles: ['example.xpi'] };
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it('downloads the already signed version without submitting it again', async () => {
    fetcher.mockResolvedValueOnce(json(details())).mockResolvedValueOnce(new Response(signedBytes));
    const artifact = await signFirefox(options, { sign });
    expect(artifact).toBe(join(options.artifactsDir, 'github-orca-firefox-1.2.3.xpi'));
    expect(await readFile(artifact)).toEqual(signedBytes);
    expect(sign).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([versionUrl, fileUrl]);
    const header = fetcher.mock.calls[0][1].headers.Authorization;
    expect(header).toMatch(/^JWT /);
    expect(JSON.parse(Buffer.from(header.split('.')[1], 'base64url').toString())).toMatchObject({ iss: options.apiKey });
  });

  it('submits an absent version and keeps a deterministic artifact name', async () => {
    fetcher.mockResolvedValueOnce(json({ detail: 'Not found.' }, 404));
    const artifact = await signFirefox(options, { sign });
    expect(await readFile(artifact)).toEqual(signedBytes);
    expect(sign).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      ...options, channel: 'unlisted', amoBaseUrl: 'https://addons.mozilla.org/api/v5/',
    }));
  });

  it('waits for an existing pending version without submitting it again', async () => {
    fetcher.mockResolvedValueOnce(json(details('unreviewed')))
      .mockResolvedValueOnce(json(details()))
      .mockResolvedValueOnce(new Response(signedBytes));
    const artifact = await signFirefox(options, { sign });
    expect(await readFile(artifact)).toEqual(signedBytes);
    expect(sign).not.toHaveBeenCalled();
    expect(String(fetcher.mock.calls[1][0])).toBe(
      'https://addons.mozilla.org/api/v5/addons/addon/extension@example.com/versions/42/',
    );
  });

  it('recovers on a fresh invocation after downloading a signed version failed', async () => {
    fetcher.mockResolvedValueOnce(json(details())).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(signFirefox(options, { sign })).rejects.toThrow(/Downloading/);
    fetcher.mockResolvedValueOnce(json(details())).mockResolvedValueOnce(new Response(signedBytes));
    const artifact = await signFirefox(options, { sign });
    expect(await readFile(artifact)).toEqual(signedBytes);
    expect(sign).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])('stops on AMO HTTP %s without submitting', async (status) => {
    fetcher.mockResolvedValueOnce(json({ detail: 'Request failed.' }, status));
    await expect(signFirefox(options, { sign })).rejects.toThrow(String(status));
    expect(sign).not.toHaveBeenCalled();
  });

  it('stops on a network failure without submitting', async () => {
    fetcher.mockRejectedValueOnce(new Error('Connection failed'));
    await expect(signFirefox(options, { sign })).rejects.toThrow('Connection failed');
    expect(sign).not.toHaveBeenCalled();
  });

  it.each([
    { ...details(), version: '1.2.4' },
    { ...details(), channel: 'listed' },
    { ...details(), file: null },
    { ...details(), id: undefined },
  ])('rejects unusable AMO version metadata without submitting: %j', async (metadata) => {
    fetcher.mockResolvedValueOnce(json(metadata));
    await expect(signFirefox(options, { sign })).rejects.toThrow(/AMO version/);
    expect(sign).not.toHaveBeenCalled();
  });

  it('times out when an existing version never becomes approved', async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation(async () => json(details('unreviewed')));
    const failed = expect(signFirefox(options, { sign })).rejects.toThrow(/timeout exceeded/);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(900_001);
    await failed;
    expect(sign).not.toHaveBeenCalled();
  });

  it('propagates new submission failures', async () => {
    fetcher.mockResolvedValueOnce(json({}, 404));
    sign.mockRejectedValueOnce(new Error('Submission failed'));
    await expect(signFirefox(options, { sign })).rejects.toThrow('Submission failed');
  });

  it('fails when signing returns no downloaded file', async () => {
    fetcher.mockResolvedValueOnce(json({}, 404));
    sign.mockResolvedValueOnce({ id: addonId });
    await expect(signFirefox(options, { sign })).rejects.toThrow(/signed XPI/);
  });

  it.each(['apiKey', 'apiSecret'] as const)('requires %s before contacting AMO', async (key) => {
    options[key] = '';
    await expect(signFirefox(options, { sign })).rejects.toThrow(/WEB_EXT_API/);
    expect(fetcher).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });
});
