import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from '../utils/recoveryCodes.js';

test('8 unique codes in XXXXX-XXXXX form without look-alike characters', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) assert.match(c, /^[A-HJKMNP-TV-Z2-9]{5}-[A-HJKMNP-TV-Z2-9]{5}$/);
});

test('hashing ignores case, dashes and spaces, and differs between codes', () => {
  assert.equal(hashRecoveryCode('abcde-fghjk'), hashRecoveryCode('ABCDE FGHJK'));
  assert.equal(normalizeRecoveryCode(' ab-cd '), 'ABCD');
  assert.notEqual(hashRecoveryCode('AAAAA-AAAAA'), hashRecoveryCode('AAAAA-AAAAB'));
  assert.match(hashRecoveryCode('AAAAA-AAAAA'), /^[0-9a-f]{64}$/);
});
