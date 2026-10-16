import type { RequestHandler } from 'express';
import { User } from '../models/User.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { HttpError } from './error.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Not signed in');
    let payload;
    try {
      payload = verifyAccessToken(header.slice(7));
    } catch {
      throw new HttpError(401, 'Session expired');
    }
    const user = await User.findById(payload.sub).select('tokenVersion');
    if (!user || user.tokenVersion !== payload.tv) throw new HttpError(401, 'Session expired');
    req.userId = user.id;
    next();
  } catch (err) {
    next(err);
  }
};
