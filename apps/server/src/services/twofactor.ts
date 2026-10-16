import { User } from '../models/User.js';
import { hashRecoveryCode } from '../utils/recoveryCodes.js';
import { openSecret } from '../utils/secretBox.js';
import { verifyTotp } from '../utils/totp.js';
import { totpKey } from './secrets.js';

type WithTotp = { _id: unknown; totp?: { secretEnc: string; enabled: boolean; lastUsedStep: number | null } | null };

/**
 * Check an authenticator code or a one-time recovery code. Both are consumed with one conditional update, so the same
 * code can never be accepted twice even if two requests arrive together.
 */
export async function checkSecondFactor(user: WithTotp, totpCode?: string, recoveryCode?: string, nowMs = Date.now()): Promise<boolean> {
  if (!user.totp?.enabled) return false;

  if (totpCode) {
    const secret = openSecret(totpKey, user.totp.secretEnc, 'totp');
    const r = verifyTotp(secret, totpCode, nowMs, { lastUsedStep: user.totp.lastUsedStep });
    if (!r.ok) return false;
    const res = await User.updateOne(
      { _id: user._id, $or: [{ 'totp.lastUsedStep': null }, { 'totp.lastUsedStep': { $lt: r.step } }] },
      { $set: { 'totp.lastUsedStep': r.step } },
    );
    return res.matchedCount > 0;
  }

  if (recoveryCode) {
    const h = hashRecoveryCode(recoveryCode);
    const res = await User.updateOne({ _id: user._id, 'totp.recoveryHashes': h }, { $pull: { 'totp.recoveryHashes': h } });
    return res.matchedCount > 0;
  }
  return false;
}
