import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateVaultKey, openText, sealText, unwrapVaultKey, wrapVaultKey } from './aes';
import { fromB64, toB64 } from './encoding';
import { deriveKeys } from './kdf';
import { createAccountMaterial, deriveLoginKeys, openFile, openItem, sealFile, sealItem, type PlainItem } from './vault';

// crypto.getRandomValues() refuses buffers over 65,536 bytes, so fill big test buffers in chunks.
function randomBig(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65_536) crypto.getRandomValues(out.subarray(i, Math.min(i + 65_536, n)));
  return out;
}

const FAST = 1000; // PBKDF2 iterations for tests only; production uses 600k

test('base64 round-trips arbitrary bytes, including large buffers', () => {
  const big = randomBig(200_000);
  assert.deepEqual(fromB64(toB64(big)), big);
});

test('seal/open round-trip incl. Hindi text', async () => {
  const key = await generateVaultKey();
  const text = 'LIC पॉलिसी नंबर 123456, नॉमिनी: मम्मी';
  assert.equal(await openText(key, await sealText(key, text, 'a'), 'a'), text);
});

test('same plaintext gives different ciphertext (random IV)', async () => {
  const key = await generateVaultKey();
  const a = await sealText(key, 'hello', 'a');
  const b = await sealText(key, 'hello', 'a');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test('wrong AAD is rejected (field swapping is detected)', async () => {
  const key = await generateVaultKey();
  const sealed = await sealText(key, 'secret notes', 'item:notes');
  await assert.rejects(() => openText(key, sealed, 'item:title'));
});

test('tampered ciphertext is rejected', async () => {
  const key = await generateVaultKey();
  const sealed = await sealText(key, 'secret', 'a');
  const bytes = fromB64(sealed.ct);
  bytes[0] ^= 1;
  await assert.rejects(() => openText(key, { ...sealed, ct: toB64(bytes) }, 'a'));
});

test('wrong key is rejected', async () => {
  const sealed = await sealText(await generateVaultKey(), 'secret', 'a');
  const other = await generateVaultKey();
  await assert.rejects(() => openText(other, sealed, 'a'));
});

test('deriveKeys is deterministic and password-dependent', async () => {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const a1 = await deriveKeys('correct horse battery', salt, FAST);
  const a2 = await deriveKeys('correct horse battery', salt, FAST);
  const b = await deriveKeys('different password!!', salt, FAST);
  assert.equal(a1.authKey, a2.authKey);
  assert.notEqual(a1.authKey, b.authKey);
  assert.equal(fromB64(a1.authKey).length, 32);
});

test('KEK is not extractable (cannot leave the browser)', async () => {
  const { kek } = await deriveKeys('some password 123', toB64(new Uint8Array(16)), FAST);
  assert.equal(kek.extractable, false);
  await assert.rejects(() => crypto.subtle.exportKey('raw', kek));
});

test('wrap/unwrap vault key: right password opens, wrong password fails', async () => {
  const mat = await createAccountMaterial('my master password 1', FAST);
  const right = await deriveLoginKeys('my master password 1', mat.kdfSalt, mat.kdfParams);
  const vk = await unwrapVaultKey(mat.wrappedVK, right.kek);

  // the unwrapped key decrypts what the original key encrypted
  const sealed = await sealText(mat.vk, 'proof', 'a');
  assert.equal(await openText(vk, sealed, 'a'), 'proof');

  const wrong = await deriveLoginKeys('not the password!!', mat.kdfSalt, mat.kdfParams);
  await assert.rejects(() => unwrapVaultKey(mat.wrappedVK, wrong.kek));
});

test('wrapVaultKey output is not the raw key', async () => {
  const vk = await generateVaultKey();
  const raw = toB64(await crypto.subtle.exportKey('raw', vk));
  const { kek } = await deriveKeys('pw for wrapping 12', toB64(new Uint8Array(16)), FAST);
  const wrapped = await wrapVaultKey(vk, kek);
  assert.ok(!wrapped.ct.includes(raw));
});

test('item seal/open round-trip', async () => {
  const vk = await generateVaultKey();
  const item: PlainItem = {
    category: 'insurance',
    title: 'LIC Jeevan Anand',
    notes: 'Policy at home almirah, top shelf',
    instructions: 'Call agent Ramesh: 98xxxxxx00',
    attachments: [{ fileId: '64b7f0f2a1b2c3d4e5f60718', name: 'policy.pdf', size: 1234 }],
  };
  const dto = { ...(await sealItem(vk, item)), id: 'x', updatedAt: new Date().toISOString() };
  const opened = await openItem(vk, dto);
  assert.deepEqual({ ...opened, id: undefined, updatedAt: undefined }, { ...item, id: undefined, updatedAt: undefined });
  // server-visible JSON must not contain plaintext
  assert.ok(!JSON.stringify(dto).includes('LIC Jeevan Anand'));
});

test('file seal/open round-trip for binary data', async () => {
  const vk = await generateVaultKey();
  const data = randomBig(100_000);
  const { ct, iv } = await sealFile(vk, data);
  assert.equal(ct.length, data.length + 16); // + GCM tag
  assert.deepEqual(await openFile(vk, ct, iv), data);
});
