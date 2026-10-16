import { fromB64, fromUtf8, randomBytes, toB64, utf8 } from './encoding';

/** AES-256-GCM output as stored on the server: ciphertext (with 16-byte auth tag) + 12-byte IV, base64. */
export interface Sealed {
  ct: string;
  iv: string;
}

const IV_BYTES = 12;

/** A fresh random 256-bit vault key. Extractable so Phase 2 can split it with Shamir's Secret Sharing. */
export const generateVaultKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

/**
 * `aad` (additional authenticated data) is not encrypted but is bound into the auth tag.
 * We use a different label per field, so a malicious server cannot swap the "notes"
 * ciphertext into the "title" slot: decryption would fail instead of silently succeeding.
 */
async function encrypt(key: CryptoKey, data: Uint8Array, aad: string) {
  const iv = randomBytes(IV_BYTES); // never reuse an IV with the same key
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource },
    key,
    data as BufferSource,
  );
  return { ct: new Uint8Array(ct), iv };
}

async function decrypt(key: CryptoKey, ct: Uint8Array, iv: Uint8Array, aad: string) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource },
    key,
    ct as BufferSource,
  );
  return new Uint8Array(pt);
}

export async function sealText(key: CryptoKey, plaintext: string, aad: string): Promise<Sealed> {
  const { ct, iv } = await encrypt(key, utf8(plaintext), aad);
  return { ct: toB64(ct), iv: toB64(iv) };
}

export async function openText(key: CryptoKey, sealed: Sealed, aad: string): Promise<string> {
  return fromUtf8(await decrypt(key, fromB64(sealed.ct), fromB64(sealed.iv), aad));
}

export async function sealBytes(key: CryptoKey, data: Uint8Array, aad: string) {
  const { ct, iv } = await encrypt(key, data, aad);
  return { ct, iv: toB64(iv) };
}

export const openBytes = (key: CryptoKey, ct: Uint8Array, ivB64: string, aad: string) =>
  decrypt(key, ct, fromB64(ivB64), aad);

const AAD_WRAPPED_VK = 'vault:wrappedVK';

/** Encrypt the vault key with the KEK so the server can store it without being able to use it. */
export async function wrapVaultKey(vk: CryptoKey, kek: CryptoKey): Promise<Sealed> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', vk));
  const { ct, iv } = await encrypt(kek, raw, AAD_WRAPPED_VK);
  raw.fill(0); // best-effort wipe of the raw key bytes
  return { ct: toB64(ct), iv: toB64(iv) };
}

/** Throws if the KEK is wrong (wrong password) or the blob was tampered with. */
export async function unwrapVaultKey(sealed: Sealed, kek: CryptoKey): Promise<CryptoKey> {
  const raw = await decrypt(kek, fromB64(sealed.ct), fromB64(sealed.iv), AAD_WRAPPED_VK);
  const vk = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  raw.fill(0);
  return vk;
}
