import { Schema, model, type Types } from 'mongoose';

export type CaseState = 'PENDING_APPROVAL' | 'WAITING_PERIOD' | 'UNLOCKED' | 'CANCELLED' | 'CLOSED';

export interface IEmergencyCase {
  ownerId: Types.ObjectId;
  state: CaseState;
  openedAt: Date;
  threshold: number; // pieces needed, copied from the owner's key-piece settings when the case opens
  shareGeneration: number;
  approvals: { contactId: Types.ObjectId; approvedAt: Date }[];
  waitingStartsAt?: Date;
  unlocksAt?: Date;
  unlockedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: 'owner';
  closedAt?: Date; // the owner came back after UNLOCKED and closed access
}

const caseSchema = new Schema<IEmergencyCase>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    state: { type: String, enum: ['PENDING_APPROVAL', 'WAITING_PERIOD', 'UNLOCKED', 'CANCELLED', 'CLOSED'], required: true },
    openedAt: { type: Date, required: true },
    threshold: { type: Number, required: true },
    shareGeneration: { type: Number, required: true },
    approvals: {
      type: [new Schema({ contactId: { type: Schema.Types.ObjectId, required: true }, approvedAt: { type: Date, required: true } }, { _id: false })],
      default: [],
    },
    waitingStartsAt: Date,
    unlocksAt: Date,
    unlockedAt: Date,
    cancelledAt: Date,
    cancelledBy: { type: String, enum: ['owner'] },
    closedAt: Date,
  },
  { timestamps: true },
);

export const EmergencyCase = model<IEmergencyCase>('EmergencyCase', caseSchema);
