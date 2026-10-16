import { createHmac } from 'node:crypto';

export const DEFAULT_KDF = { algo: 'PBKDF2-SHA256', iterations: 600_000 } as const;

/**
 * /auth/prelogin must return a KDF salt BEFORE the client can derive its authKey.
 * For unknown emails we return a deterministic fake salt (HMAC of the email with a server
 * secret) so an attacker cannot tell registered and unregistered emails apart.
 */
export function fakeSalt(email: string, secret: string): string {
  return createHmac('sha256', secret).update(email.toLowerCase()).digest().subarray(0, 16).toString('base64');
}
