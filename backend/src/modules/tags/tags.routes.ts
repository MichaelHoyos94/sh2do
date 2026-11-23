import { Router, type RequestHandler } from 'express';
import { AppError } from '../../shared/http/problem.js';
import { validateBody, validateQuery } from '../../shared/http/validate.js';
import { requireAuth } from '../auth/require-auth.middleware.js';
import { createTag, deleteTag, listTags, renameTag } from './tags.controller.js';
import { listTagsQuerySchema, tagBodySchema, tagIdParamSchema } from './tags.schemas.js';

/** Un id que no es un entero positivo no puede ser de nadie: 404 como uno inexistente, y antes de validar el body. */
const validateTagId: RequestHandler = (req, _res, next) => {
  if (!tagIdParamSchema.safeParse(req.params.tagId).success) {
    return next(new AppError('NOT_FOUND', 'Esta etiqueta no existe.'));
  }
  next();
};

// Solo requireAuth: una cuenta sin verificar también gestiona sus etiquetas (plan R-09).
export const tagsRoutes = Router();

tagsRoutes.use(requireAuth);
tagsRoutes.get('/', validateQuery(listTagsQuerySchema), listTags);
tagsRoutes.post('/', validateBody(tagBodySchema), createTag);
tagsRoutes.patch('/:tagId', validateTagId, validateBody(tagBodySchema), renameTag);
tagsRoutes.delete('/:tagId', validateTagId, deleteTag);
