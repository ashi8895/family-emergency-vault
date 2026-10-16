import { createHash, randomInt } from 'node:crypto';

/** One-time backup codes for when the authenticator phone is lost. 10 characters from a 30-letter alphabet (~49 bits). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no I, L, O, U, 0, 1: easy to read from paper

export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, '');

/** Only the hash is stored. The codes are high-entropy random, so a plain SHA-256 is enough. */
export const hashRecoveryCode = (code: string) => createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

export function generateRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const raw = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
