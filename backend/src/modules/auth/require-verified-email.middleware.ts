import type { RequestHandler } from 'express';
import { AppError } from '../../shared/http/problem.js';
import { usersService } from '../users/users.service.js';

/** Va después de requireAuth. Consulta la BD: el JWT no sabe si el correo se verificó después. */
export const requireVerifiedEmail: RequestHandler = async (req, _res, next) => {
  const user = req.user && (await usersService.findById(req.user.id));
  if (!user) return next(new AppError('UNAUTHENTICATED', 'Inicia sesión para continuar.'));
  if (!user.emailVerifiedAt) {
    return next(new AppError('EMAIL_NOT_VERIFIED', 'Verifica tu correo para continuar.'));
  }
  next();
};
