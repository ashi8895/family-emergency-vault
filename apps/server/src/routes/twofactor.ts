import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/User.js';
import { audit, OWNER } from '../services/audit.js';
import { totpKey } from '../services/secrets.js';
import { checkSecondFactor } from '../services/twofactor.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateRecoveryCodes, hashRecoveryCode } from '../utils/recoveryCodes.js';
import { openSecret, sealSecret } from '../utils/secretBox.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../utils/totp.js';
import { codeBodySchema } from '../validators/schemas.js';

/** Two-step sign-in for the OWNER (authenticator app + one-time recovery codes). */
const router = Router();
router.use(requireAuth);

const ISSUER = 'Family Emergency Vault';

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.userId).select('+totp');
    // serverTime lets the screen show which clock the codes are checked against
    res.json({ enabled: !!u?.totp?.enabled, recoveryCodesLeft: u?.totp?.recoveryHashes?.length ?? 0, serverTime: new Date().toISOString() });
  }),
);

// Step 1: make a secret and store it (sealed) as PENDING. Nothing changes at sign-in until a code from the app is confirmed.
router.post(
  '/setup',
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.userId).select('email +totp');
    if (!u) throw new HttpError(404, 'Account not found');
    if (u.totp?.enabled) throw new HttpError(409, 'Two-step sign-in is already on');

    const secret = generateTotpSecret();
    await User.updateOne(
      { _id: u._id },
      { $set: { totp: { secretEnc: sealSecret(totpKey, secret, 'totp'), enabled: false, lastUsedStep: null, recoveryHashes: [] } } },
    );
    res.json({ secret, otpauthUri: otpauthUri(secret, u.email, ISSUER), serverTime: new Date().toISOString() });
  }),
);

// Step 2: prove the app works by entering a code. Only then does it switch on, and the recovery codes are shown ONCE.
router.post(
  '/enable',
  validate(codeBodySchema),
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.userId).select('+totp');
    if (!u?.totp || u.totp.enabled) throw new HttpError(409, 'Start the setup first');

    const r = verifyTotp(openSecret(totpKey, u.totp.secretEnc, 'totp'), req.body.code, Date.now());
    if (!r.ok) throw new HttpError(400, 'That code did not match. Check the app and try again.');

    const recoveryCodes = generateRecoveryCodes(8);
    await User.updateOne(
      { _id: u._id },
      { $set: { 'totp.enabled': true, 'totp.lastUsedStep': r.step, 'totp.recoveryHashes': recoveryCodes.map(hashRecoveryCode) } },
    );
    await audit(u._id, OWNER, '2fa.enabled', {});
    res.json({ recoveryCodes });
  }),
);

// Turning it off needs a valid current code (or a recovery code), so a stolen session alone cannot remove it.
router.post(
  '/disable',
  validate(codeBodySchema),
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.userId).select('+totp');
    if (!u?.totp?.enabled) throw new HttpError(409, 'Two-step sign-in is not on');

    const code: string = req.body.code;
    const isTotp = /^\d{6}$/.test(code);
    const ok = await checkSecondFactor(u, isTotp ? code : undefined, isTotp ? undefined : code);
    if (!ok) throw new HttpError(400, 'That code did not work');

    await User.updateOne({ _id: u._id }, { $unset: { totp: '' } });
    await audit(u._id, OWNER, '2fa.disabled', {});
    res.status(204).end();
  }),
);

export default router;
