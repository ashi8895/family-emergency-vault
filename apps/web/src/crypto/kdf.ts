import { toB64, fromB64, utf8 } from './encoding';

export interface KdfParams {
  algo: 'PBKDF2-SHA256';
  iterations: number;
}

export const DEFAULT_KDF: KdfParams = { algo: 'PBKDF2-SHA256', iterations: 600_000 };

const INFO_AUTH = utf8('fev-auth-v1');
const INFO_ENC = utf8('fev-enc-v1');

export interface DerivedKeys {
  /** Sent to the server for login. Reveals nothing about the KEK (HKDF outputs are independent). */
  authKey: string;
  /** Key-encryption key. Never leaves the browser; non-extractable. */
  kek: CryptoKey;
}

/**
 * master password --PBKDF2(600k)--> 256-bit master secret
 *                 --HKDF("auth")--> authKey   (goes to the server)
 *                 --HKDF("enc") --> KEK       (stays in the browser)
 *
 * Splitting with HKDF is what makes "one password, server can log you in but cannot decrypt" safe.
 */
export async function deriveKeys(password: string, saltB64: string, iterations: number): Promise<DerivedKeys> {
  const pwKey = await crypto.subtle.importKey('raw', utf8(password.normalize('NFKC')) as BufferSource, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const masterBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64) as BufferSource, iterations },
    pwKey,
    256,
  );

  const hkdfKey = await crypto.subtle.importKey('raw', masterBits, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const emptySalt = new Uint8Array(32);

  const authBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: emptySalt, info: INFO_AUTH as BufferSource },
    hkdfKey,
    256,
  );
  const kek = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: emptySalt, info: INFO_ENC as BufferSource },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return { authKey: toB64(authBits), kek };
}
