import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { diskStorage, gridFsStorage, type FileStorage } from '../utils/fileStorage.js';

/** One place decides where encrypted files go. Set STORAGE=gridfs when the host's disk is not permanent. */
export const storage: FileStorage =
  env.STORAGE === 'gridfs'
    ? gridFsStorage(
        () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'encrypted_files' }),
        (id) => new mongoose.Types.ObjectId(id),
      )
    : diskStorage(path.resolve(env.UPLOAD_DIR));
