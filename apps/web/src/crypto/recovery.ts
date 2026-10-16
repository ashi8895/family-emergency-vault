import { openText, sealText, type Sealed } from './aes';
import { encryptShareFor } from './keypair';
import { combine, split } from './shamir';

/**
 * Glue between the vault key and Shamir sharing.
 *
 * Shamir returns garbage (not an error) when given too few or mismatched shares, so we store a "key check":
 * a known sentence encrypted with the real vault key. After rebuilding a candidate key we try to decrypt it.
 * Success means the pieces were right. Failure means wrong, too few, or mixed-generation pieces.
 */
const KEY_CHECK_TEXT = 'fev-key-check-v1';
const AAD_KEY_CHECK = 'vault:keyCheck';

export interface EncryptedShare {
  contactId: string;
  encryptedShare: string; // base64 RSA-OAEP ciphertext, only the contact's private key can open it
}

export interface ShareSet {
  keyCheck: Sealed;
  shares: EncryptedShare[];
}

const importVaultKey = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export async function createShareSet(
  vk: CryptoKey,
  contacts: { id: string; publicKey: string }[],
  threshold: number,
): Promise<ShareSet> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', vk));
  try {
    const pieces = split(raw, contacts.length, threshold);
    const shares = await Promise.all(
      contacts.map(async (c, i) => ({ contactId: c.id, encryptedShare: await encryptShareFor(c.publicKey, pieces[i]) })),
    );
    pieces.forEach((p) => p.fill(0));
    return { keyCheck: await sealText(vk, KEY_CHECK_TEXT, AAD_KEY_CHECK), shares };
  } finally {
    raw.fill(0);
  }
}

/** Rebuild the vault key from decrypted pieces. Throws if they do not open the vault. */
export async function recoverVaultKey(pieces: Uint8Array[], keyCheck: Sealed): Promise<CryptoKey> {
  const raw = combine(pieces);
  const candidate = await importVaultKey(raw);
  raw.fill(0);
  try {
    if ((await openText(candidate, keyCheck, AAD_KEY_CHECK)) === KEY_CHECK_TEXT) return candidate;
  } catch {
    /* fall through */
  }
  throw new Error('These key pieces do not open the vault');
}
