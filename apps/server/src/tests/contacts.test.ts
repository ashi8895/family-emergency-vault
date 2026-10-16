import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { hashToken, newInviteToken } from '../utils/inviteToken.js';
import { isAcceptableRsaPublicKey } from '../utils/publicKey.js';

const der = (key: { export(o: { type: 'spki'; format: 'der' }): Buffer | string }) => (key.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64');
const rsaSpki = (modulusLength: number) => der(generateKeyPairSync('rsa', { modulusLength }).publicKey);
const ecSpki = () => der(generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey);

test('invite token: 43-char url-safe string, stored as hash, unique each time', () => {
  const a = newInviteToken();
  const b = newInviteToken();
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
  assert.notEqual(a.token, b.token);
  assert.ok(a.expiresAt.getTime() > Date.now() + 6 * 24 * 3600 * 1000);
});

test('public key check accepts RSA-3072 and rejects weaker or wrong keys', () => {
  assert.equal(isAcceptableRsaPublicKey(rsaSpki(3072)), true);
  assert.equal(isAcceptableRsaPublicKey(rsaSpki(2048)), false);
  assert.equal(isAcceptableRsaPublicKey(ecSpki()), false);
  assert.equal(isAcceptableRsaPublicKey('bm90LWEta2V5'), false);
  assert.equal(isAcceptableRsaPublicKey(''), false);
});
