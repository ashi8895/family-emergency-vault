import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listAudit, verifyAudit } from '../services/audit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { auditQuerySchema } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  validate(auditQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { before, limit } = req.query as unknown as { before?: number; limit: number };
    res.json(await listAudit(req.userId!, { before, limit }));
  }),
);

// Recomputes every hash in the owner's chain. Not-ok means an entry was changed, removed or re-ordered.
router.get(
  '/verify',
  asyncHandler(async (req, res) => {
    res.json(await verifyAudit(req.userId!));
  }),
);

export default router;
