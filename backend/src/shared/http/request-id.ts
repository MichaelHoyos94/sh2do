import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// pino-http reutiliza req.id, así que los logs de la petición llevan este mismo id.
export const requestId: RequestHandler = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
