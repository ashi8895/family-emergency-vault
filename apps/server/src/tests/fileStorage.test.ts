import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import { test } from 'node:test';
import { diskStorage, gridFsStorage, type GridBucketLike } from '../utils/fileStorage.js';

const ID = 'a'.repeat(24);
const read = async (s: Readable) => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(Buffer.from(c as Buffer));
  return Buffer.concat(parts);
};

test('disk: save, read back, remove; remove of a missing file is fine', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fev-'));
  const st = diskStorage(path.join(dir, 'nested', 'uploads')); // creates the folder
  const data = randomBytes(5000);
  await st.save(ID, data);
  assert.deepEqual(await read(st.read(ID)), data);
  await st.remove(ID);
  await st.remove(ID);
  assert.equal(fs.readdirSync(path.join(dir, 'nested', 'uploads')).length, 0);
});

test('disk: never overwrites, and ids that could be paths are refused', async () => {
  const st = diskStorage(fs.mkdtempSync(path.join(os.tmpdir(), 'fev-')));
  await st.save(ID, Buffer.from('first'));
  await assert.rejects(() => st.save(ID, Buffer.from('second')), /EEXIST/);
  assert.equal((await read(st.read(ID))).toString(), 'first');
  for (const bad of ['../etc/passwd', '..\\x', 'a/b', '', 'zz'.repeat(12), ID + 'x']) {
    await assert.rejects(() => st.save(bad, Buffer.from('x')), /Invalid file id/);
    assert.throws(() => st.read(bad), /Invalid file id/);
    await assert.rejects(() => st.remove(bad), /Invalid file id/);
  }
});

/** In-memory stand-in with the same shape as mongodb's GridFSBucket. */
function fakeBucket() {
  const files = new Map<string, Buffer>();
  const key = (id: unknown) => String((id as { v: string }).v);
  const bucket: GridBucketLike = {
    openUploadStreamWithId(id) {
      const chunks: Buffer[] = [];
      const w = new PassThrough();
      w.on('data', (c) => chunks.push(c));
      w.on('end', () => files.set(key(id), Buffer.concat(chunks)));
      return w;
    },
    openDownloadStream(id) {
      const f = files.get(key(id));
      return Readable.from(f ? [f] : (async function* () { throw Object.assign(new Error('FileNotFound: no such file'), { name: 'MongoRuntimeError' }); })());
    },
    async delete(id) {
      if (!files.delete(key(id))) throw Object.assign(new Error(`FileNotFound: file ${key(id)} was not found`), { name: 'MongoRuntimeError' });
    },
  };
  return { bucket, files };
}

test('gridfs adapter: round trip, id conversion, and idempotent delete', async () => {
  const { bucket, files } = fakeBucket();
  const seen: unknown[] = [];
  const st = gridFsStorage(() => bucket, (id) => (seen.push(id), { v: id }));
  const data = randomBytes(70_000);
  await st.save(ID, data);
  assert.deepEqual(await read(st.read(ID)), data);
  assert.ok(seen.every((x) => x === ID));
  await st.remove(ID);
  assert.equal(files.size, 0);
  await st.remove(ID); // already gone: no error
});

test('gridfs adapter: refuses bad ids, surfaces real errors, reports upload failures', async () => {
  const { bucket } = fakeBucket();
  const st = gridFsStorage(() => bucket, (id) => ({ v: id }));
  await assert.rejects(() => st.save('../x', Buffer.from('x')), /Invalid file id/);
  await assert.rejects(() => gridFsStorage(() => ({ ...bucket, delete: async () => { throw new Error('connection lost'); } }), (id) => ({ v: id })).remove(ID), /connection lost/);
  // a writable whose write fails: emits 'error' and never 'finish', like a real broken upload stream
  const failing: GridBucketLike = { ...bucket, openUploadStreamWithId: () => new Writable({ write(_chunk, _enc, cb) { cb(new Error('disk full')); } }) };
  await assert.rejects(() => gridFsStorage(() => failing, (id) => ({ v: id })).save(ID, Buffer.from('x')), /disk full/);
});
