import { z } from 'zod';
import type { Tag } from '../../generated/prisma/client.js';

export const NAME_MAX = 60;
export const MAX_PAGE_SIZE = 100;
const MAX_INT = 2_147_483_647; // el id es INT en MySQL

// R-01: recorta y colapsa espacios antes de medir; se guarda con las mayúsculas originales.
const tagName = z
  .string({ error: 'El nombre es obligatorio.' })
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'El nombre es obligatorio.')
      .max(NAME_MAX, `El nombre admite como máximo ${NAME_MAX} caracteres.`),
  );

export const tagBodySchema = z.strictObject({ name: tagName });
export type TagBody = z.output<typeof tagBodySchema>;

const positiveInt = (message: string) =>
  z
    .string()
    .regex(/^[1-9]\d{0,9}$/, message)
    .transform(Number)
    .pipe(z.number().max(MAX_INT, message));

const limitMessage = `El límite debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`;

export const listTagsQuerySchema = z.strictObject({
  cursor: positiveInt('El cursor no es válido.').optional(),
  limit: z
    .string()
    .regex(/^\d+$/, limitMessage)
    .transform(Number)
    .pipe(z.number().min(1, limitMessage).max(MAX_PAGE_SIZE, limitMessage))
    .default(MAX_PAGE_SIZE),
});
export type ListTagsQuery = z.output<typeof listTagsQuerySchema>;

export const tagIdParamSchema = positiveInt('Esta etiqueta no existe.');

export interface TagDto {
  id: number;
  name: string;
  createdAt: string;
}

export const toTagDto = (tag: Tag): TagDto => ({
  id: tag.id,
  name: tag.name,
  createdAt: tag.createdAt.toISOString(),
});
