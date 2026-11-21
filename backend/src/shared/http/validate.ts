import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from './problem.js';

z.config(z.locales.es()); // mensajes por defecto de Zod en español

/** Valida y reemplaza req.body con el resultado de Zod; los errores salen como 422 por campo. */
export const validateBody =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const errors = result.error.issues.flatMap((i) =>
        i.code === 'unrecognized_keys'
          ? i.keys.map((key) => ({
              field: [...i.path, key].join('.'),
              message: 'Campo no permitido.',
            }))
          : [{ field: i.path.join('.'), message: i.message }],
      );
      return next(new AppError('VALIDATION_ERROR', 'Revisa los campos marcados.', { errors }));
    }
    req.body = result.data;
    next();
  };
