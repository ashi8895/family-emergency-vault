import { Router } from 'express';
import { HttpError } from '../middleware/error.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { TrustedContact } from '../models/TrustedContact.js';
import { User } from '../models/User.js';
import { audit, contactActor } from '../services/audit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashToken } from '../utils/inviteToken.js';
import { isAcceptableRsaPublicKey } from '../utils/publicKey.js';
import { acceptBodySchema, tokenParamSchema } from '../validators/schemas.js';

/** Public routes: the invited person has no account, the single-use token IS the credential. */
const router = Router();
router.use(authLimiter);

const NOT_VALID = 'This invitation is invalid, already used, or has expired';

const pendingFilter = (token: string) => ({
  inviteTokenHash: hashToken(token),
  status: 'INVITED' as const,
  inviteExpiresAt: { $gt: new Date() },
});

router.get(
  '/:token',
  validate(tokenParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const contact = await TrustedContact.findOne(pendingFilter(req.params.token));
    if (!contact) throw new HttpError(404, NOT_VALID);
    const owner = await User.findById(contact.ownerId).select('name');
    res.json({
      ownerName: owner?.name ?? 'Someone',
      contactName: contact.name,
      relation: contact.relation,
      expiresAt: contact.inviteExpiresAt,
    });
  }),
);

router.post(
  '/:token/accept',
  validate(tokenParamSchema, 'params'),
  validate(acceptBodySchema),
  asyncHandler(async (req, res) => {
    const { publicKey, wrappedPrivateKey, kdfSalt, kdfParams } = req.body;
    if (!isAcceptableRsaPublicKey(publicKey)) throw new HttpError(400, 'Public key must be an RSA key of at least 3072 bits');

    // One atomic step: only the first request that matches a still-valid invite wins, and the token is wiped,
    // so the same link can never be used twice (even by two requests racing each other).
    const accepted = await TrustedContact.findOneAndUpdate(
      pendingFilter(req.params.token),
      {
        $set: { status: 'ACCEPTED', acceptedAt: new Date(), publicKey, wrappedPrivateKey, kdfSalt, kdfParams },
        $unset: { inviteTokenHash: '', inviteExpiresAt: '' },
      },
      { new: true },
    );
    if (!accepted) throw new HttpError(404, NOT_VALID);
    await audit(accepted.ownerId, contactActor(accepted.name), 'contact.accepted', {});
    res.json({ ok: true });
  }),
);

export default router;
