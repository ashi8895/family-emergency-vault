import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import accessRoutes from './routes/access.js';
import auditRoutes from './routes/audit.js';
import authRoutes from './routes/auth.js';
import contactRoutes from './routes/contacts.js';
import emergencyRoutes from './routes/emergency.js';
import inviteRoutes from './routes/invites.js';
import linkRoutes from './routes/links.js';
import twoFactorRoutes from './routes/twofactor.js';
import vaultRoutes from './routes/vault.js';

export function createApp() {
  const app = express();
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      exposedHeaders: ['X-File-IV'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/vault', vaultRoutes);
  app.use('/api/contacts', contactRoutes);
  app.use('/api/invites', inviteRoutes);
  app.use('/api/emergency', emergencyRoutes);
  app.use('/api/links', linkRoutes);
  app.use('/api/access', accessRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/2fa', twoFactorRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
