import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { encodeMessage, readMessage } from './protocol';

describe('encodeMessage', () => {
  it('prefixes the UTF-8 JSON body with its byte length, little-endian', () => {
    const buf = encodeMessage({ t: 'é' });
    const body = JSON.stringify({ t: 'é' });
    expect(buf.readUInt32LE(0)).toBe(Buffer.byteLength(body));
    expect(buf.subarray(4).toString('utf8')).toBe(body);
  });
});

describe('readMessage', () => {
  it('reads a frame split across several chunks', async () => {
    const stream = new PassThrough();
    const frame = encodeMessage({ action: 'review', n: 1 });
    const pending = readMessage(stream);
    stream.write(frame.subarray(0, 2));
    stream.write(frame.subarray(2, 9));
    stream.write(frame.subarray(9));
    expect(await pending).toEqual({ action: 'review', n: 1 });
  });

  it('resolves without waiting for the stream to end', async () => {
    const stream = new PassThrough();
    const pending = readMessage(stream);
    stream.write(encodeMessage({ ok: 1 }));
    expect(await pending).toEqual({ ok: 1 });
  });

  it('rejects when the stream ends before a full frame', async () => {
    const stream = new PassThrough();
    const pending = readMessage(stream);
    stream.end(Buffer.from([10, 0, 0, 0, 123]));
    await expect(pending).rejects.toThrow(/closed/);
  });
});
