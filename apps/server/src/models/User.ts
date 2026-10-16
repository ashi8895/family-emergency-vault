import { Schema, model, type Types } from 'mongoose';

export interface Sealed {
  ct: string;
  iv: string;
}

export interface IUser {
  email: string;
  name: string;
  authHash: string;
  kdfSalt: string;
  kdfParams: { algo: string; iterations: number };
  wrappedVK: Sealed;
  tokenVersion: number;
  failedLogins: number;
  lockedUntil?: Date;
  // Describes the CURRENT set of key pieces. Absent until the owner creates them.
  // Safety switch settings, in days. Missing on old accounts: code falls back to the defaults.
  settings?: { checkInIntervalDays: number; reminderGapDays: number; waitingPeriodDays: number };
  // Current position of the dead-man's switch (see services/emergencyStateMachine.ts).
  emergency?: {
    state: 'ACTIVE' | 'WARNING' | 'PENDING_APPROVAL' | 'WAITING_PERIOD' | 'UNLOCKED';
    cycleId: string; // rotates on every "I am okay"; links carry it, so old links stop working
    lastCheckInAt: Date;
    nextActionAt: Date | null;
    remindersSent: number;
    unlocksAt: Date | null;
    caseId: Types.ObjectId | null;
  };
  // Two-step sign-in. Selected explicitly (select:false) so it never leaks into normal queries.
  totp?: { secretEnc: string; enabled: boolean; lastUsedStep: number | null; recoveryHashes: string[] };
  shares?: {
    generation: number; // bumps every time pieces are re-created; old pieces become useless
    threshold: number; // how many pieces are needed
    total: number; // how many pieces exist
    stale: boolean; // true after a contact is removed: the owner should re-create pieces
    keyCheck: Sealed; // known text encrypted with the vault key, lets a client verify a rebuilt key
    updatedAt: Date;
  };
}

export const sealedSchema = new Schema<Sealed>(
  { ct: { type: String, required: true }, iv: { type: String, required: true } },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // scrypt hash of the browser-derived authKey. Never returned unless explicitly selected.
    authHash: { type: String, required: true, select: false },
    kdfSalt: { type: String, required: true },
    kdfParams: {
      type: new Schema({ algo: String, iterations: Number }, { _id: false }),
      required: true,
    },
    // Vault key encrypted (in the browser) with the key-encryption key. Server cannot open it.
    wrappedVK: { type: sealedSchema, required: true },
    tokenVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    settings: {
      type: new Schema(
        {
          checkInIntervalDays: { type: Number, default: 30 },
          reminderGapDays: { type: Number, default: 3 },
          waitingPeriodDays: { type: Number, default: 7 },
        },
        { _id: false },
      ),
    },
    emergency: {
      type: new Schema(
        {
          state: { type: String, enum: ['ACTIVE', 'WARNING', 'PENDING_APPROVAL', 'WAITING_PERIOD', 'UNLOCKED'], default: 'ACTIVE' },
          cycleId: { type: String, required: true },
          lastCheckInAt: { type: Date, required: true },
          nextActionAt: { type: Date, default: null, index: true },
          remindersSent: { type: Number, default: 0 },
          unlocksAt: { type: Date, default: null },
          caseId: { type: Schema.Types.ObjectId, ref: 'EmergencyCase', default: null },
        },
        { _id: false },
      ),
    },
    totp: {
      type: new Schema(
        {
          secretEnc: { type: String, required: true }, // AES-GCM sealed with a key derived from the server secret
          enabled: { type: Boolean, default: false },
          lastUsedStep: { type: Number, default: null }, // replay protection: a code can be used once
          recoveryHashes: { type: [String], default: [] },
        },
        { _id: false },
      ),
      select: false,
    },
    shares: {
      type: new Schema(
        {
          generation: { type: Number, required: true },
          threshold: { type: Number, required: true },
          total: { type: Number, required: true },
          stale: { type: Boolean, default: false },
          keyCheck: { type: sealedSchema, required: true },
          updatedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
    },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', userSchema);
