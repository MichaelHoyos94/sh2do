import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/http/problem.js';
import { tagsRepository } from './tags.repository.js';
import { toTagDto, type ListTagsQuery } from './tags.schemas.js';

const notFound = () => new AppError('NOT_FOUND', 'Esta etiqueta no existe.');

const NAME_TAKEN = 'Ya tienes una etiqueta con ese nombre.';

/** La BD decide el duplicado (índice único con intercalación as_ci): sin consulta previa ni carrera (R-03). */
async function writeName<T>(write: () => Promise<T>) {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('TAG_NAME_TAKEN', NAME_TAKEN, {
        errors: [{ field: 'name', message: NAME_TAKEN }],
      });
    }
    // Borrada entre `findOwned` y el `update`.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')
      throw notFound();
    throw err;
  }
}

export const tagsService = {
  async list(userId: number, query: ListTagsQuery) {
    // El cursor debe ser una etiqueta propia: si no, no se revela nada de la ajena (RN-PRO-1).
    const after =
      query.cursor === undefined ? undefined : await tagsRepository.findOwned(query.cursor, userId);
    if (query.cursor !== undefined && !after) {
      throw new AppError('VALIDATION_ERROR', 'Revisa los campos marcados.', {
        errors: [{ field: 'cursor', message: 'El cursor no es válido.' }],
      });
    }
    // Se pide una fila de más para saber si hay otra página.
    const rows = await tagsRepository.list(userId, after ?? undefined, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map(toTagDto),
      nextCursor: hasMore ? String(page[page.length - 1]!.id) : null,
    };
  },

  /** Para el módulo tasks: de `ids`, los que son etiquetas del usuario (lo ajeno no cuenta). */
  async findOwnedIds(userId: number, ids: number[]) {
    return (await tagsRepository.findOwnedByIds(userId, ids)).map((t) => t.id);
  },

  /** Para el módulo tasks: id y nombre de las etiquetas propias, en orden alfabético. */
  async getOwnedByIds(userId: number, ids: number[]) {
    return (await tagsRepository.findOwnedByIds(userId, ids)).map(({ id, name }) => ({ id, name }));
  },

  async create(userId: number, name: string) {
    return toTagDto(await writeName(() => tagsRepository.create(userId, name)));
  },

  async rename(userId: number, tagId: number, name: string) {
    const current = await tagsRepository.findOwned(tagId, userId);
    if (!current) throw notFound();
    // Idéntico: no se escribe nada (R-04). Cambiar solo mayúsculas sí escribe y no choca consigo misma.
    if (current.name === name) return toTagDto(current);
    return toTagDto(await writeName(() => tagsRepository.rename(tagId, name)));
  },

  async delete(userId: number, tagId: number) {
    const { count } = await tagsRepository.delete(tagId, userId);
    if (count === 0) throw notFound();
  },
};
