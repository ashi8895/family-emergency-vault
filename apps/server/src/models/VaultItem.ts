import { Schema, model, type Types } from 'mongoose';
import { sealedSchema, type Sealed } from './User.js';

export interface IAttachment {
  fileId: Types.ObjectId;
  nameEnc: Sealed;
  size: number;
}

export interface IVaultItem {
  ownerId: Types.ObjectId;
  // Category stays in plaintext on purpose: Phase 4 needs the server to enforce
  // "this contact may only see Medical". Trade-off: the server learns the category, never the content.
  category: string;
  titleEnc: Sealed;
  notesEnc: Sealed;
  instructionsEnc: Sealed;
  attachments: IAttachment[];
}

const attachmentSchema = new Schema<IAttachment>(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'EncryptedFile', required: true },
    nameEnc: { type: sealedSchema, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

const vaultItemSchema = new Schema<IVaultItem>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, required: true },
    titleEnc: { type: sealedSchema, required: true },
    notesEnc: { type: sealedSchema, required: true },
    instructionsEnc: { type: sealedSchema, required: true },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { timestamps: true },
);

export const VaultItem = model<IVaultItem>('VaultItem', vaultItemSchema);
