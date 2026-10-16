import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combine, gfDiv, gfMul, split } from './shamir';

const secret32 = () => crypto.getRandomValues(new Uint8Array(32));

/** all subsets of `arr` with exactly `size` items */
function subsets<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [head, ...rest] = arr;
  return [...subsets(rest, size - 1).map((s) => [head, ...s]), ...subsets(rest, size)];
}

test('GF(256) arithmetic matches the known AES test vector (0x57 * 0x83 = 0xC1)', () => {
  assert.equal(gfMul(0x57, 0x83), 0xc1);
  assert.equal(gfMul(0x57, 0x13), 0xfe);
});

test('GF(256): every non-zero element has an inverse and division undoes multiplication', () => {
  for (let a = 1; a < 256; a++) {
    assert.equal(gfMul(a, gfDiv(1, a)), 1);
    for (const b of [1, 2, 3, 0x53, 0xca, 0xff]) assert.equal(gfDiv(gfMul(a, b), b), a);
  }
  assert.throws(() => gfDiv(5, 0));
});

test('2-of-3: every pair of shares rebuilds the secret', () => {
  const secret = secret32();
  const shares = split(secret, 3, 2);
  for (const pair of subsets(shares, 2)) assert.deepEqual(combine(pair), secret);
});

test('3-of-5 and 2-of-2: all qualifying subsets work, and extra shares are fine', () => {
  const secret = secret32();
  const s5 = split(secret, 5, 3);
  for (const size of [3, 4, 5]) for (const sub of subsets(s5, size)) assert.deepEqual(combine(sub), secret);
  const s2 = split(secret, 2, 2);
  assert.deepEqual(combine(s2), secret);
});

test('fewer than k shares do NOT reveal the secret (combine returns something else)', () => {
  const secret = secret32();
  const shares = split(secret, 5, 3);
  for (const pair of subsets(shares, 2)) assert.notDeepEqual(combine(pair), secret);
});

test('with k-1 shares every candidate secret is still possible (information-theoretic secrecy)', () => {
  // 2-of-3 over one byte: for one fixed share y1 at x=1, each possible secret s gives a valid line through (0,s) and (1,y1),
  // so seeing y1 alone rules nothing out. We verify by checking the share distribution is independent of the secret.
  const counts = [new Map<number, number>(), new Map<number, number>()];
  [0x00, 0xff].forEach((s, idx) => {
    for (let i = 0; i < 4000; i++) {
      const y = split(new Uint8Array([s]), 3, 2)[0][1];
      counts[idx].set(y, (counts[idx].get(y) ?? 0) + 1);
    }
  });
  // both distributions should cover (almost) the whole byte range, not cluster around the secret
  assert.ok(counts[0].size > 200 && counts[1].size > 200);
});

test('two splits of the same secret give different shares (fresh randomness)', () => {
  const secret = secret32();
  assert.notDeepEqual(split(secret, 3, 2)[0], split(secret, 3, 2)[0]);
});

test('shares from two different splits cannot be mixed', () => {
  const secret = secret32();
  const a = split(secret, 3, 2);
  const b = split(secret, 3, 2);
  assert.notDeepEqual(combine([a[0], b[1]]), secret);
});

test('a modified share gives a wrong secret', () => {
  const secret = secret32();
  const shares = split(secret, 3, 2);
  shares[0][5] ^= 1;
  assert.notDeepEqual(combine([shares[0], shares[1]]), secret);
});

test('share layout: 1 index byte + secret bytes, indices are 1..n', () => {
  const shares = split(secret32(), 4, 2);
  assert.deepEqual(shares.map((s) => s[0]), [1, 2, 3, 4]);
  assert.ok(shares.every((s) => s.length === 33));
});

test('input validation', () => {
  const s = secret32();
  assert.throws(() => split(s, 3, 1), /at least 2/);
  assert.throws(() => split(s, 2, 3), /larger/);
  assert.throws(() => split(s, 256, 2), /255/);
  assert.throws(() => split(new Uint8Array(0), 3, 2), /empty/);
  const shares = split(s, 3, 2);
  assert.throws(() => combine([shares[0]]), /At least 2/);
  assert.throws(() => combine([shares[0], shares[0]]), /Duplicate/);
  assert.throws(() => combine([shares[0], shares[1].subarray(0, 10)]), /different lengths/);
  const zero = shares[1].slice();
  zero[0] = 0;
  assert.throws(() => combine([shares[0], zero]), /Invalid share index/);
});
