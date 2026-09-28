import { createHash } from 'node:crypto';

/** Chrome extension ID derived from the manifest `key` (base64 SPKI DER). */
export function extensionIdFromPublicKey(derBase64) {
  const hex = createHash('sha256').update(Buffer.from(derBase64, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
