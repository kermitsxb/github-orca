import { createHash, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extensionIdFromPublicKey } from './extension-id.mjs';

describe('extensionIdFromPublicKey', () => {
  it('maps the first 32 hex chars of sha256(DER) to a–p', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const id = extensionIdFromPublicKey(der.toString('base64'));
    const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
    expect(id).toMatch(/^[a-p]{32}$/);
    expect(id).toBe([...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join(''));
  });
});
