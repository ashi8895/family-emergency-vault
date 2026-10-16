import { Router } from 'express';
import { HttpError } from '../middleware/error.js';
import { accessLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { accessBundle, accessFile, accessItems } from '../services/access.js';
import { storage } from '../services/storage.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { accessFileParamsSchema, linkTokenParamSchema } from '../validators/schemas.js';

/** Public (the signed link is the credential). Returns ciphertext only; all decryption happens in the browser. */
const router = Router();
router.use(accessLimiter);

const NOT_OPEN = 'This link is not valid, or the vault is not open yet';

router.get(
  '/:token',
  validate(linkTokenParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const bundle = await accessBundle(req.params.token, req.ip);
    if (!bundle) throw new HttpError(404, NOT_OPEN);
    res.json(bundle);
  }),
);

router.get(
  '/:token/items',
  validate(linkTokenParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const items = await accessItems(req.params.token);
    if (!items) throw new HttpError(404, NOT_OPEN);
    res.json(items);
  }),
);

router.get(
  '/:token/files/:id',
  validate(accessFileParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const file = await accessFile(req.params.token, req.params.id);
    if (!file) throw new HttpError(404, 'File not found');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-File-IV', file.iv);
    const stream = storage.read(file.id);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }),
);

export default router;
