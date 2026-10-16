import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * The browser never sends the master password. It sends `authKey`, a 256-bit value derived
 * with PBKDF2 + HKDF. We still hash authKey again on the server (defence in depth): if the
 * database leaks, the stored hash cannot be replayed as a login credential.
 *
 * scrypt is memory-hard and ships with Node, so there is no native module to compile.
 */
const N = 2 ** 15;
const OPTS: ScryptOptions = { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

function scryptAsync(secret: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashAuthKey(authKeyB64: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(authKeyB64, salt, OPTS);
  return `scrypt$${N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyAuthKey(authKeyB64: string, stored: string): Promise<boolean> {
  const [scheme, n, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(authKeyB64, Buffer.from(saltB64, 'base64'), {
    ...OPTS,
    N: Number(n),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
