import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM for small server-side secrets (the TOTP seed) so a database leak alone does not expose them. */
export function sealSecret(key: Buffer, plaintext: string, aad = 'fev'): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), ct.toString('base64url'), c.getAuthTag().toString('base64url')].join('.');
}

/** Throws if the key, the aad, or any byte of the token is wrong. */
export function openSecret(key: Buffer, token: string, aad = 'fev'): string {
  const [v, iv, ct, tag] = token.split('.');
  if (v !== 'v1' || !iv || !ct || !tag) throw new Error('Bad secret format');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
