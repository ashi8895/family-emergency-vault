import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createShareSet, recoverVaultKey } from './recovery';
import { decryptShare, createContactKeyMaterial, encryptShareFor, fingerprint, unwrapContactPrivateKey, type ContactKeyMaterial } from './keypair';
import { generateVaultKey, openText, sealText } from './aes';
import { fromB64 } from './encoding';

const FAST = 1000; // PBKDF2 iterations for tests only

let alice: ContactKeyMaterial, bob: ContactKeyMaterial, carol: ContactKeyMaterial;
before(async () => {
  [alice, bob, carol] = await Promise.all([
    createContactKeyMaterial('alice passphrase 1', FAST),
    createContactKeyMaterial('bob passphrase 22', FAST),
    createContactKeyMaterial('carol passphrase 3', FAST),
  ]);
});

test('public key is a 3072-bit RSA SPKI', () => {
  assert.ok(fromB64(alice.publicKey).length > 400);
});

test('share encrypted to a public key is opened only by the matching private key', async () => {
  const share = crypto.getRandomValues(new Uint8Array(33));
  const enc = await encryptShareFor(alice.publicKey, share);
  assert.deepEqual(await decryptShare(await unwrapContactPrivateKey(alice, 'alice passphrase 1'), enc), share);
  await assert.rejects(async () => decryptShare(await unwrapContactPrivateKey(bob, 'bob passphrase 22'), enc));
});

test('wrong passphrase cannot unwrap the private key', async () => {
  await assert.rejects(() => unwrapContactPrivateKey(alice, 'not the passphrase'));
});

test('unwrapped private key is non-extractable', async () => {
  const key = await unwrapContactPrivateKey(alice, 'alice passphrase 1');
  assert.equal(key.extractable, false);
});

test('server-visible material contains no private key bytes in the clear', () => {
  assert.ok(!JSON.stringify(alice).includes('PRIVATE'));
  assert.notEqual(alice.wrappedPrivateKey.ct.length, 0);
});

test('fingerprint: stable, 8 groups of 4 hex chars, differs per key', async () => {
  const f1 = await fingerprint(alice.publicKey);
  assert.equal(f1, await fingerprint(alice.publicKey));
  assert.match(f1, /^([0-9A-F]{4} ){7}[0-9A-F]{4}$/);
  assert.notEqual(f1, await fingerprint(bob.publicKey));
});

test('end to end: 2-of-3 pieces rebuild a working vault key, 1 piece does not', async () => {
  const vk = await generateVaultKey();
  const proof = await sealText(vk, 'family documents', 'a');
  const { keyCheck, shares } = await createShareSet(
    vk,
    [
      { id: 'a', publicKey: alice.publicKey },
      { id: 'b', publicKey: bob.publicKey },
      { id: 'c', publicKey: carol.publicKey },
    ],
    2,
  );

  const mats: Record<string, [ContactKeyMaterial, string]> = {
    a: [alice, 'alice passphrase 1'],
    b: [bob, 'bob passphrase 22'],
    c: [carol, 'carol passphrase 3'],
  };
  const piece = async (id: string) => {
    const [m, pass] = mats[id];
    const enc = shares.find((s) => s.contactId === id)!.encryptedShare;
    return decryptShare(await unwrapContactPrivateKey(m, pass), enc);
  };

  for (const pair of [['a', 'b'], ['a', 'c'], ['b', 'c']]) {
    const rebuilt = await recoverVaultKey(await Promise.all(pair.map(piece)), keyCheck);
    assert.equal(await openText(rebuilt, proof, 'a'), 'family documents');
  }

  // one piece: combine() needs 2 inputs, so pass the same piece twice -> rejected as duplicate
  await assert.rejects(async () => recoverVaultKey([await piece('a'), await piece('a')], keyCheck));
});

test('pieces from an old and a new share set cannot be combined', async () => {
  const vk = await generateVaultKey();
  const contacts = [
    { id: 'a', publicKey: alice.publicKey },
    { id: 'b', publicKey: bob.publicKey },
  ];
  const oldSet = await createShareSet(vk, contacts, 2);
  const newSet = await createShareSet(vk, contacts, 2);
  const open = async (m: ContactKeyMaterial, pass: string, enc: string) =>
    decryptShare(await unwrapContactPrivateKey(m, pass), enc);

  const oldA = await open(alice, 'alice passphrase 1', oldSet.shares[0].encryptedShare);
  const newB = await open(bob, 'bob passphrase 22', newSet.shares[1].encryptedShare);
  await assert.rejects(() => recoverVaultKey([oldA, newB], newSet.keyCheck), /do not open the vault/);
});
