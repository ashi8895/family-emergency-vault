import { Schema, model, type Types } from 'mongoose';
import { sealedSchema, type Sealed } from './User.js';

export type ContactStatus = 'INVITED' | 'ACCEPTED' | 'REVOKED';

export interface ITrustedContact {
  ownerId: Types.ObjectId;
  name: string;
  email: string;
  relation: string;
  status: ContactStatus;

  // invite (cleared once accepted or revoked)
  inviteTokenHash?: string;
  inviteExpiresAt?: Date;

  // set when the contact accepts. All of it is produced in the contact's browser.
  publicKey?: string; // RSA-3072 SPKI, base64
  wrappedPrivateKey?: Sealed; // private key encrypted with the contact's passphrase (server cannot use it)
  kdfSalt?: string;
  kdfParams?: { algo: string; iterations: number };
  acceptedAt?: Date;

  // set by the owner's browser: this contact's Shamir share encrypted to publicKey
  encryptedShare?: string;
  shareGeneration?: number;

  // Which drawers this person may read once the vault is open. Missing = all of them.
  allowedCategories?: string[];

  revokedAt?: Date;
}

const contactSchema = new Schema<ITrustedContact>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, trim: true },
    relation: { type: String, required: true, trim: true, maxlength: 40 },
    status: { type: String, enum: ['INVITED', 'ACCEPTED', 'REVOKED'], default: 'INVITED' },

    inviteTokenHash: { type: String, select: false, index: true, sparse: true },
    inviteExpiresAt: { type: Date },

    publicKey: { type: String },
    wrappedPrivateKey: { type: sealedSchema, select: false },
    kdfSalt: { type: String, select: false },
    kdfParams: { type: new Schema({ algo: String, iterations: Number }, { _id: false }), select: false },
    acceptedAt: { type: Date },

    encryptedShare: { type: String, select: false },
    shareGeneration: { type: Number },

    allowedCategories: { type: [String] },

    revokedAt: { type: Date },
  },
  { timestamps: true },
);

export const TrustedContact = model<ITrustedContact>('TrustedContact', contactSchema);
