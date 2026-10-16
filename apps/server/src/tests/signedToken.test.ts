import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signToken, verifyToken } from '../utils/signedToken.js';

const SECRET = 's'.repeat(48);

test('round trip returns the same parts', () => {
  const token = signToken(SECRET, ['alive', '64b7f0f2a1b2c3d4e5f60718', 'abc123']);
  assert.deepEqual(verifyToken(SECRET, token), ['alive', '64b7f0f2a1b2c3d4e5f60718', 'abc123']);
});

test('token is url-safe', () => {
  assert.match(signToken(SECRET, ['approve', 'x', 'y']), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
});

test('wrong secret is rejected', () => {
  assert.equal(verifyToken('t'.repeat(48), signToken(SECRET, ['alive', 'a', 'b'])), null);
});

test('editing the payload is rejected (cannot swap in another user id)', () => {
  const token = signToken(SECRET, ['alive', 'user1', 'cycle1']);
  const forged = Buffer.from('alive|user2|cycle1').toString('base64url') + '.' + token.split('.')[1];
  assert.equal(verifyToken(SECRET, forged), null);
});

test('editing the signature is rejected', () => {
  const [payload, sig] = signToken(SECRET, ['alive', 'a', 'b']).split('.');
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(verifyToken(SECRET, `${payload}.${flipped}`), null);
});

test('garbage input returns null instead of throwing', () => {
  for (const bad of ['', 'abc', '.', 'a.b.c', 'a.', '.b', '%%%.%%%']) assert.equal(verifyToken(SECRET, bad), null);
});

test('parts may not contain separators', () => {
  assert.throws(() => signToken(SECRET, ['a|b']));
  assert.throws(() => signToken(SECRET, ['a.b']));
  assert.throws(() => signToken(SECRET, []));
});
