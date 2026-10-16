import { createPublicKey } from 'node:crypto';

/**
 * The server cannot read key pieces, but it can refuse junk. Accept only a real RSA public key of at least 3072 bits,
 * so a broken or weak key can never be used to wrap a key piece.
 */
export function isAcceptableRsaPublicKey(spkiB64: string, minBits = 3072): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(spkiB64, 'base64'), format: 'der', type: 'spki' });
    return key.asymmetricKeyType === 'rsa' && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= minBits;
  } catch {
    return false;
  }
}
