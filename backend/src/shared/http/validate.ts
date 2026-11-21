import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from './problem.js';

z.config(z.locales.es()); // mensajes por defecto de Zod en español

function toFieldErrors(error: z.ZodError) {
  return error.issues.flatMap((i) =>
    i.code === 'unrecognized_keys'
      ? i.keys.map((key) => ({
          field: [...i.path, key].join('.'),
          message: 'Campo no permitido.',
        }))
      : [{ field: i.path.join('.'), message: i.message }],
  );
}

/** Valida y reemplaza req.body con el resultado de Zod; los errores salen como 422 por campo. */
export const validateBody =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(
        new AppError('VALIDATION_ERROR', 'Revisa los campos marcados.', {
          errors: toFieldErrors(result.error),
        }),
      );
    }
    req.body = result.data;
    next();
  };

/**
 * Igual que validateBody, para la query string. En Express 5 req.query es un getter de solo
 * lectura, así que el resultado de Zod se define como propiedad propia de la request.
 */
export const validateQuery =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(
        new AppError('VALIDATION_ERROR', 'Revisa los campos marcados.', {
          errors: toFieldErrors(result.error),
        }),
      );
    }
    Object.defineProperty(req, 'query', { value: result.data, configurable: true, writable: true });
    next();
  };
