import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { closeAccess, getStatus, ownerConfirmsAlive, updateSettings } from '../services/emergency.js';
import { settingsBodySchema } from '../validators/schemas.js';

/** Owner-only: look at the safety switch, change its timing, say "I am okay". */
const router = Router();
router.use(requireAuth);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json(await getStatus(req.userId!));
  }),
);

router.put(
  '/settings',
  validate(settingsBodySchema),
  asyncHandler(async (req, res) => {
    await updateSettings(req.userId!, req.body);
    res.json(await getStatus(req.userId!));
  }),
);

// One click: from any stage before UNLOCKED this returns the switch to ACTIVE and cancels a running request.
router.post(
  '/checkin',
  asyncHandler(async (req, res) => {
    await ownerConfirmsAlive(req.userId!);
    res.json(await getStatus(req.userId!));
  }),
);

// "I am back": after UNLOCKED the request cannot be cancelled, but the owner can shut access and restart the switch.
router.post(
  '/close-access',
  asyncHandler(async (req, res) => {
    await closeAccess(req.userId!);
    res.json(await getStatus(req.userId!));
  }),
);

export default router;
