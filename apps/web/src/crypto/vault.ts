import { generateVaultKey, openBytes, openText, sealBytes, sealText, unwrapVaultKey, wrapVaultKey, type Sealed } from './aes';
import { fromB64, randomBytes, toB64 } from './encoding';
import { DEFAULT_KDF, deriveKeys, type KdfParams } from './kdf';

// One AAD label per field: ciphertexts cannot be moved between fields undetected.
const AAD = {
  title: 'item:title',
  notes: 'item:notes',
  instructions: 'item:instructions',
  attachmentName: 'item:attachmentName',
  fileContent: 'file:content',
} as const;

export type Category = 'insurance' | 'bank' | 'investments' | 'property' | 'medical' | 'legal' | 'other';

export interface PlainAttachment {
  fileId: string;
  name: string;
  size: number;
}

export interface PlainItem {
  category: Category;
  title: string;
  notes: string;
  instructions: string;
  attachments: PlainAttachment[];
}

export interface ItemDto {
  id: string;
  category: Category;
  titleEnc: Sealed;
  notesEnc: Sealed;
  instructionsEnc: Sealed;
  attachments: { fileId: string; nameEnc: Sealed; size: number }[];
  updatedAt: string;
}

export interface ItemBody {
  category: Category;
  titleEnc: Sealed;
  notesEnc: Sealed;
  instructionsEnc: Sealed;
  attachments: { fileId: string; nameEnc: Sealed; size: number }[];
}

// ---------- account creation / unlock ----------

export interface RegistrationMaterial {
  authKey: string;
  kdfSalt: string;
  kdfParams: KdfParams;
  wrappedVK: Sealed;
  vk: CryptoKey;
}

export async function createAccountMaterial(password: string, iterations = DEFAULT_KDF.iterations): Promise<RegistrationMaterial> {
  const kdfSalt = toB64(randomBytes(16));
  const kdfParams: KdfParams = { algo: 'PBKDF2-SHA256', iterations };
  const { authKey, kek } = await deriveKeys(password, kdfSalt, iterations);
  const vk = await generateVaultKey();
  const wrappedVK = await wrapVaultKey(vk, kek);
  return { authKey, kdfSalt, kdfParams, wrappedVK, vk };
}

export const deriveLoginKeys = (password: string, kdfSalt: string, kdfParams: KdfParams) =>
  deriveKeys(password, kdfSalt, kdfParams.iterations);

export { unwrapVaultKey };

// ---------- items ----------

export async function sealItem(vk: CryptoKey, item: PlainItem): Promise<ItemBody> {
  return {
    category: item.category,
    titleEnc: await sealText(vk, item.title, AAD.title),
    notesEnc: await sealText(vk, item.notes, AAD.notes),
    instructionsEnc: await sealText(vk, item.instructions, AAD.instructions),
    attachments: await Promise.all(
      item.attachments.map(async (a) => ({
        fileId: a.fileId,
        nameEnc: await sealText(vk, a.name, AAD.attachmentName),
        size: a.size,
      })),
    ),
  };
}

export async function openItem(vk: CryptoKey, dto: ItemDto): Promise<PlainItem & { id: string; updatedAt: string }> {
  return {
    id: dto.id,
    updatedAt: dto.updatedAt,
    category: dto.category,
    title: await openText(vk, dto.titleEnc, AAD.title),
    notes: await openText(vk, dto.notesEnc, AAD.notes),
    instructions: await openText(vk, dto.instructionsEnc, AAD.instructions),
    attachments: await Promise.all(
      dto.attachments.map(async (a) => ({
        fileId: a.fileId,
        name: await openText(vk, a.nameEnc, AAD.attachmentName),
        size: a.size,
      })),
    ),
  };
}

// ---------- files ----------

export async function sealFile(vk: CryptoKey, bytes: Uint8Array) {
  return sealBytes(vk, bytes, AAD.fileContent);
}

export const openFile = (vk: CryptoKey, ciphertext: Uint8Array, ivB64: string) =>
  openBytes(vk, ciphertext, ivB64, AAD.fileContent);

export { fromB64 };
