import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';
import { signToken, verifyToken } from '../utils/signedToken.js';

// Derived from an existing secret with a fixed label, so there is no extra variable to configure.
const secret = createHmac('sha256', env.JWT_REFRESH_SECRET).update('fev-link-secret-v1').digest('hex');
const origin = env.CLIENT_ORIGIN.replace(/\/$/, '');

/** Owner's "I am okay" link. Dies when the cycle id rotates (after any check-in or cancel). */
export const aliveUrl = (userId: string, cycleId: string) => `${origin}/alive/${signToken(secret, ['alive', userId, cycleId])}`;

/** A trusted person's approval link. Valid while the case is waiting for approvals. */
export const approveUrl = (caseId: string, contactId: string) =>
  `${origin}/approve/${signToken(secret, ['approve', caseId, contactId])}`;

export const parseLinkToken = (token: string) => verifyToken(secret, token);

/** Opens the family access page. Valid only while the case is UNLOCKED (the server checks), and only for this contact. */
export const accessUrl = (caseId: string, contactId: string) => `${origin}/access/${signToken(secret, ['access', caseId, contactId])}`;
