import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUri, stepAt, totpAt, verifyTotp } from '../utils/totp.js';

// RFC 6238 appendix B test secret: ASCII "12345678901234567890" (SHA-1)
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('RFC 6238 test vectors (8 digits)', () => {
  const cases: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [t, code] of cases) assert.equal(totpAt(RFC_SECRET, t * 1000, 8), code);
});

test('6-digit codes are the last 6 digits of the 8-digit vectors', () => {
  assert.equal(totpAt(RFC_SECRET, 59_000), '287082');
});

test('RFC 4226 HOTP vectors', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.deepEqual([0, 1, 2, 3, 4].map((c) => hotp(secret, c)), ['755224', '287082', '359152', '969429', '338314']);
});

test('base32 round trip and tolerant decoding', () => {
  const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 9, 8, 7]);
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
  assert.deepEqual(base32Decode(base32Encode(buf).toLowerCase().replace(/(.{4})/g, '$1 ')), buf);
  assert.throws(() => base32Decode('abc1'));
  assert.equal(generateTotpSecret().length, 32);
});

test('verify accepts the current slot and one either side, but not two away', () => {
  const now = 1_700_000_000_000;
  for (const d of [-1, 0, 1]) assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + d * 30_000), now).ok, true);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 2 * 30_000), now).ok, false);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 2 * 30_000), now).ok, false);
});

test('replay protection: an accepted slot (and anything older) cannot be used again', () => {
  const now = 1_700_000_000_000;
  const code = totpAt(RFC_SECRET, now);
  const first = verifyTotp(RFC_SECRET, code, now);
  assert.ok(first.ok);
  assert.equal(first.ok && first.step, stepAt(now));
  assert.equal(verifyTotp(RFC_SECRET, code, now, { lastUsedStep: stepAt(now) }).ok, false);
  // a code from the previous slot is also dead once a later slot was used
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 30_000), now, { lastUsedStep: stepAt(now) }).ok, false);
  // the next slot is still fine
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 30_000), now, { lastUsedStep: stepAt(now) }).ok, true);
});

test('malformed codes are rejected without throwing', () => {
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 456', '１２３４５６']) assert.equal(verifyTotp(RFC_SECRET, bad, Date.now()).ok, false);
});

test('otpauth URI contains what an authenticator app needs', () => {
  const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'ashi@example.com', 'Family Emergency Vault');
  assert.match(uri, /^otpauth:\/\/totp\/Family%20Emergency%20Vault%3Aashi%40example\.com\?/);
  assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP') && uri.includes('period=30') && uri.includes('digits=6'));
});
