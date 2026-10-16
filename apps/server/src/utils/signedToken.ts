import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless signed links for emails: token = base64url(parts joined by "|") + "." + HMAC-SHA256.
 * The signature stops anyone from forging or editing a link. Whether a link is still usable is decided by the
 * database (a rotated cycleId, a closed case), so each link is effectively single-use without storing the token.
 */
const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function signToken(secret: string, parts: string[]): string {
  if (parts.length === 0 || parts.some((p) => p.includes('|') || p.includes('.'))) {
    throw new Error('Token parts must be non-empty and must not contain "|" or "."');
  }
  const payload = Buffer.from(parts.join('|'), 'utf8').toString('base64url');
  return `${payload}.${mac(secret, payload)}`;
}

/** Returns the parts if the signature is valid, otherwise null. */
export function verifyToken(secret: string, token: string): string[] | null {
  const pieces = token.split('.');
  if (pieces.length !== 2) return null;
  const [payload, sig] = pieces;
  if (!payload || !sig) return null;

  const expected = Buffer.from(mac(secret, payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return Buffer.from(payload, 'base64url').toString('utf8').split('|');
}
