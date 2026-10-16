import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'File is too large (max 10 MB)' : 'Upload failed' });
  }
  // Log only the message: never request bodies, tokens or ciphertext.
  console.error('Unhandled error:', err instanceof Error ? err.message : 'unknown');
  res.status(500).json({ error: 'Something went wrong on our side' });
};
