import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../logger.js';
import { AppError } from './problem.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 'El recurso solicitado no existe.'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    // Cuerpo JSON mal formado o demasiado grande (límite de 100 kb)
    appError = new AppError('VALIDATION_ERROR', 'La solicitud está mal formada.', { status: 400 });
  } else {
    logger.error({ err, requestId: req.id }, 'Unhandled error');
    appError = new AppError('INTERNAL_ERROR', 'Ocurrió un error inesperado. Inténtalo de nuevo.');
  }

  if (appError.options.retryAfter) res.set('Retry-After', String(appError.options.retryAfter));
  res.status(appError.status).type('application/problem+json').json(appError.toProblem());
};
