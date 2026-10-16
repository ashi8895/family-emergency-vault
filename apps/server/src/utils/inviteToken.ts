import { createHash, randomBytes } from 'node:crypto';

export const INVITE_TTL_DAYS = 7;

/** 256-bit random token. Only its SHA-256 is stored, so a database leak does not expose usable invite links. */
export function newInviteToken() {
  const token = randomBytes(32).toString('base64url'); // 43 chars
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000) };
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
