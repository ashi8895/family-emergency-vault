import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { openSecret, sealSecret } from '../utils/secretBox.js';

const key = randomBytes(32);

test('round trip', () => assert.equal(openSecret(key, sealSecret(key, 'JBSWY3DPEHPK3PXP')), 'JBSWY3DPEHPK3PXP'));

test('every seal is different (fresh IV) and hides the plaintext', () => {
  const a = sealSecret(key, 'same');
  assert.notEqual(a, sealSecret(key, 'same'));
  assert.ok(!a.includes('same'));
});

test('wrong key, wrong aad, tampered or malformed token all throw', () => {
  const t = sealSecret(key, 'secret', 'totp');
  assert.throws(() => openSecret(randomBytes(32), t, 'totp'));
  assert.throws(() => openSecret(key, t, 'other'));
  const parts = t.split('.');
  parts[2] = Buffer.from('xxxxxxxx').toString('base64url');
  assert.throws(() => openSecret(key, parts.join('.'), 'totp'));
  assert.throws(() => openSecret(key, 'garbage', 'totp'));
});
