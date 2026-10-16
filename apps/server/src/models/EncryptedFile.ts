import { Schema, model, type Types } from 'mongoose';

export interface IEncryptedFile {
  ownerId: Types.ObjectId;
  itemId?: Types.ObjectId; // null until the item that references it is saved (lets a cleanup job find orphans)
  iv: string;
  size: number; // ciphertext bytes on disk
}

const encryptedFileSchema = new Schema<IEncryptedFile>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'VaultItem', default: null },
    iv: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true },
);

// The blob lives on disk at UPLOAD_DIR/<_id>. The file name is our own ObjectId,
// never anything the client sent, so there is no path traversal surface.
export const EncryptedFile = model<IEncryptedFile>('EncryptedFile', encryptedFileSchema);
