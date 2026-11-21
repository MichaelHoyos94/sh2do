import type { RequestHandler } from 'express';
import { AppError } from '../../shared/http/problem.js';
import { verifyAccessToken } from '../../shared/security/jwt.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: number };
  }
}

/** Exige `Authorization: Bearer <access token>` y deja el usuario en req.user. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('UNAUTHENTICATED', 'Inicia sesión para continuar.'));
  }
  try {
    req.user = { id: await verifyAccessToken(token) };
    next();
  } catch {
    next(new AppError('UNAUTHENTICATED', 'Tu sesión venció. Inicia sesión de nuevo.'));
  }
};
