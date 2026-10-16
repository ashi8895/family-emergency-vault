import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePiece, encodePiece, PieceCodeError } from './pieceCode';
import { split } from './shamir';

const piece = () => crypto.getRandomValues(new Uint8Array(33));

test('round trip, shape is 14 groups of 4', async () => {
  for (let i = 0; i < 20; i++) {
    const p = piece();
    const code = await encodePiece(p);
    assert.match(code, /^([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.deepEqual(await decodePiece(code), p);
  }
});

test('forgiving input: lower case, spaces, line breaks, O/I/L look-alikes', async () => {
  const p = piece();
  const code = await encodePiece(p);
  assert.deepEqual(await decodePiece(code.toLowerCase()), p);
  assert.deepEqual(await decodePiece(code.replace(/-/g, ' ')), p);
  assert.deepEqual(await decodePiece(code.replace(/-/g, '\n')), p);
  assert.deepEqual(await decodePiece(`  ${code}  `), p);
  const confusing = code.replace(/0/g, 'O').replace(/1/g, 'l');
  assert.deepEqual(await decodePiece(confusing), p);
});

test('a single wrong character is caught by the checksum', async () => {
  const code = await encodePiece(piece());
  let caught = 0;
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (let pos = 0; pos < code.length; pos++) {
    if (code[pos] === '-') continue;
    const other = alphabet[(alphabet.indexOf(code[pos]) + 7) % 32];
    const typo = code.slice(0, pos) + other + code.slice(pos + 1);
    try {
      await decodePiece(typo);
    } catch (e) {
      if (e instanceof PieceCodeError && e.kind === 'checksum') caught++;
    }
  }
  assert.ok(caught >= 55, `only ${caught} of 56 single-character typos were caught`);
});

test('wrong length or characters is a format error', async () => {
  for (const bad of ['', 'ABCD', 'U'.repeat(56), '!'.repeat(56), (await encodePiece(piece())).slice(0, -5)]) {
    await assert.rejects(() => decodePiece(bad), (e: unknown) => e instanceof PieceCodeError && e.kind === 'format');
  }
});

test('size is enforced when encoding', async () => {
  await assert.rejects(() => encodePiece(new Uint8Array(32)));
});

test('real Shamir pieces survive the trip through codes', async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const pieces = split(secret, 3, 2);
  const codes = await Promise.all(pieces.map(encodePiece));
  const back = await Promise.all(codes.map(decodePiece));
  back.forEach((b, i) => assert.deepEqual(b, pieces[i]));
});
