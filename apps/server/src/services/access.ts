import { EmergencyCase } from '../models/EmergencyCase.js';
import { EncryptedFile } from '../models/EncryptedFile.js';
import { TrustedContact } from '../models/TrustedContact.js';
import { User } from '../models/User.js';
import { VaultItem } from '../models/VaultItem.js';
import { CATEGORIES } from '../validators/schemas.js';
import { audit, contactActor } from './audit.js';
import { parseLinkToken } from './links.js';

/**
 * What a trusted person can do after the waiting period: fetch THEIR OWN encrypted key piece and the encrypted items.
 * Everything here is ciphertext. Decrypting needs the contact's passphrase and k key pieces, all in the browser.
 * The link only works while the case is UNLOCKED and the person is still an accepted contact.
 */
async function readAccess(token: string) {
  const parts = parseLinkToken(token);
  if (!parts || parts[0] !== 'access' || parts.length !== 3) return null;

  const c = await EmergencyCase.findById(parts[1]);
  if (!c || c.state !== 'UNLOCKED') return null;

  const contact = await TrustedContact.findById(parts[2]).select('+wrappedPrivateKey +kdfSalt +kdfParams +encryptedShare');
  if (!contact || contact.status !== 'ACCEPTED' || String(contact.ownerId) !== String(c.ownerId)) return null;
  if (contact.shareGeneration !== c.shareGeneration || !contact.encryptedShare) return null;

  const owner = await User.findById(c.ownerId).select('name shares');
  if (!owner?.shares) return null;
  return { c, contact, owner };
}

const allowedOf = (contact: { allowedCategories?: string[] | null }): string[] =>
  contact.allowedCategories && contact.allowedCategories.length > 0 ? contact.allowedCategories : [...CATEGORIES];

export async function accessBundle(token: string, ip?: string) {
  const r = await readAccess(token);
  if (!r) return null;
  const { c, contact, owner } = r;
  const holders = await TrustedContact.find({ ownerId: c.ownerId, status: 'ACCEPTED', shareGeneration: c.shareGeneration });
  await audit(c.ownerId, contactActor(contact.name), 'access.opened', { ip: ip ?? '' });
  return {
    ownerName: owner.name,
    contactName: contact.name,
    wrappedPrivateKey: contact.wrappedPrivateKey,
    kdfSalt: contact.kdfSalt,
    kdfParams: contact.kdfParams,
    encryptedShare: contact.encryptedShare,
    keyCheck: owner.shares!.keyCheck,
    threshold: c.threshold,
    total: holders.length,
    allowedCategories: allowedOf(contact),
  };
}

export async function accessItems(token: string) {
  const r = await readAccess(token);
  if (!r) return null;
  const items = await VaultItem.find({ ownerId: r.c.ownerId, category: { $in: allowedOf(r.contact) } }).sort({ updatedAt: -1 });
  await audit(r.c.ownerId, contactActor(r.contact.name), 'access.items_listed', { count: items.length });
  return items.map((i) => ({
    id: i.id,
    category: i.category,
    titleEnc: i.titleEnc,
    notesEnc: i.notesEnc,
    instructionsEnc: i.instructionsEnc,
    attachments: i.attachments.map((a) => ({ fileId: String(a.fileId), nameEnc: a.nameEnc, size: a.size })),
    updatedAt: (i as unknown as { updatedAt: Date }).updatedAt,
  }));
}

/** A file is served only if the item it belongs to is in a drawer this person may read. */
export async function accessFile(token: string, fileId: string) {
  const r = await readAccess(token);
  if (!r) return null;
  const file = await EncryptedFile.findOne({ _id: fileId, ownerId: r.c.ownerId });
  if (!file?.itemId) return null;
  const item = await VaultItem.findOne({ _id: file.itemId, ownerId: r.c.ownerId, category: { $in: allowedOf(r.contact) } });
  if (!item) return null;
  await audit(r.c.ownerId, contactActor(r.contact.name), 'access.file_downloaded', { fileId: String(file.id) });
  return { id: String(file.id), iv: file.iv };
}
