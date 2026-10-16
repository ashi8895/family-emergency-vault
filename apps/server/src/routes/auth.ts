import { Router } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/User.js';
import { audit, OWNER } from '../services/audit.js';
import { checkInOnLogin, initialEmergency } from '../services/emergency.js';
import { checkSecondFactor } from '../services/twofactor.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { hashAuthKey, verifyAuthKey } from '../utils/password.js';
import { DEFAULT_KDF, fakeSalt } from '../utils/prelogin.js';
import { loginSchema, preloginSchema, registerSchema } from '../validators/schemas.js';

const router = Router();

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const REFRESH_COOKIE = 'fev_refresh';

// Used so that "unknown email" costs the same time as "wrong password".
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashAuthKey('dummy-auth-key-for-timing'));

function setRefreshCookie(res: import('express').Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/** Wrong password OR wrong second factor: both count toward the same lockout, so 6-digit codes cannot be brute forced. */
async function recordFailure(user: InstanceType<typeof User> | null, ip: string | undefined, why: string) {
  if (!user) return;
  user.failedLogins += 1;
  const locked = user.failedLogins >= MAX_FAILED_LOGINS;
  if (locked) {
    user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    user.failedLogins = 0;
  }
  await user.save();
  await audit(user._id, OWNER, locked ? 'login.locked' : 'login.failed', { why, ip: ip ?? '' });
}

// Step 1 of login: the browser needs the user's KDF salt before it can derive authKey.
router.post(
  '/prelogin',
  authLimiter,
  validate(preloginSchema),
  asyncHandler(async (req, res) => {
    const email = String(req.body.email).toLowerCase();
    const user = await User.findOne({ email }).select('kdfSalt kdfParams');
    if (user) return res.json({ kdfSalt: user.kdfSalt, kdfParams: user.kdfParams });
    res.json({ kdfSalt: fakeSalt(email, env.PRELOGIN_SECRET), kdfParams: DEFAULT_KDF });
  }),
);

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, name, authKey, kdfSalt, kdfParams, wrappedVK } = req.body;
    const normalized = String(email).toLowerCase();
    if (await User.exists({ email: normalized })) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const user = await User.create({
      email: normalized,
      name,
      authHash: await hashAuthKey(authKey),
      kdfSalt,
      kdfParams,
      wrappedVK,
      emergency: initialEmergency(),
    });
    await audit(user._id, OWNER, 'account.created', {});
    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  }),
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, authKey, totpCode, recoveryCode } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+authHash +totp');

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
    }

    const ok = await verifyAuthKey(authKey, user?.authHash ?? (await getDummyHash()));
    if (!user || !ok) {
      await recordFailure(user, req.ip, 'password');
      // Same message for unknown email and wrong password.
      throw new HttpError(401, 'Incorrect email or password');
    }

    // Step 2: only after the password is right do we reveal that a code is needed, so nobody can probe accounts for 2FA.
    const hasTwoFactor = !!user.totp?.enabled;
    if (hasTwoFactor) {
      if (!totpCode && !recoveryCode) return res.json({ twoFactorRequired: true });
      if (!(await checkSecondFactor(user, totpCode, recoveryCode))) {
        await recordFailure(user, req.ip, 'second_factor');
        throw new HttpError(401, 'That code did not work');
      }
    }

    user.failedLogins = 0;
    user.lockedUntil = undefined;
    await user.save();

    await audit(user._id, OWNER, 'login', { twoFactor: hasTwoFactor, usedRecoveryCode: !!recoveryCode, ip: req.ip ?? '' });
    await checkInOnLogin(user.id); // signing in proves the owner is alive (never cancels a running request)

    const payload = { sub: user.id, tv: user.tokenVersion };
    setRefreshCookie(res, signRefreshToken(payload));
    res.json({
      accessToken: signAccessToken(payload),
      user: { id: user.id, email: user.email, name: user.name },
      wrappedVK: user.wrappedVK,
      kdfSalt: user.kdfSalt,
      kdfParams: user.kdfParams,
    });
  }),
);

router.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new HttpError(401, 'Not signed in');
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new HttpError(401, 'Session expired');
    }
    const user = await User.findById(payload.sub).select('tokenVersion');
    if (!user || user.tokenVersion !== payload.tv) throw new HttpError(401, 'Session expired');
    const fresh = { sub: user.id, tv: user.tokenVersion };
    setRefreshCookie(res, signRefreshToken(fresh)); // rotate
    res.json({ accessToken: signAccessToken(fresh) });
  }),
);

router.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.status(204).end();
});

export default router;
