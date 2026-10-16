import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';

/**
 * Where the ENCRYPTED file bytes live. The database keeps only metadata. Two interchangeable backends:
 *  - disk:    simplest, perfect for local development
 *  - gridfs:  stored inside MongoDB, so it survives redeploys on hosts with a throw-away disk (Render free tier)
 */
export interface FileStorage {
  save(id: string, data: Buffer): Promise<void>;
  read(id: string): Readable;
  remove(id: string): Promise<void>;
}

/** Ids are our own ObjectIds. Refuse anything else so a bad id can never become a path. */
const SAFE_ID = /^[a-f0-9]{24}$/i;
const assertSafe = (id: string) => {
  if (!SAFE_ID.test(id)) throw new Error('Invalid file id');
  return id;
};

export function diskStorage(dir: string): FileStorage {
  fs.mkdirSync(dir, { recursive: true });
  const pathOf = (id: string) => path.join(dir, assertSafe(id));
  return {
    // async on purpose: a bad id is always a rejected promise, never a synchronous throw.
    // flag "wx": fail instead of overwriting, so an id can never silently replace someone's file
    save: async (id, data) => fsp.writeFile(pathOf(id), data, { flag: 'wx' }),
    read: (id) => fs.createReadStream(pathOf(id)),
    remove: async (id) => fsp.rm(pathOf(id), { force: true }),
  };
}

/** The small part of mongodb's GridFSBucket we use. A structural type keeps this file free of the mongodb package. */
export interface GridBucketLike {
  openUploadStreamWithId(id: unknown, filename: string): Writable;
  openDownloadStream(id: unknown): Readable;
  delete(id: unknown): Promise<void>;
}

export function gridFsStorage(bucket: () => GridBucketLike, toId: (id: string) => unknown): FileStorage {
  return {
    save: (id, data) =>
      new Promise<void>((resolve, reject) => {
        const up = bucket().openUploadStreamWithId(toId(assertSafe(id)), id);
        up.once('error', reject);
        up.once('finish', () => resolve());
        up.end(data);
      }),
    read: (id) => bucket().openDownloadStream(toId(assertSafe(id))),
    remove: async (id) => {
      try {
        await bucket().delete(toId(assertSafe(id)));
      } catch (e) {
        // Removing something that is already gone is fine (same as rm -f)
        if (!/not\s*found|ENOENT/i.test(e instanceof Error ? `${e.name} ${e.message}` : '')) throw e;
      }
    },
  };
}
