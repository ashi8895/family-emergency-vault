import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { EncryptedFile } from '../models/EncryptedFile.js';
import { User } from '../models/User.js';
import { VaultItem, type IAttachment } from '../models/VaultItem.js';
import { audit, OWNER } from '../services/audit.js';
import { storage } from '../services/storage.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fileIvSchema, idParamSchema, itemBodySchema, MAX_FILE_BYTES } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES + 16, files: 1 }, // +16 = AES-GCM tag
});

const removeFiles = async (ids: string[]) => {
  await Promise.all(ids.map((id) => storage.remove(id)));
  await EncryptedFile.deleteMany({ _id: { $in: ids } });
};

// ---------- key material ----------
router.get(
  '/key',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select('wrappedVK kdfSalt kdfParams');
    if (!user) throw new HttpError(404, 'Account not found');
    res.json({ wrappedVK: user.wrappedVK, kdfSalt: user.kdfSalt, kdfParams: user.kdfParams });
  }),
);

// ---------- items ----------
const toDto = (i: InstanceType<typeof VaultItem>) => ({
  id: i.id,
  category: i.category,
  titleEnc: i.titleEnc,
  notesEnc: i.notesEnc,
  instructionsEnc: i.instructionsEnc,
  attachments: i.attachments.map((a) => ({ fileId: a.fileId.toString(), nameEnc: a.nameEnc, size: a.size })),
  updatedAt: (i as unknown as { updatedAt: Date }).updatedAt,
});

/** Every fileId must belong to this user and not be attached to a different item. */
async function assertFilesUsable(ownerId: string, attachments: { fileId: string }[], itemId?: string) {
  if (attachments.length === 0) return;
  const ids = [...new Set(attachments.map((a) => a.fileId))];
  const files = await EncryptedFile.find({ _id: { $in: ids }, ownerId });
  const usable = files.filter((f) => !f.itemId || f.itemId.toString() === itemId);
  if (ids.length !== attachments.length || usable.length !== ids.length) {
    throw new HttpError(400, 'One or more attachments are invalid');
  }
}

router.get(
  '/items',
  asyncHandler(async (req, res) => {
    const items = await VaultItem.find({ ownerId: req.userId }).sort({ updatedAt: -1 });
    res.json(items.map(toDto));
  }),
);

router.post(
  '/items',
  validate(itemBodySchema),
  asyncHandler(async (req, res) => {
    await assertFilesUsable(req.userId!, req.body.attachments);
    const item = await VaultItem.create({ ...req.body, ownerId: req.userId });
    await EncryptedFile.updateMany(
      { _id: { $in: req.body.attachments.map((a: { fileId: string }) => a.fileId) } },
      { itemId: item._id },
    );
    await audit(req.userId!, OWNER, 'vault.item_created', { category: item.category });
    res.status(201).json(toDto(item));
  }),
);

router.get(
  '/items/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const item = await VaultItem.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!item) throw new HttpError(404, 'Item not found');
    res.json(toDto(item));
  }),
);

router.put(
  '/items/:id',
  validate(idParamSchema, 'params'),
  validate(itemBodySchema),
  asyncHandler(async (req, res) => {
    const item = await VaultItem.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!item) throw new HttpError(404, 'Item not found');
    await assertFilesUsable(req.userId!, req.body.attachments, item.id);

    const keep = new Set<string>(req.body.attachments.map((a: { fileId: string }) => a.fileId));
    const dropped = item.attachments.map((a: IAttachment) => a.fileId.toString()).filter((id: string) => !keep.has(id));

    item.set({
      category: req.body.category,
      titleEnc: req.body.titleEnc,
      notesEnc: req.body.notesEnc,
      instructionsEnc: req.body.instructionsEnc,
      attachments: req.body.attachments,
    });
    await item.save();
    await EncryptedFile.updateMany({ _id: { $in: [...keep] } }, { itemId: item._id });
    await removeFiles(dropped);
    await audit(req.userId!, OWNER, 'vault.item_updated', { category: item.category });
    res.json(toDto(item));
  }),
);

router.delete(
  '/items/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const item = await VaultItem.findOneAndDelete({ _id: req.params.id, ownerId: req.userId });
    if (!item) throw new HttpError(404, 'Item not found');
    await removeFiles(item.attachments.map((a: IAttachment) => a.fileId.toString()));
    await audit(req.userId!, OWNER, 'vault.item_deleted', { category: item.category });
    res.status(204).end();
  }),
);

// ---------- encrypted files ----------
router.post(
  '/files',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received');
    const iv = fileIvSchema.safeParse(req.body?.iv);
    if (!iv.success) throw new HttpError(400, 'Missing or invalid IV');

    const record = await EncryptedFile.create({ ownerId: req.userId, iv: iv.data, size: req.file.size });
    await storage.save(record.id, req.file.buffer);
    await audit(req.userId!, OWNER, 'vault.file_uploaded', { bytes: req.file.size });
    res.status(201).json({ fileId: record.id });
  }),
);

router.get(
  '/files/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const file = await EncryptedFile.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!file) throw new HttpError(404, 'File not found');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-File-IV', file.iv);
    const stream = storage.read(file.id);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }),
);

router.delete(
  '/files/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const file = await EncryptedFile.findOne({ _id: req.params.id, ownerId: req.userId });
    if (!file) throw new HttpError(404, 'File not found');
    if (file.itemId) throw new HttpError(409, 'Remove the file from its item instead');
    await removeFiles([file.id]);
    res.status(204).end();
  }),
);

export default router;
