import { prisma } from '../../shared/db/prisma.js';

export const tagsRepository = {
  /**
   * Alfabético (la intercalación ignora mayúsculas), desempate por id; `after` es la última etiqueta (excluida).
   * Keyset explícito en vez del `cursor` de Prisma: su subconsulta lee la fila del cursor sin filtrar por dueño.
   */
  list: (userId: number, after: { id: number; name: string } | undefined, take: number) =>
    prisma.tag.findMany({
      where: {
        userId,
        ...(after && {
          OR: [{ name: { gt: after.name } }, { name: after.name, id: { gt: after.id } }],
        }),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take,
    }),

  /** Busca por id y dueño a la vez: lo ajeno es indistinguible de lo inexistente. */
  findOwned: (id: number, userId: number) => prisma.tag.findFirst({ where: { id, userId } }),

  create: (userId: number, name: string) => prisma.tag.create({ data: { userId, name } }),

  rename: (id: number, name: string) => prisma.tag.update({ where: { id }, data: { name } }),

  /** Las filas de `task_tags` caen por ON DELETE CASCADE; los pendientes no se tocan. */
  delete: (id: number, userId: number) => prisma.tag.deleteMany({ where: { id, userId } }),
};
