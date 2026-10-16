import { openBytes, sealBytes, type Sealed } from './aes';
import { fromB64, toB64, utf8, randomBytes } from './encoding';
import { DEFAULT_KDF, type KdfParams } from './kdf';

/**
 * A trusted contact has no account. When they accept an invite their browser creates an RSA key pair:
 *  - the PUBLIC key goes to the server; the owner's browser uses it to encrypt that contact's key piece
 *  - the PRIVATE key is encrypted with the contact's passphrase before upload, so the server cannot use it
 *
 * RSA-OAEP can encrypt up to ~318 bytes with a 3072-bit key; a Shamir share of a 256-bit key is 33 bytes.
 */
const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;
const AAD_PRIVATE_KEY = 'contact:privateKey';

export interface ContactKeyMaterial {
  publicKey: string; // SPKI, base64
  wrappedPrivateKey: Sealed; // PKCS8 encrypted with a key derived from the passphrase
  kdfSalt: string;
  kdfParams: KdfParams;
}

async function passphraseKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', utf8(passphrase.normalize('NFKC')) as BufferSource, 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createContactKeyMaterial(
  passphrase: string,
  iterations = DEFAULT_KDF.iterations,
): Promise<ContactKeyMaterial> {
  const pair = (await crypto.subtle.generateKey(
    { ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['encrypt', 'decrypt'],
  )) as CryptoKeyPair;

  const salt = randomBytes(16);
  const wrapKey = await passphraseKey(passphrase, salt, iterations);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const { ct, iv } = await sealBytes(wrapKey, pkcs8, AAD_PRIVATE_KEY);
  pkcs8.fill(0);

  return {
    publicKey: toB64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    wrappedPrivateKey: { ct: toB64(ct), iv },
    kdfSalt: toB64(salt),
    kdfParams: { algo: 'PBKDF2-SHA256', iterations },
  };
}

/** Throws if the passphrase is wrong or the blob was modified. */
export async function unwrapContactPrivateKey(
  m: Pick<ContactKeyMaterial, 'wrappedPrivateKey' | 'kdfSalt' | 'kdfParams'>,
  passphrase: string,
): Promise<CryptoKey> {
  const wrapKey = await passphraseKey(passphrase, fromB64(m.kdfSalt), m.kdfParams.iterations);
  const pkcs8 = await openBytes(wrapKey, fromB64(m.wrappedPrivateKey.ct), m.wrappedPrivateKey.iv, AAD_PRIVATE_KEY);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, RSA, false, ['decrypt']);
  pkcs8.fill(0);
  return key;
}

export async function encryptShareFor(publicKeyB64: string, share: Uint8Array): Promise<string> {
  const pub = await crypto.subtle.importKey('spki', fromB64(publicKeyB64) as BufferSource, RSA, false, ['encrypt']);
  return toB64(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, share as BufferSource));
}

export async function decryptShare(privateKey: CryptoKey, encryptedShareB64: string): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, fromB64(encryptedShareB64) as BufferSource);
  return new Uint8Array(pt);
}

/**
 * Short code a human can read over a phone call. The server is not trusted, so a malicious server could swap
 * a contact's public key for its own. The owner compares this code with what the contact sees on their screen
 * BEFORE any key piece is encrypted to that key.
 * 16 bytes (128 bits) of SHA-256, shown as 8 groups of 4 hex characters.
 */
export async function fingerprint(publicKeyB64: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', fromB64(publicKeyB64) as BufferSource));
  const hex = Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return hex.match(/.{4}/g)!.join(' ');
}
