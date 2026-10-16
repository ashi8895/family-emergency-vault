import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';

/** Key for encrypting TOTP seeds at rest. Derived from an existing secret with a fixed label: nothing new to configure. */
export const totpKey: Buffer = createHmac('sha256', env.JWT_REFRESH_SECRET).update('fev-totp-key-v1').digest();
