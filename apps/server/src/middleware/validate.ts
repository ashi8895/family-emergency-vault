import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { HttpError } from './error.js';

export const validate =
  (schema: ZodTypeAny, source: 'body' | 'params' | 'query' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new HttpError(400, 'Invalid request', result.error.flatten().fieldErrors));
    }
    if (source === 'body') req.body = result.data; // strips unknown fields
    next();
  };
