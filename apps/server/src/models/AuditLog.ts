import { Schema, model, type Types } from 'mongoose';
import type { Meta } from '../utils/auditChain.js';

export interface IAuditLog {
  ownerId: Types.ObjectId;
  seq: number;
  ts: Date;
  actorType: 'owner' | 'contact' | 'system';
  actorLabel: string;
  action: string;
  meta: Meta;
  prevHash: string;
  hash: string;
}

const auditSchema = new Schema<IAuditLog>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seq: { type: Number, required: true },
    ts: { type: Date, required: true },
    actorType: { type: String, enum: ['owner', 'contact', 'system'], required: true },
    actorLabel: { type: String, required: true },
    action: { type: String, required: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  // minimize:false keeps an empty meta object; the hash is computed over it, so it must survive a round trip
  { minimize: false },
);

// Two writers racing for the same seq: the second one fails on this index and retries with the new head.
auditSchema.index({ ownerId: 1, seq: 1 }, { unique: true });

export const AuditLog = model<IAuditLog>('AuditLog', auditSchema);
