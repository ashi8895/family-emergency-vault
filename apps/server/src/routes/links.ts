import { Router } from 'express';
import { HttpError } from '../middleware/error.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { confirmAlive, describeAlive, describeApprove, submitApproval } from '../services/emergency.js';
import { linkTokenParamSchema } from '../validators/schemas.js';

/**
 * Public routes behind emailed links. GET only LOOKS (email scanners and link previews open links automatically,
 * so a GET must never change anything). The person has to press a button, which sends the POST.
 */
const router = Router();
router.use(authLimiter);

const NOT_VALID = 'This link is not valid';

router.get(
  '/alive/:token',
  validate(linkTokenParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const r = await describeAlive(req.params.token);
    if (!r) throw new HttpError(404, NOT_VALID);
    res.json(r);
  }),
);

router.post(
  '/alive/:token',
  validate(linkTokenParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const r = await confirmAlive(req.params.token);
    if (!r) throw new HttpError(404, NOT_VALID);
    res.json(r);
  }),
);

router.get(
  '/approve/:token',
  validate(linkTokenParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const r = await describeApprove(req.params.token);
    if (!r) throw new HttpError(404, NOT_VALID);
    res.json(r);
  }),
);

router.post(
  '/approve/:token',
  validate(linkTokenParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const r = await submitApproval(req.params.token);
    if (!r) throw new HttpError(404, NOT_VALID);
    res.json(r);
  }),
);

export default router;
