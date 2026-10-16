import { z } from 'zod';

// Names and relations are copied into email subjects and the audit log: no control characters, no line breaks.
const safeText = (max: number) =>
  z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001F\u007F]+$/, 'Contains invalid characters');

export const CATEGORIES = ['insurance', 'bank', 'investments', 'property', 'medical', 'legal', 'other'] as const;

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Must be base64');
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** AES-GCM output: ciphertext (includes auth tag) + 12-byte IV, both base64. */
export const sealedSchema = z.object({
  ct: base64.max(300_000),
  iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/, 'IV must be 12 bytes of base64'),
});

// 32 random bytes in base64 = 44 chars ending with "="
const authKey = z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'Invalid authKey');

export const preloginSchema = z.object({ email: z.string().email().max(254) });

export const registerSchema = z.object({
  email: z.string().email().max(254),
  name: safeText(100),
  authKey,
  kdfSalt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/, 'Salt must be 16 bytes'),
  kdfParams: z.object({
    algo: z.literal('PBKDF2-SHA256'),
    iterations: z.number().int().min(600_000).max(5_000_000),
  }),
  wrappedVK: sealedSchema,
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  authKey,
  // only sent on the second step, when the account has two-step sign-in
  totpCode: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().trim().min(8).max(20).optional(),
});

export const idParamSchema = z.object({ id: objectId });

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const itemBodySchema = z.object({
  category: z.enum(CATEGORIES),
  titleEnc: sealedSchema,
  notesEnc: sealedSchema,
  instructionsEnc: sealedSchema,
  attachments: z
    .array(
      z.object({
        fileId: objectId,
        nameEnc: sealedSchema,
        size: z.number().int().min(0).max(MAX_FILE_BYTES),
      }),
    )
    .max(10)
    .default([]),
});

export const fileIvSchema = z.string().regex(/^[A-Za-z0-9+/]{16}$/, 'IV must be 12 bytes of base64');

// ---------- Phase 2: trusted contacts ----------
const base64Loose = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Must be base64');

export const inviteBodySchema = z.object({
  name: safeText(100),
  email: z.string().trim().toLowerCase().email().max(254),
  relation: safeText(40),
});

export const tokenParamSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid invite link') });

// SPKI for RSA-3072 is ~422 bytes (~564 base64 chars). The real check (RSA, >= 3072 bits) happens in the route.
export const acceptBodySchema = z.object({
  publicKey: base64Loose.min(300).max(1400),
  wrappedPrivateKey: sealedSchema,
  kdfSalt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/, 'Salt must be 16 bytes'),
  kdfParams: z.object({
    algo: z.literal('PBKDF2-SHA256'),
    iterations: z.number().int().min(600_000).max(5_000_000),
  }),
});

export const sharesBodySchema = z.object({
  threshold: z.number().int().min(2).max(5),
  keyCheck: sealedSchema,
  shares: z
    .array(
      z.object({
        contactId: objectId,
        // RSA-OAEP output is as long as the modulus: 384 bytes for 3072 bits -> 512 base64 chars
        encryptedShare: base64Loose.min(300).max(1400),
      }),
    )
    .min(2)
    .max(5),
});

// ---------- Phase 3: safety switch ----------
export const settingsBodySchema = z.object({
  checkInIntervalDays: z.number().int().min(1).max(365),
  reminderGapDays: z.number().int().min(1).max(30),
  waitingPeriodDays: z.number().int().min(1).max(30),
});

// token = base64url(payload) + "." + 43-char signature
export const linkTokenParamSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{10,300}\.[A-Za-z0-9_-]{43}$/, 'Invalid link'),
});

// ---------- Phase 4 ----------
export const permissionsBodySchema = z.object({
  allowedCategories: z.array(z.enum(CATEGORIES)).min(1).max(CATEGORIES.length).transform((a) => [...new Set(a)]),
});

export const codeBodySchema = z.object({ code: z.string().trim().min(6).max(20) });

export const auditQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const accessFileParamsSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{10,300}\.[A-Za-z0-9_-]{43}$/, 'Invalid link'),
  id: objectId,
});
