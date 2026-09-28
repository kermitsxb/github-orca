export function encodeMessage(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export async function readMessage(input: AsyncIterable<Buffer | string>): Promise<unknown> {
  let buf = Buffer.alloc(0);
  for await (const chunk of input) {
    buf = Buffer.concat([buf, typeof chunk === 'string' ? Buffer.from(chunk) : chunk]);
    if (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length >= 4 + len) return JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
    }
  }
  throw new Error('stdin closed before a full message was received');
}
