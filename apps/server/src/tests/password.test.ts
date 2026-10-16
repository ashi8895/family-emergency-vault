import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashAuthKey, verifyAuthKey } from '../utils/password.js';
import { fakeSalt } from '../utils/prelogin.js';

const KEY_A = 'qZ3m2cP9vJt8Xw1sL0aB7nYd4eRfGh5uKiOp6TcVx2E=';
const KEY_B = 'aZ3m2cP9vJt8Xw1sL0aB7nYd4eRfGh5uKiOp6TcVx2E=';

test('verifyAuthKey accepts the right key and rejects a wrong one', async () => {
  const stored = await hashAuthKey(KEY_A);
  assert.equal(await verifyAuthKey(KEY_A, stored), true);
  assert.equal(await verifyAuthKey(KEY_B, stored), false);
});

test('same key hashes differently each time (random salt)', async () => {
  assert.notEqual(await hashAuthKey(KEY_A), await hashAuthKey(KEY_A));
});

test('malformed stored hash is rejected, not thrown', async () => {
  assert.equal(await verifyAuthKey(KEY_A, 'garbage'), false);
});

test('fakeSalt is deterministic per email and differs across emails', () => {
  const secret = 'x'.repeat(40);
  assert.equal(fakeSalt('a@b.com', secret), fakeSalt('A@B.com', secret));
  assert.notEqual(fakeSalt('a@b.com', secret), fakeSalt('c@d.com', secret));
  assert.match(fakeSalt('a@b.com', secret), /^[A-Za-z0-9+/]{22}==$/);
});
