import { Router } from 'express';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { TrustedContact } from '../models/TrustedContact.js';
import { User } from '../models/User.js';
import { audit, OWNER } from '../services/audit.js';
import { ownerConfirmsAlive } from '../services/emergency.js';
import { notifier } from '../services/notifier.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { INVITE_TTL_DAYS, newInviteToken } from '../utils/inviteToken.js';
import { CATEGORIES, idParamSchema, inviteBodySchema, permissionsBodySchema, sharesBodySchema } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);

const MAX_CONTACTS = 5;
const inviteUrlFor = (token: string) => `${env.CLIENT_ORIGIN.replace(/\/$/, '')}/invite/${token}`;

const toDto = (c: InstanceType<typeof TrustedContact>) => ({
  id: c.id,
  name: c.name,
  email: c.email,
  relation: c.relation,
  status: c.status,
  publicKey: c.publicKey, // public by nature; the owner's browser needs it to encrypt a key piece
  allowedCategories: c.allowedCategories && c.allowedCategories.length > 0 ? c.allowedCategories : [...CATEGORIES],
  hasShare: c.shareGeneration !== undefined && c.shareGeneration !== null,
  shareGeneration: c.shareGeneration,
  inviteExpiresAt: c.inviteExpiresAt,
  acceptedAt: c.acceptedAt,
});

// ---------- list ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [contacts, user] = await Promise.all([
      TrustedContact.find({ ownerId: req.userId, status: { $ne: 'REVOKED' } }).sort({ createdAt: 1 }),
      User.findById(req.userId).select('shares'),
    ]);
    const s = user?.shares;
    res.json({
      contacts: contacts.map(toDto),
      shares: s ? { generation: s.generation, threshold: s.threshold, total: s.total, stale: s.stale, updatedAt: s.updatedAt } : null,
    });
  }),
);

// ---------- invite ----------
router.post(
  '/invite',
  validate(inviteBodySchema),
  asyncHandler(async (req, res) => {
    const { name, email, relation } = req.body;
    const owner = await User.findById(req.userId).select('name email');
    if (!owner) throw new HttpError(404, 'Account not found');
    if (email === owner.email) throw new HttpError(400, 'Choose someone other than yourself');

    const active = await TrustedContact.find({ ownerId: req.userId, status: { $in: ['INVITED', 'ACCEPTED'] } }).select('email');
    if (active.length >= MAX_CONTACTS) throw new HttpError(409, `You can have up to ${MAX_CONTACTS} trusted people`);
    if (active.some((c) => c.email === email)) throw new HttpError(409, 'You have already invited this email');

    const { token, hash, expiresAt } = newInviteToken();
    const contact = await TrustedContact.create({
      ownerId: req.userId,
      name,
      email,
      relation,
      inviteTokenHash: hash,
      inviteExpiresAt: expiresAt,
    });

    const inviteUrl = inviteUrlFor(token);
    await notifier
      .sendInvite({ to: email, contactName: name, ownerName: owner.name, inviteUrl, expiresInDays: INVITE_TTL_DAYS })
      .catch((e) => console.error('Invite email failed:', e instanceof Error ? e.message : 'unknown'));

    await audit(req.userId!, OWNER, 'contact.invited', { name, relation });
    // The link is also returned so the owner can send it by WhatsApp or SMS if email is not set up.
    res.status(201).json({ contact: toDto(contact), inviteUrl });
  }),
);

// ---------- resend (issues a NEW link; the old one stops working) ----------
router.post(
  '/:id/resend',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const contact = await TrustedContact.findOne({ _id: req.params.id, ownerId: req.userId, status: 'INVITED' });
    if (!contact) throw new HttpError(404, 'No pending invitation found');
    const owner = await User.findById(req.userId).select('name');

    const { token, hash, expiresAt } = newInviteToken();
    contact.inviteTokenHash = hash;
    contact.inviteExpiresAt = expiresAt;
    await contact.save();

    const inviteUrl = inviteUrlFor(token);
    await notifier
      .sendInvite({ to: contact.email, contactName: contact.name, ownerName: owner?.name ?? 'Someone', inviteUrl, expiresInDays: INVITE_TTL_DAYS })
      .catch((e) => console.error('Invite email failed:', e instanceof Error ? e.message : 'unknown'));
    await audit(req.userId!, OWNER, 'contact.link_resent', { name: contact.name });
    res.json({ contact: toDto(contact), inviteUrl });
  }),
);

// ---------- what this person may read once the vault is open ----------
router.patch(
  '/:id/permissions',
  validate(idParamSchema, 'params'),
  validate(permissionsBodySchema),
  asyncHandler(async (req, res) => {
    const owner = await User.findById(req.userId).select('emergency');
    const state = owner?.emergency?.state;
    if (state === 'PENDING_APPROVAL' || state === 'WAITING_PERIOD' || state === 'UNLOCKED') {
      throw new HttpError(409, 'Permissions cannot be changed while an emergency request is running.');
    }
    const contact = await TrustedContact.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.userId, status: { $in: ['INVITED', 'ACCEPTED'] } },
      { $set: { allowedCategories: req.body.allowedCategories } },
      { new: true },
    );
    if (!contact) throw new HttpError(404, 'Trusted person not found');
    await audit(req.userId!, OWNER, 'contact.permissions_changed', { name: contact.name, drawers: req.body.allowedCategories.join(',') });
    res.json(toDto(contact));
  }),
);

// ---------- remove ----------
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const contact = await TrustedContact.findOne({ _id: req.params.id, ownerId: req.userId, status: { $ne: 'REVOKED' } }).select(
      '+encryptedShare',
    );
    if (!contact) throw new HttpError(404, 'Trusted person not found');
    const hadShare = !!contact.encryptedShare;

    // Keep a tombstone row, but remove everything usable: link, key material and the encrypted piece.
    await TrustedContact.updateOne(
      { _id: contact._id },
      {
        $set: { status: 'REVOKED', revokedAt: new Date() },
        $unset: { inviteTokenHash: '', inviteExpiresAt: '', publicKey: '', wrappedPrivateKey: '', kdfSalt: '', kdfParams: '', encryptedShare: '', shareGeneration: '' },
      },
    );
    // The remaining pieces still belong to the old set that included this person: the owner should re-create them.
    if (hadShare) await User.updateOne({ _id: req.userId, shares: { $exists: true } }, { $set: { 'shares.stale': true } });
    await audit(req.userId!, OWNER, 'contact.removed', { name: contact.name });
    res.status(204).end();
  }),
);

// ---------- create / replace key pieces ----------
router.post(
  '/shares',
  validate(sharesBodySchema),
  asyncHandler(async (req, res) => {
    const { threshold, keyCheck, shares } = req.body as {
      threshold: number;
      keyCheck: { ct: string; iv: string };
      shares: { contactId: string; encryptedShare: string }[];
    };

    const accepted = await TrustedContact.find({ ownerId: req.userId, status: 'ACCEPTED' });
    if (accepted.length < 2) throw new HttpError(400, 'At least 2 trusted people must accept before key pieces can be created');

    const ids = shares.map((s) => s.contactId);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Duplicate trusted person');
    if (ids.length !== accepted.length || !accepted.every((c) => ids.includes(c.id))) {
      throw new HttpError(400, 'Create one key piece for every trusted person who has accepted');
    }
    if (threshold > accepted.length) throw new HttpError(400, 'Threshold cannot exceed the number of trusted people');

    const user = await User.findById(req.userId).select('shares emergency');
    const running = user?.emergency?.state;
    if (running === 'PENDING_APPROVAL' || running === 'WAITING_PERIOD' || running === 'UNLOCKED') {
      throw new HttpError(409, 'An emergency request is in progress. Stop it first (Safety switch tab), then create key pieces again.');
    }
    const generation = (user?.shares?.generation ?? 0) + 1;

    await TrustedContact.bulkWrite(
      shares.map((s) => ({
        updateOne: {
          filter: { _id: s.contactId, ownerId: req.userId, status: 'ACCEPTED' as const },
          update: { $set: { encryptedShare: s.encryptedShare, shareGeneration: generation } },
        },
      })),
    );
    await User.updateOne(
      { _id: req.userId },
      { $set: { shares: { generation, threshold, total: accepted.length, stale: false, keyCheck, updatedAt: new Date() } } },
    );
    // New pieces arm the switch and start a fresh check-in clock.
    await audit(req.userId!, OWNER, 'shares.created', { threshold, total: accepted.length, generation });
    await ownerConfirmsAlive(req.userId!, new Date(), 'arming').catch((e) => console.error('Arming failed:', e instanceof Error ? e.message : 'unknown'));
    res.status(201).json({ generation, threshold, total: accepted.length });
  }),
);

export default router;
