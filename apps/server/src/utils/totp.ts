import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/** RFC 4648 base32 (what authenticator apps expect for the shared secret). */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20)); // 160 bits, as recommended by RFC 4226

/** HOTP (RFC 4226): HMAC-SHA1 of the counter, then "dynamic truncation" to a few digits. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[19] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const STEP_SECONDS = 30;
export const stepAt = (timeMs: number) => Math.floor(timeMs / 1000 / STEP_SECONDS);

/** TOTP (RFC 6238) = HOTP with the counter being "which 30-second slot are we in". */
export const totpAt = (secretB32: string, timeMs: number, digits = 6) => hotp(base32Decode(secretB32), stepAt(timeMs), digits);

/**
 * Accepts the current code and one slot either side (clock drift). `lastUsedStep` blocks replay: a code that was
 * already accepted (or any older slot) can never be used again, even inside its validity window.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  nowMs: number,
  opts: { window?: number; lastUsedStep?: number | null } = {},
): { ok: true; step: number } | { ok: false } {
  if (!/^\d{6}$/.test(code)) return { ok: false };
  const secret = base32Decode(secretB32);
  const window = opts.window ?? 1;
  const now = stepAt(nowMs);
  for (let w = -window; w <= window; w++) {
    const step = now + w;
    if (opts.lastUsedStep != null && step <= opts.lastUsedStep) continue;
    const expected = Buffer.from(hotp(secret, step));
    const given = Buffer.from(code);
    if (expected.length === given.length && timingSafeEqual(expected, given)) return { ok: true, step };
  }
  return { ok: false };
}

export function otpauthUri(secretB32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
