import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  PRELOGIN_SECRET: z.string().min(32, 'PRELOGIN_SECRET must be at least 32 chars'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  // Where encrypted files are kept. Use gridfs on hosts whose disk is wiped on every deploy (Render free tier).
  STORAGE: z.enum(['disk', 'gridfs']).default('disk'),
  // How many reverse proxies sit in front of the API (Render, Railway, Nginx = 1). Without it every visitor looks
  // like the proxy's IP, so the rate limiter would count everyone together and audit entries would show the wrong IP.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Optional. Without SMTP_URL, invite links are printed in the server console (development only).
  // Length of one "day" in milliseconds. Lowering it makes the whole switch run fast for demos
  // (60000 means 1 day = 1 minute). Refused in production.
  TIME_UNIT_MS: z.coerce.number().int().min(1000).default(86_400_000),
  // How often the background scheduler looks for work.
  SCHEDULER_TICK_MS: z.coerce.number().int().min(1000).default(30_000),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Family Emergency Vault <no-reply@example.com>'),
});

// Fail fast at boot if configuration is missing or weak.
export const env = schema.parse(process.env);

if (env.NODE_ENV === 'production' && env.TIME_UNIT_MS !== 86_400_000) {
  throw new Error('TIME_UNIT_MS must stay at its default (one day) in production');
}
