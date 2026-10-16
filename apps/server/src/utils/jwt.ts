import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

interface TokenPayload {
  sub: string; // user id
  tv: number; // tokenVersion: bump it to revoke every token of a user
}

export const signAccessToken = (p: TokenPayload) =>
  jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

export const signRefreshToken = (p: TokenPayload) =>
  jwt.sign(p, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

export const verifyAccessToken = (t: string) => jwt.verify(t, env.JWT_ACCESS_SECRET) as TokenPayload;
export const verifyRefreshToken = (t: string) => jwt.verify(t, env.JWT_REFRESH_SECRET) as TokenPayload;
